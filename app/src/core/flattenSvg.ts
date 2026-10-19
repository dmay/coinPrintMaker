import type { Point2Mm } from './contracts';
import type { SvgCurve } from './svgExtraction';
import { curvePoint, ellipseSweep } from './svgCurveGeometry';
import { PolygonBudget, PolygonFailure, POLYGON_POLICY, segmentDistance } from './polygonGeometry';

/** Physical control-hull/second-derivative bounds; no renderer sampling. */
export function flattenCurves(curves: readonly SvgCurve[], budget: PolygonBudget): Point2Mm[] {
  const points: Point2Mm[] = [];
  const append = (p: Point2Mm) => {
    budget.vertex();
    if (points.length >= POLYGON_POLICY.maxRingVertices) throw new PolygonFailure('Flattened ring vertex limit exceeded.',true);
    if (!p.every(Number.isFinite)) throw new PolygonFailure('Nonfinite flattened coordinate.');
    points.push(p);
  };
  const midpoint = (a: Point2Mm,b: Point2Mm): Point2Mm => [(a[0]+b[0])/2,(a[1]+b[1])/2];
  for (const curve of curves) {
    const start = curvePoint(curve,0);
    if (!points.length) append(start);
    else if (Math.hypot(points[points.length-1][0]-start[0],points[points.length-1][1]-start[1]) > POLYGON_POLICY.snapMm) throw new PolygonFailure('Curve contour is discontinuous.');
    if (curve.kind === 'line') append(curve.to);
    else if (curve.kind === 'ellipse') {
      const bound = Math.hypot(...curve.axisX) + Math.hypot(...curve.axisY);
      const steps = Math.max(1,Math.ceil(Math.abs(ellipseSweep(curve))*Math.sqrt(bound/(8*POLYGON_POLICY.chordErrorMm))));
      if (!Number.isFinite(steps) || steps + points.length > POLYGON_POLICY.maxRingVertices) throw new PolygonFailure('Ellipse subdivision limit exceeded.',true);
      for (let i=1;i<=steps;i++) append(curvePoint(curve,i/steps));
    } else {
      const controls = curve.kind === 'quadratic' ? [curve.from,curve.control,curve.to] : [curve.from,curve.control1,curve.control2,curve.to];
      const stack = [{ controls, depth: 0 }];
      while (stack.length) {
        const { controls: row0, depth } = stack.pop()!;
        if (row0.every(p => segmentDistance(p,row0[0],row0[row0.length-1]) <= POLYGON_POLICY.chordErrorMm)) { append(row0[row0.length-1]); continue; }
        if (depth >= POLYGON_POLICY.maxSubdivisionDepth) throw new PolygonFailure('Bezier subdivision depth exceeded.',true);
        let row = row0;
        const left = [row[0]], right = [row[row.length-1]];
        while (row.length > 1) { row = row.slice(1).map((p,i) => midpoint(p,row[i])); left.push(row[0]); right.unshift(row[row.length-1]); }
        stack.push({controls:right,depth:depth+1},{controls:left,depth:depth+1});
      }
    }
  }
  return points;
}
