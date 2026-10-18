import clipping from 'polygon-clipping';
import { Earcut } from 'three/src/extras/Earcut.js';
const EPS = 1e-8; // mm; fixture-scale spike only, no artwork snapping
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const areaRing = r => r.reduce((s,p,i)=>{ const q=r[(i+1)%r.length]; return s+p[0]*q[1]-q[0]*p[1]; },0)/2;
export const area = mp => mp.reduce((s,p)=>s+p.reduce((v,r,i)=>v+(i?-1:1)*Math.abs(areaRing(r)),0),0);
const open = r => r.slice(0,-1); // polygon-clipping returns closed rings

export function buildCoin(layers) {
  if (!layers.length) throw Error('Empty stack');
  let z=0;
  const tiers=layers.map((l,i)=>{
    if (!(l.thicknessMm>0) || !Number.isFinite(l.thicknessMm)) throw Error('Invalid thickness');
    if (!l.footprintMm.flat(2).every(p=>p.length===2 && p.every(Number.isFinite))) throw Error('Invalid coordinates');
    const footprintMm=clipping.union(l.footprintMm);
    if (!(area(footprintMm)>EPS)) throw Error('Empty footprint');
    if (i===0 && footprintMm.length!==1) throw Error('Disconnected base: join regions in SVG');
    if (i && clipping.difference(footprintMm,layers[i-1].footprintMm).length) throw Error('Unsupported upper footprint');
    const bottomZMm=z; z+=l.thicknessMm;
    return {name:l.name,footprintMm,bottomZMm,topZMm:z};
  });
  const vertices=[], faces=[], lookup=new Map();
  function vertex(p) { const key=p.map(v=>Math.round(v/EPS)).join(','); if (!lookup.has(key)) { lookup.set(key,vertices.length); vertices.push(p); } return lookup.get(key); }
  const tri=(a,b,c)=>faces.push([a,b,c].map(vertex));
  function cap(mp,z,up) {
    for (const poly of mp) {
      const rings=poly.map(open), pts=rings.flat(), holes=[]; let n=rings[0].length;
      for(const r of rings.slice(1)){holes.push(n);n+=r.length;}
      const idx=Earcut.triangulate(pts.flat(),holes);
      for(let i=0;i<idx.length;i+=3){let [a,b,c]=idx.slice(i,i+3).map(j=>[...pts[j],z]); if ((cross(sub(b,a),sub(c,a))[2]>0)!==up) [b,c]=[c,b]; tri(a,b,c);}
    }
  }
  cap(tiers[0].footprintMm,0,false);
  tiers.forEach((t,i)=>{
    cap(i+1<tiers.length ? clipping.difference(t.footprintMm,tiers[i+1].footprintMm):t.footprintMm,t.topZMm,true);
    for(const poly of t.footprintMm) for(const [j,ring] of poly.entries()) {
      let r=open(ring); if ((areaRing(r)>0)!==(j===0)) r=r.toReversed();
      r.forEach((p,k)=>{const q=r[(k+1)%r.length],a=[...p,t.bottomZMm],b=[...q,t.bottomZMm],c=[...q,t.topZMm],d=[...p,t.topZMm];tri(a,b,c);tri(a,c,d);});
    }
  });
  // Earcut may remove collinear boundary points. Split every affected triangle
  // edge at existing vertices, then fan its boundary around an interior centroid.
  // The fixed candidate set prevents newly added centroids affecting other faces.
  const candidates=vertices.slice(), stitched=[];
  for(const f of faces) {
    const boundary=[];
    for(let e=0;e<3;e++) {
      const a=vertices[f[e]],b=vertices[f[(e+1)%3]],d=sub(b,a),len2=dot(d,d),points=[];
      candidates.forEach((p,id)=>{const t=dot(sub(p,a),d)/len2; if(t>EPS && t<1-EPS && Math.hypot(...sub(p,a.map((v,i)=>v+t*d[i])))<EPS) points.push([t,id]);});
      boundary.push(f[e],...points.sort((a,b)=>a[0]-b[0]).map(x=>x[1]));
    }
    if(boundary.length===3) stitched.push(f);
    else {const center=vertex([0,1,2].map(k=>f.reduce((s,id)=>s+vertices[id][k],0)/3)); boundary.forEach((id,i)=>stitched.push([center,id,boundary[(i+1)%boundary.length]]));}
  }
  const mesh={vertices,faces:stitched};
  const expectedVolumeMm3=tiers.reduce((s,t)=>s+area(t.footprintMm)*(t.topZMm-t.bottomZMm),0);
  const metrics=validateMesh(mesh,expectedVolumeMm3);
  return {mesh,tiers,metrics};
}

export function validateMesh({vertices,faces},expectedVolumeMm3) {
  if(!vertices.length || !faces.length || !vertices.every(p=>p.length===3 && p.every(Number.isFinite))) throw Error('Invalid mesh vertices');
  if(new Set(vertices.map(p=>p.join(','))).size!==vertices.length) throw Error('Coincident indexed vertices');
  const edges=new Map(), seen=new Set(); let volume=0;
  faces.forEach((f,fi)=>{
    if(f.length!==3 || !f.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length)) throw Error('Invalid indices');
    const key=f.toSorted((a,b)=>a-b).join(','); if(seen.has(key)) throw Error('Duplicate triangle'); seen.add(key);
    const [a,b,c]=f.map(i=>vertices[i]);
    if(Math.hypot(...cross(sub(b,a),sub(c,a)))<=1e-12) throw Error('Degenerate triangle');
    volume+=dot(a,cross(b,c))/6;
    f.forEach((a,i)=>{const b=f[(i+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');if(!edges.has(key)) edges.set(key,[]);edges.get(key).push({fi,direction:a<b?1:-1});});
  });
  if([...edges.values()].some(e=>e.length!==2 || e[0].direction+e[1].direction!==0)) throw Error('Nonmanifold edge or inconsistent winding');
  const adjacent=faces.map(()=>[]);for(const e of edges.values()){adjacent[e[0].fi].push(e[1].fi);adjacent[e[1].fi].push(e[0].fi);}
  const visited=new Set(); let components=0;
  for(let i=0;i<faces.length;i++) if(!visited.has(i)){components++;const todo=[i];while(todo.length){const j=todo.pop();if(visited.has(j))continue;visited.add(j);todo.push(...adjacent[j]);}}
  // Every vertex link must be one cycle, ruling out point-pinched surfaces
  // that edge incidence alone cannot detect.
  const links=vertices.map(()=>new Map());
  for(const f of faces) f.forEach((id,i)=>{const a=f[(i+1)%3],b=f[(i+2)%3],link=links[id];for(const [x,y] of [[a,b],[b,a]]){if(!link.has(x))link.set(x,[]);link.get(x).push(y);}});
  for(const link of links){
    if(!link.size || [...link.values()].some(n=>n.length!==2)) throw Error('Nonmanifold vertex');
    const reached=new Set(),todo=[link.keys().next().value];while(todo.length){const v=todo.pop();if(reached.has(v))continue;reached.add(v);todo.push(...link.get(v));}
    if(reached.size!==link.size) throw Error('Pinched vertex');
  }
  // A through-hole is still one boundary shell; a sealed cavity is outside this spike.
  if(components!==1) throw Error('Disconnected mesh boundary');
  if(!(volume>0) || (expectedVolumeMm3!==undefined && Math.abs(volume-expectedVolumeMm3)>Math.max(1e-6,expectedVolumeMm3*1e-7))) throw Error('Volume mismatch');
  const bounds=[0,1,2].map(k=>[Math.min(...vertices.map(p=>p[k])),Math.max(...vertices.map(p=>p[k]))]);
  return {vertices:vertices.length,triangles:faces.length,edges:edges.size,edgeIncidence:2,oppositeEdgeDirections:true,components,boundsMm:bounds,dimensionsMm:bounds.map(([a,b])=>b-a),volumeMm3:volume,expectedVolumeMm3};
}

export function writeStl(mesh) {
  // Validate the actual float32 coordinates that STL retains before returning bytes.
  const rounded={vertices:mesh.vertices.map(p=>p.map(Math.fround)),faces:mesh.faces};
  const before=validateMesh(mesh);validateMesh(rounded,before.volumeMm3);
  const bytes=new Uint8Array(84+50*mesh.faces.length),view=new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('CoinPrint M0.3; coordinates in mm'));view.setUint32(80,mesh.faces.length,true);
  mesh.faces.forEach((f,i)=>{const p=f.map(id=>rounded.vertices[id]),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),length=Math.hypot(...n);[...n.map(v=>v/length),...p.flat()].forEach((v,j)=>view.setFloat32(84+50*i+4*j,v,true));});
  return bytes;
}
