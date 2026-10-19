import './setup';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { svgLoaderAdapter } from '../../app/src/import/svgLoaderAdapter';
import { findInkscapeLayers } from '../../app/src/import/findInkscapeLayers';
import { loadFixtures } from './helpers/fixtures';

const ink = 'http://www.inkscape.org/namespaces/inkscape';
const wrap = (content: string, attributes = '') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="${ink}" ${attributes}>${content}</svg>`;
const rect = '<rect id="shape" width="10" height="10"/>';
const layer = (content = rect, attributes = 'id="base" i:label="Base"') => `<g i:groupmode="layer" ${attributes}>${content}</g>`;
function extracted(text: string) {
  const result = svgLoaderAdapter(text);
  expect(result.status, JSON.stringify(result)).toBe('extracted');
  if (result.status !== 'extracted') throw new Error(JSON.stringify(result));
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  return result;
}
function rejected(text: string, code: string) {
  const result = svgLoaderAdapter(text);
  expect(result.status, JSON.stringify(result)).toBe('rejected');
  expect(result.diagnostics.some(d => d.code === code && d.severity === 'error'), JSON.stringify(result)).toBe(true);
  expect('layers' in result).toBe(false);
}
afterEach(() => vi.restoreAllMocks());

describe('actual named Inkscape layers and stable source identity', () => {
  test('duplicate labels stay separate; ordinary nested groups and multiple objects retain ancestry and order', () => {
    const text = wrap('<title>Coin</title><g>' + layer(`<g id="ordinary">${rect}<g><circle id="second" cx="3" cy="3" r="1"/></g></g>`, 'id="a" i:label="Same"') + '</g>' + layer('<ellipse id="third" rx="2" ry="3"/>', 'id="b" i:label="Same"'));
    const result = extracted(text);
    expect(result.baseCandidateId).toBe('source:a');
    expect(result.layers.map(l => [l.id, l.name, l.sourceOrder, l.elementPath])).toEqual([
      ['source:a', 'Same', 0, [1, 0]], ['source:b', 'Same', 1, [2]],
    ]);
    expect(result.layers.map(l => l.shapes.map(s => [s.elementId, s.layerId, s.sourceOrder, s.elementPath]))).toEqual([
      [['shape', 'source:a', 0, [1, 0, 0, 0]], ['second', 'source:a', 1, [1, 0, 0, 1, 0]]], [['third', 'source:b', 2, [2, 0]]],
    ]);
    expect(svgLoaderAdapter(text)).toEqual(result);
  });
  test('structural identities cannot collide with source ID strings or duplicate labels', () => {
    const result = extracted(wrap(layer('<rect width="2" height="2"/>', 'i:label="A"') + layer('<rect id="path:0.0" width="2" height="2"/>', 'id="path:0" i:label="A"')));
    expect(result.layers.map(l => l.id)).toEqual(['path:0', 'source:path:0']);
    expect(result.layers.flatMap(l => l.shapes.map(s => s.id))).toEqual(['path:0.0', 'source:path:0.0']);
    expect(new Set(result.layers.flatMap(l => [l.id, ...l.shapes.map(s => s.id)])).size).toBe(4);
  });
  test.each([
    [wrap(rect), 'INKSCAPE_LAYERS_REQUIRED'],
    [wrap(layer(rect, 'id="base"')), 'INKSCAPE_LAYERS_REQUIRED'],
    [wrap(layer(rect, 'i:label="  "')), 'INKSCAPE_LAYERS_REQUIRED'],
    [wrap(layer(rect, 'label="Wrong namespace"')), 'INKSCAPE_LAYERS_REQUIRED'],
    [wrap('<g i:label="Ordinary">' + rect + '</g>'), 'INKSCAPE_LAYERS_REQUIRED'],
    [wrap(layer(rect + layer('<circle r="2"/>', 'id="inner" i:label="Nested"'))), 'NESTED_LAYER_UNSUPPORTED'],
    [wrap(layer(rect) + '<circle r="2"/>'), 'ARTWORK_OUTSIDE_LAYER'],
    [wrap(layer(rect) + '<metadata id="shape"/>'), 'LAYER_ID_DUPLICATE'],
    [wrap(layer(rect) + layer('<circle r="2"/>')), 'LAYER_ID_DUPLICATE'],
    [wrap(layer('<g display="none">' + rect + '</g>') + layer('<circle r="2"/>', 'i:label="Upper"')), 'BASE_EMPTY'],
  ])('fails descriptively: %s', (text, code) => rejected(text, code));
  test('unused definitions/metadata do not invent tiers; empty nonbase layers retain identity', () => {
    const result = extracted(wrap('<defs>' + layer(rect, 'i:label="Definition"') + '</defs><metadata>' + layer('', 'i:label="Metadata"') + '</metadata>' + layer(rect.replace('id="shape"', 'id="actual"')) + layer('', 'i:label="Empty upper"')));
    expect(result.layers.map(l => l.name)).toEqual(['Base', 'Empty upper']);
    expect(result.layers[1].shapes).toEqual([]);
  });
  test('namespace prefixes for SVG and Inkscape do not alter recognition', () => {
    const text = `<s:svg xmlns:s="http://www.w3.org/2000/svg" xmlns:ink="${ink}"><s:g ink:groupmode="layer" ink:label="名"><s:rect width="2" height="3"/></s:g></s:svg>`;
    expect(extracted(text).layers[0].name).toBe('名');
  });
  test('discovery returns plain metadata, including untrimmed Unicode display labels', () => {
    const result = findInkscapeLayers(new DOMParser().parseFromString(wrap(layer(rect, 'i:label="  コイン ☀  "')), 'image/svg+xml').documentElement);
    expect(result.status).toBe('found');
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    if (result.status === 'found') expect(result.layers[0].name).toBe('  コイン ☀  ');
  });
});

describe('pinned loader shape and style contract', () => {
  test('all eleven authored accepted fixtures preserve layer/source order and source-node mapping', async () => {
    for (const fixture of await loadFixtures()) if (fixture.expected.importOutcome === 'accept') {
      const result = extracted(fixture.svg);
      expect(result.layers.map(l => [l.elementId, l.name, l.sourceOrder]), fixture.name).toEqual(fixture.expected.layers.map(l => [l.id, l.name, l.order]));
      expect(result.layers.every(l => l.shapes.length > 0)).toBe(true);
      expect(result.layers.flatMap(l => l.shapes).every(s => s.elementPath.length > 0 && s.contours.length > 0)).toBe(true);
    }
  });
  test('shape arrays may be reordered by loader without changing owner, source IDs or output order', () => {
    const text = wrap(layer(rect + '<circle id="two" r="2"/>') + layer('<polygon id="three" points="0,0 1,0 0,1"/>', 'id="upper" i:label="Upper"'));
    const baseline = extracted(text), parse = SVGLoader.prototype.parse;
    vi.spyOn(SVGLoader.prototype, 'parse').mockImplementation(function (this: SVGLoader, text) { const data = parse.call(this, text); data.paths.reverse(); return data; });
    expect(extracted(text)).toEqual(baseline);
  });
  test('resolved inherited paint/importance/currentColor/initial/unset overrides loader-native CSS behavior', () => {
    const result = extracted(wrap(layer(`<g fill="red" fill-rule="evenodd" color="blue">
      <rect id="a" width="2" height="2" style="fill:currentColor"/>
      <rect id="b" width="2" height="2" style="fill:green!important;fill:red;fill-rule:initial"/>
      <rect id="c" width="2" height="2" style="fill:initial;fill-rule:unset"/>
      <rect id="d" width="2" height="2" fill="black" style="fill:inherit"/>
    </g>`)));
    expect(result.layers[0].shapes.map(s => [s.elementId, s.fill, s.fillRule])).toEqual([
      ['a', 'blue', 'evenodd'], ['b', 'green', 'nonzero'], ['c', 'black', 'evenodd'], ['d', 'red', 'evenodd'],
    ]);
  });
  test('eligible paths alone paint: restored visibility survives; suppressed, nonprinting, hidden unsupported and inert artwork stay absent', () => {
    const result = extracted(wrap(layer(`<g visibility="hidden"><rect id="hidden" width="2" height="2"/><g visibility="visible">${rect}</g></g>
      <g display="none"><rect width="2" height="2"/><text>hidden</text></g><g opacity="0"><circle r="2"/></g>
      <rect fill="none" width="2" height="2"/><rect fill-opacity="0" width="2" height="2"/>
      <rect id="no-stroke" width="2" height="2" stroke="red" stroke-width="0"/>
      <rect id="no-stroke-alpha" width="2" height="2" stroke="red" stroke-opacity="0"/>
      <metadata><circle r="9"/></metadata><defs><circle r="9"/></defs>`)));
    expect(result.layers[0].shapes.map(s => s.elementId)).toEqual(['shape', 'no-stroke', 'no-stroke-alpha']);
    expect(result.diagnostics.every(d => d.code === 'ARTWORK_IGNORED')).toBe(true);
  });
  test('preserves closed compound contours and exact line/quadratic/cubic/ellipse DTOs without canonicalization', () => {
    const result = extracted(wrap(layer('<path id="all" fill-rule="evenodd" d="M0 0L10 0Q12 2 10 4C9 5 8 6 7 5A2 3 0 01 4 2Z M1 1L2 1L1 2Z"/><rect x="2" y="3" width="8" height="5" rx="1"/><circle cx="5" cy="6" r="2"/><ellipse cx="5" cy="6" rx="3" ry="2"/><polygon points="0,0 2,0 0,2"/>')));
    expect(result.coordinateSpace).toBe('svg-user');
    expect(result.layers[0].shapes).toHaveLength(5);
    expect(result.layers[0].shapes[0].contours).toHaveLength(2);
    expect(new Set(result.layers[0].shapes[0].contours.flatMap(c => c.curves.map(c => c.kind)))).toEqual(new Set(['line', 'quadratic', 'cubic', 'ellipse']));
    expect('physicalPageMm' in result || 'footprintMm' in result).toBe(false);
  });
  test('SVG element transforms appear exactly once in curve data; root viewBox/mm conversion is deferred', () => {
    const result = extracted(wrap(layer('<g transform="translate(10 20)"><rect width="2" height="3"/></g>'), 'width="40mm" height="40mm" viewBox="5 6 40 40"'));
    expect(result.layers[0].shapes[0].contours[0].curves[0]).toEqual({ kind: 'line', from: [10, 20], to: [12, 20] });
  });
});

describe('fail-closed completeness and malformed shape data', () => {
  test.each([
    '<path d="M0 0L1 1 garbageZ"/>', '<path d="M0 0L1Z"/>', '<path d="M0 0L1 1, Z"/>', '<path d="M0 0A2 2 0 2 0 4 4Z"/>',
    '<path d="M0 0L1e999 2Z"/>', '<path d=""/>', '<path/>', '<rect width="2junk" height="2"/>', '<rect width="0" height="2"/>',
    '<circle r="-1"/>', '<ellipse rx="2"/>', '<polygon points="0,0 1,1 2"/>', '<polygon points="0,0 1,1 2,2 junk"/>',
  ])('rejects shape syntax the permissive loader might partially read: %s', shape => rejected(wrap(layer(shape)), 'SVG_SHAPE_INVALID'));
  test.each(['missing', 'duplicate', 'node', 'marker', 'owner', 'style', 'nonfinite', 'curve'])('detects a broken pinned loader contract: %s', mutation => {
    const parse = SVGLoader.prototype.parse;
    vi.spyOn(SVGLoader.prototype, 'parse').mockImplementation(function (this: SVGLoader, text) {
      const data = parse.call(this, text);
      const path = data.paths[0] as { userData: { node?: Element; style: { fill: string } }; subPaths: { curves: { v1: { x: number }; type: string }[] }[] };
      if (mutation === 'missing') data.paths = [];
      if (mutation === 'duplicate') data.paths.push(path);
      if (mutation === 'node') delete path.userData.node;
      if (mutation === 'marker') path.userData.node!.removeAttribute('data-coinprint-source-path');
      if (mutation === 'owner') data.xml.appendChild(path.userData.node!);
      if (mutation === 'style') path.userData.style.fill = 'red';
      if (mutation === 'nonfinite') path.subPaths[0].curves[0].v1.x = NaN;
      if (mutation === 'curve') path.subPaths[0].curves[0].type = 'UnknownCurve';
      return data;
    });
    rejected(wrap(layer()), ['nonfinite', 'curve'].includes(mutation) ? 'SVG_SHAPE_INVALID' : 'SVG_LOADER_MAPPING_INVALID');
  });
  test('preflight rejection never invokes SVGLoader or returns partial layers', () => {
    const parse = vi.spyOn(SVGLoader.prototype, 'parse');
    rejected(wrap(layer(rect) + '<g display="none"><script>throw 1</script></g>'), 'SCRIPT_UNSUPPORTED');
    expect(parse).not.toHaveBeenCalled();
  });
});
