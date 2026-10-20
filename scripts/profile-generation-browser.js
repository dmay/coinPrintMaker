// Developer observer only; not imported by the application or Pages build.
(async()=>{
 const report={variant:'DIG-27 Worker production build',build:await(await fetch('/profile/info')).json(),environment:{ua:navigator.userAgent,cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]},runs:[],longtasks:[],frames:[],ticks:[],states:[],errors:[]};
 window.__dig27=report;
 new PerformanceObserver(l=>report.longtasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:false});
 let previous=performance.now();function frame(t){report.frames.push({start:previous,duration:t-previous});previous=t;requestAnimationFrame(frame)}requestAnimationFrame(frame);
 let tickAt=performance.now();setInterval(()=>{const t=performance.now();report.ticks.push({start:tickAt,duration:t-tickAt});tickAt=t},16);
 window.addEventListener('error',e=>report.errors.push(e.message));
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 let store;
 for(let tries=0;tries<200&&!store;tries++){
  const root=document.getElementById('root');const key=root&&Object.keys(root).find(k=>k.startsWith('__reactContainer'));
  const fiber=key&&root[key];const pending=[fiber?.stateNode?.current??fiber];const seen=new Set();
  while(pending.length){const f=pending.pop();if(!f||seen.has(f))continue;seen.add(f);pending.push(f.child,f.sibling);let h=f.memoizedState;for(let i=0;h&&i<50;i++,h=h.next){const v=h.memoizedState;if(v?.getState&&v?.subscribe){store=v;break}}if(store)break}
  if(!store)await wait(50);
 }
 if(!store){report.errors.push('Editor store not located');return;}
 const summary=s=>({time:performance.now(),status:s.generationStatus,token:s.generationToken,sourceRevision:s.sourceRevision,revision:s.settings?.revision,pending:s.importState.pendingFileName,file:s.importState.coin?.source.fileName,importId:s.importState.coin?.source.importId,input:s.result?.input,result:s.result?.status,diagnostics:[...s.importState.diagnostics,...(s.result?.diagnostics??[])].map(d=>d.code),vertices:s.importState.coin?.layers.reduce((sum,l)=>sum+l.footprintMm.reduce((n,p)=>n+p.outer.length+p.holes.reduce((a,r)=>a+r.length,0),0),0),unifiedVertices:s.result?.unifiedMesh?.vertices.length,unifiedTriangles:s.result?.unifiedMesh?.triangles.length,partVertices:s.result?.parts?.map(p=>p.mesh.vertices.length),partTriangles:s.result?.parts?.map(p=>p.mesh.triangles.length),dimensions:s.result?.dimensionsMm});
 store.subscribe(s=>report.states.push(summary(s)));
 const fixtures=await(await fetch('/profile/fixtures')).json();
 const panel=document.createElement('div');panel.style='position:fixed;bottom:0;left:0;background:#fff;color:#111;padding:8px;z-index:9999;font:14px sans-serif';panel.innerHTML='<button id="dig27-run">Run generation profile</button> <button id="dig27-save">Save measurements</button><button id="dig27-fault">Test Worker failure</button><span id="dig27-status"> Ready</span>';document.body.append(panel);
 const status=document.getElementById('dig27-status');
 const save=async()=>{report.buildAfter=await(await fetch('/profile/info')).json();return fetch('/profile/evidence',{method:'POST',body:JSON.stringify(report,null,2)});};
 document.getElementById('dig27-save').onclick=save;
 async function settle(){for(let i=0;i<500;i++){const s=store.getState();if(s.importState.pendingFileName===null&&s.generationStatus!=='pending')return;await wait(20)}throw Error('settle timeout')}
 async function measure(label,action,delay=0){await wait(120);const start=performance.now(),stateIndex=report.states.length;status.textContent=' Running '+label;action();if(delay)await wait(delay);await settle();await wait(100);const end=performance.now();const entry={label,start,end,wallMs:end-start-100,states:report.states.slice(stateIndex),final:summary(store.getState()),longtasks:report.longtasks.filter(x=>x.start>=start&&x.start<end),maxFrameGapMs:Math.max(0,...report.frames.filter(x=>x.start+x.duration>=start&&x.start<end).map(x=>x.duration)),maxTimerGapMs:Math.max(0,...report.ticks.filter(x=>x.start+x.duration>=start&&x.start<end).map(x=>x.duration))};report.runs.push(entry);status.textContent=' '+label+' '+entry.wallMs.toFixed(1)+'ms';await save();}
 const importFixture=name=>{const dt=new DataTransfer();dt.items.add(new File([fixtures[name]],name+'.svg',{type:'image/svg+xml'}));const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
 function edit(value){const input=document.querySelector('input[aria-label^="Thickness"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));}
 document.getElementById('dig27-fault').onclick=async()=>{await fetch('/profile/fault-next-worker',{method:'POST'});const thickness=store.getState().settings.layers[0].thicknessMm;edit(thickness+0.01);setTimeout(()=>edit(thickness+0.02),30);};
 document.getElementById('dig27-run').onclick=async()=>{try{
  for(const name of Object.keys(fixtures)){for(let run=1;run<=3;run++){await measure(name+' import '+run,()=>importFixture(name));if(store.getState().result?.status==='valid'&&store.getState().importState.coin.source.fileName===name+'.svg')await measure(name+' edit '+run,()=>edit(1.6+run/10));}}
  await measure('sun repeated 4 Enter edits at 30ms intervals',()=>{importFixture('sun-medallion')});
  const actual=[];await measure('sun rapid Enter edits',()=>{for(let i=0;i<4;i++){const scheduled=performance.now()+i*30;setTimeout(()=>{actual.push({scheduled,actual:performance.now()});edit(2+i/10)},i*30)}},150);report.rapidInputs=actual;await settle();report.rapidFinal=summary(store.getState());status.textContent=' Complete';await save();
 }catch(e){report.errors.push(String(e));status.textContent=' Failed '+e;await save()}};
})();
