import type { Bounds2Mm } from './contracts';
import type { SvgCurve, SvgPoint } from './svgExtraction';

const tau = 2 * Math.PI;
const modulo = (angle: number) => ((angle % tau) + tau) % tau;
/** Same parameter traversal as SVGLoader/Three EllipseCurve, including full turns. */
export function ellipseSweep(curve: Extract<SvgCurve, { kind: 'ellipse' }>): number {
  const original = curve.endAngle - curve.startAngle;
  let delta = modulo(original);
  if (delta < Number.EPSILON) delta = Math.abs(original) < Number.EPSILON ? 0 : tau;
  if (curve.clockwise && delta !== 0) delta = delta === tau ? -tau : delta - tau;
  return delta;
}
/** Evaluate exact curves. t in [0,1]; ellipse axes include reflection/orientation. */
export function curvePoint(curve: SvgCurve, t: number): SvgPoint {
  const u = 1 - t;
  if (curve.kind === 'ellipse') {
    const angle = curve.startAngle + ellipseSweep(curve) * t, cos = Math.cos(angle), sin = Math.sin(angle);
    return [curve.center[0] + curve.axisX[0] * cos + curve.axisY[0] * sin, curve.center[1] + curve.axisX[1] * cos + curve.axisY[1] * sin];
  }
  const axis = (i: 0 | 1) => {
    if (curve.kind === 'line') return u * curve.from[i] + t * curve.to[i];
    if (curve.kind === 'quadratic') return u * u * curve.from[i] + 2 * u * t * curve.control[i] + t * t * curve.to[i];
    return u * u * u * curve.from[i] + 3 * u * u * t * curve.control1[i] + 3 * u * t * t * curve.control2[i] + t * t * t * curve.to[i];
  };
  return [axis(0), axis(1)];
}
function roots(a: number, b: number, c: number): number[] {
  if (![a, b, c].every(Number.isFinite)) throw new Error('Curve extrema overflow.');
  // Normalize coefficients before discriminant arithmetic to avoid overflow.
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  if (scale === 0) return [];
  a /= scale; b /= scale; c /= scale;
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}
/** Analytical extrema; does not flatten, repair, close or validate polygons. */
export function curveBounds(curve: SvgCurve): Bounds2Mm {
  const parameters = [0, 1];
  for (const axis of [0, 1] as const) {
    if (curve.kind === 'quadratic') {
      const denominator = curve.from[axis] - 2 * curve.control[axis] + curve.to[axis];
      if (!Number.isFinite(denominator)) throw new Error('Curve extrema overflow.');
      if (denominator !== 0) parameters.push((curve.from[axis] - curve.control[axis]) / denominator);
    } else if (curve.kind === 'cubic') {
      const p = curve.from[axis], q = curve.control1[axis], r = curve.control2[axis], s = curve.to[axis];
      parameters.push(...roots(-p + 3 * q - 3 * r + s, 2 * (p - 2 * q + r), q - p));
    } else if (curve.kind === 'ellipse') {
      const sweep = ellipseSweep(curve);
      if (sweep !== 0) for (const angle of [Math.atan2(curve.axisY[axis], curve.axisX[axis]), Math.atan2(curve.axisY[axis], curve.axisX[axis]) + Math.PI]) {
        const distance = sweep < 0 ? modulo(curve.startAngle - angle) : modulo(angle - curve.startAngle);
        const t = distance / Math.abs(sweep);
        if (t <= 1) parameters.push(t);
      }
    }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of parameters) if (t >= 0 && t <= 1) {
    const [x, y] = curvePoint(curve, t);
    if (![x, y].every(Number.isFinite)) throw new Error('Nonfinite curve bounds.');
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}
export function unionBounds(bounds: readonly Bounds2Mm[]): Bounds2Mm | null {
  if (!bounds.length) return null;
  let result = bounds[0];
  for (let i = 1; i < bounds.length; i++) {
    const b = bounds[i];
    result = [Math.min(result[0], b[0]), Math.min(result[1], b[1]), Math.max(result[2], b[2]), Math.max(result[3], b[3])];
  }
  return result;
}
