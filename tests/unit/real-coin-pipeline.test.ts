import './setup';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,test} from 'vitest';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import type {MeshMetrics,Point3Mm,Triangle,TriangleMesh} from '../../app/src/core/contracts';
import {importCoinSvg} from '../../app/src/import/importCoinSvg';
import {createDefaultCoinSettings} from '../../app/src/core/resolveStack';
import {generateCoin} from '../../app/src/core/generateCoin';
import {polygonClippingKernel} from '../../app/src/import/polygonClippingKernel';
import {earcutTriangulationKernel} from '../../app/src/import/earcutTriangulationKernel';
import {serializeBinaryStl} from '../../app/src/core/serializeBinaryStl';
import {serialize3mf} from '../../app/src/core/serialize3mf';
import {inspectMeshTopology} from '../../app/src/core/meshTopology';
import {MeshValidationBudget} from '../../app/src/core/meshConstructionPolicy';
import {STL_CLEANUP_MM} from '../../app/src/core/prepareStlMesh';

interface FixtureCase {
 id:string;file:string;sha256:string;sourceIssue:string;
 expected:{stages:{import:string;generation:string;stl:string;threeMf:string};physicalPageMm:number[];
 layers:{id:string;name:string;color:string;regionCount:number;holeCount:number;sourceElementIds:string[]}[];
 boundsMm:MeshMetrics['boundsMm'];volumeMm3:number;unifiedShellCount:number;partShellCounts:number[]};
}
const manifest=JSON.parse(readFileSync(new URL('../../fixtures/regressions/cases.json',import.meta.url),'utf8')) as {schemaVersion:number;cases:FixtureCase[]};

/** Independent byte reader and divergence-integral volume. Avoid a large XML DOM
 * for these production fixtures so the same cases can run in the bulk harness. */
function readStl(bytes:ArrayBuffer):{mesh:TriangleMesh;volume:number}{
 const data=new DataView(bytes),count=data.getUint32(80,true);
 expect(bytes.byteLength).toBe(84+50*count);expect(count).toBeGreaterThan(0);
 const vertices:Point3Mm[]=[],triangles:Triangle[]=[],ids=new Map<string,number>();let volume=0;
 for(let i=0;i<count;i++){
  const offset=84+50*i,normal=[0,1,2].map(j=>data.getFloat32(offset+j*4,true));
  const p=[0,1,2].map(v=>[0,1,2].map(axis=>data.getFloat32(offset+12+12*v+4*axis,true)) as unknown as Point3Mm);
  const [a,b,c]=p,u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  if(!p.flat().every(Number.isFinite)||!normal.every(Number.isFinite)||!(length>0)
   || normal.some((x,j)=>Math.abs(x-n[j]/length)>1e-6)||data.getUint16(offset+48,true)!==0)throw Error('Invalid STL facet bytes.');
  volume+=n[2]*(a[2]+b[2]+c[2])/6;
  triangles.push(p.map(point=>{const key=point.join(':');let id=ids.get(key);if(id===undefined){id=vertices.length;vertices.push(point);ids.set(key,id);}return id;}) as unknown as Triangle);
 }
 return {mesh:{vertices,triangles},volume};
}
function read3mfMeshes(bytes:Uint8Array):{xml:string;meshes:TriangleMesh[];headers:string[]}{
 const entries=unzipSync(bytes),xml=new TextDecoder().decode(entries['3D/3dmodel.model']);
 expect(Object.keys(entries).sort()).toEqual(['3D/3dmodel.model','[Content_Types].xml','_rels/.rels'].sort());
 expect(xml).toContain('unit="millimeter"');
 const meshes:TriangleMesh[]=[],headers:string[]=[];
 for(const match of xml.matchAll(/<object\b([^>]*)><mesh><vertices>(.*?)<\/vertices><triangles>(.*?)<\/triangles><\/mesh><\/object>/gs)){
  headers.push(match[1]);
  const vertices=[...match[2].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map(m=>m.slice(1).map(Number) as unknown as Point3Mm);
  const triangles=[...match[3].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].map(m=>m.slice(1).map(Number) as unknown as Triangle);
  meshes.push({vertices,triangles});
 }
 return {xml,meshes,headers};
}

test('real-coin manifest has a stable schema and requires success at every pipeline stage',()=>{
 expect(manifest.schemaVersion).toBe(1);expect(manifest.cases.map(c=>c.id)).toEqual(['dig79-gumi','dig79-teto']);
 for(const fixture of manifest.cases)expect(fixture.expected.stages).toEqual({import:'imported',generation:'valid',stl:'exported',threeMf:'exported'});
});
test.each(manifest.cases)('$id imports, generates and round-trips STL and layered 3MF',fixture=>{
 const bytes=readFileSync(new URL(`../../fixtures/regressions/${fixture.file}`,import.meta.url)),svgText=bytes.toString('utf8');
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
 const imported=importCoinSvg({svgText,fileName:fixture.file,importId:fixture.id,byteLength:bytes.length});
 expect(imported.status,JSON.stringify(imported.diagnostics)).toBe('imported');if(imported.status!=='imported')return;
 imported.coin.physicalPageMm.forEach((v,i)=>expect(v).toBeCloseTo(fixture.expected.physicalPageMm[i],9));
 expect(imported.coin.layers.map(l=>({id:l.id,name:l.name,color:l.sourceColor,regionCount:l.footprintMm.length,
  holeCount:l.footprintMm.reduce((n,p)=>n+p.holes.length,0),sourceElementIds:l.sourceElements.map(e=>e.elementId)}))).toEqual(fixture.expected.layers);
 const settings=createDefaultCoinSettings(imported.coin);expect(settings.status).toBe('created');if(settings.status!=='created')return;
 const generated=generateCoin(imported.coin,settings.settings,polygonClippingKernel,earcutTriangulationKernel);
 expect(generated.status,JSON.stringify(generated.diagnostics)).toBe('valid');if(generated.status!=='valid')return;
 expect(generated.metrics.shellCount).toBe(fixture.expected.unifiedShellCount);
 expect(generated.parts.map(p=>p.metrics.shellCount)).toEqual(fixture.expected.partShellCounts);
 expect(generated.metrics.volumeMm3).toBeCloseTo(fixture.expected.volumeMm3,6);
 const before=JSON.stringify(generated),stl=readStl(serializeBinaryStl(generated.unifiedMesh,generated.metrics));
 const checked=inspectMeshTopology(stl.mesh,{expectedShellCount:fixture.expected.unifiedShellCount,expectedVolumeMm3:stl.volume,budget:new MeshValidationBudget()});
 expect(checked.status,JSON.stringify(checked.status==='rejected'?checked.diagnostics:[])).toBe('stitched');
 if(checked.status==='stitched')for(let end=0;end<2;end++)for(let axis=0;axis<3;axis++)
  expect(Math.abs(checked.metrics.boundsMm[end][axis]-fixture.expected.boundsMm[end][axis])).toBeLessThanOrEqual(STL_CLEANUP_MM+1e-6);
 expect(Math.abs(stl.volume-generated.metrics.volumeMm3)/generated.metrics.volumeMm3).toBeLessThan(1e-5);
 const threeMf=read3mfMeshes(serialize3mf(generated));expect(threeMf.meshes).toHaveLength(fixture.expected.layers.length);
 threeMf.meshes.forEach((mesh,i)=>{
  const part=generated.parts[i];expect(mesh).toEqual(part.mesh);
  expect(threeMf.headers[i]).toContain(`name="${part.name}"`);expect(threeMf.headers[i]).toContain(`partnumber="${part.layerId}"`);
  expect(threeMf.xml).toContain(`displaycolor="${part.color.toUpperCase()}FF"`);
 });
 expect([...threeMf.xml.matchAll(/<component objectid="(\d+)"\/>/g)].map(m=>Number(m[1]))).toEqual([2,3,4]);
 expect(JSON.stringify(generated)).toBe(before);
},120000);
