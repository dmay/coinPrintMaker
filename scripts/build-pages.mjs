import { build } from 'vite';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const publishedNames = ['index.html', 'assets', '.nojekyll'];

async function exists(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Reject links and unexpected entries before any published file is touched.
async function inventory(directory, prefix = '') {
  const files = new Map();
  for (const name of (await readdir(directory)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    const file = path.join(directory, name);
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not publishable: ${relative}`);
    if (stat.isDirectory()) {
      for (const entry of await inventory(file, relative)) files.set(...entry);
    } else if (stat.isFile()) files.set(relative, await readFile(file));
    else throw new Error(`Unsupported generated entry: ${relative}`);
  }
  return files;
}

async function stagedFiles(directory) {
  const names = (await readdir(directory)).sort();
  if (JSON.stringify(names) !== JSON.stringify([...publishedNames].sort())) {
    throw new Error('A complete build must contain only index.html, assets/ and .nojekyll.');
  }
  const files = await inventory(directory);
  const html = files.get('index.html')?.toString('utf8');
  if (!html || !files.has('.nojekyll') || !(await lstat(path.join(directory, 'assets'))).isDirectory()) {
    throw new Error('Incomplete Pages build.');
  }
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
  if (!references.some(reference => reference.endsWith('.js'))) throw new Error('The built module entry is missing.');
  for (const reference of references) {
    if (!reference.startsWith('./assets/') || reference.includes('..', 2) || !files.has(reference.slice(2))) {
      throw new Error(`Missing or non-relative built asset: ${reference}`);
    }
  }
  return files;
}

async function publishedFiles(root) {
  const files = new Map();
  for (const name of publishedNames) {
    const file = path.join(root, name);
    const stat = await exists(file);
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error(`Refusing published symbolic link: ${name}`);
    if (name === 'assets') {
      if (!stat.isDirectory()) throw new Error('The published assets path must be a directory.');
      for (const entry of await inventory(file, name)) files.set(...entry);
    } else {
      if (!stat.isFile()) throw new Error(`The published ${name} path must be a file.`);
      files.set(name, await readFile(file));
    }
  }
  return files;
}

async function runVite({ root, outDir }) {
  await build({
    configFile: path.join(root, 'vite.config.mjs'),
    build: { outDir, emptyOutDir: false },
  });
}

// root/runBuild injection permits failure tests in disposable repositories.
// The CLI always uses this script's repository and accepts no output paths.
export async function buildPages({ root = repositoryRoot, check = false, runBuild = runVite } = {}) {
  root = path.resolve(root);
  const lock = path.join(root, '.pages-build-lock');
  await mkdir(lock); // Exclusive: never interleave two publications.
  let stage;
  let preserveStage = false;
  try {
    stage = await mkdtemp(path.join(root, '.pages-build-'));
    const output = path.join(stage, 'output');
    await mkdir(output);
    await runBuild({ root, outDir: output });
    await writeFile(path.join(output, '.nojekyll'), '');
    const expected = await stagedFiles(output);
    const current = await publishedFiles(root);
    if (check) {
      const names = new Set([...expected.keys(), ...current.keys()]);
      const changed = [...names].filter(name => !expected.has(name) || !current.has(name) || !expected.get(name).equals(current.get(name))).sort();
      if (changed.length) throw new Error(`Generated Pages files are stale: ${changed.join(', ')}. Run npm run build:pages and commit the result.`);
      return;
    }

    // Build and validation succeeded. Back up only the three owned paths.
    const backup = path.join(stage, 'previous');
    await mkdir(backup);
    const moved = [];
    const installed = [];
    try {
      for (const name of publishedNames) {
        if (await exists(path.join(root, name))) {
          await rename(path.join(root, name), path.join(backup, name));
          moved.push(name);
        }
      }
      // index.html goes last so it only references already-installed assets.
      for (const name of ['assets', '.nojekyll', 'index.html']) {
        await rename(path.join(output, name), path.join(root, name));
        installed.push(name);
      }
    } catch (error) {
      try {
        for (const name of installed.reverse()) await rm(path.join(root, name), { recursive: name === 'assets', force: true });
        for (const name of moved) await rename(path.join(backup, name), path.join(root, name));
      } catch (rollbackError) {
        preserveStage = true;
        throw new AggregateError([error, rollbackError], `Publication and rollback failed; recover previous files from ${backup}.`);
      }
      throw error;
    }
  } finally {
    // Both targets are fixed children of root; never delete the repository root.
    if (!preserveStage && stage && path.dirname(stage) === root && path.basename(stage).startsWith('.pages-build-')) {
      await rm(stage, { recursive: true, force: true });
    }
    await rm(lock, { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    console.error('Usage: node scripts/build-pages.mjs [--check]');
    process.exitCode = 1;
  } else {
    try {
      await buildPages({ check: args[0] === '--check' });
      console.log(args[0] ? 'Generated Pages files match source.' : 'Published build to root index.html, assets/ and .nojekyll.');
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
