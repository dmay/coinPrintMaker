// Developer observer only: synthetic fixture input and intercepted Blob evidence
// are deliberately distinguished from the separately enabled real download.
(async()=>{
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ui=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const report={variant:'DIG-29 production app; synthetic inputs and intercepted Blob/URL lifecycle',environment:{ua:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio},build:await(await fetch('/stl/info')).json(),checks:[],downloads:[],errors:[]};
let store;
for(let tries=0;tries<200&&!store;tries++){
 const root=document.getElementById('root'),key=root&&Object.keys(root).find(k=>k.startsWith('__reactContainer')),f=key&&root[key],pending=[f?.stateNode?.current??f],seen=new Set();
 while(pending.length){const n=pending.pop();if(!n||seen.has(n))continue;seen.add(n);pending.push(n.child,n.sibling);let h=n.memoizedState;for(let i=0;h&&i<50;i++,h=h.next){const v=h.memoizedState;if(v?.getState&&v?.subscribe){store=v;break;}}if(store)break;}
 if(!store)await wait(25);
}
if(!store)throw Error('Store observer unavailable');
const fixtures=await(await fetch('/stl/fixtures')).json(),blobs=new Map(),revoked=[],capture=[];
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
let intercept=true,fail=false;
URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
URL.revokeObjectURL=url=>{revoked.push(url);blobs.delete(url);return revoke(url);};
HTMLAnchorElement.prototype.click=function(){
 if(this.download&&this.href.startsWith('blob:')){if(fail)throw Error('Synthetic download failure');const record={fileName:this.download,url:this.href,mode:intercept?'intercepted (no browser save)':'real anchor action (OS save not observed)',blob:blobs.get(this.href)};capture.push(record);if(intercept)return;}
 return click.call(this);
};
const panel=document.createElement('aside');panel.style='background:white;border:2px solid #006c9e;padding:12px;margin:16px;font:14px sans-serif';
panel.innerHTML='<h2>Local STL developer verification</h2><button id="dig29-run">Run STL workflow (intercepted)</button> <button id="dig29-load">Load native-download fixture (synthetic input)</button> <button id="dig29-native">Enable real STL download</button> <button id="dig29-save">Save STL evidence</button><p id="dig29-status">Ready. Native saving is a separate evidence track. Worker assets delayed 150 ms to expose pending.</p>';
document.body.append(panel);const status=document.getElementById('dig29-status');
const $=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);return e;},buttons=()=>[...document.querySelectorAll('.export-controls button')],stl=()=>buttons()[0];
const snapshot=()=>{const s=store.getState();return {status:s.generationStatus,input:s.result?.input,revision:s.settings?.revision,sourceRevision:s.sourceRevision,file:s.importState.coin?.source.fileName,dimensions:s.result?.dimensionsMm,volume:s.result?.metrics?.volumeMm3};};
const check=(label,pass)=>{report.checks.push({label,pass:!!pass,state:snapshot()});if(!pass)throw Error(label);};
async function settle(){for(let i=0;i<500;i++){const s=store.getState();if(s.importState.pendingFileName===null&&s.generationStatus!=='pending'){await ui();return;}await wait(20);}throw Error('Settle timeout');}
async function load(name,fileName=name+'.svg'){const transfer=new DataTransfer();transfer.items.add(new File([fixtures[name]],fileName,{type:'image/svg+xml'}));const input=$('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await ui();}
async function parse(record,expected){
 const bytes=await record.blob.arrayBuffer(),data=new DataView(bytes),count=data.getUint32(80,true),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let volume=0,normalsAgree=true,attributesZero=true,order=true;
 for(let i=0;i<count;i++){const offset=84+50*i,normal=[0,1,2].map(j=>data.getFloat32(offset+4*j,true)),p=[0,1,2].map(v=>[0,1,2].map(j=>data.getFloat32(offset+12+12*v+4*j,true)));
  for(let v=0;v<3;v++)for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[v][j]);max[j]=Math.max(max[j],p[v][j]);order&&=p[v][j]===Math.fround(expected.unifiedMesh.vertices[expected.unifiedMesh.triangles[i][v]][j]);}
  const [a,b,c]=p,u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  normalsAgree&&=length>0&&n.every((v,j)=>Math.abs(v/length-normal[j])<1e-6);volume+=n[2]*(a[2]+b[2]+c[2])/6;attributesZero&&=data.getUint16(offset+48,true)===0;
 }
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const summary={fileName:record.fileName,mode:record.mode,bytes:bytes.byteLength,triangles:count,bounds:[min,max],volume,normalsAgree,attributesZero,order,sha256:digest,urlRevoked:revoked.filter(url=>url===record.url).length===1,expected:{input:expected.input,bounds:expected.metrics.boundsMm,volume:expected.metrics.volumeMm3},header:String.fromCharCode(...new Uint8Array(bytes,0,80)).replace(/\0+$/,'')};report.downloads.push(summary);
 check('STL exact length/header/LE facets, normals/order/attributes and mm metrics',bytes.byteLength===84+50*count&&summary.header.startsWith('CoinPrint binary STL')&&normalsAgree&&attributesZero&&order&&Math.abs(volume-expected.metrics.volumeMm3)<=expected.metrics.volumeMm3*1e-6&&[min,max].every((p,e)=>p.every((x,j)=>Math.abs(x-expected.metrics.boundsMm[e][j])<=1e-6+Math.abs(x)*2e-7)));
 check('Object URL revoked exactly once and no anchor remains',summary.urlRevoked&&!document.querySelector('a[download]')&&blobs.size===0);return summary;
}
const save=async()=>{report.final=snapshot();report.buildAfter=await(await fetch('/stl/info')).json();status.textContent+=' · '+await(await fetch('/stl/evidence',{method:'POST',body:JSON.stringify(report,null,2)})).text();};
document.getElementById('dig29-save').onclick=async()=>{try{const last=capture.at(-1);if(last&&last.mode.startsWith('real')&&!report.downloads.some(d=>d.mode.startsWith('real')))await parse(last,store.getState().result);await save();}catch(e){status.textContent=String(e);}};
document.getElementById('dig29-load').onclick=async()=>{await load('offset-nested-transforms');await settle();status.textContent='Fixture ready: offset-nested-transforms.svg. Click Enable real STL download, then the app Export STL button.';};
document.getElementById('dig29-native').onclick=()=>{intercept=false;status.textContent='Real anchor download enabled. Click the app Export STL button; expected offset-nested-transforms.stl. Inspect browser Downloads to verify an actual saved file separately.';};
document.getElementById('dig29-run').onclick=async()=>{try{
 intercept=true;status.textContent='Running intercepted workflow';check('empty STL and 3MF disabled',buttons().every(b=>b.disabled));
 await load('offset-nested-transforms','CON.svg');check('import/generation pending disables STL',stl().disabled);await settle();check('current STL enabled, 3MF disabled',!stl().disabled&&buttons()[1].disabled);
 let expected=store.getState().result;stl().click();await wait(30);await parse(capture.at(-1),expected);check('sanitized filename',capture.at(-1).fileName==='_CON.stl');
 const thickness=$('input[aria-label="Thickness for Transformed tile (mm)"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(thickness,'0.7');thickness.dispatchEvent(new Event('input',{bubbles:true}));thickness.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));await ui();const before=capture.length;stl().click();check('pending/stale cannot download previous geometry',stl().disabled&&capture.length===before);await settle();
 expected=store.getState().result;stl().click();await wait(30);await parse(capture.at(-1),expected);check('latest revision has 2.3 mm height',Math.abs(expected.dimensionsMm[2]-2.3)<1e-12&&expected.input.settingsRevision===store.getState().settings.revision);
 await load('unsupported-script');await settle();check('failed replacement retains current STL and original filename',store.getState().result===expected&&!stl().disabled);stl().click();await wait(30);await parse(capture.at(-1),expected);check('retained source filename used',capture.at(-1).fileName==='_CON.stl');
 const beforeFailure=store.getState();fail=true;stl().click();await ui();fail=false;check('browser action failure visible without domain mutation',!!document.querySelector('.export-controls [role=alert]')&&store.getState()===beforeFailure&&blobs.size===0);
 stl().click();await wait(30);await parse(capture.at(-1),expected);check('retry clears only browser error',!document.querySelector('.export-controls [role=alert]'));
 await load('over-lower-hole');await settle();const prior=capture.length;stl().click();check('invalid support cannot export old geometry',store.getState().result?.status==='invalid'&&stl().disabled&&capture.length===prior);
 check('STL geometry-only/unitless mm convention disclosed',$('.export-controls').textContent.includes('no colors or layers')&&$('.export-controls').textContent.includes('format has no units')&&$('.export-controls').textContent.includes('millimeters'));
 check('no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth);await load('offset-nested-transforms');await settle();status.textContent='Complete: '+report.checks.length+' checks passed (intercepted; no OS save claimed).';await save();
}catch(e){fail=false;report.errors.push(String(e));status.textContent='Failed: '+e;await save();}};
})();
