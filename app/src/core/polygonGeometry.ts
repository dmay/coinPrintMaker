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
  constructor(private readonly maxVertices: number = POLYGON_POLICY.maxDocumentVertices) {}
  private vertices = 0;
  private checks = 0;
  vertex() {
    if (++this.vertices > this.maxVertices) throw new PolygonFailure('Document vertex limit exceeded.', true);
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
function contact(a: Point2Mm, b: Point2Mm, c: Point2Mm, d: Point2Mm, eps: number = POLYGON_POLICY.snapMm * 2): boolean {
  if (Math.max(a[0], b[0]) + eps < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) + eps < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) + eps < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) + eps < Math.min(a[1], b[1])) return false;
  const x = cross(a,b,c), y = cross(a,b,d), z = cross(c,d,a), w = cross(c,d,b);
  if (((x > 0 && y < 0) || (x < 0 && y > 0)) && ((z > 0 && w < 0) || (z < 0 && w > 0))) return true;
  return Math.min(segmentDistance(a,c,d), segmentDistance(b,c,d), segmentDistance(c,a,b), segmentDistance(d,a,b)) <= eps;
}
/** Sweep segment bounds before exact contact tests. Expanded bounds preserve the
 * existing near-contact tolerance. Charge every X-overlap scan, including
 * Y-disjoint pairs, so dense adversarial arrangements remain bounded. */
function* segmentCandidates(a: readonly Point2Mm[], b: readonly Point2Mm[] | null, budget: PolygonBudget): Generator<readonly [number, number]> {
  const segments = (ring: readonly Point2Mm[], group: number) => ring.map((p, index) => {
    const q = ring[(index + 1) % ring.length];
    return { index, group, minX: Math.min(p[0],q[0]), maxX: Math.max(p[0],q[0]), minY: Math.min(p[1],q[1]), maxY: Math.max(p[1],q[1]) };
  });
  const entries = [...segments(a,0), ...(b ? segments(b,1) : [])].sort((p,q) => p.minX-q.minX || p.group-q.group || p.index-q.index);
  const eps = 2 * POLYGON_POLICY.snapMm;
  for (let i=0;i<entries.length;i++) for (let j=i+1;j<entries.length;j++) {
    const p=entries[i], q=entries[j];
    if (q.minX > p.maxX + eps) break;
    budget.check();
    if (b && p.group===q.group) continue;
    if (p.maxY + eps < q.minY || q.maxY + eps < p.minY) continue;
    yield p.group===0 ? [p.index,q.index] : [q.index,p.index];
  }
}
const snapCoordinate = (v: number) => Math.round(v / POLYGON_POLICY.snapMm) * POLYGON_POLICY.snapMm || 0;
export function normalizeRing(points: readonly Point2Mm[], budget: PolygonBudget, snapCoordinates = true): RingMm {
  if (points.length > POLYGON_POLICY.maxRingVertices + 1) throw new PolygonFailure('Ring vertex limit exceeded.', true);
  const ring: Point2Mm[] = [];
  let previous: Point2Mm | null = null;
  for (const point of points) {
    budget.vertex();
    if (point.length !== 2 || !point.every(Number.isFinite) || point.some(v => Math.abs(v) > POLYGON_POLICY.maxCoordinateMm)) throw new PolygonFailure('Nonfinite or out-of-range XY coordinate.');
    const p: Point2Mm = snapCoordinates ? [snapCoordinate(point[0]), snapCoordinate(point[1])] : [point[0],point[1]];
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
  for (const [i,j] of segmentCandidates(ring,null,budget)) {
    if ((i+1)%ring.length===j || (j+1)%ring.length===i) continue;
    // Diverging neighbours of a short edge are necessarily within clearance
    // at that edge. Preserve it and still check actual contact. Hairpins and
    // nonlocal pairs keep the full precision clearance guard.
    const bridge = (i+2)%ring.length===j ? (i+1)%ring.length : (j+2)%ring.length===i ? (j+1)%ring.length : -1;
    let clearance: number = 2*POLYGON_POLICY.snapMm;
    if (bridge>=0) {
      const before=ring[(bridge+ring.length-1)%ring.length], a=ring[bridge];
      const b=ring[(bridge+1)%ring.length], after=ring[(bridge+2)%ring.length];
      const diverging=(before[0]-a[0])*(after[0]-b[0])+(before[1]-a[1])*(after[1]-b[1])<=0;
      if (diverging && Math.hypot(a[0]-b[0],a[1]-b[1])<=clearance) clearance=0;
    }
    if (contact(ring[i], ring[(i+1)%ring.length], ring[j], ring[(j+1)%ring.length],clearance)) throw new PolygonFailure('Contour self-intersects or has near-contact.');
  }
  return ring as unknown as RingMm;
}
/** Neighbours on opposite ends of an identical short edge are close by
 * construction. Both operands must contain that same noncollapsed bridge;
 * unrelated gaps, overlaps and hairpins retain the clearance requirement. */
function sharedShortBridgePairs(a:readonly Point2Mm[],b:readonly Point2Mm[]):Set<string>{
  const key=(p:Point2Mm,q:Point2Mm)=>{const x=JSON.stringify(p),y=JSON.stringify(q);return x<y?x+'|'+y:y+'|'+x;};
  const bridges=(ring:readonly Point2Mm[])=>{
    const result=new Map<string,number>();
    for(let i=0;i<ring.length;i++){
      const p=ring[i],q=ring[(i+1)%ring.length],length=Math.hypot(p[0]-q[0],p[1]-q[1]);
      const before=ring[(i+ring.length-1)%ring.length],after=ring[(i+2)%ring.length];
      if(length>0&&length<=2*POLYGON_POLICY.snapMm&&(before[0]-p[0])*(after[0]-q[0])+(before[1]-p[1])*(after[1]-q[1])<=0)result.set(key(p,q),i);
    }
    return result;
  };
  const left=bridges(a),right=bridges(b),pairs=new Set<string>();
  const neighbours=(ring:readonly Point2Mm[],i:number)=>[
    {edge:(i+ring.length-1)%ring.length,point:ring[i],outside:ring[(i+ring.length-1)%ring.length]},
    {edge:(i+1)%ring.length,point:ring[(i+1)%ring.length],outside:ring[(i+2)%ring.length]},
  ];
  for(const [key,i] of left){const j=right.get(key);if(j===undefined)continue;
    for(const x of neighbours(a,i))for(const y of neighbours(b,j)){
      if(equalPoint(x.point,y.point))continue;
      if((x.outside[0]-x.point[0])*(y.outside[0]-y.point[0])+(x.outside[1]-x.point[1])*(y.outside[1]-y.point[1])<=0
        && !contact(a[x.edge],a[(x.edge+1)%a.length],b[y.edge],b[(y.edge+1)%b.length],0))pairs.add(`${x.edge}:${y.edge}`);
    }
  }
  return pairs;
}
/** Before snapping/union: allow actual intersections/shared edges across objects,
 * but never let the snap grid bridge a tiny gap or erase a narrow overlap. */
export function assertNoNearObjectContact(a: readonly Point2Mm[], b: readonly Point2Mm[], budget: PolygonBudget): void {
  const sharedBridges=sharedShortBridgePairs(a,b);
  for (const [i,j] of segmentCandidates(a,b,budget)) {
    const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
    const x=cross(p,q,r),y=cross(p,q,s),z=cross(r,s,p),w=cross(r,s,q);
    if (x*y<0 && z*w<0) {
      // A strict crossing can create a tiny residual at either endpoint. Input
      // snapping must not erase it before output validation gets to see it.
      const denominator=(q[0]-p[0])*(s[1]-r[1])-(q[1]-p[1])*(s[0]-r[0]);
      const t=((r[0]-p[0])*(s[1]-r[1])-(r[1]-p[1])*(s[0]-r[0]))/denominator;
      const u=((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0]))/denominator;
      const endpointDistance=Math.min(t,1-t)*Math.hypot(q[0]-p[0],q[1]-p[1]);
      const otherDistance=Math.min(u,1-u)*Math.hypot(s[0]-r[0],s[1]-r[1]);
      if (!Number.isFinite(endpointDistance) || !Number.isFinite(otherDistance) || Math.min(endpointDistance,otherDistance)<=2*POLYGON_POLICY.snapMm) throw new PolygonFailure('A crossing is too close to a boundary endpoint for the precision grid.');
      continue;
    }
    const onSegment=(point: Point2Mm,a: Point2Mm,b: Point2Mm)=>cross(a,b,point)===0 && point[0]>=Math.min(a[0],b[0]) && point[0]<=Math.max(a[0],b[0]) && point[1]>=Math.min(a[1],b[1]) && point[1]<=Math.max(a[1],b[1]);
    if(onSegment(p,r,s) || onSegment(q,r,s) || onSegment(r,p,q) || onSegment(s,p,q)) continue;
    const distance=Math.min(segmentDistance(p,r,s),segmentDistance(q,r,s),segmentDistance(r,p,q),segmentDistance(s,p,q));
    if (distance<=2*POLYGON_POLICY.snapMm && !sharedBridges.has(`${i}:${j}`)) throw new PolygonFailure('Separate objects have ambiguous near-contact before snapping. Separate them clearly or union them in Inkscape.');
  }
}
export function assertSeparate(a: RingMm, b: RingMm, budget: PolygonBudget): void {
  for (const [i,j] of segmentCandidates(a,b,budget)) {
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
export function canonicalFootprint(input: FootprintMm, budget: PolygonBudget, snapCoordinates = true): FootprintMm {
  const output = input.map(p => ({ outer: canonicalRing(normalizeRing(p.outer,budget,snapCoordinates),true), holes: p.holes.map(h => canonicalRing(normalizeRing(h,budget,snapCoordinates),false)).sort((a,b) => compareKeys(ringKey(a),ringKey(b))) }));
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

/** Validate raw topology before rounding, then reject erased/reversed corners.
 * Turn preservation is a conservative guard, not a topology-equivalence proof;
 * canonicalFootprint also checks global relationships on both sides of the snap. */
export function guardedCanonicalFootprint(input: FootprintMm, budget: PolygonBudget, snapOutput = true): FootprintMm {
  const raw=canonicalFootprint(input,budget,false);
  for (const polygon of raw) for (const ring of [polygon.outer,...polygon.holes]) {
    const snapped=ring.map(p=>[snapCoordinate(p[0]),snapCoordinate(p[1])] as Point2Mm);
    for (let i=0;i<ring.length;i++) {
      budget.check();
      const j=(i+1)%ring.length,k=(i+2)%ring.length;
      if (equalPoint(snapped[i],snapped[j]) && !equalPoint(ring[i],ring[j])) throw new PolygonFailure('Precision grid would erase a nonzero Boolean edge.');
      if (Math.sign(cross(ring[i],ring[j],ring[k]))!==Math.sign(cross(snapped[i],snapped[j],snapped[k]))) throw new PolygonFailure('Precision grid would erase or reverse a Boolean corner.');
    }
  }
  const snapped=canonicalFootprint(raw,budget);
  return snapOutput ? snapped : raw;
}
