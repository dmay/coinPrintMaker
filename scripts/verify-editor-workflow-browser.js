// Developer observer, not part of the production application. Synthetic inputs
// exercise actual DOM handlers, importer, native Worker and unchanged engine.
(async()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ui=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const report={variant:'DIG-28 production workflow, synthetic inputs',environment:{ua:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]},build:await(await fetch('/editor/info')).json(),states:[],checks:[],errors:[]};
window.addEventListener('error',e=>report.errors.push(e.message));
let store;
for(let tries=0;tries<200&&!store;tries++){
 const root=document.getElementById('root'),key=root&&Object.keys(root).find(k=>k.startsWith('__reactContainer'));
 const f=key&&root[key],pending=[f?.stateNode?.current??f],seen=new Set();
 while(pending.length){const n=pending.pop();if(!n||seen.has(n))continue;seen.add(n);pending.push(n.child,n.sibling);let h=n.memoizedState;for(let i=0;h&&i<50;i++,h=h.next){const v=h.memoizedState;if(v?.getState&&v?.subscribe){store=v;break;}}if(store)break;}
 if(!store)await wait(25);
}
if(!store)throw Error('Store observer unavailable');
function snapshot(){const s=store.getState();return {time:performance.now(),status:s.generationStatus,token:s.generationToken,sourceRevision:s.sourceRevision,settingsRevision:s.settings?.revision,input:s.result?.input,importId:s.importState.coin?.source.importId,pendingFile:s.importState.pendingFileName,file:s.importState.coin?.source.fileName,result:s.result?.status,dimensions:s.result?.dimensionsMm,volume:s.result?.metrics?.volumeMm3,tiers:s.result?.activeTiers?.map(t=>({id:t.layerId,bottom:t.bottomZMm,top:t.topZMm})),diagnostics:s.result?.diagnostics.map(d=>({code:d.code,severity:d.severity,location:d.location})),order:s.settings?.layers.map(l=>({id:l.layerId,enabled:l.enabled})),selected:s.selectedLayerId};}
store.subscribe(()=>report.states.push(snapshot()));
const fixtures=await(await fetch('/editor/fixtures')).json();
const panel=document.createElement('aside');panel.style='background:white;border:2px solid #006c9e;padding:12px;margin:16px;font:14px sans-serif';
panel.innerHTML='<h2>Local developer verification</h2><button id="dig28-run">Run editor workflow</button> <button id="dig28-save">Save editor evidence</button><button id="dig28-rapid">Run rapid layer edits</button><p id="dig28-status">Ready. Worker assets have an explicit 150 ms response delay to expose pending states.</p>';
document.body.append(panel);const status=document.getElementById('dig28-status');
const save=async()=>{report.buildAfter=await(await fetch('/editor/info')).json();report.final=snapshot();return fetch('/editor/evidence',{method:'POST',body:JSON.stringify(report,null,2)});};
document.getElementById('dig28-save').onclick=save;
async function settle(){for(let i=0;i<500;i++){const s=store.getState();if(s.importState.pendingFileName===null&&s.generationStatus!=='pending'){await ui();return;}await wait(20);}throw Error('Settle timeout');}
function check(label,condition){report.checks.push({label,pass:!!condition,state:snapshot(),measurements:document.querySelector('.dimension-summary')?.textContent,diagnostics:document.querySelector('.diagnostics-panel')?.textContent,exports:document.querySelector('.export-controls')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth});if(!condition)throw Error(label);}
const $=selector=>{const e=document.querySelector(selector);if(!e)throw Error('Missing '+selector);return e;};
const click=name=>{const e=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent===name);if(!e)throw Error('Missing button '+name);e.click();};
const load=async name=>{const transfer=new DataTransfer();transfer.items.add(new File([fixtures[name]],name+'.svg',{type:'image/svg+xml'}));const input=$('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await wait(15);await ui();};
const disabledExports=()=>[...document.querySelectorAll('.export-controls button')].every(b=>b.disabled);
const noMetrics=()=>!document.querySelector('.dimension-summary dl,.dimension-summary table');
async function rapid(){const actions=[()=>$('#editor input[aria-label="Show Ring"]').click(),()=>click('Move Unsupported center toward base'),()=>$('#editor input[aria-label="Show Ring"]').click(),()=>$('#editor input[aria-label="Show Ring"]').click(),()=>$('#editor input[aria-label="Show Ring"]').click()];for(const action of actions){action();await wait(5);}await ui();check('rapid pending has no current metrics and exports disabled',noMetrics()&&store.getState().generationStatus==='pending'&&disabledExports());await settle();const s=store.getState();check('rapid latest order/visibility settles to checked current revision',s.result?.status==='valid'&&s.result.input.settingsRevision===s.settings.revision&&s.settings.layers[1].layerId==='source:art'&&s.settings.layers[2].enabled===false);}
document.getElementById('dig28-rapid').onclick=async()=>{try{await load('over-lower-hole');await settle();$('#editor input[aria-label="Show Ring"]').click();await settle();await rapid();status.textContent='Rapid complete';await save();}catch(e){status.textContent='Failed '+e;report.errors.push(String(e));await save();}};
document.getElementById('dig28-run').onclick=async()=>{try{
 status.textContent='Running';await load('over-lower-hole');await settle();
 check('invalid support has layer IDs, lower ID, action and no measurements',store.getState().result?.status==='invalid'&&$('.diagnostics-panel').textContent.includes('ID: source:art')&&$('.diagnostics-panel').textContent.includes('ID: source:ring')&&$('.diagnostics-panel').textContent.includes('Action:')&&noMetrics()&&disabledExports());
 const before=snapshot();click('Select layer source:art');await ui();const after=snapshot();check('diagnostic selection changes no geometry settings/token',after.selected==='source:art'&&before.token===after.token&&before.settingsRevision===after.settingsRevision);
 $('#editor input[aria-label="Show Ring"]').click();await ui();check('pending clears invalid diagnostics and measurements',noMetrics()&&!$('.diagnostics-panel').textContent.includes('SUPPORT_OUTSIDE_LOWER'));
 await settle();check('hidden ring gives exact current 2 mm height and active tiers',store.getState().result?.status==='valid'&&store.getState().result.dimensionsMm[2]===2&&store.getState().result.activeTiers.map(t=>t.layerId).join(',')==='source:base,source:art');
 await rapid();
 await load('inferred-size');await settle();check('current warning is distinguished from error and exporter remains unavailable',$('.diagnostics-panel').textContent.includes('Warning · SOURCE_SIZE_INFERRED')&&$('.diagnostics-panel').textContent.includes('0 errors')&&$('.export-controls').textContent.includes('Current geometry is valid')&&disabledExports());
 const kept=store.getState().result;await load('unsupported-script');await settle();check('failed candidate remains separate from retained current coin',store.getState().result===kept&&$('.import-status').textContent.includes('Replacement failed')&&$('.dimension-summary').textContent.includes('retained loaded SVG')&&!$('.diagnostics-panel').textContent.includes('SCRIPT_UNSUPPORTED'));
 await load('offset-nested-transforms');check('new import pending has no checked measurements',noMetrics()&&disabledExports());await settle();
 check('new import checked volume/dimensions/Z are independent of WebGL',store.getState().result?.status==='valid'&&!!document.querySelector('.dimension-summary dl')&&!!document.querySelector('.dimension-summary table')&&$('.dimension-summary').textContent.includes('mm³')&&disabledExports());
 const thickness=$('input[aria-label="Thickness for Transformed tile (mm)"]');
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(thickness,'0.7');thickness.dispatchEvent(new Event('input',{bubbles:true}));thickness.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));await ui();
 check('geometry edit pending labels previous checked result stale and hides measurements',store.getState().generationStatus==='pending'&&noMetrics()&&$('.dimension-summary').textContent.includes('stale')&&disabledExports());await settle();
 check('edited checked measurements replace stale values',store.getState().result?.status==='valid'&&Math.abs(store.getState().result.dimensionsMm[2]-2.3)<1e-12&&!!document.querySelector('.dimension-summary table'));
 check('source SVG is never mounted or executed',!document.querySelector('#editor svg,#editor img,#editor script'));
 check('current viewport has no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth);
 status.textContent='Complete: '+report.checks.length+' checks passed';await save();
}catch(e){report.errors.push(String(e));status.textContent='Failed '+e;await save();}};
})();
