import './setup';
import { describe, expect, test, vi } from 'vitest';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { normalizeSvg } from '../../app/src/import/normalizeSvg';
import { svgLoaderAdapter } from '../../app/src/import/svgLoaderAdapter';
import { curveBounds, curvePoint } from '../../app/src/core/svgCurveGeometry';
import { parseTransform, transformPoint } from '../../app/src/core/svgAffine';
import type { SvgCurve } from '../../app/src/core/svgExtraction';
import { loadFixtures, expectedBoundsYUp } from './helpers/fixtures';

const ink = 'http://www.inkscape.org/namespaces/inkscape';
const layer = (content: string, id = 'base', attributes = '') => `<g i:groupmode="layer" i:label="${id}" id="${id}" ${attributes}>${content}</g>`;
const wrap = (content: string, attributes = 'width="40mm" height="40mm" viewBox="0 0 40 40"') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="${ink}" ${attributes}>${content}</svg>`;
const rect = '<rect width="10" height="10"/>';
function normalized(text: string) {
  const result = normalizeSvg(text);
  expect(result.status, JSON.stringify(result)).toBe('normalized');
  if (result.status !== 'normalized') throw new Error(JSON.stringify(result));
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  expect('source' in result || 'footprintMm' in result || 'meshes' in result).toBe(false);
  return result;
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-9) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, i) => expect(Math.abs(value - expected[i]), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(tolerance));
}
function rejected(text: string, code: string) {
  const result = normalizeSvg(text);
  expect(result.status, JSON.stringify(result)).toBe('rejected');
  expect(result.diagnostics.some(d => d.code === code && d.severity === 'error'), JSON.stringify(result)).toBe(true);
  expect('layers' in result || 'boundsMm' in result).toBe(false);
}

describe('physical viewport, origin and 96 DPI lengths', () => {
  test.each(['40mm', '4cm', `${40 / 25.4}in`, `${40 * 72 / 25.4}pt`, `${40 * 96 / 25.4}px`, `${40 * 96 / 25.4}`])('root %s agrees with physical mm geometry bounds', width => {
    const result = normalized(wrap(layer('<rect x="10" y="20" width="80" height="40"/>'), `width="${width}" height="20mm" viewBox="10 20 80 40"`));
    near(result.physicalPageMm, [40, 20]);
    near(result.boundsMm, [0, 0, 40, 20]);
    expect(result.sizeOrigin).toBe('explicit');
    expect(result.diagnostics).toEqual([]);
  });
  test.each(['', 'width="200mm"', 'height="100px"'])('missing either physical dimension uses complete 40mm fallback: %s', dimensions => {
    const text = wrap(layer('<rect x="-10" y="5" width="80" height="20"/>'), `${dimensions} viewBox="-10 5 80 20"`);
    const result = normalized(text);
    near(result.physicalPageMm, [40, 10]);
    near(result.boundsMm, [0, 0, 40, 10]);
    expect(result.sizeOrigin).toBe('inferred');
    expect(result.diagnostics.map(d => d.code)).toEqual(['SOURCE_SIZE_INFERRED']);
    expect(result.diagnostics[0].message).toContain('40 mm');
    expect(normalizeSvg(text)).toEqual(result);
  });
  test.each(['', 'preserveAspectRatio="xMidYMid"', 'preserveAspectRatio="xMidYMid meet"'])('default centered meet letterboxes a non-square page: %s', aspect => {
    const result = normalized(wrap(layer('<rect x="10" y="20" width="20" height="20"/>'), `width="60mm" height="20mm" viewBox="10 20 20 20" ${aspect}`));
    near(result.boundsMm, [20, 0, 40, 20]);
    near(result.physicalPageMm, [60, 20]);
  });
  test('none maps axes independently and origins once, without shifting artwork to its own bounds', () => {
    const result = normalized(wrap(layer('<rect x="12" y="23" width="5" height="4"/>'), 'width="60mm" height="20mm" viewBox="10 20 20 20" preserveAspectRatio="none"'));
    near(result.boundsMm, [6, 13, 21, 17]);
  });
  test.each(['25.4mm', '2.54cm', '1in', '72pt', '6pc', '96px', '96', '  25.4mm  '])('primitive length %s resolves before viewBox mapping', width => {
    const result = normalized(wrap(layer(`<rect width="${width}" height="48"/>`), 'width="25.4mm" height="25.4mm" viewBox="0 0 96 96"'));
    near(result.boundsMm, [0, 12.7, 25.4, 25.4]);
  });
  test('absolute primitive lengths are local CSS user units, then affected by transforms and viewport', () => {
    const result = normalized(wrap(layer('<g transform="translate(10 0) scale(2 1)"><rect x="1mm" y="2mm" width="1mm" height="2mm"/></g>')));
    const mmInUserUnits = 96 / 25.4;
    near(result.boundsMm, [10 + 2 * mmInUserUnits, 40 - 4 * mmInUserUnits, 10 + 4 * mmInUserUnits, 40 - 2 * mmInUserUnits]);
  });
  test('circle/ellipse centers and radii resolve physical units consistently', () => {
    const result = normalized(wrap(layer('<circle cx=".5in" cy="36pt" r="2mm"/><ellipse cx="48px" cy=".5in" rx="2mm" ry=".1cm"/>'), 'width="25.4mm" height="25.4mm" viewBox="0 0 96 96"'));
    near(result.layers[0].shapes[0].boundsMm, [10.7, 10.7, 14.7, 14.7]);
    near(result.layers[0].shapes[1].boundsMm, [10.7, 11.7, 14.7, 13.7]);
  });
});

describe('strict composition and one Y inversion', () => {
  test.each([
    ['translate(10 20) scale(2 3)', [12, 26]],
    ['scale(2 3) translate(10 20)', [22, 66]],
    ['rotate(90)', [-2, 1]], ['rotate(90 1 1)', [0, 1]],
    ['matrix(2 3 4 5 6 7)', [16, 20]],
    ['scale(-2 3)', [-2, 6]], ['skewX(45)', [3, 2]], ['skewY(45)', [1, 3]],
    ['translate(1e1,-2e1),scale(.5)', [10.5, -19]],
  ])('%s has independent point oracle', (transform, point) => near(transformPoint(parseTransform(transform), [1, 2]), point as number[]));
  test('parent/list/child order and page mapping are composed exactly once across layers', () => {
    const result = normalized(wrap('<g transform="translate(10 20)">' + layer('<g transform="rotate(90)"><rect x="1" y="2" width="2" height="3" transform="translate(4 0) scale(2 1)"/></g>', 'base', 'transform="scale(2 3)"') + layer('<rect x="1" y="1" width="1" height="1"/>', 'upper') + '</g>', 'width="80mm" height="40mm" viewBox="10 20 80 40"'));
    // local rect -> [6..10, 2..5] -> rotate [-5..-2,6..10]
    // -> parent scale [-10..-4,18..30] -> translate [0..6,38..50]
    // -> viewport offset and Y up [-10..-4,10..22].
    near(result.layers[0].boundsMm!, [-10, 10, -4, 22]);
    near(result.layers[1].boundsMm!, [1, 38, 2, 39]);
    expect(result.layers.map(l => l.id)).toEqual(['source:base', 'source:upper']);
  });
  test('empty nonbase identity, metadata and diagnostics survive, no origin recentring', () => {
    const result = normalized(wrap(layer('<rect id="tile" x="7" y="9" width="2" height="3"/><circle display="none" r="3"/>') + layer('', 'empty')));
    near(result.boundsMm, [7, 28, 9, 31]);
    expect(result.layers[1].boundsMm).toBeNull();
    expect(result.layers[0].shapes[0].elementId).toBe('tile');
    expect(result.layers[0].shapes[0].elementPath).toEqual([0, 0]);
    expect(result.diagnostics.map(d => d.code)).toEqual(['ARTWORK_IGNORED']);
  });
  test('detached loader projection never contains transforms or physical viewport attributes', () => {
    const parse = SVGLoader.prototype.parse;
    const spy = vi.spyOn(SVGLoader.prototype, 'parse').mockImplementation(function (this: SVGLoader, text) {
      expect(text).not.toMatch(/transform=|viewBox=|preserveAspectRatio=/);
      return parse.call(this, text);
    });
    try { normalized(wrap(layer(rect, 'base', 'transform="translate(1 2)"'))); expect(spy).toHaveBeenCalledOnce(); }
    finally { spy.mockRestore(); }
  });
});

describe('affine arcs and analytical curve bounds', () => {
  test.each(['scale(2 1)', 'scale(-2 1)', 'skewX(30)', 'skewY(-20) rotate(25) scale(2 3)', 'matrix(-1 2 3 4 5 6)'])('rotated partial arc parameters and traversal survive %s', transform => {
    const shape = '<path d="M10 5 A8 3 35 1 0 20 15 L10 5 Z"/>';
    const raw = svgLoaderAdapter(wrap(layer(shape)));
    expect(raw.status).toBe('extracted');
    if (raw.status !== 'extracted') throw new Error('rejected');
    const source = raw.layers[0].shapes[0].contours[0].curves.find(c => c.kind === 'ellipse')!;
    const result = normalized(wrap(layer(shape, 'base', `transform="${transform}"`)));
    const arc = result.layers[0].shapes[0].contours[0].curves.find(c => c.kind === 'ellipse')!;
    expect(arc.kind).toBe('ellipse');
    if (arc.kind !== 'ellipse' || source.kind !== 'ellipse') throw new Error('missing arc');
    expect([arc.startAngle, arc.endAngle, arc.clockwise]).toEqual([source.startAngle, source.endAngle, source.clockwise]);
    for (let i = 0; i <= 100; i++) {
      const input = curvePoint(source, i / 100), [x, y] = transformPoint(parseTransform(transform), input);
      near(curvePoint(arc, i / 100), [x, 40 - y]);
    }
    // Independent command endpoint oracles also verify path interpreter arcs.
    for (const [t, point] of [[0, [10, 5]], [1, [20, 15]]] as const) {
      const [x, y] = transformPoint(parseTransform(transform), point);
      near(curvePoint(arc, t), [x, 40 - y], 1e-7);
    }
  });
  test('full sheared reflected ellipse has analytical extrema and retains its start point', () => {
    const result = normalized(wrap(layer('<ellipse cx="10" cy="12" rx="4" ry="2" transform="matrix(-2 1 3 2 5 6)"/>')));
    // center=(21,40); axes=(-8,4),(6,4), then Y reflection.
    near(result.boundsMm, [11, -Math.sqrt(32), 31, Math.sqrt(32)]);
    const arc = result.layers[0].shapes[0].contours[0].curves[0];
    near(curvePoint(arc, 0), [13, -4]);
    near(curvePoint(arc, 1), [13, -4]);
  });
  test('partial arcs bound only the traversed section, including clockwise/wrapped intervals', () => {
    const arc: SvgCurve = { kind: 'ellipse', center: [2, 3], axisX: [4, 0], axisY: [0, 2], startAngle: 0, endAngle: Math.PI / 2, clockwise: false };
    near(curveBounds(arc), [2, 3, 6, 5]);
    near(curveBounds({ ...arc, clockwise: true }), [-2, 1, 6, 5]);
    near(curveBounds({ ...arc, startAngle: 3 * Math.PI / 2, endAngle: Math.PI / 2 }), [2, 1, 6, 5]);
  });
  test('quadratic and cubic bounds use interior extrema rather than control hulls', () => {
    const result = normalized(wrap(layer('<path d="M0 0 Q10 20 20 0 Z"/><path d="M0 0 C0 12 12 12 12 0 Z"/>')));
    near(result.layers[0].shapes[0].boundsMm, [0, 30, 20, 40]);
    near(result.layers[0].shapes[1].boundsMm, [0, 31, 12, 40]);
  });
  test('nonuniform root scaling of a rotated ellipse preserves all parametric points', () => {
    const result = normalized(wrap(layer('<ellipse cx="5" cy="6" rx="3" ry="2" transform="rotate(30 5 6)"/>'), 'width="80mm" height="20mm" viewBox="0 0 40 40" preserveAspectRatio="none"'));
    const arc = result.layers[0].shapes[0].contours[0].curves[0];
    for (let i = 0; i <= 40; i++) {
      const angle = i / 40 * 2 * Math.PI, x = 3 * Math.cos(angle), y = 2 * Math.sin(angle);
      near(curvePoint(arc, i / 40), [2 * (5 + Math.sqrt(3) / 2 * x - y / 2), 20 - .5 * (6 + x / 2 + Math.sqrt(3) / 2 * y)]);
    }
  });
  test('all authored accepted fixtures retain physical pages, per-layer analytic bounds and identities', async () => {
    for (const fixture of await loadFixtures()) if (fixture.expected.importOutcome === 'accept') {
      const result = normalized(fixture.svg);
      near(result.physicalPageMm, fixture.expected.physicalPageMm);
      expect(result.layers.map(l => [l.elementId, l.name, l.sourceOrder]), fixture.name).toEqual(fixture.expected.layers.map(l => [l.id, l.name, l.order]));
      fixture.expected.layers.forEach((layer, i) => near(result.layers[i].boundsMm!, expectedBoundsYUp(layer.boundsMm, result.physicalPageMm[1]), .011));
    }
  });
});

describe('unsupported and malformed mappings fail with actionable diagnostics', () => {
  test.each(['', 'viewBox="0 0 0 10"', 'viewBox="0 0 -2 10"', 'viewBox="0 0 10"', 'viewBox="0,,0 10 10"', 'viewBox="0 0 1e999 10"', 'viewBox="0 0 10 10 garbage"', 'viewBox="0 0 10 10,"'])('rejects invalid/missing viewBox: %s', attributes => rejected(wrap(layer(rect), attributes), 'PHYSICAL_SIZE_INVALID'));
  test.each(['0', '-1mm', '50%', '2em', 'NaN', 'Infinity', '1e999mm', '', '10MM', '10pc', 'auto', '40mm garbage'])('rejects invalid page dimension even when other axis missing: %s', width => rejected(wrap(layer(rect), `width="${width}" viewBox="0 0 40 40"`), 'PHYSICAL_SIZE_INVALID'));
  test.each(['xMinYMin meet', 'xMidYMid slice', 'defer xMidYMid meet', '', 'none meet', 'garbage'])('rejects unsupported aspect mapping: %s', aspect => rejected(wrap(layer(rect), `width="40mm" height="40mm" viewBox="0 0 40 40" preserveAspectRatio="${aspect}"`), 'PHYSICAL_SIZE_INVALID'));
  test.each(['translate(1 2 3)', 'rotate(1 2)', 'matrix(1 0 0 1 0)', 'scale()', 'unknown(2)', 'translate(1)junk', 'translate(1),', 'translate(1,,2)', 'scale(0)', 'matrix(1 2 2 4 0 0)', 'scale(1e999)', 'scale(1e308) scale(1e308)', 'skewX(90)', 'translate(1px)', 'rotate(30deg)'])('rejects malformed, singular or nonfinite transform: %s', transform => {
    const text = wrap(layer(rect, 'base', `transform="${transform}"`));
    rejected(text, 'SVG_TRANSFORM_UNSUPPORTED');
    const result = normalizeSvg(text);
    expect(result.diagnostics.at(-1)?.location).toEqual({ scope: 'element', layerId: 'source:base', layerName: 'base', elementLabel: 'base', elementId: 'base', elementPath: [0] });
    expect(result.diagnostics.at(-1)?.remediation.length).toBeGreaterThan(0);
  });
  test('root transforms fail explicitly instead of being applied in the wrong viewport order', () => rejected(wrap(layer(rect), 'width="40mm" height="40mm" viewBox="0 0 40 40" transform="translate(1 2)"'), 'SVG_TRANSFORM_UNSUPPORTED'));
  test.each(['50%', '2em', 'calc(2px)', '2MM'])('relative/unsupported primitive length fails: %s', width => rejected(wrap(layer(`<rect width="${width}" height="2"/>`)), 'SVG_SHAPE_INVALID'));
  test('active content is rejected before normalization and geometry never returns partially', () => rejected(wrap(layer(rect) + '<script>throw 1</script>'), 'SCRIPT_UNSUPPORTED'));
});
