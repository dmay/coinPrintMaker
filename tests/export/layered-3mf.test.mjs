import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import {unzipSync} from 'three/addons/libs/fflate.module.js';
import {ThreeMFLoader} from 'three/addons/loaders/3MFLoader.js';
import {Box3} from 'three';
import {buildLayeredCoin,write3mf} from '../../spikes/layered-3mf/export.mjs';
import {validateMesh} from '../../spikes/tiered-stl/mesh.mjs';

globalThis.DOMParser=new JSDOM('').window.DOMParser;
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]];
const layer=(footprintMm,thicknessMm=1,name='Layer',color='#123456')=>({footprintMm,thicknessMm,name,color});
const parse=bytes=>new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');
function readMesh(object) {
  return {vertices:[...object.querySelectorAll('vertex')].map(v=>['x','y','z'].map(k=>Number(v.getAttribute(k)))),
    faces:[...object.querySelectorAll('triangle')].map(t=>['v1','v2','v3'].map(k=>Number(t.getAttribute(k))))};
}
function checkShells(mesh) {
  // Partition the serialized mesh by indexed vertex connectivity, then validate
  // every closed shell, including the disconnected islands in a single part.
  const incident=mesh.vertices.map(()=>[]);
  mesh.faces.forEach((f,i)=>f.forEach(v=>{assert.ok(incident[v]);incident[v].push(i);}));
  const visited=new Set(),metrics=[];
  for(let i=0;i<mesh.faces.length;i++) {
    if(visited.has(i))continue;
    const todo=[i],faces=[],vertices=[],ids=new Map();
    while(todo.length) {
      const f=todo.pop();if(visited.has(f))continue;visited.add(f);
      faces.push(mesh.faces[f].map(v=>{
        if(!ids.has(v)){ids.set(v,vertices.length);vertices.push(mesh.vertices[v]);}
        todo.push(...incident[v]);return ids.get(v);
      }));
    }
    metrics.push(validateMesh({vertices,faces}));
  }
  assert.ok(metrics.length);return metrics;
}
function inspect(bytes) {
  const entries=unzipSync(bytes);
  assert.deepEqual(Object.keys(entries),['[Content_Types].xml','_rels/.rels','3D/3dmodel.model']);
  for(const entry of Object.values(entries)) assert.equal(parse(entry).querySelector('parsererror'),null);
  const types=parse(entries['[Content_Types].xml']),rels=parse(entries['_rels/.rels']),doc=parse(entries['3D/3dmodel.model']);
  assert.equal(types.documentElement.namespaceURI,'http://schemas.openxmlformats.org/package/2006/content-types');
  assert.equal(types.querySelector('Default[Extension="model"]').getAttribute('ContentType'),'application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
  assert.equal(rels.documentElement.namespaceURI,'http://schemas.openxmlformats.org/package/2006/relationships');
  const relationship=rels.querySelector('Relationship');
  assert.equal(relationship.getAttribute('Type'),'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel');
  assert.ok(entries[relationship.getAttribute('Target').slice(1)]);
  assert.equal(doc.documentElement.namespaceURI,'http://schemas.microsoft.com/3dmanufacturing/core/2015/02');
  assert.equal(doc.documentElement.getAttribute('unit'),'millimeter');
  const resources=[...doc.querySelector('resources').children], ids=resources.map(r=>r.getAttribute('id'));
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ids) assert.match(id,/^[1-9]\d*$/);
  const objects=[...doc.querySelectorAll('object')],items=doc.querySelectorAll('build > item');
  assert.equal(items.length,1);
  const assembly=objects.find(o=>o.getAttribute('id')===items[0].getAttribute('objectid'));
  assert.ok(assembly);assert.equal(assembly.querySelector('mesh'),null);
  const meshes=objects.filter(o=>o.querySelector('mesh')),components=[...assembly.querySelectorAll('component')];
  assert.equal(components.length,meshes.length);
  assert.deepEqual(components.map(c=>c.getAttribute('objectid')),meshes.map(m=>m.getAttribute('id')));
  for(const c of [...components,...items]) assert.equal(c.hasAttribute('transform'),false);
  const bases=[...doc.querySelectorAll('basematerials > base')];assert.equal(bases.length,meshes.length);
  meshes.forEach((o,i)=>{
    assert.equal(o.getAttribute('pid'),doc.querySelector('basematerials').getAttribute('id'));
    assert.equal(o.getAttribute('pindex'),String(i));assert.match(bases[i].getAttribute('displaycolor'),/^#[A-F0-9]{8}$/);
  });
  return {doc,meshes,bases};
}

test('3MF round trip preserves escaped Unicode names, colors, mm coordinates and closed meshes',()=>{
  const names=['Base & <black> "a"',"Детали 'β'\t\n"],layers=[layer(rect(0,0,40,40),1.6,names[0]),layer(rect(7,11,4,6),.4,names[1],'#abcdef')];
  const bytes=write3mf(layers,{name:'Coin & "test"'}),{meshes,bases}=inspect(bytes),generated=buildLayeredCoin(layers);
  assert.equal(bases[1].getAttribute('displaycolor'),'#ABCDEFFF');
  meshes.forEach((o,i)=>{
    assert.equal(o.getAttribute('name'),names[i]);
    const mesh=readMesh(o);
    const metrics=validateMesh(mesh,generated.parts[i].shells[0].volumeMm3);
    assert.deepEqual(metrics.boundsMm[2],[generated.parts[i].bottomZMm,generated.parts[i].topZMm]);
  });
  assert.deepEqual(bytes,write3mf(layers,{name:'Coin & "test"'}));
  // Independently exercise a consumer, not just our XML tests.
  const scene=new ThreeMFLoader().parse(bytes.buffer),bounds=new Box3().setFromObject(scene);
  assert.deepEqual(bounds.min.toArray(),[0,0,0]);
  assert.ok(Math.abs(bounds.max.z-2)<1e-6);
  const rendered=[];scene.traverse(o=>{if(o.isMesh)rendered.push(o);});
  assert.deepEqual(rendered.map(m=>m.name),names);
  assert.equal(rendered[1].material.color.getHexString(),'abcdef');
});

test('raised islands remain one named part with independently closed shells and preserved holes',()=>{
  const ring=rect(4,4,10,10);ring[0].push(rect(7,7,4,4)[0][0]);
  const layers=[layer(rect(0,0,40,40),1.6,'Base'),layer([...ring,...rect(22,7,4,6)],.4,'Two islands')];
  const result=buildLayeredCoin(layers);assert.equal(result.parts[1].shells.length,2);
  assert.ok(Math.abs(result.parts[1].shells.reduce((s,m)=>s+m.volumeMm3,0)-(100-16+24)*.4)<1e-8);
  const {meshes}=inspect(write3mf(layers));assert.equal(meshes.length,2);
  // Existing STL validator deliberately rejects a disconnected boundary as ONE
  // coin. Here each shell has already passed; they share one logical part.
  assert.throws(()=>validateMesh(result.parts[1].mesh),/Disconnected mesh boundary/);
});

test('invalid stack, metadata and post-build source edits cannot export unchecked geometry',()=>{
  const good=layer(rect(0,0,40,40),1.6,'Base');
  for(const bad of [[],[good,layer(rect(39,0,2,2))],[{...good,thicknessMm:0}],
    [{...good,footprintMm:[...rect(0,0,4,4),...rect(8,0,4,4)]}],
    [{...good,color:'red'}],[{...good,name:'bad\u0001'}],[{...good,name:'bad\uD800'}]]) assert.throws(()=>write3mf(bad));
  const ring=rect(0,0,40,40);ring[0].push(rect(10,10,20,20)[0][0]);
  assert.throws(()=>write3mf([layer(ring),layer(rect(12,12,4,4))]),/Unsupported/);
  const layers=[good];buildLayeredCoin(layers);layers[0]={...good,thicknessMm:NaN};assert.throws(()=>write3mf(layers));
  assert.throws(()=>write3mf([good],{name:'\u0000'}),/XML/);
});

test('all retained sample packages match regeneration and load as one assembly in ThreeMFLoader',async()=>{
  execFileSync(process.execPath,['scripts/check-layered-3mf.mjs','--check'],{cwd:new URL('../../',import.meta.url)});
  const report=JSON.parse(await readFile(new URL('../../fixtures/layered-3mf-verification.json',import.meta.url),'utf8'));
  for(const sample of report.samples.filter(s=>s.parts)) {
    const bytes=new Uint8Array(await readFile(new URL(`../../spikes/layered-3mf/samples/${sample.name}.3mf`,import.meta.url)));
    const {meshes}=inspect(bytes);assert.deepEqual(meshes.map(m=>m.getAttribute('name')),sample.parts.map(p=>p.name));
    let partVolume=0;
    meshes.forEach((object,i)=>{
      const part=sample.parts[i],mesh=readMesh(object),shells=checkShells(mesh);
      assert.equal(shells.length,part.closedShells);
      assert.equal(mesh.vertices.length,part.vertices);assert.equal(mesh.faces.length,part.triangles);
      const volume=shells.reduce((s,m)=>s+m.volumeMm3,0);partVolume+=volume;
      assert.ok(Math.abs(volume-part.volumeMm3)<1e-6);
      for(const s of shells) assert.deepEqual(s.boundsMm[2],[part.bottomZMm,part.topZMm]);
    });
    // Compare the actual STL facets with the separately serialized 3MF part volume.
    const stl=await readFile(new URL(`../../${sample.comparisonStl}`,import.meta.url)),view=new DataView(stl.buffer,stl.byteOffset,stl.byteLength);
    let stlVolume=0;
    for(let i=0;i<view.getUint32(80,true);i++) {
      const [a,b,c]=[0,1,2].map(j=>[0,1,2].map(k=>view.getFloat32(84+50*i+12+12*j+4*k,true)));
      stlVolume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    }
    assert.ok(Math.abs(partVolume-stlVolume)<sample.volumeMm3*1e-6);
    const scene=new ThreeMFLoader().parse(bytes.buffer), bounds=new Box3().setFromObject(scene);
    assert.equal(scene.children.length,1);
    bounds.getSize(bounds.max.clone()).toArray().forEach((v,k)=>assert.ok(Math.abs(v-sample.dimensionsMm[k])<1e-5));
  }
  // Python's ZIP reader independently checks CRCs, local/central directory records,
  // UTF-8 XML and standard-library XML parsing for every retained package.
  execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['-c',`import glob,zipfile,xml.etree.ElementTree as ET
for path in glob.glob('spikes/layered-3mf/samples/*.3mf'):
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  for n in z.namelist(): ET.fromstring(z.read(n))
`],{cwd:new URL('../../',import.meta.url)});
});
