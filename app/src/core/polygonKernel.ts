import type { FootprintMm } from './contracts';

/** Replaceable planar Boolean boundary. No library types escape this adapter.
 * Results are untrusted until the polygon service validates them. */
export interface PolygonKernel {
  union(footprints: readonly FootprintMm[]): FootprintMm;
  difference(subject: FootprintMm, clip: FootprintMm): FootprintMm;
  intersection(subject: FootprintMm, clip: FootprintMm): FootprintMm;
}
