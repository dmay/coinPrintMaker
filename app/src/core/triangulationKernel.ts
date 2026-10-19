import type { Point2Mm, Triangle } from './contracts';

/** Untrusted, replaceable triangulator; indices refer to the supplied vertices.
 * No Steiner vertices, library types, transforms or scene objects cross here. */
export interface TriangulationKernel {
  triangulate(vertices: readonly Point2Mm[], holeStarts: readonly number[]): readonly Triangle[];
}
