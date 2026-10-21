import type { CoinSettings, FootprintMm, GenerationKey, ImportedCoin, MeshMetrics, Point3Mm, SupportedStack, Triangle, TriangleMesh } from './contracts';
import type { Diagnostic } from './diagnostics';
import type { PolygonKernel } from './polygonKernel';
import type { TriangulationKernel } from './triangulationKernel';
import { MeshConstructionBudget } from './meshConstructionPolicy';
import { createPolygonService } from './polygonService';
import { constructionDiagnostic, triangulateRegion } from './triangulateRegion';
import { validateSupport } from './validateSupport';
import { assertTerraceBoundary, conformUnifiedBoundaries, emittedFootprintArea } from './conformUnifiedBoundaries';
import { stitchTopology } from './stitchTopology';

export type UnifiedMeshResult =
  | {readonly status:'unified-built';readonly input:GenerationKey;readonly activeTiers:SupportedStack['activeTiers'];readonly totalHeightMm:number;readonly unifiedMesh:TriangleMesh;readonly metrics:MeshMetrics;readonly diagnostics:readonly Diagnostic[]}
  | {readonly status:'rejected';readonly input?:GenerationKey;readonly diagnostics:readonly Diagnostic[];readonly unifiedMesh?:never;readonly metrics?:never;readonly activeTiers?:never;readonly totalHeightMm?:never};
/** Replaceable complete stage, independent of UI/rendering and serializer state. */
export interface UnifiedMeshBuilder {
  build(coin:ImportedCoin,settings:CoinSettings,polygonKernel:PolygonKernel,triangulator:TriangulationKernel):UnifiedMeshResult;
}

/** Current source/settings -> fresh support -> only exposed surfaces. Never
 * concatenates closed parts or returns GeneratedCoin/export authorization. */
export function buildUnifiedMesh(coin:ImportedCoin,settings:CoinSettings,polygonKernel:PolygonKernel,triangulator:TriangulationKernel):UnifiedMeshResult {
  const support=validateSupport(coin,settings,polygonKernel);
  if(support.status==='rejected')return {status:'rejected',...(support.input?{input:support.input}:{}),diagnostics:support.diagnostics};
  const reject=(diagnostics:readonly Diagnostic[]):UnifiedMeshResult=>({status:'rejected',input:support.input,diagnostics:[...support.diagnostics,...diagnostics]});
  const budget=new MeshConstructionBudget(),service=createPolygonService(polygonKernel);
  try{
    const tiers=support.activeTiers,terraces:FootprintMm[]=[];
    for(let i=0;i+1<tiers.length;i++){
      const result=service.difference(tiers[i].footprintMm,tiers[i+1].footprintMm,{budget:budget.polygonBudget,location:{scope:'mesh',layerId:tiers[i].layerId}});
      if(result.status==='rejected')return reject(result.diagnostics);terraces.push(result.value);
    }
    const refined=conformUnifiedBoundaries([...tiers.map(t=>t.footprintMm),...terraces],budget),footprints=refined.slice(0,tiers.length),exposed=refined.slice(tiers.length);
    for(let i=0;i<exposed.length;i++)assertTerraceBoundary(footprints[i],footprints[i+1],exposed[i],budget);
    const vertices:Point3Mm[]=[],triangles:Triangle[]=[];
    const addCap=(footprint:FootprintMm,z:number,up:boolean,layerId:string):readonly Diagnostic[]|null=>{
      for(const polygon of footprint){
        const result=triangulateRegion(polygon,triangulator,{budget,layerId});if(result.status==='rejected')return result.diagnostics;
        const offset=vertices.length,cap=result.region;budget.output(cap.vertices.length,cap.triangles.length);
        for(const [x,y] of cap.vertices)vertices.push([x,y,z]);
        for(const [a,b,c] of cap.triangles)triangles.push(up?[offset+a,offset+b,offset+c]:[offset+a,offset+c,offset+b]);
      }return null;
    };
    let error=addCap(footprints[0],0,false,tiers[0].layerId);if(error)return reject(error);
    for(let i=0;i<tiers.length;i++){
      const tier=tiers[i];error=addCap(i+1===tiers.length?footprints[i]:exposed[i],tier.topZMm,true,tier.layerId);if(error)return reject(error);
      for(const polygon of footprints[i])for(const ring of [polygon.outer,...polygon.holes])for(let j=0;j<ring.length;j++){
        budget.check();budget.output(4,2);const a=ring[j],b=ring[(j+1)%ring.length],n=vertices.length;
        vertices.push([a[0],a[1],tier.bottomZMm],[b[0],b[1],tier.bottomZMm],[b[0],b[1],tier.topZMm],[a[0],a[1],tier.topZMm]);
        triangles.push([n,n+1,n+2],[n,n+2,n+3]);
      }
    }
    let expected=0,compensation=0;
    for(const [i,tier] of tiers.entries()){
      const value=emittedFootprintArea(footprints[i])*(tier.topZMm-tier.bottomZMm)-compensation,total=expected+value;compensation=(total-expected)-value;expected=total;
    }
    const result=stitchTopology({vertices,triangles},{budget,expectedVolumeMm3:expected,expectedShellCount:tiers[0].footprintMm.length});if(result.status==='rejected')return reject(result.diagnostics);
    return {status:'unified-built',input:support.input,activeTiers:support.activeTiers,totalHeightMm:support.totalHeightMm,unifiedMesh:result.mesh,metrics:result.metrics,diagnostics:support.diagnostics};
  }catch(error){return reject([constructionDiagnostic(error,null)]);}
}
export const unifiedMeshBuilder:UnifiedMeshBuilder={build:buildUnifiedMesh};

/** Freshness of an already constructed stage; not arbitrary mesh validation. */
export function isCurrentUnifiedMesh(result:UnifiedMeshResult|null,current:GenerationKey):result is Extract<UnifiedMeshResult,{status:'unified-built'}> {
  return result?.status==='unified-built'&&result.input.importId===current.importId&&result.input.settingsRevision===current.settingsRevision&&!result.diagnostics.some(d=>d.severity==='error');
}
