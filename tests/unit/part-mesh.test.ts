import './setup';
import { describe, expect, test, vi } from 'vitest';
import type { ActiveTier, CoinSettings, FootprintMm, GeneratedPart, ImportedCoin, Point2Mm, PolygonMm, RingMm, Triangle } from '../../app/src/core/contracts';
import type { TriangulationKernel } from '../../app/src/core/triangulationKernel';
import { buildLayerParts, isCurrentLayerParts } from '../../app/src/core/buildLayerParts';
import { buildPartMesh } from '../../app/src/core/buildPartMesh';
import { triangulateRegion } from '../../app/src/core/triangulateRegion';
import { MESH_CONSTRUCTION_POLICY, MeshConstructionBudget } from '../../app/src/core/meshConstructionPolicy';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { expectedBoundsYUp, loadFixtures, near, tolerance } from './helpers/fixtures';

const box=(x=0,y=0,w=10,h=10): PolygonMm=>({outer:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],holes:[]});
const donut: PolygonMm={outer:box().outer,holes:[[[2,2],[2,8],[8,8],[8,2]]]};
const multiHole: PolygonMm={outer:box().outer,holes:[[[1,1],[1,4],[4,4],[4,1]],[[6,6],[6,9],[9,9],[9,6]]]};
const concave: PolygonMm={outer:[[0,0],[10,0],[10,3],[3,3],[3,10],[0,10]],holes:[]};
const cross=(a:readonly number[],b:readonly number[],c:readonly number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const ringArea=(ring:readonly Point2Mm[])=>ring.slice(1,-1).reduce((sum,p,i)=>sum+cross(ring[0],p,ring[i+2]),0)/2;
const polygonArea=(p:PolygonMm)=>ringArea(p.outer)+p.holes.reduce((sum,h)=>sum+ringArea(h),0);
const footprintArea=(f:FootprintMm)=>f.reduce((sum,p)=>sum+polygonArea(p),0);
const tier=(footprintMm:FootprintMm,bottomZMm=0,thicknessMm=1.6):ActiveTier=>({layerId:'source:layer',name:'Layer',color:'#123456',footprintMm,bottomZMm,thicknessMm,topZMm:bottomZMm+thicknessMm});
function part(t:ActiveTier,kernel=earcutTriangulationKernel,budget?:MeshConstructionBudget):GeneratedPart {
  const result=buildPartMesh(t,kernel,{budget});
  expect(result.status,JSON.stringify(result)).toBe('built');
  if(result.status!=='built') throw new Error('Expected part');
  return result.part;
}
function coinOf(...footprints:FootprintMm[]):ImportedCoin {
  return {schemaVersion:1,source:{importId:'test',fileName:'test.svg',byteLength:0,svgText:''},physicalPageMm:[40,40],sizeOrigin:'explicit',baseLayerId:'layer-0',diagnostics:[],
    layers:footprints.map((footprintMm,sourceOrder)=>({id:`layer-${sourceOrder}`,name:'Duplicate label',sourceOrder,sourceElements:[],footprintMm,boundsMm:[0,0,1,1],areaMm2:-1}))};
}
function defaults(coin:ImportedCoin):CoinSettings {
  const result=createDefaultCoinSettings(coin); if(result.status!=='created') throw new Error('Expected defaults'); return result.settings;
}
function freeze<T>(value:T):T {
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);} return value;
}
function insideRing(p:Point2Mm,ring:RingMm):boolean {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) if((ring[i][1]>p[1])!==(ring[j][1]>p[1]) && p[0]<(ring[j][0]-ring[i][0])*(p[1]-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0]) inside=!inside;
  return inside;
}
const inPolygon=(p:Point2Mm,polygon:PolygonMm)=>insideRing(p,polygon.outer)&&!polygon.holes.some(h=>insideRing(p,h));
/** Independent convex clipping oracle for positive-area triangle overlap. */
function intersectionArea(a:readonly Point2Mm[],b:readonly Point2Mm[]):number {
  let output=[...a];
  for(let i=0;i<3;i++) {
    const start=b[i],end=b[(i+1)%3],input=output; output=[];
    for(let j=0;j<input.length;j++) {
      const p=input[j],q=input[(j+1)%input.length],cp=cross(start,end,p),cq=cross(start,end,q);
      if(cp>=0) output.push(p);
      if((cp<0&&cq>0)||(cp>0&&cq<0)) {const t=cp/(cp-cq);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
  }
  return output.length<3?0:Math.abs(ringArea(output));
}
function verifyCap(polygon:PolygonMm) {
  const result=triangulateRegion(polygon,earcutTriangulationKernel);
  expect(result.status,JSON.stringify(result)).toBe('triangulated'); if(result.status!=='triangulated') throw new Error('cap');
  const {vertices,triangles}=result.region;
  const cap=triangles.map(t=>t.map(i=>vertices[i]));
  let area=0;
  for(const tri of cap) {const a=cross(tri[0],tri[1],tri[2])/2;expect(a).toBeGreaterThan(0);area+=a;}
  near(area,polygonArea(polygon),Math.abs(area)*1e-10+1e-25);
  for(let i=0;i<cap.length;i++) for(let j=i+1;j<cap.length;j++) expect(intersectionArea(cap[i],cap[j])).toBeLessThanOrEqual(area*1e-10+1e-25);
  // Sample across the authored bounds and exterior; skip internal diagonals.
  const xValues=polygon.outer.map(p=>p[0]),yValues=polygon.outer.map(p=>p[1]);
  const minX=Math.min(...xValues),minY=Math.min(...yValues),width=Math.max(...xValues)-minX,height=Math.max(...yValues)-minY;
  for(let x=-2;x<39;x++) for(let y=-2;y<39;y++) {
    const p:Point2Mm=[minX+(x+.213)*width/37,minY+(y+.127)*height/37];
    if(cap.some(t=>t.some((_,i)=>Math.abs(cross(t[i],t[(i+1)%3],p))<1e-10))) continue;
    const count=cap.filter(t=>[0,1,2].every(i=>cross(t[i],t[(i+1)%3],p)>0)).length;
    expect(count,JSON.stringify(p)).toBe(inPolygon(p,polygon)?1:0);
  }
  // Every original boundary segment must be present with original direction.
  const edges=new Map<string,number>();
  for(const [a,b,c] of triangles) for(const [u,v] of [[a,b],[b,c],[c,a]]) edges.set(`${u}:${v}`,(edges.get(`${u}:${v}`)??0)+1);
  for(const ring of result.region.boundaries) for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length]; expect(edges.get(`${a}:${b}`)).toBe(1);expect(edges.has(`${b}:${a}`)).toBe(false);
  }
  return result.region;
}
function verifyPart(p:GeneratedPart,t:ActiveTier) {
  const {vertices,triangles}=p.mesh,edges=new Map<string,{uses:number[];balance:number}>(),neighbors=vertices.map(()=>new Map<number,Set<number>>());
  let volume=0;
  for(const [index,tri] of triangles.entries()) {
    expect(tri).toHaveLength(3);
    tri.forEach(i=>{expect(Number.isInteger(i)&&i>=0&&i<vertices.length).toBe(true);expect(vertices[i].every(Number.isFinite)).toBe(true);});
    const [a,b,c]=tri.map(i=>vertices[i]);
    const u=b.map((v,j)=>v-a[j]),v=c.map((value,j)=>value-a[j]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    expect(normal.every(Number.isFinite)&&normal.some(n=>n!==0)).toBe(true);
    volume+=cross(a,b,c)/2*((a[2]-t.bottomZMm+b[2]-t.bottomZMm+c[2]-t.bottomZMm)/3);
    if(a[2]===b[2]&&b[2]===c[2]) expect(Math.sign(normal[2])).toBe(a[2]===t.topZMm?1:-1);
    else {
      const points=[a,b,c],pair=points.flatMap((a,i)=>points.slice(i+1).map(b=>[a,b])).find(([a,b])=>a[2]===b[2]);
      expect(pair).toBeDefined();
      const ring=[...t.footprintMm.flatMap(p=>[p.outer,...p.holes])].find(r=>r.some((q,i)=>pair!.every(p=>[q,r[(i+1)%r.length]].some(e=>e[0]===p[0]&&e[1]===p[1]))))!;
      const edgeIndex=ring.findIndex((q,i)=>pair!.every(p=>[q,ring[(i+1)%ring.length]].some(e=>e[0]===p[0]&&e[1]===p[1])));
      const start=ring[edgeIndex],end=ring[(edgeIndex+1)%ring.length];
      expect(normal[0]*(end[1]-start[1])-normal[1]*(end[0]-start[0])).toBeGreaterThan(0);
    }
    for(let j=0;j<3;j++) {
      const x=tri[j],y=tri[(j+1)%3],z=tri[(j+2)%3],key=x<y?`${x}:${y}`:`${y}:${x}`,e=edges.get(key);
      if(e){e.uses.push(index);e.balance+=x<y?1:-1;}else edges.set(key,{uses:[index],balance:x<y?1:-1});
      for(const [a,b] of [[y,z],[z,y]]) {const link=neighbors[x].get(a)??new Set<number>();link.add(b);neighbors[x].set(a,link);}
    }
  }
  const adjacency=triangles.map(()=>new Set<number>());
  for(const e of edges.values()) {expect(e.uses).toHaveLength(2);expect(e.balance).toBe(0);adjacency[e.uses[0]].add(e.uses[1]);adjacency[e.uses[1]].add(e.uses[0]);}
  function countComponents(graph:readonly Set<number>[]):number {
    const seen=new Set<number>();let count=0;
    graph.forEach((_,i)=>{if(seen.has(i))return;count++;const queue=[i];while(queue.length){const v=queue.pop()!;if(seen.has(v))continue;seen.add(v);queue.push(...graph[v]);}});return count;
  }
  expect(countComponents(adjacency)).toBe(t.footprintMm.length);
  for(const link of neighbors) {
    expect(link.size).toBeGreaterThan(2);for(const adjacent of link.values())expect(adjacent.size).toBe(2);
    const keys=[...link.keys()],indices=new Map(keys.map((k,i)=>[k,i]));
    expect(countComponents(keys.map(k=>new Set([...link.get(k)!].map(v=>indices.get(v)!))))).toBe(1);
  }
  const expected=footprintArea(t.footprintMm)*(t.topZMm-t.bottomZMm);
  near(volume,expected,expected*1e-9);near(p.metrics.volumeMm3,expected,expected*1e-9);
  expect(p.metrics.shellCount).toBe(t.footprintMm.length);
  expect(new Set(vertices.map(p=>p[2]))).toEqual(new Set([t.bottomZMm,t.topZMm]));
  expect(p).toMatchObject({layerId:t.layerId,name:t.name,color:t.color});
  expect(vertices.map(([x,y])=>[x,y])).toEqual(t.footprintMm.flatMap(p=>{
    const points=[p.outer,...p.holes].flat();return [...points,...points];
  }));
  expect(JSON.parse(JSON.stringify(p))).toEqual(p);
}

describe('independent caps and closed positioned parts',()=>{
  test.each([{polygon:box(),area:100},{polygon:concave,area:51},{polygon:donut,area:64},{polygon:multiHole,area:82}])('analytical region $area mm²',({polygon,area})=>{
    const cap=verifyCap(polygon);near(cap.areaMm2,area,1e-12);
    const t=tier([polygon],1.6,.4);verifyPart(part(t),t);
  });
  test('multiple supported islands, including an island in another region hole, remain one part with three closed shells',()=>{
    const t=tier([donut,box(3,3,2,2),box(20,0,3,4)]);const p=part(t);verifyPart(p,t);near(p.metrics.volumeMm3,80*1.6,1e-10);
  });
  test('every side of a triangle can need restoration, including wraparound collinear subdivisions',()=>{
    const polygon:PolygonMm={outer:[[0,0],[5,0],[10,0],[5,5],[0,10],[0,5]],holes:[]};
    const replacement:TriangulationKernel={triangulate:()=>[[0,2,4]]};
    const t=tier([polygon]);verifyPart(part(t,replacement),t);verifyCap(polygon);
  });
  test('outer/hole collinear vertices and aligned hole bridges preserve cap-wall conformity',()=>{
    const polygon:PolygonMm={outer:[[0,0],[5,0],[10,0],[10,5],[10,10],[5,10],[0,10],[0,5]],holes:[[[2,2],[2,5],[2,8],[5,8],[8,8],[8,5],[8,2],[5,2]]]};
    verifyCap(polygon);const t=tier([polygon]);verifyPart(part(t),t);
  });
  test('two hole shoulders restore cross-ring collinear Earcut bridges without changing coverage',()=>{
    const polygon:PolygonMm={outer:box().outer,holes:[[[2,4],[4,4],[3,2]],[[6,4],[8,4],[7,2]]]};
    const vertices=[polygon.outer,...polygon.holes].flat(),raw=earcutTriangulationKernel.triangulate(vertices,[4,7]);
    const edges=new Map<string,{a:number;b:number;count:number}>();
    for(const t of raw)for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`,e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1});}
    // Prove this exercises a bridge between rings, not the original single-ring path.
    expect([...edges.values()].some(e=>e.count===1&&e.a>=4&&e.b>=4&&Math.floor((e.a-4)/3)!==Math.floor((e.b-4)/3))).toBe(true);
    near(verifyCap(polygon).areaMm2,96,1e-12);const t=tier([polygon]);verifyPart(part(t),t);
  });
  test.each([0,999999])('tiny nonzero triangle at XY offset %s retains 8e-12 mm² rather than an EPS deletion',offset=>{
    const polygon:PolygonMm={outer:[[offset,offset],[offset+.000004,offset],[offset,offset+.000004]],holes:[]};
    const t=tier([polygon]);const p=part(t);verifyPart(p,t);expect(p.mesh.triangles).toHaveLength(8);near(p.metrics.volumeMm3,8e-12*1.6,1e-15);
  });
  test.each([0,999998])('tiny corner step at XY offset %s is retained',offset=>{
    const polygon:PolygonMm={outer:[[offset,offset],[offset+1,offset],[offset+1,offset+1],[offset+.000004,offset+1],[offset+.000004,offset+1+.000004],[offset,offset+1+.000004]],holes:[]};
    const t=tier([polygon],25,.00000001);verifyPart(part(t),t);
  });
  test('exact thin Z intervals at a large elevation are preserved and measured locally',()=>{
    const t=tier([box(900000,900000,1,1)],100000,.000000001);const p=part(t);verifyPart(p,t);
    expect(p.metrics.boundsMm).toEqual([[900000,900000,100000],[900001,900001,t.topZMm]]);
  });
  test('frozen inputs and deterministic independent calls retain XY/metadata without renderer state',()=>{
    const t=freeze(tier([donut],1.6,.4)),before=JSON.stringify(t),a=part(t),snapshot=JSON.stringify(a),b=part(t);
    expect(a).toEqual(b);expect(a).not.toBe(b);expect(JSON.stringify(t)).toBe(before);expect(JSON.stringify(a)).toBe(snapshot);
  });
  test('ordinary fractional grid multiplication artifacts are accepted and emitted unchanged',()=>{
    const t=tier([box(.1,.2,.3,.4)]);verifyPart(part(t),t);
    expect(part(t).mesh.vertices.some(p=>p[1]===.2+.4)).toBe(true);
  });
});

describe('untrusted triangulator and bounded failure-atomic construction',()=>{
  const bad:readonly {name:string;output:unknown}[]=[
    {name:'null',output:null},{name:'object',output:{}},{name:'empty',output:[]},{name:'flat indices',output:[0,1,2]},
    {name:'negative',output:[[-1,1,2]]},{name:'fractional',output:[[.5,1,2]]},{name:'outside',output:[[0,1,99]]},
    {name:'NaN',output:[[0,1,NaN]]},{name:'degenerate',output:[[0,0,1]]},{name:'duplicate',output:[[0,1,2],[0,1,2]]},
    {name:'missing cap',output:[[0,1,2]]},{name:'overlap',output:[[0,1,2],[0,1,3]]},
  ];
  test.each(bad)('$name output rejects with no partial part',({output})=>{
    const result=buildPartMesh(tier([box()]),{triangulate:()=>output as readonly Triangle[]});
    expect(result.status).toBe('rejected');expect(result).not.toHaveProperty('part');
    if(result.status==='rejected')expect(result.diagnostics[0]).toMatchObject({code:'MESH_INVALID',location:{scope:'mesh',layerId:'source:layer'}});
  });
  test('an injected throw does not expose private exception text',()=>{
    const result=buildPartMesh(tier([box()]),{triangulate:()=>{throw new Error('private secret');}});
    expect(result.status).toBe('rejected');expect(JSON.stringify(result)).not.toContain('private secret');
  });
  test('large-coordinate skinny fan whose ideal-grid turn reverses in emitted XY rejects',()=>{
    const n=999999999008,s=.000001;
    const polygon:PolygonMm={outer:[[0,0],[n*s,(n-1)*s],[(n+4)*s,(n+3)*s],[0,1000000]],holes:[]};
    // Ideal integer determinant is +4, but the unchanged binary coordinates
    // have a negative determinant. Never emit that fan's reversed cap.
    const [[ax,ay],[bx,by],[cx,cy]]=polygon.outer.slice(0,3).map(p=>p.map(v=>BigInt(v*2**80)));
    expect((bx-ax)*(cy-ay)-(by-ay)*(cx-ax)).toBeLessThan(0n);
    const result=triangulateRegion(polygon,{triangulate:()=>[[0,1,2],[0,2,3]]});
    expect(result).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_INVALID',message:expect.stringContaining('Emitted binary XY')}]});
    expect(result).not.toHaveProperty('region');
  });
  test('reverse adapter winding normalizes without changing covered geometry',()=>{
    const t=tier([box()]);verifyPart(part(t,{triangulate:()=>[[2,1,0],[3,2,0]]}),t);
  });
  test('an adapter cannot mutate retained source or cap vertices',()=>{
    const t=freeze(tier([box()])),kernel:TriangulationKernel={triangulate:(vertices,holes)=>{
      const triangles=earcutTriangulationKernel.triangulate(vertices,holes);(vertices as Point2Mm[])[0]=[123,456];return triangles;
    }};verifyPart(part(t,kernel),t);
  });
  test.each([
    {polygon:{outer:[[0,0],[10,10],[0,10],[10,0]],holes:[]} as PolygonMm},
    {polygon:{outer:[...box().outer].reverse() as unknown as RingMm,holes:[]} as PolygonMm},
    {polygon:{outer:box().outer,holes:[box(2,2,2,2).outer]} as PolygonMm},
    {polygon:{outer:box().outer,holes:[box(20,20,2,2).outer]} as PolygonMm},
    {polygon:{outer:[[0,0],[10,0],[10,10],[0,10],[0,0]],holes:[]} as PolygonMm},
    {polygon:{outer:[[0,0],[10.0000002,0],[10,10],[0,10]],holes:[]} as PolygonMm},
    {polygon:{outer:[[.000000000000000001,0],[10,0],[10,10],[0,10]],holes:[]} as PolygonMm},
    {polygon:{outer:[[999990.00000001,0],[1000000,0],[1000000,10],[999990,10]],holes:[]} as PolygonMm},
    {polygon:{outer:[[0,0],[Infinity,0],[0,10]],holes:[]} as PolygonMm},
  ])('noncanonical/invalid input %# rejects without repair',({polygon})=>{
    const result=buildPartMesh(tier([polygon]),earcutTriangulationKernel);expect(result.status).toBe('rejected');expect(result).not.toHaveProperty('part');
  });
  test.each([
    {bottomZMm:-1,topZMm:1},{thicknessMm:0},{topZMm:Infinity},{topZMm:2},{color:'red'},
    {bottomZMm:1e300,thicknessMm:1,topZMm:1e300},{bottomZMm:0,thicknessMm:1e308,topZMm:1e308},
  ])('invalid, unrepresentable or overflowing part interval %# rejects',patch=>{
    const result=buildPartMesh({...tier([box()]),...patch},earcutTriangulationKernel);expect(result.status).toBe('rejected');expect(result).not.toHaveProperty('part');
  });
  test('overlapping filled regions fail without separately extruding duplicated material',()=>{
    expect(buildPartMesh(tier([box(),box(5,5)]),earcutTriangulationKernel).status).toBe('rejected');
  });
  test.each(['input','vertices','triangles','work'] as const)('shared aggregate %s budget cannot reset across parts',kind=>{
    const budget=new MeshConstructionBudget(),p=MESH_CONSTRUCTION_POLICY;
    if(kind==='input')budget.input(p.maxInputVertices-4);
    if(kind==='vertices')budget.output(p.maxOutputVertices-8,0);
    if(kind==='triangles')budget.output(0,p.maxOutputTriangles-12);
    // Exact supporting-line indexing adds charged comparisons; allow one box,
    // then prove the same shared allowance cannot build a second box.
    if(kind==='work')budget.check(p.maxWork-200);
    const first=buildPartMesh(tier([box()]),earcutTriangulationKernel,{budget});expect(first.status).toBe('built');
    const second=buildPartMesh(tier([box()]),earcutTriangulationKernel,{budget});expect(second.status).toBe('rejected');expect(second).not.toHaveProperty('part');
    if(second.status==='rejected')expect(second.diagnostics[0].code).toBe('MESH_LIMIT_EXCEEDED');
  });
  test('region input and untrusted output triangle caps reject before expensive reconstruction',()=>{
    const polygon={outer:Array.from({length:MESH_CONSTRUCTION_POLICY.maxRegionVertices+1},()=>[0,0]) as unknown as RingMm,holes:[]};
    expect(triangulateRegion(polygon,earcutTriangulationKernel)).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_LIMIT_EXCEEDED'}]});
    expect(triangulateRegion(box(),{triangulate:()=>Array.from({length:MESH_CONSTRUCTION_POLICY.maxRegionTriangles+1},()=>[0,1,2])})).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_LIMIT_EXCEEDED'}]});
  });
});

describe('fresh support orchestration, identity and failure gating',()=>{
  test('fresh immediate-lower support blocks every mesh call when unsupported or source/settings stale',()=>{
    const coin=coinOf([box()],[donut],[box(3,3,2,2)]),settings=defaults(coin),triangulate=vi.fn(earcutTriangulationKernel.triangulate);
    for(const config of [settings,{...settings,importId:'stale'}]){
      const result=buildLayerParts(coin,config,polygonClippingKernel,{triangulate});expect(result.status).toBe('rejected');
      for(const key of ['parts','activeTiers','totalHeightMm','unifiedMesh','metrics'])expect(result).not.toHaveProperty(key);
    }
    expect(triangulate).not.toHaveBeenCalled();
  });
  test('hide/reorder/color/thickness edits rebuild absolute parts while keeping opaque layer identities',()=>{
    const coin=freeze(coinOf([box()],[box(1,1,8,8)],[box(2,2,2,2)])),settings=freeze(defaults(coin)),before=JSON.stringify([coin,settings]);
    const a=buildLayerParts(coin,settings,polygonClippingKernel,earcutTriangulationKernel);
    const edited={...settings,revision:1,layers:[settings.layers[0],{...settings.layers[1],enabled:false},{...settings.layers[2],color:'#fedcba',thicknessMm:.7}]} as CoinSettings;
    const b=buildLayerParts(coin,edited,polygonClippingKernel,earcutTriangulationKernel);
    expect(a.status).toBe('parts-built');expect(b.status).toBe('parts-built');if(a.status!=='parts-built'||b.status!=='parts-built')throw new Error('parts');
    expect(a.parts.map(p=>p.layerId)).toEqual(['layer-0','layer-1','layer-2']);expect(b.parts.map(p=>p.layerId)).toEqual(['layer-0','layer-2']);
    expect(b.parts[1]).toMatchObject({color:'#fedcba',metrics:{boundsMm:[[2,2,1.6],[4,4,2.3]]}});
    expect(isCurrentLayerParts(a,b.input)).toBe(false);expect(isCurrentLayerParts(b,b.input)).toBe(true);expect(isCurrentLayerParts(b,{...b.input,importId:'other'})).toBe(false);expect(isCurrentLayerParts(null,b.input)).toBe(false);
    expect(isCurrentLayerParts({...b,diagnostics:[{code:'MESH_INVALID',severity:'error',message:'error',location:{scope:'document'},remediation:'fix'}]},b.input)).toBe(false);
    const reordered={...settings,revision:2,layers:[settings.layers[0],settings.layers[2],settings.layers[1]]} as CoinSettings;
    expect(buildLayerParts(coin,reordered,polygonClippingKernel,earcutTriangulationKernel).status).toBe('rejected');
    expect(JSON.stringify([coin,settings])).toBe(before);expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  });
  test('later tier triangulator failure discards every earlier built part',()=>{
    const coin=coinOf([box()],[box(1,1,1,1)]),triangulate=vi.fn(earcutTriangulationKernel.triangulate).mockImplementationOnce(earcutTriangulationKernel.triangulate).mockImplementationOnce(()=>{throw new Error('private');});
    const result=buildLayerParts(coin,defaults(coin),polygonClippingKernel,{triangulate});expect(triangulate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({status:'rejected',input:{importId:'test',settingsRevision:0},diagnostics:[{location:{scope:'mesh',layerId:'layer-1'}}]});
    for(const key of ['parts','activeTiers','totalHeightMm','unifiedMesh','metrics'])expect(result).not.toHaveProperty(key);
  });
});

const fixtures=(await loadFixtures()).filter(f=>f.expected.importOutcome==='accept');
describe('production importer → fresh support → independent parts: authored oracles',()=>{
  test.each(fixtures)('$name',f=>{
    const imported=importCoinSvg({importId:f.name,fileName:f.name+'.svg',svgText:f.svg,byteLength:f.svg.length});
    if(imported.status!=='imported') throw new Error(JSON.stringify(imported.diagnostics));
    const settings=createDefaultCoinSettings(imported.coin);
    if(settings.status!=='created') throw new Error('settings');
    const result=buildLayerParts(imported.coin,settings.settings,polygonClippingKernel,earcutTriangulationKernel);
    expect(result.status,JSON.stringify(result)).toBe(f.expected.geometryOutcome==='blocked'?'rejected':'parts-built');
    if(result.status==='rejected') {expect(result).not.toHaveProperty('parts');return;}
    expect(result.parts.map(p=>p.layerId)).toEqual(f.expected.layers.map(l=>'source:'+l.id));
    result.parts.forEach((p,i)=>{
      const expected=f.expected.layers[i],t=result.activeTiers[i];verifyPart(p,t);
      near(p.metrics.volumeMm3,expected.areaMm2*expected.thicknessMm,Math.max(tolerance.areaAbsoluteMm2*expected.thicknessMm,expected.areaMm2*expected.thicknessMm*tolerance.volumeRelative));
      const bounds=expectedBoundsYUp(expected.boundsMm,f.expected.physicalPageMm[1]);
      expect(p.metrics.boundsMm[0][2]).toBe(t.bottomZMm);expect(p.metrics.boundsMm[1][2]).toBe(t.topZMm);
      [p.metrics.boundsMm[0][0],p.metrics.boundsMm[0][1],p.metrics.boundsMm[1][0],p.metrics.boundsMm[1][1]].forEach((v,j)=>near(v,bounds[j],tolerance.coordinateMm));
      expect(p.metrics.shellCount).toBe(expected.regions);
    });
    if(f.name==='offset-nested-transforms') {
      expect(result.parts[1].metrics.boundsMm).toEqual([[4,24,1.6],[10,30,2]]);near(result.parts[1].metrics.volumeMm3,14.4,1e-12);
      // Explicit D-10 oracle also checks the transformed square's cap coverage.
      const cap=result.parts[1].mesh.triangles.filter(t=>t.every(i=>result.parts[1].mesh.vertices[i][2]===2));
      expect(cap).toHaveLength(2);
      verifyCap(result.activeTiers[1].footprintMm[0]);
    }
  });
});
