import type { Bounds2Mm, FootprintMm, Point2Mm, RingMm } from './contracts';

export const POLYGON_POLICY = {
  chordErrorMm: 0.005,
  snapMm: 0.000001,
  closureNoiseMm: 0.000000001,
  maxCoordinateMm: 1_000_000,
  maxRingVertices: 8_192,
  maxDocumentVertices: 50_000,
  maxSegmentChecks: 2_000_000,
  maxSubdivisionDepth: 24,
  maxKernelInputVertices: 12_000,
} as const;
export class PolygonFailure extends Error {
  constructor(message: string, readonly limit = false) { super(message); }
}
/** A single budget spans input flattening, validation and kernel output. */
export class PolygonBudget {
  private vertices = 0;
  private checks = 0;
  vertex() {
    if (++this.vertices > POLYGON_POLICY.maxDocumentVertices) throw new PolygonFailure('Document vertex limit exceeded.', true);
  }
  check() {
    if (++this.checks > POLYGON_POLICY.maxSegmentChecks) throw new PolygonFailure('Contour comparison limit exceeded.', true);
  }
}
export const equalPoint = (a: Point2Mm, b: Point2Mm) => a[0] === b[0] && a[1] === b[1];
const cross = (a: Point2Mm, b: Point2Mm, c: Point2Mm) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function signedRingArea(ring: readonly Point2Mm[]): number {
  const origin = ring[0];
  let sum = 0;
  for (let i = 1; i + 1 < ring.length; i++) sum += cross(origin, ring[i], ring[i + 1]);
  return sum / 2;
}
export function segmentDistance(p: Point2Mm, a: Point2Mm, b: Point2Mm): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function contact(a: Point2Mm, b: Point2Mm, c: Point2Mm, d: Point2Mm): boolean {
  const eps = POLYGON_POLICY.snapMm * 2;
  if (Math.max(a[0], b[0]) + eps < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) + eps < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) + eps < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) + eps < Math.min(a[1], b[1])) return false;
  const x = cross(a,b,c), y = cross(a,b,d), z = cross(c,d,a), w = cross(c,d,b);
  if (((x > 0 && y < 0) || (x < 0 && y > 0)) && ((z > 0 && w < 0) || (z < 0 && w > 0))) return true;
  return Math.min(segmentDistance(a,c,d), segmentDistance(b,c,d), segmentDistance(c,a,b), segmentDistance(d,a,b)) <= eps;
}
export function normalizeRing(points: readonly Point2Mm[], budget: PolygonBudget): RingMm {
  if (points.length > POLYGON_POLICY.maxRingVertices + 1) throw new PolygonFailure('Ring vertex limit exceeded.', true);
  const ring: Point2Mm[] = [];
  let previous: Point2Mm | null = null;
  for (const point of points) {
    budget.vertex();
    if (point.length !== 2 || !point.every(Number.isFinite) || point.some(v => Math.abs(v) > POLYGON_POLICY.maxCoordinateMm)) throw new PolygonFailure('Nonfinite or out-of-range XY coordinate.');
    const snap = (v: number) => Math.round(v / POLYGON_POLICY.snapMm) * POLYGON_POLICY.snapMm || 0;
    const p: Point2Mm = [snap(point[0]), snap(point[1])];
    if (ring.length && equalPoint(p,ring[ring.length-1]) && previous && Math.hypot(point[0]-previous[0],point[1]-previous[1]) > POLYGON_POLICY.closureNoiseMm) throw new PolygonFailure('Snapping would collapse a nonzero edge. Enlarge or remove the tiny feature in Inkscape.');
    if (!ring.length || !equalPoint(p, ring[ring.length - 1])) ring.push(p);
    previous=point;
  }
  if (ring.length > 1 && equalPoint(ring[0], ring[ring.length - 1])) {
    if (Math.hypot(points[0][0]-points[points.length-1][0],points[0][1]-points[points.length-1][1]) > POLYGON_POLICY.closureNoiseMm) throw new PolygonFailure('Snapping would collapse the closing edge.');
    ring.pop();
  }
  // Only exactly collinear forward vertices are redundant. Never erase a sliver.
  let changed = true;
  while (changed && ring.length >= 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      budget.check();
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
      if (cross(a,b,c) === 0) {
        if ((b[0]-a[0])*(c[0]-b[0]) + (b[1]-a[1])*(c[1]-b[1]) < 0) throw new PolygonFailure('Contour doubles back.');
        ring.splice(i, 1); changed = true; break;
      }
    }
  }
  if (ring.length < 3 || Math.abs(signedRingArea(ring)) <= POLYGON_POLICY.snapMm ** 2) throw new PolygonFailure('Contour collapsed or has zero area.');
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    budget.check();
    if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
    if (contact(ring[i], ring[(i+1)%ring.length], ring[j], ring[(j+1)%ring.length])) throw new PolygonFailure('Contour self-intersects or has near-contact.');
  }
  return ring as unknown as RingMm;
}
/** Before snapping/union: allow actual intersections/shared edges across objects,
 * but never let the snap grid bridge a tiny gap or erase a narrow overlap. */
export function assertNoNearObjectContact(a: readonly Point2Mm[], b: readonly Point2Mm[], budget: PolygonBudget): void {
  for (let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) {
    budget.check();
    const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
    const x=cross(p,q,r),y=cross(p,q,s),z=cross(r,s,p),w=cross(r,s,q);
    if (x*y<0 && z*w<0) continue;
    const distance=Math.min(segmentDistance(p,r,s),segmentDistance(q,r,s),segmentDistance(r,p,q),segmentDistance(s,p,q));
    if (distance>POLYGON_POLICY.closureNoiseMm && distance<=2*POLYGON_POLICY.snapMm) throw new PolygonFailure('Separate objects have ambiguous near-contact before snapping. Separate them clearly or union them in Inkscape.');
  }
}
export function assertSeparate(a: RingMm, b: RingMm, budget: PolygonBudget): void {
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    budget.check();
    if (contact(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length])) throw new PolygonFailure('Compound contours cross, touch or have near-contact. Use separate filled objects for overlapping artwork, or resolve the compound path in Inkscape.');
  }
}
export function inside(point: Point2Mm, ring: RingMm, budget: PolygonBudget): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    budget.check();
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) result = !result;
  }
  return result;
}
export function canonicalRing(ring: RingMm, ccw: boolean): RingMm {
  const points = (signedRingArea(ring) > 0) === ccw ? [...ring] : [...ring].reverse();
  let first = 0;
  for (let i = 1; i < points.length; i++) if (points[i][0] < points[first][0] || (points[i][0] === points[first][0] && points[i][1] < points[first][1])) first = i;
  return [...points.slice(first), ...points.slice(0,first)] as unknown as RingMm;
}
const compareKeys = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
const ringKey = (ring: RingMm) => JSON.stringify(ring);
export function canonicalFootprint(input: FootprintMm, budget: PolygonBudget): FootprintMm {
  const output = input.map(p => ({ outer: canonicalRing(normalizeRing(p.outer,budget),true), holes: p.holes.map(h => canonicalRing(normalizeRing(h,budget),false)).sort((a,b) => compareKeys(ringKey(a),ringKey(b))) }));
  const rings = output.flatMap(p => [p.outer, ...p.holes]);
  for (let i=0;i<rings.length;i++) for (let j=i+1;j<rings.length;j++) assertSeparate(rings[i],rings[j],budget);
  for (const p of output) {
    for (const h of p.holes) {
      if (!inside(h[0],p.outer,budget)) throw new PolygonFailure('Kernel hole is outside its exterior.');
      if (p.holes.some(other => other !== h && inside(h[0],other,budget))) throw new PolygonFailure('Kernel holes are nested.');
    }
    for (const q of output) if (p !== q && inside(p.outer[0],q.outer,budget) && !q.holes.some(h => inside(p.outer[0],h,budget))) throw new PolygonFailure('Kernel regions overlap.');
  }
  return output.sort((a,b) => compareKeys(ringKey(a.outer),ringKey(b.outer)));
}
export function footprintMetrics(footprint: FootprintMm): { areaMm2: number; boundsMm: Bounds2Mm } {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,areaMm2=0;
  for (const p of footprint) {
    areaMm2 += signedRingArea(p.outer) + p.holes.reduce((sum,h) => sum+signedRingArea(h),0);
    for (const [x,y] of p.outer) { minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); }
  }
  if (!(areaMm2 > 0) || ![minX,minY,maxX,maxY,areaMm2].every(Number.isFinite)) throw new PolygonFailure('Empty or invalid filled footprint.');
  return { areaMm2, boundsMm: [minX,minY,maxX,maxY] };
}
