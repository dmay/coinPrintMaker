import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoin, validateMesh, writeStl } from '../../spikes/tiered-stl/mesh.mjs';
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]];
const layer=(p,t=1)=>({footprintMm:p,thicknessMm:t});
test('authored fixtures meet analytical bounds, volume and topology checks',async()=>{await import('../../scripts/check-tiered-stl.mjs');});
test('identical footprints remove internal faces and retain cumulative Z',()=>{
 const r=buildCoin([layer(rect(0,0,40,40),1.6),layer(rect(0,0,40,40),.4)]);
 assert.deepEqual(r.metrics.dimensionsMm,[40,40,2]);assert.ok(Math.abs(r.metrics.volumeMm3-3200)<1e-8);
 assert.deepEqual(r.tiers.map(t=>[t.bottomZMm,t.topZMm]),[[0,1.6],[1.6,2]]);
});
test('shared boundary and collinear T junctions are stitched',()=>{
 const r=buildCoin([layer(rect(0,0,40,40)),layer(rect(0,10,20,20)),layer(rect(0,15,10,10))]);
 assert.equal(r.metrics.components,1);assert.equal(r.metrics.edgeIncidence,2);assert.ok(Math.abs(r.metrics.volumeMm3-2100)<1e-8);
});
test('through hole and identical ring tiers retain one closed shell',()=>{
 const ring=[...rect(0,0,40,40)];ring[0].push(rect(10,10,20,20)[0][0]);
 const r=buildCoin([layer(ring),layer(ring)]);assert.ok(Math.abs(r.metrics.volumeMm3-2400)<1e-8);
});
test('invalid support, hole support, disconnected base and invalid thickness block generation',()=>{
 assert.throws(()=>buildCoin([layer([...rect(0,0,4,4),...rect(6,0,4,4)])]),/Disconnected base/);
 assert.throws(()=>buildCoin([layer(rect(0,0,4,4)),layer(rect(3,0,2,2))]),/Unsupported/);
 for(const t of [0,-1,NaN,Infinity])assert.throws(()=>buildCoin([layer(rect(0,0,4,4),t)]),/thickness/);
 assert.throws(()=>buildCoin([]),/Empty stack/);
});
test('binary STL round trip preserves bounds, topology and volume at float32 precision',()=>{
 const {mesh,metrics}=buildCoin([layer(rect(0,0,40,40),1.6),layer(rect(0,10,20,20),.4)]);
 const bytes=writeStl(mesh),view=new DataView(bytes.buffer),count=view.getUint32(80,true);
 assert.equal(count,mesh.faces.length);assert.equal(bytes.length,84+50*count);
 const vertices=[],faces=[],ids=new Map();
 for(let i=0;i<count;i++){const f=[];for(let j=0;j<3;j++){const p=[0,1,2].map(k=>view.getFloat32(84+50*i+12+12*j+4*k,true)),key=p.join(',');if(!ids.has(key)){ids.set(key,vertices.length);vertices.push(p);}f.push(ids.get(key));}faces.push(f);assert.equal(view.getUint16(84+50*i+48,true),0);}
 const result=validateMesh({vertices,faces},metrics.volumeMm3);assert.deepEqual(result.dimensionsMm,[40,40,2]);
});
test('corrupted meshes fail export rather than returning partial STL',()=>{
 const {mesh}=buildCoin([layer(rect(0,0,4,4))]);
 for(const faces of [mesh.faces.slice(1),[...mesh.faces,mesh.faces[0]],mesh.faces.map((f,i)=>i?f:f.toReversed()),[[0,0,1]],[[0,1,99999]]])assert.throws(()=>writeStl({...mesh,faces}));
});
