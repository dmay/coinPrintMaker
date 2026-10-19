import type { Point2Mm } from './contracts';
import { POLYGON_POLICY } from './polygonGeometry';
import { MeshConstructionFailure } from './meshConstructionPolicy';

export type GridPoint = readonly [bigint, bigint];
/** Recover the existing canonical lattice for predicates only. Never emit rounded
 * coordinates. Allow only floating representation noise, not an off-grid snap. */
export function gridPoint(point: Point2Mm): GridPoint {
  if (point.length !== 2) throw new MeshConstructionFailure('Expected an XY tuple.');
  return point.map(value => {
    const integer = Math.round(value / POLYGON_POLICY.snapMm);
    if (!Number.isFinite(value) || Math.abs(value) > POLYGON_POLICY.maxCoordinateMm || !Number.isSafeInteger(integer) ||
        Math.abs(value - integer * POLYGON_POLICY.snapMm) > 4 * Number.EPSILON * Math.max(Math.abs(value), Math.abs(integer * POLYGON_POLICY.snapMm))) {
      throw new MeshConstructionFailure('Mesh input must already use the canonical 0.000001 mm grid.');
    }
    return BigInt(integer);
  }) as unknown as GridPoint;
}
/** Canonical nonzero coordinates are >= ~1e-6 and <= 1e6 mm, so their
 * IEEE-754 values have at most 72 fractional binary bits. Multiplication by
 * 2^80 is exact and produces integers; BigInt preserves every emitted bit.
 * This is a predicate coordinate system only, never an emitted transform. */
export function binaryPoint(point: Point2Mm): GridPoint {
  return point.map(value=>{
    const scaled=value*2**80;
    if(!Number.isInteger(scaled)) throw new MeshConstructionFailure('Emitted XY cannot be lifted exactly for construction predicates.');
    return BigInt(scaled);
  }) as unknown as GridPoint;
}
export const gridCross = (a: GridPoint, b: GridPoint, c: GridPoint): bigint =>
  (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
export const gridArea2 = (ring: readonly GridPoint[]): bigint => {
  let area = 0n;
  for (let i=1;i+1<ring.length;i++) area += gridCross(ring[0],ring[i],ring[i+1]);
  return area;
};
export const gridOnSegment = (p: GridPoint, a: GridPoint, b: GridPoint): boolean =>
  gridCross(a,b,p) === 0n && (p[0]-a[0])*(p[0]-b[0]) <= 0n && (p[1]-a[1])*(p[1]-b[1]) <= 0n;
