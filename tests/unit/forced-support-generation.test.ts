import './setup';
import { expect, test } from 'vitest';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import type { CoinSettings, TriangleMesh, ValidGeneratedCoin } from '../../app/src/core/contracts';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { generateCoin } from '../../app/src/core/generateCoin';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { serializeBinaryStl } from '../../app/src/core/serializeBinaryStl';
import { serialize3mf } from '../../app/src/core/serialize3mf';
import { validateMesh } from '../../app/src/core/validateMesh';
import { isCurrentValidGeneration } from '../../app/src/core/generation';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="40mm" height="40mm" viewBox="0 0 40 40">
  <g id="base" inkscape:groupmode="layer" inkscape:label="Base"><rect width="10" height="10"/></g>
  <g id="middle" inkscape:groupmode="layer" inkscape:label="Middle"><rect x="2" y="2" width="6" height="6"/></g>
  <g id="top" inkscape:groupmode="layer" inkscape:label="Top"><rect x="20" y="2" width="2" height="2"/></g>
</svg>`;
function input() {
  const imported = importCoinSvg({importId:'forced',fileName:'detached.svg',byteLength:svg.length,svgText:svg});
  if (imported.status !== 'imported') throw Error(JSON.stringify(imported));
  const initialized = createDefaultCoinSettings(imported.coin);
  if (initialized.status !== 'created') throw Error('settings');
  const colors = ['#123456','#abcdef','#987654'];
  const settings: CoinSettings = {...initialized.settings,layers:[{...initialized.settings.layers[0],color:colors[0]},...initialized.settings.layers.filter(t=>t.role==='artwork').map((t,i)=>({...t,color:colors[i+1]}))]};
  return {coin:imported.coin,settings};
}
function checked(result: ReturnType<typeof generateCoin>): ValidGeneratedCoin {
  expect(result.status,JSON.stringify(result)).toBe('valid');
  if(result.status!=='valid')throw Error('generation');
  return result;
}
const generate = (coin:ReturnType<typeof input>['coin'],settings:ReturnType<typeof input>['settings']) =>
  checked(generateCoin(coin,settings,polygonClippingKernel,earcutTriangulationKernel));

test('detached upper artwork extends through all lower colors to Z=0, with no bridge or missing material',()=>{
  const {coin,settings}=input(),before=JSON.stringify([coin,settings]),r=generate(coin,settings);
  // Areas 104,40,4 and heights 1.6,.4,.4 => 184 mm3. The added
  // column stays at source X20..22 and page-relative Y36..38.
  expect(r.metrics.shellCount).toBe(2);expect(r.metrics.volumeMm3).toBeCloseTo(184,10);
  expect(r.dimensionsMm).toEqual([22,10,2.4]);expect(r.metrics.boundsMm).toEqual([[0,30,0],[22,40,2.4]]);
  expect(r.parts.map(p=>p.metrics.shellCount)).toEqual([2,2,1]);
  r.parts.forEach((p,i)=>{
    expect(p.color).toBe(settings.layers[i].color);
    expect(p.metrics.volumeMm3).toBeCloseTo([166.4,16,1.6][i],10);
    expect(p.mesh.vertices.filter(v=>v[0]>=20).every(v=>v[0]<=22&&v[1]>=36&&v[1]<=38)).toBe(true);
  });
  expect(r.activeTiers.map(t=>[t.bottomZMm,t.topZMm])).toEqual([[0,1.6],[1.6,2],[2,2.4]]);
  expect(r.colorBoundaryHeightsMm).toEqual([1.6,2]);
  expect(JSON.stringify([coin,settings])).toBe(before);
});

test('both exports include all straight-down material and round-trip disconnected closed shells',()=>{
  const {coin,settings}=input(),r=generate(coin,settings);
  const bytes=serializeBinaryStl(r.unifiedMesh,r.metrics),view=new DataView(bytes),count=view.getUint32(80,true);
  const vertices:TriangleMesh['vertices'][number][]=[],triangles:TriangleMesh['triangles'][number][]=[];
  for(let i=0;i<count;i++){
    const n=vertices.length;triangles.push([n,n+1,n+2]);
    for(let j=0;j<3;j++)vertices.push([0,1,2].map(k=>view.getFloat32(84+50*i+12+12*j+4*k,true)) as unknown as TriangleMesh['vertices'][number]);
  }
  const stl=validateMesh({vertices,triangles},{expectedShellCount:2,expectedVolumeMm3:104*Math.fround(1.6)+40*(2-Math.fround(1.6))+4*(Math.fround(2.4)-2),expectedBoundsMm:[[0,30,0],[22,40,Math.fround(2.4)]]});
  expect(stl.status,JSON.stringify(stl)).toBe('checked');
  const archive=serialize3mf(r),entries=unzipSync(archive),doc=new DOMParser().parseFromString(new TextDecoder().decode(entries['3D/3dmodel.model']),'application/xml');
  const objects=[...doc.querySelectorAll('object')].filter(o=>o.querySelector('mesh'));
  expect(objects).toHaveLength(3);
  objects.forEach((o,i)=>{
    const mesh:TriangleMesh={vertices:[...o.querySelectorAll('vertex')].map(v=>['x','y','z'].map(k=>Number(v.getAttribute(k))) as unknown as TriangleMesh['vertices'][number]),
      triangles:[...o.querySelectorAll('triangle')].map(t=>['v1','v2','v3'].map(k=>Number(t.getAttribute(k))) as unknown as TriangleMesh['triangles'][number])};
    expect(mesh).toEqual(r.parts[i].mesh);
    expect(validateMesh(mesh,{expectedShellCount:[2,2,1][i],expectedVolumeMm3:[166.4,16,1.6][i],expectedBoundsMm:r.parts[i].metrics.boundsMm}).status).toBe('checked');
  });
  expect([...doc.querySelectorAll('basematerials > base')].map(b=>b.getAttribute('displaycolor'))).toEqual(['#123456FF','#ABCDEFFF','#987654FF']);
  expect(()=>new ThreeMFLoader().parse(archive.slice().buffer)).not.toThrow();
});

test('hide/show/reorder rebuilds support; old valid generation cannot authorize export',()=>{
  const {coin,settings}=input(),original=generate(coin,settings);
  const hidden:CoinSettings={...settings,revision:1,layers:[settings.layers[0],...settings.layers.filter(t=>t.role==='artwork').map(t=>({...t,enabled:t.layerId!=='source:top'}))]},r=generate(coin,hidden);
  expect(r.metrics.shellCount).toBe(1);expect(r.metrics.volumeMm3).toBeCloseTo(174.4,10);
  expect(r.metrics.boundsMm).toEqual([[0,30,0],[10,40,2]]);
  expect(isCurrentValidGeneration(original,r.input)).toBe(false);
  const shown=generate(coin,{...settings,revision:2});expect(shown.parts).toEqual(original.parts);
  const reordered=generate(coin,{...settings,revision:3,layers:[settings.layers[0],settings.layers[2],settings.layers[1]]});
  expect(reordered.parts.map(p=>p.layerId)).toEqual(['source:base','source:top','source:middle']);
  expect(reordered.parts.map(p=>p.metrics.shellCount)).toEqual([2,2,1]);
  expect(reordered.metrics.volumeMm3).toBeCloseTo(196.8,10);
});
