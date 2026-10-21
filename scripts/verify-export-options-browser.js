// Developer observer only. Synthetic File/events and intercepted browser downloads.
(async()=>{
if(location.search.includes('evidence-child'))return;
const wait=ms=>new Promise(r=>setTimeout(r,ms)),ui=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const fixtures=await(await fetch('/export/fixtures')).json();
const report={variant:'DIG-31 actual generated Pages app / synthetic fixture events / intercepted Blob actions',date:new Date().toISOString(),environment:{ua:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio},build:await(await fetch('/export/info')).json(),checks:[],downloads:[],errors:[]};
const panel=document.createElement('aside');panel.style='padding:16px;background:white;border:2px solid #006c9e';
panel.innerHTML='<h2>Local export developer verification</h2><button id="dig31-run">Run export workflow (intercepted)</button> <button id="dig31-narrow">Check 320px iframe dialog</button><p id="dig31-status">Ready. Synthetic inputs; no OS save or native picker claim.</p>';
document.body.append(panel);const status=document.getElementById('dig31-status');
async function storeFor(doc){for(let attempt=0;attempt<200;attempt++){
 const root=doc.getElementById('root'),key=root&&Object.keys(root).find(k=>k.startsWith('__reactContainer')),pending=[key&&root[key]?.stateNode?.current],seen=new Set();
 while(pending.length){const n=pending.pop();if(!n||seen.has(n))continue;seen.add(n);pending.push(n.child,n.sibling);let h=n.memoizedState;for(let i=0;h&&i<50;i++,h=h.next){const v=h.memoizedState;if(v?.getState&&v?.subscribe)return v;}}
 await wait(25);}throw Error('Store observer unavailable');}
function check(label,pass){report.checks.push({label,pass:!!pass});if(!pass)throw Error(label);}
const save=async()=>{report.buildAfter=await(await fetch('/export/info')).json();const name=await(await fetch('/export/evidence',{method:'POST',body:JSON.stringify(report,null,2)})).text();status.textContent+=' · '+name;};
async function run(doc,win,narrow=false){
 const store=await storeFor(doc),$=s=>{const e=doc.querySelector(s);if(!e)throw Error('Missing '+s);return e;},buttons=()=>[...doc.querySelectorAll('.export-controls button')];
 const create=win.URL.createObjectURL.bind(win.URL),revoke=win.URL.revokeObjectURL.bind(win.URL),click=win.HTMLAnchorElement.prototype.click;
 const blobs=new Map(),revoked=[],captured=[];let fail=false;
 win.URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};win.URL.revokeObjectURL=url=>{revoked.push(url);blobs.delete(url);return revoke(url);};
 win.HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){if(fail)throw Error('Synthetic action failure');captured.push({fileName:this.download,url:this.href,blob:blobs.get(this.href)});return;}return click.call(this);};
 async function settle(){for(let i=0;i<600;i++){const s=store.getState();if(s.importState.pendingFileName===null&&s.generationStatus!=='pending'){await ui();return;}await wait(20);}throw Error('Settle timeout');}
 async function load(name){const transfer=new win.DataTransfer();transfer.items.add(new win.File([fixtures[name]],name+'.svg',{type:'image/svg+xml'}));const input=$('input[type=file]');input.files=transfer.files;input.dispatchEvent(new win.Event('change',{bubbles:true}));await ui();}
 function text(input,value){Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new win.Event('input',{bubbles:true}));}
 async function open(format){buttons()[format==='stl'?0:1].click();await ui();}
 async function submit(){const expected=store.getState().result;$('dialog button[type=submit]').click();await wait(30);return {expected,record:captured.at(-1)};}
 async function audit({expected,record},format){
  const bytes=await record.blob.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const summary={format,fileName:record.fileName,bytes:bytes.byteLength,mime:record.blob.type,sha256,input:expected.input,tiers:expected.parts.map(p=>({id:p.layerId,name:p.name,color:p.color})),mode:'intercepted anchor; no browser/OS save'};
  check('exactly-once revoked URL, no anchor/URL leak',revoked.filter(url=>url===record.url).length===1&&!doc.querySelector('a[download]')&&blobs.size===0);
  check(format+' MIME',record.blob.type==='model/'+format);
  if(format==='3mf'){
   const data=new DataView(bytes);let offset=0,xml='';while(data.getUint32(offset,true)===0x04034b50){const method=data.getUint16(offset+8,true),size=data.getUint32(offset+18,true),nl=data.getUint16(offset+26,true),el=data.getUint16(offset+28,true),start=offset+30+nl+el,name=new TextDecoder().decode(new Uint8Array(bytes,offset+30,nl));
    if(name==='3D/3dmodel.model'){const compressed=bytes.slice(start,start+size);xml=method===0?new TextDecoder().decode(compressed):await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();}offset=start+size;}
   const model=new DOMParser().parseFromString(xml,'application/xml');check('valid 3MF model XML',!model.querySelector('parsererror')&&model.documentElement.getAttribute('unit')==='millimeter');
   const objects=[...model.querySelectorAll('object')].filter(o=>o.querySelector('mesh')),bases=[...model.querySelectorAll('base')];
   check('3MF current part count and materials',objects.length===expected.parts.length&&bases.length===objects.length);
   objects.forEach((o,i)=>{const p=expected.parts[i];check('3MF exact current name/ID/color/material reference '+i,o.getAttribute('name')===p.name&&o.getAttribute('partnumber')===p.layerId&&o.getAttribute('pid')===model.querySelector('basematerials').getAttribute('id')&&o.getAttribute('pindex')===String(i)&&bases[i].getAttribute('displaycolor')===p.color.toUpperCase()+'FF');
    check('3MF exact current vertices '+i,[...o.querySelectorAll('vertex')].every((v,j)=>['x','y','z'].every((k,a)=>Number(v.getAttribute(k))===p.mesh.vertices[j][a])));});
  }else{const d=new DataView(bytes),count=d.getUint32(80,true);check('STL current facet count and length',count===expected.unifiedMesh.triangles.length&&bytes.byteLength===84+50*count);
   check('STL exact current float32 domain vertices',expected.unifiedMesh.triangles.every((t,i)=>t.every((index,v)=>expected.unifiedMesh.vertices[index].every((x,a)=>d.getFloat32(84+50*i+12+12*v+4*a,true)===Math.fround(x)))));}
  report.downloads.push(summary);
 }
 try{
  check('empty exports disabled',buttons().every(b=>b.disabled));await load('twin-stars');check('pending exports disabled',buttons().every(b=>b.disabled));await settle();check('current both exports enabled',buttons().every(b=>!b.disabled));
  await open('3mf');check('native modal open and filename focused',$('dialog').matches(':modal')&&doc.activeElement===$('#export-filename'));
  check('generic model and consumer configuration guidance',$('dialog').textContent.includes('not an OrcaSlicer project')&&$('dialog').textContent.includes('outside CoinPrint export acceptance'));
  if(narrow){const r=$('dialog').getBoundingClientRect();report.narrow={viewport:[win.innerWidth,win.innerHeight],dialog:{left:r.left,right:r.right,width:r.width},scrollWidth:doc.documentElement.scrollWidth};check('320px frame dialog remains inside viewport',win.innerWidth===320&&r.left>=0&&r.right<=320&&doc.documentElement.scrollWidth<=320);$('dialog button[type=button]').click();await ui();return;}
  text($('#export-filename'),'CON.stl.3mf');await ui();check('safe chosen suffix preview',$('#export-final-name').textContent.includes('_CON.3mf'));
  const before=store.getState(),old=before.result,color=$('input[type=color]');text(color,'#123abc');await ui();
  const current=store.getState();check('color-only keeps checked meshes, no generation token change',current.generationToken===before.generationToken&&current.result.unifiedMesh===old.unifiedMesh&&current.result.parts[0].mesh===old.parts[0].mesh&&current.settings.revision>before.settings.revision);
  await audit(await submit(),'3mf');check('safe 3MF download filename',captured.at(-1).fileName==='_CON.3mf');
  const visible=$('input[type=checkbox]');visible.click();await ui();check('visibility pending gates both',buttons().every(b=>b.disabled));await settle();
  await open('stl');text($('#export-filename'),'Visible.3mf.stl');await ui();await audit(await submit(),'stl');check('chosen STL suffix',captured.at(-1).fileName==='Visible.stl');
  await open('stl');const select=$('#export-format');select.value='3mf';select.dispatchEvent(new win.Event('change',{bubbles:true}));await ui();await audit(await submit(),'3mf');
  await open('3mf');const retained=store.getState().result;fail=true;$('dialog button[type=submit]').click();await ui();fail=false;
  check('failed action retains domain/dialog and cleans URL',store.getState().result===retained&&!!$('dialog [role=alert]')&&blobs.size===0);await audit(await submit(),'3mf');
  await open('3mf');const thickness=$('input[aria-label^="Thickness"]');text(thickness,'2');thickness.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));await ui();
  check('already-open dialog disabled while geometry stale',$('dialog button[type=submit]').disabled);const prior=captured.length;$('dialog form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await ui();check('forced stale submit does not download',captured.length===prior);await settle();await audit(await submit(),'3mf');
  await load('unsupported-script');await settle();check('rejected replacement retains current eligibility',buttons().every(b=>!b.disabled));
  await load('over-lower-hole');await settle();check('invalid exports disabled without previous-valid fallback',store.getState().generationStatus==='invalid'&&buttons().every(b=>b.disabled));
 }finally{win.URL.createObjectURL=create;win.URL.revokeObjectURL=revoke;win.HTMLAnchorElement.prototype.click=click;}
}
document.getElementById('dig31-run').onclick=async()=>{try{status.textContent='Running intercepted workflow';await run(document,window);status.textContent='Workflow passed: '+report.checks.length+' checks.';}catch(e){report.errors.push(String(e));status.textContent='Failed: '+e;}await save();};
document.getElementById('dig31-narrow').onclick=async()=>{try{const iframe=document.createElement('iframe');iframe.style='width:320px;height:720px;border:0;box-sizing:content-box';iframe.title='320px production export check';iframe.src='/coinPrintMaker/?evidence-child';document.body.append(iframe);await new Promise(r=>iframe.onload=r);await run(iframe.contentDocument,iframe.contentWindow,true);status.textContent='320px iframe check passed.';}catch(e){report.errors.push(String(e));status.textContent='Failed: '+e;}await save();};
})();
