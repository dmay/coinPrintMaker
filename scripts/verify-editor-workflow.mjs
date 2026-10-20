// Developer-only DIG-28 observer server; never imported by the Pages application.
import http from 'node:http';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=Number(process.env.COINPRINT_EDITOR_PORT??4176);
const output=path.join(root,'.profiling-results'); await mkdir(output,{recursive:true});
const fixtures=Object.fromEntries(await Promise.all(['over-lower-hole','offset-nested-transforms','unsupported-script'].map(async name=>[name,await readFile(path.join(root,'fixtures/svg',name+'.svg'),'utf8')])));
// Synthetic warning source differs only by omitted physical page dimensions.
fixtures['inferred-size']=fixtures['offset-nested-transforms'].replace(/width="40mm"/,'').replace(/height="40mm"/,'');
const workerRequests=[];
const info=async()=>({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim(),
  workerDelayMs:150,workerRequests,
  assets:await Promise.all((await readdir(path.join(root,'assets'))).sort().map(async name=>{const b=await readFile(path.join(root,'assets',name));return {name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}))});
http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'); res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/editor/info'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await info()));return;}
  if(url.pathname==='/editor/fixtures'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixtures));return;}
  if(url.pathname==='/editor/evidence'&&req.method==='POST'){let body='';for await(const c of req){body+=c;if(body.length>2_000_000)throw Error('Report exceeds limit');}JSON.parse(body);await writeFile(path.join(output,'dig28-browser-'+Date.now()+'.json'),body);res.end('saved');return;}
  if(url.pathname==='/editor/browser.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('./verify-editor-workflow-browser.js',import.meta.url)));return;}
  if(!url.pathname.startsWith('/coinPrintMaker/')){res.writeHead(404).end();return;}
  const relative=decodeURIComponent(url.pathname.slice('/coinPrintMaker/'.length))||'index.html';
  const file=path.resolve(root,relative); if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let bytes=await readFile(file);
  if(relative==='index.html')bytes=Buffer.from(bytes.toString().replace('</head>','<script src="/editor/browser.js"></script></head>'));
  if(relative.startsWith('assets/generation.worker-')){workerRequests.push({url:url.pathname,time:new Date().toISOString()});await new Promise(resolve=>setTimeout(resolve,150));}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(bytes);
}catch{res.writeHead(404).end();}}).listen(port,'127.0.0.1',()=>console.log('DIG-28 generated app observer: http://127.0.0.1:'+port+'/coinPrintMaker/'));
