import type { FootprintMm } from './contracts';

/** Replaceable planar Boolean boundary. Inputs/outputs are plain canonical DTOs. */
export interface PolygonKernel {
  union(footprints: readonly FootprintMm[]): FootprintMm;
}
