import type { ActiveTier, Bounds3Mm, CoinSettings, GeneratedCoin, GenerationKey, ImportedCoin, Point3Mm } from './contracts';
import type { Diagnostic } from './diagnostics';
import type { PolygonKernel } from './polygonKernel';
import type { TriangulationKernel } from './triangulationKernel';
import { buildLayerParts } from './buildLayerParts';
import { unifiedMeshBuilder } from './buildUnifiedMesh';
import type { UnifiedMeshBuilder } from './buildUnifiedMesh';
import { validateSupport } from './validateSupport';
import { emittedFootprintArea } from './conformUnifiedBoundaries';
import { validateMesh } from './validateMesh';
import { assertTierSurfaces } from './meshSurfaceSemantics';
import { MeshValidationBudget, MeshConstructionFailure } from './meshConstructionPolicy';
import { constructionDiagnostic } from './triangulateRegion';

function combined(...groups:readonly (readonly Diagnostic[])[]):readonly Diagnostic[]{
  const seen=new Set<string>();return groups.flat().filter(d=>{const key=JSON.stringify(d);if(seen.has(key))return false;seen.add(key);return true;});
}
export interface GenerationBuilders {
  readonly parts?:typeof buildLayerParts;
  readonly unified?:UnifiedMeshBuilder;
}
// Copy JSON DTOs without coercing nonfinite numbers. No geometry/render objects.
function detached<T>(value:T):T {
  if(Array.isArray(value))return value.map(detached) as T;
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,detached(v)])) as T;
  return value;
}
function measure(tiers:readonly ActiveTier[]):{bounds:Bounds3Mm;volume:number}{
  const min=[Infinity,Infinity,tiers[0].bottomZMm],max=[-Infinity,-Infinity,tiers[tiers.length-1].topZMm];let volume=0,correction=0;
  for(const tier of tiers){
    for(const polygon of tier.footprintMm)for(const ring of [polygon.outer,...polygon.holes])for(const p of ring)for(let j=0;j<2;j++){min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}
    const term=emittedFootprintArea(tier.footprintMm)*(tier.topZMm-tier.bottomZMm),adjusted=term-correction,total=volume+adjusted;correction=(total-volume)-adjusted;volume=total;
  }
  return {bounds:[min as unknown as Point3Mm,max as unknown as Point3Mm],volume};
}
function assertMetadata(stage:{input:GenerationKey;activeTiers:readonly ActiveTier[];totalHeightMm:number;diagnostics:readonly Diagnostic[]},input:GenerationKey,tiers:readonly ActiveTier[]){
  if(stage.input.importId!==input.importId||stage.input.settingsRevision!==input.settingsRevision||stage.totalHeightMm!==tiers[tiers.length-1].topZMm||stage.activeTiers.length!==tiers.length||stage.diagnostics.some(d=>d.severity==='error'))throw new MeshConstructionFailure('Builder snapshot is stale, incomplete or error-bearing.');
  for(const [i,t] of tiers.entries()){
    const candidate=stage.activeTiers[i];
    if(['layerId','name','color','thicknessMm','bottomZMm','topZMm'].some(k=>candidate[k as keyof ActiveTier]!==t[k as keyof ActiveTier])||JSON.stringify(candidate.footprintMm)!==JSON.stringify(t.footprintMm))throw new MeshConstructionFailure('Builder tier metadata differs from current source/settings.');
  }
}
/** Fresh source/settings -> support -> construction -> independent actual mesh
 * topology/intersections/source-surface coverage -> detached checked snapshot.
 * No prior generation argument and no fallback to an old successful candidate. */
export function generateCoin(coin:ImportedCoin,settings:CoinSettings,polygonKernel:PolygonKernel,triangulator:TriangulationKernel,builders:GenerationBuilders={}):GeneratedCoin{
  const input:GenerationKey={importId:settings.importId,settingsRevision:settings.revision};
  const hasKey=typeof coin.source.importId==='string'&&coin.source.importId.trim().length>0&&settings.importId===coin.source.importId&&Number.isSafeInteger(settings.revision)&&settings.revision>=0;
  let diagnostics:readonly Diagnostic[]=[];
  const reject=(errors:readonly Diagnostic[]):GeneratedCoin=>({schemaVersion:1,status:'invalid',...(hasKey?{input:detached(input)}:{}),diagnostics:detached(combined(diagnostics,errors))});
  try{
    // Adapters/builders receive their own copies; expected source truth is retained.
    const source=detached(coin),current=detached(settings),support=validateSupport(source,current,polygonKernel);
    if(support.status==='rejected')return reject(support.diagnostics);
    diagnostics=support.diagnostics;const tiers=detached(support.activeTiers),budget=new MeshValidationBudget();
    const partResult=(builders.parts??buildLayerParts)(detached(source),detached(current),polygonKernel,triangulator);
    if(partResult.status==='rejected')return reject(partResult.diagnostics);
    assertMetadata(partResult,input,tiers);diagnostics=combined(diagnostics,partResult.diagnostics);
    if(partResult.parts.length!==tiers.length)throw new MeshConstructionFailure('One ordered part per current active tier is required.');
    const parts=[];
    for(const [i,tier] of tiers.entries()){
      const part=partResult.parts[i];
      if(part.layerId!==tier.layerId||part.name!==tier.name||part.color!==tier.color)throw new MeshConstructionFailure('Part identity, order, name or color differs from the current tier.');
      const expected=measure([tier]),checked=validateMesh(part.mesh,{expectedShellCount:tier.footprintMm.length,expectedBoundsMm:expected.bounds,expectedVolumeMm3:expected.volume,layerId:tier.layerId,budget});
      if(checked.status==='rejected')return reject(checked.diagnostics);
      assertTierSurfaces(checked.mesh,[tier],'part',budget);
      parts.push({layerId:tier.layerId,name:tier.name,color:tier.color,mesh:checked.mesh,metrics:checked.metrics});
    }
    const unified=(builders.unified??unifiedMeshBuilder).build(detached(source),detached(current),polygonKernel,triangulator);
    if(unified.status==='rejected')return reject(unified.diagnostics);
    assertMetadata(unified,input,tiers);diagnostics=combined(diagnostics,unified.diagnostics);
    // Downward extension may create detached columns. Each effective base
    // region supplies one complete boundary component; never add a bridge.
    const expected=measure(tiers),checked=validateMesh(unified.unifiedMesh,{expectedShellCount:tiers[0].footprintMm.length,expectedBoundsMm:expected.bounds,expectedVolumeMm3:expected.volume,budget});
    if(checked.status==='rejected')return reject(checked.diagnostics);
    assertTierSurfaces(checked.mesh,tiers,'unified',budget);
    const dimensionsMm=checked.metrics.boundsMm[1].map((v,j)=>v-checked.metrics.boundsMm[0][j]) as unknown as Point3Mm;
    if(!dimensionsMm.every(v=>Number.isFinite(v)&&v>0))throw new MeshConstructionFailure('Final dimensions must be finite and positive.');
    return detached({schemaVersion:1,status:'valid',input,diagnostics,activeTiers:tiers,parts,unifiedMesh:checked.mesh,metrics:checked.metrics,dimensionsMm,analyticalVolumeMm3:expected.volume,colorBoundaryHeightsMm:tiers.slice(0,-1).map(t=>t.topZMm)});
  }catch(error){return reject([constructionDiagnostic(error,null)]);}
}
