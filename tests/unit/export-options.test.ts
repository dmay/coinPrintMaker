// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { createEditorStore, selectExportableGeometry } from '../../app/src/state/editorStore';
import { exportCurrentCoin, exportFailure } from '../../app/src/state/exportCoin';
import { createFileDownload, exportFileName } from '../../app/src/export/createDownload';
import { serialize3mf } from '../../app/src/core/serialize3mf';
import { serializeBinaryStl } from '../../app/src/core/serializeBinaryStl';
import { generateCoin } from '../../app/src/core/generateCoin';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { readFileSync } from 'node:fs';
import { AppShell } from '../../app/src/components/AppShell';

vi.mock('../../app/src/preview/CoinPreview',()=>({CoinPreview:()=>null}));
// jsdom and Node's TextEncoder use different typed-array realms. fflate's
// instanceof check needs its input in the same realm as its module's Uint8Array.
vi.mock('three/addons/libs/fflate.module.js',async importOriginal=>{
  const actual=await importOriginal<typeof import('three/addons/libs/fflate.module.js')>();
  return {...actual,strToU8:(text:string)=>new Uint8Array(actual.strToU8(text))};
});
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|null=null;
afterEach(async()=>{await act(async()=>root?.unmount());root=null;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();document.body.innerHTML='';});
async function harness() {
  const execute=vi.fn(request=>generateCoin(request.coin,request.settings,polygonClippingKernel,earcutTriangulationKernel));
  const store=createEditorStore({execute});
  const svg=readFileSync('fixtures/svg/twin-stars.svg','utf8');
  const imported=importCoinSvg({importId:'options',fileName:'Stars.svg',byteLength:svg.length,svgText:svg});
  if(imported.status!=='imported')throw Error('fixture');
  await act(async()=>store.getState().finishImport(store.getState().beginImport('Stars.svg'),imported));
  expect(selectExportableGeometry(store.getState())).not.toBeNull();
  return {store,execute};
}
const formats=['stl','3mf'] as const;
test.each(formats)('%s names normalize chosen suffix, dangerous names and repeated extensions',format=>{
  for(const [name,stem] of [['','coin'],[' ... ','coin'],['CON','_CON'],['../a\\b:c?','_a_b_c_'],['coin.STL.3mf.stl','coin'],['coin.svg','coin'],['星','星']])
    expect(exportFileName(name,format)).toBe(stem+'.'+format);
});
test.each(formats)('%s boundary uses exact bytes, correct MIME/name and independent URL cleanup',async format=>{
  vi.useFakeTimers();const create=vi.fn(()=> 'blob:test'),revoke=vi.fn();
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}));
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){expect(this.download).toBe('_CON.'+format);expect(this.isConnected).toBe(true);});
  createFileDownload(new Uint8Array([0,1,255]).buffer,'CON.stl.3mf',format);
  expect((create.mock.calls as unknown as [Blob][])[0][0].type).toBe('model/'+format);
  expect((create.mock.calls as unknown as [Blob][])[0][0].size).toBe(3);
  expect(document.querySelector('a')).toBeNull();expect(revoke).not.toHaveBeenCalled();vi.runAllTimers();expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test');
});
test.each(formats.flatMap(format=>['blob','url','element','append','click','schedule'].map(kind=>({format,kind}))))('$format $kind failure cleans up URL',({format,kind})=>{
  vi.useFakeTimers();const create=vi.fn(()=> 'blob:test'),revoke=vi.fn(),fail=()=>{throw Error('private');};
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}));
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  if(kind==='blob')vi.stubGlobal('Blob',vi.fn(function(){throw Error('private');}));if(kind==='url')create.mockImplementation(fail);
  if(kind==='element')vi.spyOn(document,'createElement').mockImplementation(fail);if(kind==='append')vi.spyOn(document.body,'append').mockImplementation(fail);
  if(kind==='click')click.mockImplementation(fail);if(kind==='schedule')vi.spyOn(globalThis,'setTimeout').mockImplementation(fail);
  expect(()=>createFileDownload(new ArrayBuffer(1),'coin',format)).toThrow();expect(revoke).toHaveBeenCalledTimes(kind==='blob'||kind==='url'?0:1);expect(document.querySelector('a')).toBeNull();
});
test('unsupported runtime format cannot invoke a serializer or download',async()=>{
  const {store}=await harness(),stl=vi.fn(),threeMf=vi.fn(),download=vi.fn();
  expect(exportCurrentCoin(store,{format:'zip' as '3mf',fileName:'coin'},{stl,threeMf,download})).toBe('Choose STL or 3MF to export.');
  expect(stl).not.toHaveBeenCalled();expect(threeMf).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();store.dispose();
});
test('color-only editor edits reach real 3MF material references from current snapshot, preserving checked meshes with no geometry job',async()=>{
  const {store,execute}=await harness(),before=selectExportableGeometry(store.getState())!;
  store.getState().setColor(before.parts[1].layerId,'#123abc');
  const current=selectExportableGeometry(store.getState())!;
  expect(execute).toHaveBeenCalledTimes(1);expect(current.unifiedMesh).toBe(before.unifiedMesh);expect(current.parts[1].mesh).toBe(before.parts[1].mesh);
  expect(current.input.settingsRevision).toBe(store.getState().settings!.revision);
  const download=vi.fn();expect(exportCurrentCoin(store,{format:'3mf',fileName:'Colors'},{stl:serializeBinaryStl,threeMf:serialize3mf,download})).toBeNull();
  const entries=unzipSync(new Uint8Array(download.mock.calls[0][0]));
  expect(Object.keys(entries)).toContain('3D/3dmodel.model');
  expect(entries['3D/3dmodel.model'].length).toBeGreaterThan(100);
  const doc=new DOMParser().parseFromString(new TextDecoder().decode(entries['3D/3dmodel.model']),'application/xml');
  expect(doc.querySelector('parsererror')).toBeNull();const bases=[...doc.querySelectorAll('base')],objects=[...doc.querySelectorAll('object')].filter(o=>o.querySelector('mesh'));
  expect(bases[1].getAttribute('displaycolor')).toBe('#123ABCFF');
  objects.forEach((o,i)=>{expect(o.getAttribute('pid')).toBe(doc.querySelector('basematerials')!.getAttribute('id'));expect(o.getAttribute('pindex')).toBe(String(i));expect(o.getAttribute('name')).toBe(current.parts[i].name);expect(o.getAttribute('partnumber')).toBe(current.parts[i].layerId);expect(bases[i].getAttribute('displaycolor')).toBe(current.parts[i].color.toUpperCase()+'FF');});store.dispose();
});
test.each(formats)('%s exports latest visible tiers and current thickness; no previous-valid fallback',async format=>{
  const {store}=await harness(),before=selectExportableGeometry(store.getState())!,download=vi.fn();
  const deps={stl:vi.fn(serializeBinaryStl),threeMf:vi.fn(serialize3mf),download},choices={format,fileName:'visible'};
  await act(async()=>store.getState().setEnabled(before.parts.at(-1)!.layerId,false));
  await act(async()=>store.getState().setThickness(before.parts[0].layerId,2));
  const current=selectExportableGeometry(store.getState())!;expect(current.parts).toHaveLength(before.parts.length-1);
  expect(exportCurrentCoin(store,choices,deps)).toBeNull();
  if(format==='stl')expect(deps.stl).toHaveBeenCalledWith(current.unifiedMesh,current.metrics);else expect(deps.threeMf).toHaveBeenCalledWith(current);
  const count=download.mock.calls.length;
  store.getState().setThickness(before.parts[0].layerId,0);expect(exportCurrentCoin(store,choices,deps)).toBe(exportFailure(format));
  await act(async()=>{});expect(exportCurrentCoin(store,choices,deps)).toBe(exportFailure(format));
  store.setState({previousValid:before});expect(exportCurrentCoin(store,choices,deps)).toBe(exportFailure(format));expect(download).toHaveBeenCalledTimes(count);store.dispose();
});
test.each(formats.flatMap(format=>['edit','color','replacement','source','revision','throw'].map(kind=>({format,kind}))))('$format reentrant $kind rejects captured bytes before side effects',async({format,kind})=>{
  const {store}=await harness(),download=vi.fn();
  const mutate=()=>{const s=store.getState(),id=s.settings!.layers[0].layerId;
    if(kind==='edit')s.setThickness(id,2);if(kind==='color')s.setColor(id,'#123456');if(kind==='replacement')s.beginImport('new.svg');
    if(kind==='source')store.setState({importState:{...s.importState,coin:{...s.importState.coin!,source:{...s.importState.coin!.source}}}});
    if(kind==='revision')store.setState({sourceRevision:s.sourceRevision+1});if(kind==='throw')throw Error('private');};
  expect(exportCurrentCoin(store,{format,fileName:'coin'},{stl:()=>{mutate();return new ArrayBuffer(1);},threeMf:()=>{mutate();return new Uint8Array(1);},download})).toBe(exportFailure(format));expect(download).not.toHaveBeenCalled();store.dispose();
});
test.each(formats)('%s toolbar downloads immediately with the SVG name and reports retryable errors',async format=>{
  const {store}=await harness(),container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root!.render(createElement(AppShell,{store})));
  const button=container.querySelector<HTMLButtonElement>(`[aria-label="Export ${format.toUpperCase()}"]`)!;
  const create=vi.fn().mockImplementationOnce(()=>{throw Error('private');}).mockReturnValue('blob:coin');
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:vi.fn()}));
  const names:string[]=[];vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){names.push(this.download);});
  await act(async()=>button.click());expect(container.querySelector('.export-error')?.textContent).toBe(exportFailure(format));
  expect(container.querySelector('dialog,#export-filename')).toBeNull();
  await act(async()=>button.click());expect(names).toEqual(['Stars.'+format]);expect(container.querySelector('.export-error')).toBeNull();
  expect(container.querySelector('.toolbar')?.textContent).not.toContain('Current geometry');
  expect(container.textContent).not.toContain('STL and 3MF are available');
  await act(async()=>store.getState().beginImport('new.svg'));expect(button.disabled).toBe(true);
  await act(async()=>button.click());expect(names).toHaveLength(1);
});

test('direct 3MF download resolves current colors and replacement SVG filename',async()=>{
  const {store,execute}=await harness(),container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root!.render(createElement(AppShell,{store})));
  await act(async()=>store.getState().setColor(store.getState().settings!.layers[1].layerId,'#abcdef'));expect(execute).toHaveBeenCalledTimes(1);
  const blobs:Blob[]=[],names:string[]=[];
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:(blob:Blob)=>{blobs.push(blob);return 'blob:coin';},revokeObjectURL:vi.fn()}));
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){names.push(this.download);});
  async function downloadXml(){await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Export 3MF"]')!.click());
    const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(blobs.at(-1)!);});
    const entries=unzipSync(new Uint8Array(bytes));return new DOMParser().parseFromString(new TextDecoder().decode(entries['3D/3dmodel.model']),'application/xml');}
  let xml=await downloadXml();expect(xml.querySelectorAll('base')[1].getAttribute('displaycolor')).toBe('#ABCDEFFF');expect(names.at(-1)).toBe('Stars.3mf');
  const svg=readFileSync('fixtures/svg/offset-nested-transforms.svg','utf8');
  const replacement=importCoinSvg({importId:'new-source',fileName:'New.coin.stl.svg',byteLength:svg.length,svgText:svg});
  await act(async()=>store.getState().finishImport(store.getState().beginImport('New.coin.stl.svg'),replacement));
  const current=selectExportableGeometry(store.getState())!;xml=await downloadXml();
  expect([...xml.querySelectorAll('object')].filter(o=>o.querySelector('mesh')).map(o=>o.getAttribute('partnumber'))).toEqual(current.parts.map(p=>p.layerId));
  expect(names.at(-1)).toBe('New.coin.stl.3mf');expect(container.querySelector('dialog')).toBeNull();
});
