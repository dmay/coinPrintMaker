import './setup';
import { expect, test } from 'vitest';
import type { MeshMetrics, Point3Mm, TriangleMesh } from '../../app/src/core/contracts';
import { serializeBinaryStl, STL_HEADER, STL_PRECISION } from '../../app/src/core/serializeBinaryStl';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { generateCoin } from '../../app/src/core/generateCoin';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { loadFixtures } from './helpers/fixtures';

const cube: TriangleMesh = { vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
  triangles:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]] };
const metrics: MeshMetrics = { boundsMm:[[0,0,0],[1,1,1]],volumeMm3:1,shellCount:1 };
const clone = <T>(v:T):T => structuredClone(v);
function read(buffer: ArrayBuffer) {
  const data=new DataView(buffer), count=data.getUint32(80,true), facets:Point3Mm[][]=[], normals:Point3Mm[]=[];
  expect(buffer.byteLength).toBe(84+50*count);
  const header=Array.from(new Uint8Array(buffer,0,80));
  expect(String.fromCharCode(...header.slice(0,STL_HEADER.length))).toBe(STL_HEADER);
  expect(header.slice(STL_HEADER.length).every(v=>v===0)).toBe(true);
  for(let i=0;i<count;i++) {
    const values=Array.from({length:12},(_,j)=>data.getFloat32(84+50*i+4*j,true));
    expect(values.every(Number.isFinite)).toBe(true);
    normals.push(values.slice(0,3) as unknown as Point3Mm);
    facets.push([3,6,9].map(j=>values.slice(j,j+3) as unknown as Point3Mm));
    expect(data.getUint16(84+50*i+48,true)).toBe(0);
  }
  const points=facets.flat(), bounds=[0,1].map(end=>[0,1,2].map(axis=>(end?Math.max:Math.min)(...points.map(p=>p[axis]))));
  // Independent surface-divergence integral, not serializer tetrahedra.
  let volume=0;
  const edges=new Map<string,{uses:number;balance:number}>();
  facets.forEach(([a,b,c],i)=>{
    const u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
    expect(length).toBeGreaterThan(0);
    n.forEach((v,j)=>expect(normals[i][j]).toBeCloseTo(v/length,6));
    volume+=n[2]*(a[2]+b[2]+c[2])/6;
    for(let j=0;j<3;j++) { const x=facets[i][j].join(':'),y=facets[i][(j+1)%3].join(':'),key=x<y?x+'|'+y:y+'|'+x;
      const e=edges.get(key)??{uses:0,balance:0};e.uses++;e.balance+=x<y?1:-1;edges.set(key,e); }
  });
  for(const e of edges.values()) expect(e).toEqual({uses:2,balance:0});
  expect(volume).toBeGreaterThan(0);
  return {facets,bounds,volume};
}
test('exact header/count/little endian coordinates/normal/attribute bytes, detached deterministic output and unchanged input',()=>{
  const before=JSON.stringify(cube),buffer=serializeBinaryStl(cube,metrics),data=new DataView(buffer);
  expect([...new Uint8Array(buffer,80,4)]).toEqual([12,0,0,0]);
  expect([...new Uint8Array(buffer,84+8,4)]).toEqual([0,0,128,191]); // -1 Z normal
  expect(data.getFloat32(84+12+12,true)).toBe(1);
  expect(read(buffer).volume).toBe(1);expect(JSON.stringify(cube)).toBe(before);
  expect(new Uint8Array(serializeBinaryStl(cube,metrics))).toEqual(new Uint8Array(buffer));
  new Uint8Array(buffer).fill(0);expect(read(serializeBinaryStl(cube,metrics)).volume).toBe(1);
});

test.each(['nan','infinity','overflow','underflow','collapse','index','fraction','duplicate','missing','inward','empty','count','vertices','bounds','volume','shells'])( '%s fails closed',kind=>{
  const mesh=clone(cube),m=clone(metrics),vertices=mesh.vertices as unknown as number[][],triangles=mesh.triangles as unknown as number[][];
  if(kind==='nan')vertices[0][0]=NaN;
  if(kind==='infinity')vertices[0][0]=Infinity;
  if(kind==='overflow')vertices[0][0]=1e40;
  if(kind==='underflow')vertices.forEach(p=>p[2]*=1e-50);
  if(kind==='collapse')vertices.forEach(p=>p[0]+=1e10);
  if(kind==='index')triangles[0][0]=99;
  if(kind==='fraction')triangles[0][0]=.5;
  if(kind==='duplicate')triangles.push(triangles[0]);
  if(kind==='missing')triangles.pop();
  if(kind==='inward')triangles.forEach(t=>[t[1],t[2]]=[t[2],t[1]]);
  if(kind==='empty')triangles.length=0;
  if(kind==='count')Object.defineProperty(mesh,'triangles',{value:{length:2**32}});
  if(kind==='vertices')Object.defineProperty(mesh,'vertices',{value:{length:100001}});
  if(kind==='bounds')(m.boundsMm as unknown as number[][])[1][0]=2;
  if(kind==='volume')(m as {volumeMm3:number}).volumeMm3=2;
  if(kind==='shells')(m as {shellCount:number}).shellCount=2;
  expect(()=>serializeBinaryStl(mesh,m)).toThrow();
});
test('closed self-intersection rejects even with plausible metrics',()=>{
  const mesh=clone(cube),v=mesh.vertices as unknown as number[][];[v[4],v[5]]=[v[5],v[4]];
  expect(()=>serializeBinaryStl(mesh,{...metrics,volumeMm3:.5})).toThrow();
});
const fixtures=(await loadFixtures()).filter(f=>f.expected.geometryOutcome==='valid');
test.each(fixtures)('production $name reparses with generated mm bounds, volume, winding and exact triangle order',fixture=>{
  const imported=importCoinSvg({importId:fixture.name,fileName:fixture.name+'.svg',byteLength:fixture.svg.length,svgText:fixture.svg});
  if(imported.status!=='imported')throw Error('import');
  const settings=createDefaultCoinSettings(imported.coin);if(settings.status!=='created')throw Error('settings');
  const generated=generateCoin(imported.coin,settings.settings,polygonClippingKernel,earcutTriangulationKernel);
  if(generated.status!=='valid')throw Error(JSON.stringify(generated));
  const r=read(serializeBinaryStl(generated.unifiedMesh,generated.metrics));
  for(let end=0;end<2;end++)for(let axis=0;axis<3;axis++) {
    const x=generated.metrics.boundsMm[end][axis];
    expect(Math.abs(r.bounds[end][axis]-x)).toBeLessThanOrEqual(STL_PRECISION.absoluteBoundsMm+Math.abs(x)*STL_PRECISION.relativeBounds);
  }
  expect(Math.abs(r.volume-generated.metrics.volumeMm3)).toBeLessThanOrEqual(generated.metrics.volumeMm3*STL_PRECISION.relativeVolume);
  expect(r.facets).toEqual(generated.unifiedMesh.triangles.map(t=>t.map(i=>generated.unifiedMesh.vertices[i].map(Math.fround))));
},30_000);
