import { checked, numberList } from './svgAffine';
import type { Affine } from './svgAffine';

const length = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(mm|cm|in|pt|px|pc)?$/;
/** Absolute SVG lengths in local CSS user units, with 96 px/in. */
export function lengthUserUnits(text: string, allowPicas = true): number {
  const match = length.exec(text.trim());
  if (!match || (!allowPicas && match[2] === 'pc')) throw new Error('Use mm, cm, in, pt, px or unitless lengths.');
  const scale: Record<string, number> = { mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16, px: 1 };
  const value = Number(match[1]) * scale[match[2] ?? 'px'];
  if (!Number.isFinite(value)) throw new Error('Nonfinite length.');
  return value;
}
export interface SvgViewport {
  readonly physicalPageMm: readonly [number, number];
  readonly sizeOrigin: 'explicit' | 'inferred';
  readonly userToMm: Affine;
}
/** D-02: positive viewBox, default centered meet or none, page-relative Y up. */
export function resolveSvgViewport(attributes: { readonly width: string | null; readonly height: string | null; readonly viewBox: string | null; readonly preserveAspectRatio: string | null }): SvgViewport {
  const viewBox = numberList(attributes.viewBox ?? '');
  if (viewBox.length !== 4 || viewBox[2] <= 0 || viewBox[3] <= 0) throw new Error('A finite positive four-number viewBox is required.');
  const [x, y, width, height] = viewBox;
  const dimension = (value: string | null) => {
    if (value === null) return null;
    const mm = lengthUserUnits(value, false) * 25.4 / 96;
    if (!Number.isFinite(mm) || mm <= 0) throw new Error('Page dimensions must be finite and positive.');
    return mm;
  };
  const w = dimension(attributes.width), h = dimension(attributes.height);
  const sizeOrigin = w === null || h === null ? 'inferred' : 'explicit';
  const page: readonly [number, number] = sizeOrigin === 'inferred' ? [40, 40 * (height / width)] : [w!, h!];
  if (!page.every(value => Number.isFinite(value) && value > 0)) throw new Error('Nonfinite inferred page size.');
  const aspect = attributes.preserveAspectRatio?.trim().replace(/\s+/g, ' ') ?? 'xMidYMid meet';
  if (!['xMidYMid', 'xMidYMid meet', 'none'].includes(aspect)) throw new Error('Only xMidYMid meet (default) and none are supported; remove slice or other alignment modes.');
  let sx = page[0] / width, sy = page[1] / height;
  if (aspect !== 'none') sx = sy = Math.min(sx, sy);
  const tx = (page[0] - width * sx) / 2 - x * sx;
  const ty = (page[1] - height * sy) / 2 - y * sy;
  return { physicalPageMm: page, sizeOrigin, userToMm: checked([sx, 0, 0, -sy, tx, page[1] - ty]) };
}
