import type { Bounds3Mm, MeshMetrics, TriangleMesh } from './contracts';
import type { Diagnostic } from './diagnostics';
import { inspectMeshTopology } from './meshTopology';
import { assertNoMeshIntersections } from './exactMeshPredicates';
import { MeshConstructionBudget, MeshValidationBudget, MeshConstructionFailure } from './meshConstructionPolicy';
import { constructionDiagnostic } from './triangulateRegion';

export const MESH_VALIDATION_POLICY={absoluteBoundsErrorMm:1e-9,relativeBoundsError:1e-12} as const;
export interface MeshValidationOptions {
  readonly expectedShellCount:number;
  readonly expectedBoundsMm:Bounds3Mm;
  readonly expectedVolumeMm3:number;
  readonly layerId?:string;
  readonly budget?:MeshConstructionBudget;
}
export type MeshValidation =
  | {readonly status:'checked';readonly mesh:TriangleMesh;readonly metrics:MeshMetrics}
  | {readonly status:'rejected';readonly diagnostics:readonly Diagnostic[];readonly mesh?:never;readonly metrics?:never};
/** Validate actual coordinates, never builder metrics. Exact XYZ weld only. */
export function validateMesh(mesh:TriangleMesh,options:MeshValidationOptions):MeshValidation {
  const budget=options.budget??new MeshValidationBudget();
  const topology=inspectMeshTopology(mesh,{...options,budget});
  if(topology.status==='rejected')return {status:'rejected',diagnostics:topology.diagnostics.map(d=>({...d,location:{scope:'mesh',layerId:options.layerId??null}}))};
  try{
    if(!Array.isArray(options.expectedBoundsMm)||options.expectedBoundsMm.length!==2||options.expectedBoundsMm.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!Number.isFinite(x))))throw new MeshConstructionFailure('Expected finite bounds are required.');
    for(let end=0;end<2;end++)for(let axis=0;axis<3;axis++){
      const expected=options.expectedBoundsMm[end][axis],actual=topology.metrics.boundsMm[end][axis];
      if(Math.abs(actual-expected)>MESH_VALIDATION_POLICY.absoluteBoundsErrorMm+Math.abs(expected)*MESH_VALIDATION_POLICY.relativeBoundsError)throw new MeshConstructionFailure('Measured mesh bounds differ from the current source tiers.');
    }
    assertNoMeshIntersections(topology.mesh,budget,topology.components);
    return {status:'checked',mesh:topology.mesh,metrics:topology.metrics};
  }catch(error){return {status:'rejected',diagnostics:[constructionDiagnostic(error,options.layerId??null)]};}
}
