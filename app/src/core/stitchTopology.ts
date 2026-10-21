import type { TriangleMesh } from './contracts';
import type { MeshConstructionBudget } from './meshConstructionPolicy';
import { inspectMeshTopology } from './meshTopology';
import type { TopologyResult } from './meshTopology';

export type StitchResult = Exclude<TopologyResult,{status:'stitched'}> | Omit<Extract<TopologyResult,{status:'stitched'}>,'components'>;
export interface StitchOptions {readonly expectedVolumeMm3:number;readonly expectedShellCount?:number;readonly budget?:MeshConstructionBudget}
/** Constructed conforming surfaces only. Full arbitrary-mesh intersection and
 * source-surface semantics are checked by validateMesh / generateCoin. */
export function stitchTopology(surfaces:TriangleMesh,options:StitchOptions):StitchResult {
  const result=inspectMeshTopology(surfaces,{...options,expectedShellCount:options.expectedShellCount??1});
  return result.status==='stitched'?{status:'stitched',mesh:result.mesh,metrics:result.metrics}:result;
}
