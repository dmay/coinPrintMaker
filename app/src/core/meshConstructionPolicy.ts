import { PolygonBudget } from './polygonGeometry';

export const MESH_CONSTRUCTION_POLICY = {
  maxRegionVertices: 12_000,
  maxRegionTriangles: 48_000,
  maxInputVertices: 50_000,
  maxOutputVertices: 100_000,
  maxOutputTriangles: 200_000,
  maxWork: 2_000_000,
  // Numerical accumulation only; never used to remove a triangle or region.
  relativeVolumeError: 1e-9,
} as const;

export class MeshConstructionFailure extends Error {
  constructor(message: string, readonly limit = false) { super(message); }
}
/** Shared across every region and retained part in a construction call. */
export class MeshConstructionBudget {
  readonly polygonBudget = new PolygonBudget();
  private inputs = 0;
  private vertices = 0;
  private triangles = 0;
  private work = 0;
  input(count: number) {
    if ((this.inputs += count) > MESH_CONSTRUCTION_POLICY.maxInputVertices) throw new MeshConstructionFailure('Aggregate mesh input vertex limit exceeded.', true);
  }
  output(vertices: number, triangles: number) {
    if ((this.vertices += vertices) > MESH_CONSTRUCTION_POLICY.maxOutputVertices || (this.triangles += triangles) > MESH_CONSTRUCTION_POLICY.maxOutputTriangles) throw new MeshConstructionFailure('Aggregate mesh output limit exceeded.', true);
  }
  check(count = 1) {
    if ((this.work += count) > MESH_CONSTRUCTION_POLICY.maxWork) throw new MeshConstructionFailure('Mesh construction work limit exceeded.', true);
  }
}
