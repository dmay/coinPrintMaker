import type { SvgCurve, SvgPoint } from './svgExtraction';

/** SVG [a b c d e f], mapping column vectors; multiply(parent, child). */
export type Affine = readonly [number, number, number, number, number, number];
export const identity: Affine = [1, 0, 0, 1, 0, 0];
export function checked(matrix: Affine): Affine {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (!matrix.every(Number.isFinite) || !Number.isFinite(determinant) || determinant === 0) throw new Error('Nonfinite or singular transform.');
  return matrix;
}
export function multiply(p: Affine, q: Affine): Affine {
  return checked([
    p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
  ]);
}
const numeric = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
const list = new RegExp(`^\\s*${numeric}(?:(?:\\s*,\\s*|\\s+)${numeric})*\\s*$`);
export function numberList(text: string): number[] {
  if (!list.test(text)) throw new Error('Expected a complete finite SVG number list.');
  const values = text.trim().split(/[\s,]+/).map(Number);
  if (!values.every(Number.isFinite)) throw new Error('Nonfinite SVG number.');
  return values;
}
export function parseTransform(text: string | null): Affine {
  if (text === null || !text.trim()) return identity;
  let cursor = 0, result = identity;
  while (cursor < text.length) {
    const match = /^\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/.exec(text.slice(cursor));
    if (!match) throw new Error('Unsupported or malformed SVG transform.');
    const values = numberList(match[2]), [a, b, c] = values;
    let next: Affine;
    switch (match[1]) {
      case 'matrix':
        if (values.length !== 6) throw new Error('matrix requires six numbers.');
        next = [values[0], values[1], values[2], values[3], values[4], values[5]]; break;
      case 'translate':
        if (values.length < 1 || values.length > 2) throw new Error('translate requires one or two numbers.');
        next = [1, 0, 0, 1, a, b ?? 0]; break;
      case 'scale':
        if (values.length < 1 || values.length > 2) throw new Error('scale requires one or two numbers.');
        next = [a, 0, 0, b ?? a, 0, 0]; break;
      case 'rotate': {
        if (![1, 3].includes(values.length)) throw new Error('rotate requires one or three numbers.');
        const angle = a * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle), x = b ?? 0, y = c ?? 0;
        next = [cos, sin, -sin, cos, x - cos * x + sin * y, y - sin * x - cos * y]; break;
      }
      default: {
        if (values.length !== 1 || Math.abs(a % 180) === 90) throw new Error('Skew requires one finite, nonsingular angle.');
        const tangent = Math.tan(a * Math.PI / 180);
        next = match[1] === 'skewX' ? [1, 0, tangent, 1, 0, 0] : [1, tangent, 0, 1, 0, 0];
      }
    }
    result = multiply(result, checked(next));
    cursor += match[0].length;
    const separator = /^\s*,?\s*/.exec(text.slice(cursor))![0];
    cursor += separator.length;
    if (separator.includes(',') && cursor === text.length) throw new Error('Trailing transform separator.');
  }
  return result;
}
export function transformPoint(m: Affine, p: SvgPoint, vector = false): SvgPoint {
  const result: SvgPoint = [m[0] * p[0] + m[2] * p[1] + (vector ? 0 : m[4]), m[1] * p[0] + m[3] * p[1] + (vector ? 0 : m[5])];
  if (!result.every(Number.isFinite)) throw new Error('Nonfinite transformed coordinate.');
  return result;
}
export function transformCurve(m: Affine, curve: SvgCurve): SvgCurve {
  const point = (p: SvgPoint) => transformPoint(m, p);
  switch (curve.kind) {
    case 'line': return { ...curve, from: point(curve.from), to: point(curve.to) };
    case 'quadratic': return { ...curve, from: point(curve.from), control: point(curve.control), to: point(curve.to) };
    case 'cubic': return { ...curve, from: point(curve.from), control1: point(curve.control1), control2: point(curve.control2), to: point(curve.to) };
    // p(theta) = center + axisX*cos(theta) + axisY*sin(theta). Reflection
    // lives in the axes, so angles/direction MUST NOT be inverted again.
    case 'ellipse': return { ...curve, center: point(curve.center), axisX: transformPoint(m, curve.axisX, true), axisY: transformPoint(m, curve.axisY, true) };
  }
}
