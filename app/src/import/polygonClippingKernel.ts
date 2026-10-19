import clipping from 'polygon-clipping';
import type { MultiPolygon, Pair, Ring } from 'polygon-clipping';
import type { FootprintMm, Point2Mm, RingMm } from '../core/contracts';
import type { PolygonKernel } from '../core/polygonKernel';
import { PolygonFailure, POLYGON_POLICY } from '../core/polygonGeometry';

function closed(footprint: FootprintMm): MultiPolygon {
  return footprint.map(p => [p.outer,...p.holes].map(r => [...r,r[0]].map(p => [p[0],p[1]] as Pair)));
}
/** Explicit closure and library calls belong only here, never in core DTOs. */
function run(operation: 'union' | 'difference' | 'intersection', footprints: readonly FootprintMm[]): FootprintMm {
  const inputCount = footprints.reduce((sum,f) => sum+f.reduce((n,p) => n+p.outer.length+p.holes.reduce((m,h)=>m+h.length,0),0),0);
  if (inputCount > POLYGON_POLICY.maxKernelInputVertices) throw new PolygonFailure('Boolean input vertex limit exceeded.',true);
  if (operation==='union' && footprints.every(f=>!f.length)) return [];
  if (operation!=='union' && !footprints[0].length) return [];
  if (operation==='intersection' && !footprints[1].length) return [];
  const inputs=footprints.map(closed);
  const result = operation==='union' ? clipping.union(inputs.flat()) :
    operation==='difference' ? (inputs[1].length ? clipping.difference(inputs[0],inputs[1]) : inputs[0]) :
    clipping.intersection(inputs[0],inputs[1]);
  let count=0;
  const ring = (points: Ring): RingMm => {
    if (points.length<4 || points[0][0]!==points[points.length-1][0] || points[0][1]!==points[points.length-1][1]) throw new PolygonFailure('Kernel returned an unclosed ring.');
    count+=points.length;
    if (points.length>POLYGON_POLICY.maxRingVertices+1 || count>POLYGON_POLICY.maxDocumentVertices) throw new PolygonFailure('Kernel output vertex limit exceeded.',true);
    return points.slice(0,-1).map(p=>[p[0],p[1]] as Point2Mm) as unknown as RingMm;
  };
  return result.map(p=>{
    if (!p.length) throw new PolygonFailure('Kernel returned an empty polygon.');
    return {outer:ring(p[0]),holes:p.slice(1).map(ring)};
  });
}
export const polygonClippingKernel: PolygonKernel = {
  union: footprints=>run('union',footprints),
  difference: (subject,clip)=>run('difference',[subject,clip]),
  intersection: (subject,clip)=>run('intersection',[subject,clip]),
};
