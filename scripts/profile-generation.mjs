// Developer-only production profiling server. Never included in Pages output.
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.COINPRINT_PROFILE_PORT ?? 4175);
const output = path.resolve(process.env.COINPRINT_PROFILE_OUTPUT ?? path.join(root, '.profiling-results'));
const fixtureNames = ['sun-medallion', 'twin-stars', 'monogram-o', 'offset-nested-transforms'];
const fixtures = Object.fromEntries(await Promise.all(fixtureNames.map(async name => [name, await readFile(path.join(root, 'fixtures/svg', name + '.svg'), 'utf8')])));
const polygon = n => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="40mm" height="40mm" viewBox="0 0 40 40"><g inkscape:groupmode="layer" inkscape:label="Base" id="base"><polygon points="${Array.from({length:n}, (_,i) => { const a = i * 2 * Math.PI / n; return `${(20 + 18 * Math.cos(a)).toFixed(6)},${(20 + 18 * Math.sin(a)).toFixed(6)}`; }).join(' ')}"/></g></svg>`;
for (const n of [600, 800, 8191, 8192]) fixtures['polygon-' + n] = polygon(n);
const base = fixtures['offset-nested-transforms'];
fixtures['near-source-cap'] = base.replace('</svg>', `<!--${'x'.repeat(2090000 - Buffer.byteLength(base) - 7)}--></svg>`);
let faultNextWorker = false;
const workerRequests = [];
await mkdir(output, { recursive: true });
async function info() {
  const assets = await Promise.all((await readdir(path.join(root, 'assets'))).sort().map(async name => {
    const bytes = await readFile(path.join(root, 'assets', name));
    return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  return { head: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), dirty: git(['status', '--porcelain']), assets,
    fixtures: Object.entries(fixtures).map(([name, text]) => ({ name, bytes: Buffer.byteLength(text) })), workerRequests };
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/profile/evidence' && req.method === 'POST') {
    let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 20_000_000) { res.writeHead(413).end(); return; } }
    await writeFile(path.join(output, 'profile-' + Date.now() + '.json'), data); res.end('saved'); return;
  }
  if (url.pathname === '/profile/fault-next-worker' && req.method === 'POST') { faultNextWorker = true; res.end('armed'); return; }
  if (url.pathname === '/profile/info') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await info())); return; }
  if (url.pathname === '/profile/fixtures') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixtures)); return; }
  if (url.pathname === '/profile/browser.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('./profile-generation-browser.js', import.meta.url))); return; }
  if (!url.pathname.startsWith('/coinPrintMaker/')) { res.writeHead(404).end(); return; }
  const relative = decodeURIComponent(url.pathname.slice('/coinPrintMaker/'.length)) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = await readFile(file);
    if (relative.startsWith('assets/generation.worker-')) {
      workerRequests.push({ path: url.pathname, time: new Date().toISOString(), injectedFault: faultNextWorker });
      if (faultNextWorker) { data = Buffer.from('globalThis.onmessage = () => { throw new Error("Intentional local DIG-27 worker test failure"); };'); faultNextWorker = false; }
    }
    if (relative === 'index.html') data = Buffer.from(data.toString().replace('</head>', '<script src="/profile/browser.js"></script></head>'));
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch { res.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`Production observer harness: http://127.0.0.1:${port}/coinPrintMaker/ (saves ${output})`));
