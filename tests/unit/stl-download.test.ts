// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { createDownload, stlFileName } from '../../app/src/export/createDownload';
import { exportCurrentStl, STL_EXPORT_FAILURE } from '../../app/src/state/exportStl';
import { createEditorStore } from '../../app/src/state/editorStore';
import { AppShell } from '../../app/src/components/AppShell';
import type { GeneratedCoin, ImportedCoin } from '../../app/src/core/contracts';
import { generateCoin } from '../../app/src/core/generateCoin';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import type { GenerationRequest } from '../../app/src/state/editorStore';

vi.mock('../../app/src/preview/CoinPreview',()=>({CoinPreview:()=>null}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|null=null;
afterEach(async()=>{await act(async()=>root?.unmount());root=null;vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML='';});
test.each([
  ['my coin.svg','my coin.stl'],['coin.SVG','coin.stl'],['coin.STL','coin.stl'],['coin','coin.stl'],
  ['../a\\b:c?.svg','_a_b_c_.stl'],['\u0000a\u001f\u007fb.svg','_a__b.stl'],['.svg','coin.stl'],[' .. .svg','coin.stl'],
  ['CON.svg','_CON.stl'],['con.foo.svg','_con.foo.stl'],['LPT1.svg','_LPT1.stl'],['ordinary.CON.svg','ordinary.CON.stl'],
  ['cafe\u0301星.svg','café星.stl'],['\u202ecoin.svg','_coin.stl'],['a'.repeat(120)+'.svg','a'.repeat(100)+'.stl'],
  ['😀'.repeat(120)+'.svg','😀'.repeat(45)+'.stl'],['trailing. .svg','trailing.stl'],['','coin.stl'],
])('filename %j → %j',(source,expected)=>expect(stlFileName(source)).toBe(expected));

function browser() {
  vi.useFakeTimers();
  const create=vi.fn((_blob:Blob)=> 'blob:local-stl'),revoke=vi.fn();
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}));
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){
    expect(this.isConnected).toBe(true);expect(this.hidden).toBe(true);expect(this.href).toBe('blob:local-stl');
  });
  return {create,revoke,click};
}
test('Blob contains exact bytes; anchor action is local with safe name; removed anchor and next-task exactly-once revoke',async()=>{
  const b=browser(),bytes=new Uint8Array([0,1,254,255]).buffer;
  b.click.mockImplementation(function(this:HTMLAnchorElement){expect(this.download).toBe('_CON.stl');});
  createDownload(bytes,'CON.svg');
  const blob=b.create.mock.calls[0][0] as Blob;
  expect(blob.type).toBe('model/stl');expect(blob.size).toBe(4);
  const reader=new FileReader();const result=new Promise<ArrayBuffer>(resolve=>{reader.onload=()=>resolve(reader.result as ArrayBuffer);});reader.readAsArrayBuffer(blob);
  vi.runAllTimers();expect(b.revoke).toHaveBeenCalledTimes(1);vi.useRealTimers();expect(new Uint8Array(await result)).toEqual(new Uint8Array(bytes));
  expect(document.querySelector('a')).toBeNull();
});
test('normal revoke runs after action even if caller/UI disappears; repeated actions leave no anchors or timers',()=>{
  const b=browser();
  for(let i=0;i<3;i++)createDownload(new ArrayBuffer(1),'coin.svg');
  expect(b.revoke).not.toHaveBeenCalled();expect(document.querySelector('a')).toBeNull();
  document.body.innerHTML='';vi.runAllTimers();expect(b.revoke).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
});
test.each(['blob','url','element','append','click','schedule'])('%s failure has no leaked URL/anchor',kind=>{
  const b=browser(),fail=()=>{throw Error('private browser failure');};
  if(kind==='blob')vi.stubGlobal('Blob',vi.fn(fail));
  if(kind==='url')b.create.mockImplementation(fail);
  if(kind==='element')vi.spyOn(document,'createElement').mockImplementation(fail);
  if(kind==='append')vi.spyOn(document.body,'append').mockImplementation(fail);
  if(kind==='click')b.click.mockImplementation(fail);
  if(kind==='schedule')vi.spyOn(globalThis,'setTimeout').mockImplementation(fail);
  expect(()=>createDownload(new ArrayBuffer(1),'coin.svg')).toThrow();
  expect(b.revoke).toHaveBeenCalledTimes(kind==='blob'||kind==='url'?0:1);expect(document.querySelector('a')).toBeNull();
});

const coin:ImportedCoin={schemaVersion:1,source:{importId:'one',fileName:'original.svg',byteLength:6,svgText:'<svg/>'},physicalPageMm:[10,10],sizeOrigin:'explicit',baseLayerId:'base',diagnostics:[],
  layers:[{id:'base',name:'Base',sourceOrder:0,sourceElements:[],boundsMm:[0,0,10,10],areaMm2:100,footprintMm:[{outer:[[0,0],[10,0],[10,10],[0,10]],holes:[]}]}]};
function harness(){
  const jobs:{request:GenerationRequest;finish:(r:GeneratedCoin)=>void}[]=[];
  const store=createEditorStore({execute:request=>new Promise(resolve=>jobs.push({request,finish:resolve}))});
  const imported=(c=coin)=>store.getState().finishImport(store.getState().beginImport(c.source.fileName),{status:'imported',coin:c,diagnostics:[]});
  const finish=async(i:number)=>{await act(async()=>jobs[i].finish(generateCoin(jobs[i].request.coin,jobs[i].request.settings,polygonClippingKernel,earcutTriangulationKernel)));};
  return {store,jobs,imported,finish};
}
test('only exact current snapshot authorizes download; pending/invalid/stale/importing never fall back, rejected replacement restores original filename',async()=>{
  const h=harness(),serialize=vi.fn(()=>new ArrayBuffer(84)),download=vi.fn(),deps={serialize,download};
  expect(exportCurrentStl(h.store,deps)).toBe(STL_EXPORT_FAILURE);
  await act(async()=>h.imported());expect(exportCurrentStl(h.store,deps)).toBe(STL_EXPORT_FAILURE);await h.finish(0);
  const snapshot=h.store.getState().result!;expect(snapshot.status).toBe('valid');
  expect(exportCurrentStl(h.store,deps)).toBeNull();expect(serialize).toHaveBeenLastCalledWith(snapshot.unifiedMesh,snapshot.metrics);
  expect(download).toHaveBeenLastCalledWith(expect.any(ArrayBuffer),'original.svg');
  const id=h.store.getState().beginImport('replacement.svg');expect(exportCurrentStl(h.store,deps)).toBe(STL_EXPORT_FAILURE);
  h.store.getState().finishImport(id,{status:'rejected',diagnostics:[]});expect(exportCurrentStl(h.store,deps)).toBeNull();
  await act(async()=>h.store.getState().setThickness('base',2));expect(exportCurrentStl(h.store,deps)).toBe(STL_EXPORT_FAILURE);
  await act(async()=>h.store.getState().setThickness('base',3));await h.finish(1);expect(exportCurrentStl(h.store,deps)).toBe(STL_EXPORT_FAILURE);
  await h.finish(2);expect(exportCurrentStl(h.store,deps)).toBeNull();
  h.store.getState().setColor('base','#ffffff');expect(exportCurrentStl(h.store,deps)).toBeNull();expect(h.jobs).toHaveLength(3);
  const s=h.store.getState();h.store.setState({settings:{...s.settings!,revision:99}});expect(exportCurrentStl(h.store,deps)).toBe(STL_EXPORT_FAILURE);
  h.store.setState({generationStatus:'invalid',result:{schemaVersion:1,status:'invalid',diagnostics:[]}});expect(exportCurrentStl(h.store,deps)).toBe(STL_EXPORT_FAILURE);
  expect(download).toHaveBeenCalledTimes(4);h.store.dispose();
});
test.each(['edit','replacement','throw'])('reentrant %s during serialization cannot download captured snapshot',async kind=>{
  const h=harness();await act(async()=>h.imported());await h.finish(0);const download=vi.fn();
  const serialize=()=>{if(kind==='edit')h.store.getState().setThickness('base',2);if(kind==='replacement')h.store.getState().beginImport('new.svg');if(kind==='throw')throw Error('private');return new ArrayBuffer(1);};
  expect(exportCurrentStl(h.store,{serialize,download})).toBe(STL_EXPORT_FAILURE);expect(download).not.toHaveBeenCalled();h.store.dispose();
});
test('real shell current STL click performs download; failures show bounded alert, do not mutate domain and retry clears browser error',async()=>{
  const b=browser(),h=harness(),container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root!.render(createElement(AppShell,{store:h.store})));
  const buttons=()=>[...container.querySelectorAll<HTMLButtonElement>('.export-controls button')];
  expect(buttons().map(b=>b.disabled)).toEqual([true,true]);
  await act(async()=>h.imported());await h.finish(0);expect(buttons().map(b=>b.disabled)).toEqual([false,true]);
  const before=h.store.getState();b.click.mockImplementationOnce(()=>{throw Error('secret');});
  await act(async()=>buttons()[0].click());expect(container.querySelector('[role="alert"]')?.textContent).toBe(STL_EXPORT_FAILURE);
  expect(container.textContent).not.toContain('secret');expect(h.store.getState()).toBe(before);expect(b.revoke).toHaveBeenCalledTimes(1);
  await act(async()=>buttons()[0].click());expect(container.querySelector('[role="alert"]')).toBeNull();expect(b.create).toHaveBeenCalledTimes(2);
  await act(async()=>root!.unmount());root=null;vi.runAllTimers();expect(b.revoke).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain('saved');
});
