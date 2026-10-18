import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { buildPages } from '../../scripts/build-pages.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'coinprint-pages-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets/old.js'), 'old asset');
  await writeFile(path.join(root, 'index.html'), 'old page');
  await writeFile(path.join(root, '.nojekyll'), '');
  await writeFile(path.join(root, 'source-sentinel'), 'keep source');
  return root;
}

async function fakeBuild({ outDir }) {
  await mkdir(path.join(outDir, 'assets'));
  await writeFile(path.join(outDir, 'assets/new.js'), 'new asset');
  await writeFile(path.join(outDir, 'index.html'), '<script type="module" src="./assets/new.js"></script>');
}

async function assertOriginal(root) {
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), 'old page');
  assert.equal(await readFile(path.join(root, 'assets/old.js'), 'utf8'), 'old asset');
  assert.equal(await readFile(path.join(root, 'source-sentinel'), 'utf8'), 'keep source');
  assert.deepEqual((await readdir(root)).sort(), ['.nojekyll', 'assets', 'index.html', 'source-sentinel']);
}

test('a failed build preserves the published page, assets and unrelated source', async t => {
  const root = await fixture(t);
  await assert.rejects(buildPages({ root, runBuild: async options => {
    await fakeBuild(options);
    throw new Error('compiler failed after writing partial output');
  } }), /compiler failed/);
  await assertOriginal(root);
});

test('incomplete, external and unexpected staged output never replaces published files', async t => {
  const root = await fixture(t);
  for (const mode of ['missing', 'absolute', 'external', 'extra']) {
    await assert.rejects(buildPages({ root, runBuild: async options => {
      await fakeBuild(options);
      if (mode === 'extra') await writeFile(path.join(options.outDir, 'source.txt'), 'unexpected');
      else await writeFile(path.join(options.outDir, 'index.html'), `<script src="${mode === 'missing' ? './assets/missing.js' : mode === 'absolute' ? '/assets/new.js' : 'https://cdn.example/new.js'}"></script>`);
    } }), /complete build|Missing or non-relative/);
    await assertOriginal(root);
  }
});

test('publication replaces only owned paths and drift checking does not write', async t => {
  const root = await fixture(t);
  await buildPages({ root, runBuild: fakeBuild });
  assert.equal(await readFile(path.join(root, 'assets/new.js'), 'utf8'), 'new asset');
  assert.deepEqual(await readdir(path.join(root, 'assets')), ['new.js']);
  assert.equal(await readFile(path.join(root, 'source-sentinel'), 'utf8'), 'keep source');
  await buildPages({ root, check: true, runBuild: fakeBuild });
  for (const mode of ['edited', 'missing', 'extra']) {
    if (mode === 'edited') await writeFile(path.join(root, 'assets/new.js'), 'stale');
    if (mode === 'missing') await rm(path.join(root, '.nojekyll'));
    if (mode === 'extra') await writeFile(path.join(root, 'assets/obsolete.js'), 'obsolete');
    await assert.rejects(buildPages({ root, check: true, runBuild: fakeBuild }), /Generated Pages files are stale/);
  }
  assert.equal(await readFile(path.join(root, 'assets/new.js'), 'utf8'), 'stale');
  assert.equal(await readFile(path.join(root, 'source-sentinel'), 'utf8'), 'keep source');
});

test('a publication lock refuses concurrent publishers without modifying files', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.pages-build-lock'));
  await assert.rejects(buildPages({ root, runBuild: () => assert.fail('build must not start') }), { code: 'EEXIST' });
  await rm(path.join(root, '.pages-build-lock'), { recursive: true });
  await assertOriginal(root);
});

test('published symbolic links are refused before replacement', async t => {
  const root = await fixture(t);
  const target = path.join(root, 'source-sentinel');
  await rm(path.join(root, 'assets'), { recursive: true });
  try { await symlink(root, path.join(root, 'assets'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Creating symbolic links is unavailable.'); return; } throw error; }
  await assert.rejects(buildPages({ root, runBuild: fakeBuild }), /symbolic link/);
  assert.equal(await readFile(target, 'utf8'), 'keep source');
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), 'old page');
});

test('the real production build serves relative assets below /coinPrintMaker/', async t => {
  const root = await fixture(t);
  const configFile = fileURLToPath(new URL('../../vite.config.mjs', import.meta.url));
  await buildPages({ root, runBuild: ({ outDir }) => build({ configFile, build: { outDir, emptyOutDir: false }, logLevel: 'silent' }) });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/coinPrintMaker/')) { response.writeHead(404).end(); return; }
    const relative = decodeURIComponent(url.pathname.slice('/coinPrintMaker/'.length)) || 'index.html';
    if (relative.includes('..')) { response.writeHead(400).end(); return; }
    try { response.end(await readFile(path.join(root, relative))); }
    catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/coinPrintMaker/`;
  const html = await (await fetch(base)).text();
  assert.match(html, /id="root"/);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')));
  assert.ok(assets.some(asset => asset.endsWith('.css')));
  for (const asset of assets) {
    assert.ok(asset.startsWith('./assets/'));
    const url = new URL(asset, base);
    assert.ok(url.pathname.startsWith('/coinPrintMaker/assets/'));
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 0);
  }
  assert.equal((await fetch(new URL('.nojekyll', base))).status, 200);
  assert.equal((await fetch(new URL('/assets/absent.js', base))).status, 404);
});
