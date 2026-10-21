import './setup';
import { downwardSupportExpectation } from './helpers/downwardSupportExpectation';
import { describe, expect, test, vi } from 'vitest';
import type { CoinSettings, FootprintMm, ImportedCoin, Point2Mm, PolygonMm, RingMm, TriangleMesh } from '../../app/src/core/contracts';
import { buildUnifiedMesh, isCurrentUnifiedMesh, unifiedMeshBuilder } from '../../app/src/core/buildUnifiedMesh';
import { stitchTopology } from '../../app/src/core/stitchTopology';
import { assertTerraceBoundary, conformUnifiedBoundaries } from '../../app/src/core/conformUnifiedBoundaries';
import { MESH_CONSTRUCTION_POLICY, MeshConstructionBudget } from '../../app/src/core/meshConstructionPolicy';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { expectedBoundsYUp, loadFixtures, near, tolerance } from './helpers/fixtures';

const box=(x=0,y=0,w=10,h=10):PolygonMm=>({outer:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],holes:[]});
const donut:PolygonMm={outer:box().outer,holes:[[[2,2],[2,8],[8,8],[8,2]]]};
const cross=(a:readonly number[],b:readonly number[],c:readonly number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const ringArea=(r:readonly Point2Mm[])=>r.slice(1,-1).reduce((s,p,i)=>s+cross(r[0],p,r[i+2]),0)/2;
const area=(f:FootprintMm)=>f.reduce((s,p)=>s+ringArea(p.outer)+p.holes.reduce((s,h)=>s+ringArea(h),0),0);
function coinOf(...footprints:FootprintMm[]):ImportedCoin{return {schemaVersion:1,source:{importId:'test',fileName:'test.svg',byteLength:0,svgText:''},physicalPageMm:[40,40],sizeOrigin:'explicit',baseLayerId:'layer-0',diagnostics:[],layers:footprints.map((footprintMm,sourceOrder)=>({id:`layer-${sourceOrder}`,name:'Duplicate',sourceOrder,sourceElements:[],footprintMm,boundsMm:[0,0,1,1],areaMm2:-1}))};}
function defaults(coin:ImportedCoin):CoinSettings {const r=createDefaultCoinSettings(coin);if(r.status!=='created')throw new Error('settings');return r.settings;}
function built(...footprints:FootprintMm[]){const coin=coinOf(...footprints),r=buildUnifiedMesh(coin,defaults(coin),polygonClippingKernel,earcutTriangulationKernel);expect(r.status,JSON.stringify(r)).toBe('unified-built');if(r.status!=='unified-built')throw new Error('unified');return r;}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function inRing(p:Point2Mm,r:RingMm):boolean {let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])inside=!inside;return inside;}
const inside=(p:Point2Mm,f:FootprintMm)=>f.some(q=>inRing(p,q.outer)&&!q.holes.some(h=>inRing(p,h)));
function componentCount(graph:readonly Set<number>[]):number {const seen=new Set<number>();let count=0;for(let i=0;i<graph.length;i++){if(seen.has(i))continue;count++;const queue=[i];while(queue.length){const v=queue.pop()!;if(seen.has(v))continue;seen.add(v);queue.push(...graph[v]);}}return count;}
/** Independent test-side edge incidence, connected components and cyclic links;
 * no production validator, predicate or metrics are reused. */
function verify(mesh:TriangleMesh,expectedVolume:number,footprints?:readonly FootprintMm[],heights?:readonly number[]){
  const {vertices,triangles}=mesh,edges=new Map<string,{uses:number[];balance:number}>(),links=vertices.map(()=>new Map<number,Set<number>>()),adj=triangles.map(()=>new Set<number>()),duplicates=new Set<string>();
  let volume=0;const horizontal=new Map<number,number>();
  for(const [index,t] of triangles.entries()){
    expect(t).toHaveLength(3);t.forEach(i=>{expect(Number.isInteger(i)&&i>=0&&i<vertices.length).toBe(true);expect(vertices[i].every(Number.isFinite)).toBe(true);});
    const key=t.map(i=>vertices[i].join(',')).sort().join('/');expect(duplicates.has(key)).toBe(false);duplicates.add(key);
    const [a,b,c]=t.map(i=>vertices[i]),u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    expect(normal.every(Number.isFinite)&&normal.some(x=>x!==0)).toBe(true);
    volume+=cross(a,b,c)/2*(a[2]+b[2]+c[2])/3;
    if(a[2]===b[2]&&b[2]===c[2]){
      expect(Math.sign(normal[2])).toBe(a[2]===0?-1:1);horizontal.set(a[2],(horizontal.get(a[2])??0)+Math.abs(normal[2])/2);
      if(footprints&&heights){
        const p:Point2Mm=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3],level=heights.indexOf(a[2]);
        expect(level).toBeGreaterThanOrEqual(0);expect(inside(p,footprints[a[2]===0?0:level-1])).toBe(true);
        if(a[2]!==0&&level<footprints.length)expect(inside(p,footprints[level])).toBe(false);
      }
    }else if(footprints&&heights){
      const z=(a[2]+b[2]+c[2])/3,level=heights.findIndex((h,i)=>i+1<heights.length&&z>h&&z<heights[i+1]);expect(level).toBeGreaterThanOrEqual(0);
      const pair=[a,b,c].flatMap((p,i)=>[a,b,c].slice(i+1).map(q=>[p,q])).find(([p,q])=>p[2]===q[2])!;
      // Source contour edge may be subdivided, so use collinear containment.
      const edge=footprints[level].flatMap(p=>[p.outer,...p.holes]).flatMap(r=>r.map((p,i)=>[p,r[(i+1)%r.length]])).find(([p,q])=>pair.every(v=>Math.abs(cross(p,q,v))<1e-8&&v[0]>=Math.min(p[0],q[0])&&v[0]<=Math.max(p[0],q[0])&&v[1]>=Math.min(p[1],q[1])&&v[1]<=Math.max(p[1],q[1])));
      expect(edge).toBeDefined();if(edge)expect(normal[0]*(edge[1][1]-edge[0][1])-normal[1]*(edge[1][0]-edge[0][0])).toBeGreaterThan(0);
    }
    for(let j=0;j<3;j++){
      const a=t[j],b=t[(j+1)%3],c=t[(j+2)%3],key=a<b?`${a}:${b}`:`${b}:${a}`,e=edges.get(key);if(e){e.uses.push(index);e.balance+=a<b?1:-1;}else edges.set(key,{uses:[index],balance:a<b?1:-1});
      for(const [x,y] of [[b,c],[c,b]]){const neighbors=links[a].get(x)??new Set<number>();neighbors.add(y);links[a].set(x,neighbors);}
    }
  }
  for(const e of edges.values()){expect(e.uses).toHaveLength(2);expect(e.balance).toBe(0);adj[e.uses[0]].add(e.uses[1]);adj[e.uses[1]].add(e.uses[0]);}
  expect(componentCount(adj)).toBe(1);
  for(const link of links){
    expect(link.size).toBeGreaterThan(2);for(const n of link.values())expect(n.size).toBe(2);
    const keys=[...link.keys()],ids=new Map(keys.map((k,i)=>[k,i]));
    const graph=keys.map(k=>new Set([...link.get(k)!].map(n=>ids.get(n)!)));
    expect(componentCount(graph)).toBe(1);
  }
  near(volume,expectedVolume,Math.abs(expectedVolume)*1e-9+1e-24);
  return horizontal;
}
function verifyPlaneCoverage(mesh:TriangleMesh,footprints:readonly FootprintMm[],heights:readonly number[]):void {
  const points=footprints[0].flatMap(p=>p.outer),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY;
  for(const [level,z] of heights.entries()){
    const cap=mesh.triangles.filter(t=>t.every(i=>mesh.vertices[i][2]===z)).map(t=>t.map(i=>mesh.vertices[i]));
    for(let x=-1;x<24;x++)for(let y=-1;y<24;y++){
      const p:Point2Mm=[minX+(x+.219)*w/23,minY+(y+.137)*h/23];
      if(cap.some(t=>t.some((a,i)=>Math.abs(cross(a,t[(i+1)%3],p))<1e-10)))continue;
      const count=cap.filter(t=>{const turns=t.map((a,i)=>cross(a,t[(i+1)%3],p));return turns.every(v=>v>0)||turns.every(v=>v<0);}).length;
      const expected=level===0?inside(p,footprints[0]):inside(p,footprints[level-1])&&(level===footprints.length||!inside(p,footprints[level]));
      expect(count,JSON.stringify({p,z})).toBe(expected?1:0);
    }
  }
}

describe('only the external supported coin boundary',()=>{
  const cases=[
    {name:'base only',f:[[box()]],areas:[100],volume:160},
    {name:'nested three tiers',f:[[box()],[box(1,1,8,8)],[box(2,2,2,2)]],areas:[100,64,4],volume:187.2},
    {name:'identical footprints',f:[[box()],[box()],[box()]],areas:[100,100,100],volume:240},
    {name:'partial shared edge',f:[[box()],[box(2,0,4,4)]],areas:[100,16],volume:166.4},
    {name:'full shared sides',f:[[box()],[box(0,0,10,4)]],areas:[100,40],volume:176},
    {name:'upper islands',f:[[box()],[box(1,1,2,2),box(6,6,3,3)]],areas:[100,13],volume:165.2},
    {name:'aligned through hole',f:[[donut],[{outer:box(1,1,8,8).outer,holes:donut.holes}]],areas:[64,28],volume:113.6},
    {name:'identical donut',f:[[donut],[donut]],areas:[64,64],volume:128},
    {name:'hole shrinks material above',f:[[box()],[donut]],areas:[100,64],volume:185.6},
    {name:'off-center tile',f:[[box(4,20,20,20)],[box(4,24,6,6)]],areas:[400,36],volume:654.4},
    {name:'concave shared side',f:[[{outer:[[0,0],[10,0],[10,3],[3,3],[3,10],[0,10]],holes:[]}],[box(0,0,2,3)]],areas:[51,6],volume:84},
    {name:'oblique partial boundary',f:[[{outer:[[0,0],[10,0],[10,10]],holes:[]}],[{outer:[[2,2],[8,2],[8,8]],holes:[]}]],areas:[50,18],volume:87.2},
  ] satisfies {name:string;f:FootprintMm[];areas:number[];volume:number}[];
  test.each(cases)('$name: analytic volume, plane areas, winding and independent manifoldness',({f,areas,volume})=>{
    const r=built(...f),heights=[0,...r.activeTiers.map(t=>t.topZMm)],planes=verify(r.unifiedMesh,volume,f,heights);
    verifyPlaneCoverage(r.unifiedMesh,f,heights);
    near(r.metrics.volumeMm3,volume,volume*1e-10);expect(r.metrics.shellCount).toBe(1);near(planes.get(0)!,areas[0],1e-10);
    for(let i=0;i<areas.length;i++){const expected=areas[i]-(areas[i+1]??0);near(planes.get(heights[i+1])??0,expected,1e-10);}
    expect(new Set(r.unifiedMesh.vertices.map(p=>p[2]))).toEqual(new Set(heights));expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  test('partial shared edge splits source caps and walls without inventing or moving XY',()=>{
    const r=built([box()],[box(2,0,4,4)]);
    for(const z of [0,1.6])for(const x of [2,6])expect(r.unifiedMesh.vertices).toContainEqual([x,0,z]);
    expect(r.metrics.boundsMm).toEqual([[0,0,0],[10,10,2]]);
    const existing=new Set([box(),box(2,0,4,4)].flatMap(p=>p.outer.map(x=>x.join(':'))));expect(r.unifiedMesh.vertices.every(([x,y])=>existing.has(`${x}:${y}`))).toBe(true);
  });
  test.each([0,999999])('tiny 8e-12 mm² base at %s remains nonzero',offset=>{
    const r=built([{outer:[[offset,offset],[offset+.000004,offset],[offset,offset+.000004]],holes:[]}]);
    expect(r.unifiedMesh.triangles).toHaveLength(8);verify(r.unifiedMesh,((offset+.000004)-offset)**2/2*1.6);expect(r.metrics.volumeMm3).toBeGreaterThan(0);
  });
  test('tiny shared corner step and thin upper tier are retained',()=>{
    const f:FootprintMm=[{outer:[[0,0],[1,0],[1,1],[.000004,1],[.000004,1.000004],[0,1.000004]],holes:[]}],coin=coinOf(f,f),s=defaults(coin),settings={...s,layers:[s.layers[0],{...s.layers[1],thicknessMm:.00000001}]} as CoinSettings;
    const r=buildUnifiedMesh(coin,settings,polygonClippingKernel,earcutTriangulationKernel);expect(r.status,JSON.stringify(r)).toBe('unified-built');if(r.status==='unified-built'){verify(r.unifiedMesh,(1+16e-12)*(1.6+.00000001));expect(r.unifiedMesh.vertices).toContainEqual([.000004,1.000004,1.6+.00000001]);}
  });
});

describe('exact conformity, precision and failure-atomic adapters',()=>{
  test('refinement and oriented cancellation run on exact grid and emitted XY',()=>{
    const lower=[box()],upper=[box(2,0,4,4)],terrace:FootprintMm=[{outer:[[0,0],[2,0],[2,4],[6,4],[6,0],[10,0],[10,10],[0,10]],holes:[]}],budget=new MeshConstructionBudget();
    const [a,b,c]=conformUnifiedBoundaries([lower,upper,terrace],budget);expect(a[0].outer).toContainEqual([2,0]);expect(()=>assertTerraceBoundary(a,b,c,budget)).not.toThrow();
    expect(()=>assertTerraceBoundary(a,b,[box()],budget)).toThrow('Terrace boundary');
  });
  test('equal canonical-grid keys with unequal binary values reject, never weld by proximity',()=>{
    expect(()=>conformUnifiedBoundaries([[box(.1,0,1,1)],[box(.1+Number.EPSILON/8,0,1,1)]],new MeshConstructionBudget())).toThrow('unequal emitted');
  });
  test('ideal collinear split not collinear in emitted binary XY rejects',()=>{
    const lower:FootprintMm=[{outer:[[0,0],[.1,.3],[0,1]],holes:[]}],upper:FootprintMm=[{outer:[[.03,.09],[.06,.18],[0,.5]],holes:[]}];
    expect(()=>conformUnifiedBoundaries([lower,upper],new MeshConstructionBudget())).toThrow('not exactly representable');
  });
  test('binary boundary cancellation cannot hide behind matching ideal-grid keys',()=>{
    const a=[box(.1,0,1,1)],b=[box(.1+Number.EPSILON/8,0,1,1)];expect(()=>assertTerraceBoundary(a,b,[],new MeshConstructionBudget())).toThrow('Terrace boundary');
  });
  test('valid but incorrect kernel terrace is rejected even though support previously passed',()=>{
    const coin=coinOf([box()],[box(2,2,2,2)]),difference=vi.fn(polygonClippingKernel.difference).mockImplementationOnce(()=>[]).mockImplementationOnce(()=>[box()]);
    const r=buildUnifiedMesh(coin,defaults(coin),{...polygonClippingKernel,difference},earcutTriangulationKernel);
    expect(difference).toHaveBeenCalledTimes(2);expect(r).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_INVALID',message:expect.stringContaining('Terrace boundary')}]});expect(r).not.toHaveProperty('unifiedMesh');
  });
  test.each(['throw','malformed','overlap','degenerate','missing'] as const)('triangulator %s discards the whole unified candidate',kind=>{
    const coin=coinOf([box()],[box(2,2,2,2)]),triangulate=vi.fn(earcutTriangulationKernel.triangulate).mockImplementationOnce(earcutTriangulationKernel.triangulate).mockImplementationOnce(()=>{
      if(kind==='throw')throw new Error('private detail');if(kind==='malformed')return [[-1,2,3]];if(kind==='overlap')return [[0,1,2],[0,1,3]];if(kind==='degenerate')return [[0,0,1]];return [[0,1,2]];
    });
    const r=buildUnifiedMesh(coin,defaults(coin),polygonClippingKernel,{triangulate});expect(r.status).toBe('rejected');expect(r).not.toHaveProperty('unifiedMesh');expect(r).not.toHaveProperty('activeTiers');expect(JSON.stringify(r)).not.toContain('private detail');
  });
  test('polygon adapter throws and malformed output reject without leaking internals',()=>{
    const coin=coinOf([box()],[box(2,2,2,2)]);
    for(const difference of [()=>{throw new Error('private detail');},(()=>[{outer:[[0,0]],holes:[]}]) as unknown as typeof polygonClippingKernel.difference]){
      const r=buildUnifiedMesh(coin,defaults(coin),{...polygonClippingKernel,difference},earcutTriangulationKernel);expect(r.status).toBe('rejected');expect(r).not.toHaveProperty('unifiedMesh');expect(JSON.stringify(r)).not.toContain('private detail');
    }
  });
  test('positive near-coincidence fails under existing polygon policy before constructing geometry',()=>{
    const coin=coinOf([box()],[box(.000001,1,2,2)]),triangulate=vi.fn(earcutTriangulationKernel.triangulate),r=buildUnifiedMesh(coin,defaults(coin),polygonClippingKernel,{triangulate});expect(r.status).toBe('rejected');expect(triangulate).not.toHaveBeenCalled();
  });
  test('a terrace pinch between otherwise supported tiers rejects explicitly',()=>{
    const coin=coinOf([{outer:[[0,0],[10,0],[10,3],[3,3],[3,10],[0,10]],holes:[]}],[box(0,0,3,3)]);
    const r=buildUnifiedMesh(coin,defaults(coin),polygonClippingKernel,earcutTriangulationKernel);expect(r).toMatchObject({status:'rejected',diagnostics:[{code:'POLYGON_INVALID',message:expect.stringContaining('touch')}]});expect(r).not.toHaveProperty('unifiedMesh');
  });
  test.each(['input','work'] as const)('boundary refinement shares aggregate %s limits',kind=>{
    const budget=new MeshConstructionBudget();if(kind==='input')budget.input(MESH_CONSTRUCTION_POLICY.maxInputVertices-5);else budget.check(MESH_CONSTRUCTION_POLICY.maxWork-5);
    expect(()=>conformUnifiedBoundaries([[box()]],budget)).toThrow('limit');
  });
});

describe('bounded stitching gates malformed constructed surfaces',()=>{
  const tetra:TriangleMesh={vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],triangles:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]};
  test('exact identity accepts repeated vertices and treats negative zero consistently',()=>{
    const m:TriangleMesh={vertices:tetra.triangles.flatMap(t=>t.map(i=>tetra.vertices[i].map(x=>x===0?-0:x) as unknown as typeof tetra.vertices[number])),triangles:tetra.triangles.map((_,i)=>[3*i,3*i+1,3*i+2])};
    const r=stitchTopology(m,{expectedVolumeMm3:1/6});expect(r.status).toBe('stitched');if(r.status==='stitched'){expect(r.mesh.vertices).toHaveLength(4);verify(r.mesh,1/6);}
  });
  test.each(['duplicate','opposite duplicate','missing','reversed','zero','bad index','nonfinite','wrong volume'] as const)('%s rejects without a partial stitched mesh',kind=>{
    let m=tetra;if(kind==='duplicate')m={...tetra,triangles:[...tetra.triangles,tetra.triangles[0]]};if(kind==='opposite duplicate')m={...tetra,triangles:[...tetra.triangles,[0,1,2]]};if(kind==='missing')m={...tetra,triangles:tetra.triangles.slice(1)};if(kind==='reversed')m={...tetra,triangles:[[0,1,2],...tetra.triangles.slice(1)]};if(kind==='zero')m={...tetra,triangles:[[0,0,0],...tetra.triangles]};if(kind==='bad index')m={...tetra,triangles:[[0,1,88],...tetra.triangles]};if(kind==='nonfinite')m={...tetra,vertices:[[Infinity,0,0],...tetra.vertices.slice(1)]};
    const r=stitchTopology(m,{expectedVolumeMm3:kind==='wrong volume'?2:1/6});expect(r.status).toBe('rejected');expect(r).not.toHaveProperty('mesh');expect(r).not.toHaveProperty('metrics');
  });
  test('unrefined T-junction rejects without approximate stitching',()=>{
    const m:TriangleMesh={vertices:[...tetra.vertices,[.5,0,0]],triangles:[[0,2,1],[0,4,3],[4,1,3],[1,2,3],[2,0,3]]};expect(stitchTopology(m,{expectedVolumeMm3:1/6}).status).toBe('rejected');
  });
  test.each(['disconnected','cavity','pinch'] as const)('%s boundary rejects even when individual edges have two incidences',kind=>{
    const shift=kind==='pinch'?[0,0,0]:kind==='cavity'?[.1,.1,.1]:[2,2,2],scale=kind==='cavity'?.1:kind==='pinch'?-1:1;
    const vertices=[...tetra.vertices,...tetra.vertices.map(p=>p.map((x,j)=>x*scale+shift[j]) as unknown as typeof tetra.vertices[number])];
    const faces=tetra.triangles.map(t=>(kind==='cavity'||kind==='pinch'?[t[0],t[2],t[1]]:t).map(i=>i+4) as unknown as typeof tetra.triangles[number]);
    const r=stitchTopology({vertices,triangles:[...tetra.triangles,...faces]},{expectedVolumeMm3:kind==='cavity'?(1-.001)/6:1/3});expect(r.status).toBe('rejected');
  });
  test.each(['vertices','triangles','work'] as const)('shared %s construction cap applies to stitching',kind=>{
    const budget=new MeshConstructionBudget(),p=MESH_CONSTRUCTION_POLICY;if(kind==='vertices')budget.output(p.maxOutputVertices-3,0);if(kind==='triangles')budget.output(0,p.maxOutputTriangles-3);if(kind==='work')budget.check(p.maxWork-3);
    expect(stitchTopology(tetra,{budget,expectedVolumeMm3:1/6})).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_LIMIT_EXCEEDED'}]});
  });
  test('oversized untrusted surface arrays reject before allocation/welding',()=>{
    expect(stitchTopology({...tetra,vertices:Array(MESH_CONSTRUCTION_POLICY.maxOutputVertices+1).fill([0,0,0])},{expectedVolumeMm3:1})).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_LIMIT_EXCEEDED'}]});
  });
});

describe('fresh source and settings orchestration',()=>{
  test('stale identity blocks meshing',()=>{
    const coin=coinOf([box()],[donut],[box(3,3,2,2)]),s=defaults(coin),triangulate=vi.fn(earcutTriangulationKernel.triangulate);
    for(const settings of [{...s,importId:'stale'}]){const r=buildUnifiedMesh(coin,settings,polygonClippingKernel,{triangulate});expect(r.status).toBe('rejected');for(const key of ['unifiedMesh','metrics','activeTiers','totalHeightMm'])expect(r).not.toHaveProperty(key);}
    expect(triangulate).not.toHaveBeenCalled();
  });
  test('hide, color, thickness, revision and source mutations rebuild without stale-stage input',()=>{
    const coin=freeze(coinOf([box()],[box(1,1,8,8)],[box(2,2,2,2)])),s=freeze(defaults(coin)),before=JSON.stringify([coin,s]),a=unifiedMeshBuilder.build(coin,s,polygonClippingKernel,earcutTriangulationKernel);
    const settings={...s,revision:1,layers:[s.layers[0],{...s.layers[1],enabled:false},{...s.layers[2],thicknessMm:.7,color:'#fedcba'}]} as CoinSettings;
    const b=buildUnifiedMesh(coin,settings,polygonClippingKernel,earcutTriangulationKernel);expect(a.status).toBe('unified-built');expect(b.status).toBe('unified-built');if(b.status!=='unified-built')throw new Error('stage');
    expect(b.activeTiers.map(t=>t.layerId)).toEqual(['layer-0','layer-2']);expect(b.activeTiers[1]).toMatchObject({color:'#fedcba',bottomZMm:1.6,topZMm:2.3});verify(b.unifiedMesh,162.8);expect(isCurrentUnifiedMesh(a,b.input)).toBe(false);expect(isCurrentUnifiedMesh(b,b.input)).toBe(true);expect(isCurrentUnifiedMesh(null,b.input)).toBe(false);expect(isCurrentUnifiedMesh(b,{...b.input,importId:'other'})).toBe(false);
    const error={code:'MESH_INVALID',severity:'error',message:'error',location:{scope:'document'},remediation:'fix'} as const;expect(isCurrentUnifiedMesh({...b,diagnostics:[error]},b.input)).toBe(false);
    expect(JSON.stringify([coin,s])).toBe(before);expect(buildUnifiedMesh(coin,settings,polygonClippingKernel,earcutTriangulationKernel)).toEqual(b);
    const reordered={...s,revision:2,layers:[s.layers[0],s.layers[2],s.layers[1]]} as CoinSettings;expect(buildUnifiedMesh(coin,reordered,polygonClippingKernel,earcutTriangulationKernel).status).toBe('unified-built');
  });
});

const fixtures=(await loadFixtures()).filter(f=>f.expected.importOutcome==='accept').map(downwardSupportExpectation);
describe('authored production import → support → unified surface regressions',()=>{
  test.each(fixtures)('$name',f=>{
    const imported=importCoinSvg({importId:f.name,fileName:f.name+'.svg',svgText:f.svg,byteLength:f.svg.length});if(imported.status!=='imported')throw new Error(JSON.stringify(imported));
    const r=buildUnifiedMesh(imported.coin,defaults(imported.coin),polygonClippingKernel,earcutTriangulationKernel);expect(r.status,JSON.stringify(r)).toBe(f.expected.geometryOutcome==='blocked'?'rejected':'unified-built');if(r.status==='rejected'){expect(r).not.toHaveProperty('unifiedMesh');return;}
    const expectedVolume=f.expected.layers.reduce((s,l)=>s+l.areaMm2*l.thicknessMm,0),planarVolume=r.activeTiers.reduce((s,t)=>s+area(t.footprintMm)*(t.topZMm-t.bottomZMm),0);verify(r.unifiedMesh,planarVolume);near(r.metrics.volumeMm3,expectedVolume,Math.max(tolerance.areaAbsoluteMm2,tolerance.volumeRelative*expectedVolume));
    const bounds=expectedBoundsYUp(f.expected.layers[0].boundsMm,f.expected.physicalPageMm[1]);[r.metrics.boundsMm[0][0],r.metrics.boundsMm[0][1],r.metrics.boundsMm[1][0],r.metrics.boundsMm[1][1]].forEach((v,j)=>near(v,bounds[j],tolerance.coordinateMm));expect(r.metrics.boundsMm[0][2]).toBe(0);expect(r.metrics.boundsMm[1][2]).toBe(r.totalHeightMm);
    if(f.name==='offset-nested-transforms'){
      verifyPlaneCoverage(r.unifiedMesh,r.activeTiers.map(t=>t.footprintMm),[0,...r.activeTiers.map(t=>t.topZMm)]);
      const mesh=r.unifiedMesh,cap=mesh.triangles.filter(t=>t.every(i=>mesh.vertices[i][2]===2));expect(cap).toHaveLength(2);
      const xy=cap.flatMap(t=>t.map(i=>mesh.vertices[i]));expect(Math.min(...xy.map(p=>p[0]))).toBe(4);expect(Math.max(...xy.map(p=>p[0]))).toBe(10);expect(Math.min(...xy.map(p=>p[1]))).toBe(24);expect(Math.max(...xy.map(p=>p[1]))).toBe(30);
      near(cap.reduce((s,t)=>s+cross(...t.map(i=>mesh.vertices[i]) as [typeof mesh.vertices[number],typeof mesh.vertices[number],typeof mesh.vertices[number]])/2,0),36,1e-12);
      near(r.metrics.volumeMm3,area(r.activeTiers[0].footprintMm)*1.6+14.4,1e-9);
    }
  });
});
