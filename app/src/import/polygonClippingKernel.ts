import clipping from 'polygon-clipping';
import type { MultiPolygon, Pair, Ring } from 'polygon-clipping';
import type { FootprintMm, Point2Mm, RingMm } from '../core/contracts';
import type { PolygonKernel } from '../core/polygonKernel';
import { PolygonFailure, POLYGON_POLICY } from '../core/polygonGeometry';

/** Explicit closure belongs only to this adapter, never to canonical DTOs. */
export const polygonClippingKernel: PolygonKernel = {
  union(footprints) {
    const inputCount = footprints.reduce((sum,f) => sum+f.reduce((n,p) => n+p.outer.length+p.holes.reduce((m,h)=>m+h.length,0),0),0);
    if (inputCount > POLYGON_POLICY.maxKernelInputVertices) throw new PolygonFailure('Layer Boolean input vertex limit exceeded.',true);
    const closed: MultiPolygon = footprints.flatMap(footprint => footprint.map(p => [p.outer,...p.holes].map(ring => [...ring,ring[0]].map(p => [p[0],p[1]] as Pair))));
    if (!closed.length) return [];
    const result = clipping.union(closed);
    let count = 0;
    const ring = (points: Ring): RingMm => {
      if (points.length < 4 || points[0][0] !== points[points.length-1][0] || points[0][1] !== points[points.length-1][1]) throw new PolygonFailure('Kernel returned an unclosed ring.');
      count += points.length;
      if (points.length > POLYGON_POLICY.maxRingVertices+1 || count > POLYGON_POLICY.maxDocumentVertices) throw new PolygonFailure('Kernel output vertex limit exceeded.',true);
      return points.slice(0,-1).map(p => [p[0],p[1]] as Point2Mm) as unknown as RingMm;
    };
    return result.map(p => { if (!p.length) throw new PolygonFailure('Kernel returned an empty polygon.'); return { outer:ring(p[0]),holes:p.slice(1).map(ring) }; }) as FootprintMm;
  },
};
