// Local developer observer: actual generated Pages bundle, synthetic files/events.
import http from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),output=path.join(root,'.profiling-results');
await mkdir(output,{recursive:true});
const port=Number(process.env.COINPRINT_EXPORT_PORT??4178);
const fixtures=Object.fromEntries(await Promise.all(['twin-stars','offset-nested-transforms','over-lower-hole','unsupported-script'].map(async n=>[n,await readFile(path.join(root,'fixtures/svg',n+'.svg'),'utf8')])));
const info=async()=>({identity:'Generated artifact hashes; map to commit in the evidence document',workerAssetDelayMs:150,
  assets:await Promise.all((await readdir(path.join(root,'assets'))).sort().map(async name=>{const bytes=await readFile(path.join(root,'assets',name));return {name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}))});
http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/export/info'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await info()));return;}
  if(url.pathname==='/export/fixtures'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixtures));return;}
  if(url.pathname==='/export/browser.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('./verify-export-options-browser.js',import.meta.url)));return;}
  if(url.pathname==='/export/evidence'&&req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000)throw Error('Too large');}JSON.parse(body);const name='dig31-browser-'+Date.now()+'.json';await writeFile(path.join(output,name),body);res.end(name);return;}
  if(!url.pathname.startsWith('/coinPrintMaker/')){res.writeHead(404).end();return;}
  const relative=decodeURIComponent(url.pathname.slice('/coinPrintMaker/'.length))||'index.html',file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let bytes=await readFile(file);
  if(relative==='index.html')bytes=Buffer.from(bytes.toString().replace('</head>','<script src="/export/browser.js"></script></head>'));
  if(relative.startsWith('assets/generation.worker-'))await new Promise(resolve=>setTimeout(resolve,150));
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(bytes);
}catch{res.writeHead(404).end();}}).listen(port,'127.0.0.1',()=>console.log('Export observer: http://127.0.0.1:'+port+'/coinPrintMaker/'));
