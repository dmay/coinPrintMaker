import './setup';
import { describe, expect, test, vi } from 'vitest';
import type { CoinSettings, FootprintMm, ImportedCoin, Point3Mm, PolygonMm, TriangleMesh } from '../../app/src/core/contracts';
import { createDiagnostic } from '../../app/src/core/diagnostics';
import { generateCoin } from '../../app/src/core/generateCoin';
import { validateMesh } from '../../app/src/core/validateMesh';
import { assertTrianglePair, exactCoordinates } from '../../app/src/core/exactMeshPredicates';
import { assertTierSurfaces } from '../../app/src/core/meshSurfaceSemantics';
import { MeshConstructionBudget, MeshValidationBudget, MESH_VALIDATION_WORK_LIMIT, MESH_CONSTRUCTION_POLICY } from '../../app/src/core/meshConstructionPolicy';
import { buildLayerParts } from '../../app/src/core/buildLayerParts';
import { buildUnifiedMesh } from '../../app/src/core/buildUnifiedMesh';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { isCurrentValidGeneration } from '../../app/src/core/generation';
import { polygonClippingKernel as polygon } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel as triangulator } from '../../app/src/import/earcutTriangulationKernel';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { expectedBoundsYUp, loadFixtures, near, tolerance } from './helpers/fixtures';

const box=(x=0,y=0,w=10,h=10):PolygonMm=>({outer:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],holes:[]});
const donut=(x=2):PolygonMm=>({outer:box().outer,holes:[[[x,2],[x,4],[x+2,4],[x+2,2]]]});
function coinOf(...footprints:FootprintMm[]):ImportedCoin{return {schemaVersion:1,source:{importId:'test',fileName:'test.svg',byteLength:0,svgText:''},physicalPageMm:[40,40],sizeOrigin:'explicit',baseLayerId:'layer-0',diagnostics:[],layers:footprints.map((footprintMm,sourceOrder)=>({id:`layer-${sourceOrder}`,name:'Duplicate',sourceOrder,sourceElements:[],footprintMm,boundsMm:[999,999,999,999],areaMm2:-999}))};}
function defaults(coin:ImportedCoin):CoinSettings{const r=createDefaultCoinSettings(coin);if(r.status!=='created')throw new Error('settings');return r.settings;}
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
const cube:TriangleMesh={vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],triangles:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]};
const options={expectedShellCount:1,expectedBoundsMm:[[0,0,0],[1,1,1]] as const,expectedVolumeMm3:1};
const join=(a:TriangleMesh,b:TriangleMesh):TriangleMesh=>({vertices:[...a.vertices,...b.vertices],triangles:[...a.triangles,...b.triangles.map(t=>t.map(i=>i+a.vertices.length) as unknown as readonly [number,number,number])]});
const translated=(mesh:TriangleMesh,x:number,y=0,z=0):TriangleMesh=>({...mesh,vertices:mesh.vertices.map(p=>[p[0]+x,p[1]+y,p[2]+z])});
const signed=(mesh:TriangleMesh)=>mesh.triangles.reduce((s,t)=>{const [a,b,c]=t.map(i=>mesh.vertices[i]);return s+((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*(a[2]+b[2]+c[2])/6;},0);
function independent(mesh:TriangleMesh,shells:number,volume:number){
  const edges=new Map<string,{balance:number;faces:number[]}>(),neighbors=mesh.triangles.map(()=>new Set<number>());
  const ids=new Map(mesh.vertices.map(p=>[p.join(':'),0]));let n=0;for(const key of ids.keys())ids.set(key,n++);
  for(const [face,t] of mesh.triangles.entries())for(let j=0;j<3;j++){
    const a=ids.get(mesh.vertices[t[j]].join(':'))!,b=ids.get(mesh.vertices[t[(j+1)%3]].join(':'))!,key=a<b?`${a}:${b}`:`${b}:${a}`,e=edges.get(key)??{balance:0,faces:[]};e.balance+=a<b?1:-1;e.faces.push(face);edges.set(key,e);
  }
  for(const e of edges.values()){expect(e.faces).toHaveLength(2);expect(e.balance).toBe(0);neighbors[e.faces[0]].add(e.faces[1]);neighbors[e.faces[1]].add(e.faces[0]);}
  const seen=new Set<number>();let count=0;for(let i=0;i<neighbors.length;i++)if(!seen.has(i)){count++;const queue=[i];while(queue.length){const a=queue.pop()!;if(seen.has(a))continue;seen.add(a);queue.push(...neighbors[a]);}}
  expect(count).toBe(shells);near(signed(mesh),volume,volume*1e-9+1e-20);
}

describe('actual arbitrary mesh validation',()=>{
  test('analytic cube and exact unwelded triangle soup pass, original data is not changed',()=>{
    const soup={vertices:cube.triangles.flatMap(t=>t.map(i=>cube.vertices[i])),triangles:cube.triangles.map((_,i)=>[3*i,3*i+1,3*i+2] as const)},before=JSON.stringify(soup);
    for(const mesh of [cube,soup]){const r=validateMesh(mesh,options);expect(r.status,JSON.stringify(r)).toBe('checked');if(r.status==='checked'){expect(r.mesh.vertices).toHaveLength(8);expect(r.metrics).toEqual({boundsMm:[[0,0,0],[1,1,1]],volumeMm3:1,shellCount:1});independent(r.mesh,1,1);}}
    expect(JSON.stringify(soup)).toBe(before);
  });
  const malformed=[
    ['open',{...cube,triangles:cube.triangles.slice(1)}],
    ['reversed face',{...cube,triangles:cube.triangles.map((t,i)=>i?[...t] as typeof t:[t[0],t[2],t[1]] as const)}],
    ['inverted',{...cube,triangles:cube.triangles.map(t=>[t[0],t[2],t[1]] as const)}],
    ['bad index',{...cube,triangles:[...cube.triangles,[0,1,99]]}],
    ['fractional index',{...cube,triangles:[...cube.triangles,[0,1,.5]]}],
    ['degenerate',{...cube,triangles:[...cube.triangles,[0,0,1]]}],
    ['duplicate',join(cube,cube)],
    ['nonfinite',{...cube,vertices:cube.vertices.map((p,i)=>i?p:[NaN,0,0])}],
    ['unused vertex',{...cube,vertices:[...cube.vertices,[99,99,99]]}],
  ] as const;
  test.each(malformed)('%s rejects without a mesh or metrics',(_,mesh)=>{const r=validateMesh(mesh as TriangleMesh,options);expect(r.status).toBe('rejected');expect(r).not.toHaveProperty('mesh');expect(r).not.toHaveProperty('metrics');});
  test('unexpected shells and inward shell cannot hide behind positive total volume',()=>{
    const two=join(cube,translated(cube,3));expect(validateMesh(two,{...options,expectedBoundsMm:[[0,0,0],[4,1,1]],expectedVolumeMm3:2}).status).toBe('rejected');
    expect(validateMesh(two,{...options,expectedShellCount:2,expectedBoundsMm:[[0,0,0],[4,1,1]],expectedVolumeMm3:2}).status).toBe('checked');
    const reversed={...translated(cube,3),triangles:cube.triangles.map(t=>[t[0],t[2],t[1]] as const)};
    expect(validateMesh(join(cube,reversed),{...options,expectedShellCount:2,expectedBoundsMm:[[0,0,0],[4,1,1]],expectedVolumeMm3:1}).status).toBe('rejected');
  });
  test('wrong expected bounds and volume reject independently',()=>{
    expect(validateMesh(cube,{...options,expectedVolumeMm3:1.01}).status).toBe('rejected');
    expect(validateMesh(cube,{...options,expectedBoundsMm:[[0,0,0],[1.001,1,1]]}).status).toBe('rejected');
  });
  test('closed self-crossing cube rejects despite positive analytical signed volume',()=>{
    const mesh={...cube,vertices:cube.vertices.map((p,i)=>i===4?cube.vertices[5]:i===5?cube.vertices[4]:p)};
    expect(signed(mesh)).toBeGreaterThan(0);const r=validateMesh(mesh,{...options,expectedVolumeMm3:signed(mesh)});expect(r.status).toBe('rejected');
  });
  test('overlapping closed components reject even with expected count, bounds and signed sum',()=>{
    const mesh=join(cube,translated(cube,.5,.5,.5));const r=validateMesh(mesh,{...options,expectedShellCount:2,expectedBoundsMm:[[0,0,0],[1.5,1.5,1.5]],expectedVolumeMm3:2});expect(r).toMatchObject({status:'rejected',diagnostics:[{message:expect.stringContaining('intersect')}]});
  });
  test.each([[1,0,0],[1,1,0],[1,1,1]] as const)('nonincident face/edge/point contact %j rejects',(...offset)=>{
    const mesh=join(cube,translated(cube,offset[0],offset[1],offset[2]));expect(validateMesh(mesh,{...options,expectedShellCount:2,expectedBoundsMm:[[0,0,0],[1+offset[0],1+offset[1],1+offset[2]]],expectedVolumeMm3:2}).status).toBe('rejected');
  });
  test('differently triangulated coincident internal caps reject',()=>{
    const other={...translated(cube,0,0,1),triangles:cube.triangles.map((t,i)=>i===0?[0,3,1] as const:i===1?[1,3,2] as const:t)};
    expect(validateMesh(join(cube,other),{...options,expectedShellCount:2,expectedBoundsMm:[[0,0,0],[1,1,2]],expectedVolumeMm3:2}).status).toBe('rejected');
  });
  test('dyadic predicates preserve arbitrary and subnormal Z exactly',()=>{
    const exact=exactCoordinates([[0,0,Number.MIN_VALUE],[0,0,2*Number.MIN_VALUE],[.1,.2,1.6]]);expect(exact[0][2]*2n).toBe(exact[1][2]);expect(exact[2][2]).toBeGreaterThan(exact[1][2]);
  });
  test('contained outward components reject internal faces even without any surface intersections',()=>{
    const inner={...cube,vertices:cube.vertices.map(p=>p.map(v=>v*.5+.25) as unknown as Point3Mm)},mesh=join(cube,inner);
    expect(validateMesh(mesh,{...options,expectedShellCount:2,expectedVolumeMm3:1.125})).toMatchObject({status:'rejected',diagnostics:[{message:expect.stringContaining('internal faces')}]});
  });
  test('a supported island inside a through-hole bbox remains a separate valid material component',()=>{
    const coin=coinOf([box(-1,-1,12,12)],[{outer:box().outer,holes:[[[2,2],[2,8],[8,8],[8,2]]]},box(3,3,1,1)]);
    const r=generateCoin(coin,defaults(coin),polygon,triangulator);expect(r.status,JSON.stringify(r)).toBe('valid');if(r.status==='valid')expect(r.parts[1].metrics.shellCount).toBe(2);
  });
  test('component local origins preserve small distant outward shells',()=>{
    const small=(x:number)=>({...cube,vertices:cube.vertices.map(p=>[x+p[0]*.000004,p[1]*.000004,p[2]*.000004] as const)}),a=small(0),b=small(999999),mesh=join(a,b),w=b.vertices[1][0]-b.vertices[0][0];
    expect(validateMesh(mesh,{...options,expectedShellCount:2,expectedBoundsMm:[[0,0,0],[999999+w,.000004,.000004]],expectedVolumeMm3:(.000004+w)*.000004**2}).status).toBe('checked');
  });
  test('one final validation allowance is aggregate across meshes',()=>{
    const budget=new MeshValidationBudget();expect(validateMesh(cube,{...options,budget}).status).toBe('checked');const used=budget.workUsed;
    budget.check(MESH_VALIDATION_WORK_LIMIT-budget.workUsed-used+1);
    expect(validateMesh(cube,{...options,budget})).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_LIMIT_EXCEEDED'}]});
  });
  test('work exhaustion returns a scoped limit error',()=>{
    const budget=new MeshConstructionBudget();budget.check(MESH_CONSTRUCTION_POLICY.maxWork-1);
    expect(validateMesh(cube,{...options,budget,layerId:'base'})).toMatchObject({status:'rejected',diagnostics:[{code:'MESH_LIMIT_EXCEEDED',location:{scope:'mesh',layerId:'base'}}]});
  });
});

describe('exact pair intersection and complete surface coverage proofs',()=>{
  const pair=(a:Point3Mm[],b:Point3Mm[],shared:Point3Mm[]=[])=>{const p=exactCoordinates([...a,...b,...shared]);return ()=>assertTrianglePair(p.slice(0,3),p.slice(3,6),p.slice(6));};
  test('exact degenerate triangles reject before any projection predicate',()=>{
    expect(pair([[0,0,0],[1,1,1],[2,2,2]],[[0,0,0],[1,0,0],[0,1,0]],[[0,0,0]])).toThrow('normal is zero');
  });
  test('legal coplanar diagonal and a legal shared vertex pass',()=>{
    expect(pair([[0,0,0],[1,0,0],[1,1,0]],[[0,0,0],[1,1,0],[0,1,0]],[[0,0,0],[1,1,0]])).not.toThrow();
    expect(pair([[0,0,0],[1,0,0],[0,1,0]],[[0,0,0],[-1,0,0],[0,-1,0]],[[0,0,0]])).not.toThrow();
  });
  test('coplanar crossing with no contained vertices rejects',()=>{
    expect(pair([[-2,-1,0],[2,-1,0],[0,2,0]],[[-2,1,0],[2,1,0],[0,-2,0]])).toThrow('intersect');
  });
  test('adjacent coplanar overlap beyond shared edge rejects',()=>{
    expect(pair([[0,0,0],[2,0,0],[0,2,0]],[[0,0,0],[2,0,0],[1,1,0]],[[0,0,0],[2,0,0]])).toThrow('intersect');
  });
  test('alternate box cap diagonal cancels internal edges; reversed cap rejects',()=>{
    const coin=coinOf([box(0,0,1,1)]),s=defaults(coin),r=buildLayerParts(coin,s,polygon,triangulator);if(r.status!=='parts-built')throw new Error('parts');
    const unitTier={...r.activeTiers[0],thicknessMm:1,topZMm:1},other={...cube,triangles:cube.triangles.map((t,i)=>i===2?[4,5,7] as const:i===3?[5,6,7] as const:t)};
    expect(()=>assertTierSurfaces(other,[unitTier],'part',new MeshConstructionBudget())).not.toThrow();
    expect(()=>assertTierSurfaces({...other,triangles:other.triangles.map((t,i)=>i===2?[t[0],t[2],t[1]] as const:t)},[unitTier],'part',new MeshConstructionBudget())).toThrow('reversed');
  });
});

describe('fresh complete generation and failure-atomic snapshots',()=>{
  test.each([
    ['nested',[[box()],[box(1,1,8,8)],[box(2,2,2,2)]],187.2],
    ['holed',[[donut()],[{outer:box(1,1,8,8).outer,holes:donut().holes}]],177.6],
    ['islands',[[box(4,20,20,20)],[box(4,24,6,6),box(15,30,2,2)]],656],
    ['identical',[[box()],[box()]],200],
    ['shared',[[box()],[box(2,0,4,4)]],166.4],
  ] as const)('%s returns checked positioned parts, exterior, dimensions and analytic metadata',(_,f,volume)=>{
    const coin=coinOf(...f),settings=defaults(coin),before=JSON.stringify({coin,settings}),r=generateCoin(coin,settings,polygon,triangulator);
    expect(r.status,JSON.stringify(r)).toBe('valid');if(r.status!=='valid')return;
    independent(r.unifiedMesh,1,volume);near(r.analyticalVolumeMm3,volume,1e-10);near(r.metrics.volumeMm3,volume,1e-10);
    expect(r.dimensionsMm).toEqual([r.metrics.boundsMm[1][0]-r.metrics.boundsMm[0][0],r.metrics.boundsMm[1][1]-r.metrics.boundsMm[0][1],r.activeTiers.at(-1)!.topZMm]);
    expect(r.colorBoundaryHeightsMm).toEqual(r.activeTiers.slice(0,-1).map(t=>t.topZMm));
    expect(r.parts.map(p=>p.layerId)).toEqual(r.activeTiers.map(t=>t.layerId));for(const [i,p] of r.parts.entries())independent(p.mesh,r.activeTiers[i].footprintMm.length,p.metrics.volumeMm3);
    expect(isCurrentValidGeneration(r,{importId:settings.importId,settingsRevision:settings.revision})).toBe(true);expect(JSON.parse(JSON.stringify(r))).toEqual(r);expect(JSON.stringify({coin,settings})).toBe(before);
  });
  test('invalid current support, thickness, identity or kernel failures never fall back',()=>{
    const coin=coinOf([box()],[box(1,1,2,2)]),s=defaults(coin),valid=generateCoin(coin,s,polygon,triangulator);expect(valid.status).toBe('valid');
    for(const settings of [{...s,revision:1,importId:'other'},{...s,revision:1,layers:[{...s.layers[0],thicknessMm:0},s.layers[1]]} as CoinSettings]){
      const r=generateCoin(coin,settings,polygon,triangulator);expect(r.status).toBe('invalid');if(settings.importId===coin.source.importId)expect(r.input?.settingsRevision).toBe(1);else expect(r).not.toHaveProperty('input');expect(r).not.toHaveProperty('parts');expect(r).not.toHaveProperty('metrics');expect(isCurrentValidGeneration(valid,{importId:settings.importId,settingsRevision:1})).toBe(false);
    }
    const r=generateCoin(coin,{...s,revision:1},{...polygon,difference(){throw new Error('private');}},triangulator);expect(r.status).toBe('invalid');expect(JSON.stringify(r)).not.toContain('private');
  });
  test.each([NaN,Infinity,-Infinity,-1,.5])('invalid revision %s returns a finite JSON-safe keyless failure',revision=>{
    const coin=coinOf([box()]),s=defaults(coin),r=generateCoin(coin,{...s,revision},polygon,triangulator);
    expect(r.status).toBe('invalid');expect(r).not.toHaveProperty('input');expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  test('fresh immediate active lower support rejects disabled intermediate tier',()=>{
    const coin=coinOf([box()],[box(2,2,6,6)],[box(1,1,8,8)]),s=defaults(coin);
    expect(generateCoin(coin,s,polygon,triangulator).status).toBe('invalid');
    const edited={...s,revision:1,layers:s.layers.map((t,i)=>i===1?{...t,enabled:false}:t)} as unknown as CoinSettings;
    expect(generateCoin(coin,edited,polygon,triangulator).status).toBe('valid');
  });
  test.each(['parts','unified'] as const)('late %s builder exception strips every payload',stage=>{
    const coin=coinOf([box()]),settings=defaults(coin),throws=()=>{throw new Error('private adapter error');};
    const r=generateCoin(coin,settings,polygon,triangulator,stage==='parts'?{parts:throws}:{unified:{build:throws}});expect(r.status).toBe('invalid');for(const key of ['parts','activeTiers','unifiedMesh','metrics','dimensionsMm','analyticalVolumeMm3','colorBoundaryHeightsMm'])expect(r).not.toHaveProperty(key);expect(JSON.stringify(r)).not.toContain('private adapter');
  });
  test.each(['key','count','id','name','color','z','footprint','error'] as const)('forged %s stage metadata cannot authorize generation',kind=>{
    const coin=coinOf([box()],[box(2,2,2,2)]),s=defaults(coin),parts:typeof buildLayerParts=(...args)=>{
      const r=clone(buildLayerParts(...args));if(r.status!=='parts-built')return r;
      if(kind==='key')return {...r,input:{...r.input,settingsRevision:999}};
      if(kind==='count')return {...r,parts:r.parts.slice(1)};
      if(kind==='error')return {...r,diagnostics:[{code:'MESH_INVALID',severity:'error',message:'error',location:{scope:'mesh',layerId:null},remediation:'fix'}]};
      if(kind==='z'||kind==='footprint')return {...r,activeTiers:r.activeTiers.map((t,i)=>i?t:{...t,...(kind==='z'?{topZMm:99}:{footprintMm:[box(0,0,1,1)]})})};
      return {...r,parts:r.parts.map((p,i)=>i?p:{...p,[kind==='id'?'layerId':kind]:'wrong'})};
    };
    expect(generateCoin(coin,s,polygon,triangulator,{parts}).status).toBe('invalid');
  });
  test('successful stage warnings are retained once in the final diagnostics',()=>{
    const coin=coinOf([box()]),s=defaults(coin),warning=createDiagnostic('SOURCE_SIZE_INFERRED',{scope:'document'});
    const r=generateCoin(coin,s,polygon,triangulator,{parts(...args){const stage=buildLayerParts(...args);return {...stage,diagnostics:[...stage.diagnostics,warning,warning]};}});
    expect(r.status).toBe('valid');expect(r.diagnostics).toEqual([warning]);
  });
  test('builder metrics are discarded and actual checked metrics replace them',()=>{
    const coin=coinOf([box()]),s=defaults(coin),parts:typeof buildLayerParts=(...args)=>{const r=buildLayerParts(...args);return r.status==='parts-built'?{...r,parts:r.parts.map(p=>({...p,metrics:{boundsMm:[[999,999,999],[1000,1000,1000]] as const,volumeMm3:-1,shellCount:999}}))}:r;};
    const r=generateCoin(coin,s,polygon,triangulator,{parts});expect(r.status,JSON.stringify(r)).toBe('valid');if(r.status==='valid')expect(r.parts[0].metrics).toEqual({boundsMm:[[0,0,0],[10,10,1.6]],volumeMm3:160,shellCount:1});
  });
  test('same bounds/volume hole relocation fails the exact source-surface gate',()=>{
    const coin=coinOf([donut(2)]),donor=coinOf([donut(6)]),s=defaults(coin),other=buildLayerParts(donor,defaults(donor),polygon,triangulator);if(other.status!=='parts-built')throw new Error('donor');
    const parts:typeof buildLayerParts=(...args)=>{const r=buildLayerParts(...args);return r.status==='parts-built'?{...r,parts:r.parts.map((p,i)=>({...p,mesh:other.parts[i].mesh}))}:r;};
    const r=generateCoin(coin,s,polygon,triangulator,{parts});expect(r).toMatchObject({status:'invalid',diagnostics:[{message:expect.stringContaining('tier surface')}]});
  });
  test('unified builder shifted intermediate geometry with equal total bounds and volume rejects',()=>{
    const coin=coinOf([box()],[box(1,1,2,2)]),donor=coinOf([box()],[box(6,6,2,2)]),s=defaults(coin),other=buildUnifiedMesh(donor,defaults(donor),polygon,triangulator);if(other.status!=='unified-built')throw new Error('donor');
    const r=generateCoin(coin,s,polygon,triangulator,{unified:{build(...args){const r=buildUnifiedMesh(...args);return r.status==='unified-built'?{...r,unifiedMesh:other.unifiedMesh}:r;}}});expect(r.status).toBe('invalid');
  });
  test('returned snapshot is detached from source/settings and retained builder buffers',()=>{
    const coin=coinOf([box()]),s=defaults(coin);let retained:ReturnType<typeof buildLayerParts>|undefined;
    const r=generateCoin(coin,s,polygon,triangulator,{parts(...args){retained=buildLayerParts(...args);return retained;}});expect(r.status).toBe('valid');const before=JSON.stringify(r);
    if(retained?.status==='parts-built')(retained.parts[0].mesh.vertices[0] as unknown as number[])[0]=999;
    (coin.layers[0].footprintMm[0].outer[0] as unknown as number[])[0]=888;(s.layers[0] as {color:string}).color='#ffffff';expect(JSON.stringify(r)).toBe(before);
  });
  test('point-touch terrace limitation stays explicit',()=>{
    const coin=coinOf([{outer:[[0,0],[10,0],[10,3],[3,3],[3,10],[0,10]],holes:[]}],[box(0,0,3,3)]);expect(generateCoin(coin,defaults(coin),polygon,triangulator).status).toBe('invalid');
  });
  test('malformed cap adapter fails closed before any valid snapshot',()=>{
    const coin=coinOf([box()]),s=defaults(coin),triangulate=vi.fn(()=>[[0,0,0]] as const);expect(generateCoin(coin,s,polygon,{triangulate}).status).toBe('invalid');
  });
});

const fixtures=(await loadFixtures()).filter(f=>f.expected.importOutcome==='accept');
describe('production importer to final checked snapshot M2 exit',()=>{
  test.each(fixtures)('$name',fixture=>{
    const imported=importCoinSvg({importId:fixture.name,fileName:fixture.name+'.svg',byteLength:fixture.svg.length,svgText:fixture.svg});expect(imported.status).toBe('imported');if(imported.status!=='imported')return;
    const coin=imported.coin,s=defaults(coin),r=generateCoin(coin,s,polygon,triangulator);
    const unsupported=['outside-rim','over-lower-hole'].includes(fixture.name);expect(r.status,JSON.stringify(r)).toBe(unsupported?'invalid':'valid');
    if(r.status!=='valid'){expect(r).not.toHaveProperty('unifiedMesh');return;}
    const ideal=fixture.expected.analyticalVolumeMm3!;near(r.metrics.volumeMm3,ideal,ideal*tolerance.volumeRelative);near(r.metrics.volumeMm3,r.analyticalVolumeMm3,r.analyticalVolumeMm3*1e-9);
    expect(r.parts).toHaveLength(fixture.expected.layers.length);expect(r.metrics.boundsMm[0][2]).toBe(0);near(r.dimensionsMm[2],fixture.expected.totalHeightMm!,1e-12);
    for(const [i,p] of r.parts.entries()){
      const expected=fixture.expected.layers[i],bounds=expectedBoundsYUp(expected.boundsMm,fixture.expected.physicalPageMm[1]);
      [p.metrics.boundsMm[0][0],p.metrics.boundsMm[0][1],p.metrics.boundsMm[1][0],p.metrics.boundsMm[1][1]].forEach((v,j)=>near(v,bounds[j],tolerance.coordinateMm));
      expect(p.metrics.shellCount).toBe(expected.regions);near(p.metrics.volumeMm3,expected.areaMm2*expected.thicknessMm,Math.max(tolerance.areaAbsoluteMm2*expected.thicknessMm,expected.areaMm2*expected.thicknessMm*tolerance.volumeRelative));
    }
    if(fixture.name==='offset-nested-transforms')expect(r.parts[1].metrics).toEqual({boundsMm:[[4,24,1.6],[10,30,2]],volumeMm3:14.399999999999997,shellCount:1});
  },30_000);
});
