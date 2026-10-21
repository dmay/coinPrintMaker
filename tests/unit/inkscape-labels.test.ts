// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { DiagnosticList } from '../../app/src/components/ImportStatus';

const svg = (body: string) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="http://www.inkscape.org/namespaces/inkscape" width="40mm" height="40mm" viewBox="0 0 40 40"><g id="layer1" i:groupmode="layer" i:label="Base">' + body + '</g></svg>';
function load(svgText: string) {
  return importCoinSvg({svgText, fileName:'labels.svg', byteLength:new TextEncoder().encode(svgText).length, importId:'labels'});
}
const display = (diagnostics: Parameters<typeof DiagnosticList>[0]['diagnostics']) => renderToStaticMarkup(createElement(DiagnosticList, {diagnostics}));

test('preflight reports labels using namespace URI, with ID and path fallbacks', () => {
  const result = load(svg('<path id="path1" i:label=" Coin &lt;script&gt; " d="M0 0 L10 0 L10 10"/><path id="path2" i:label=" " d="M0 0 L5 0"/><path d="M0 0 L4 0"/>'));
  expect(result.status).toBe('rejected');
  const errors = result.diagnostics.filter(d => d.code === 'OPEN_PATH_UNSUPPORTED');
  expect(errors).toHaveLength(3);
  expect(errors[0].location).toMatchObject({elementId:'path1',elementLabel:'Coin <script>',layerId:'source:layer1',layerName:'Base'});
  const html = display(errors);
  expect(html).toContain('(layer Base, ID: source:layer1), element Coin &lt;script&gt;');
  expect(html).toContain('element path2');
  expect(html).toContain('element 0.2');
  expect(html).not.toContain('element path1');
  expect(html).not.toContain('<script>');
});

test.each([
  ['shape extraction', '<rect id="path1" i:label="Coin" width="-1" height="10"/>', 'SVG_SHAPE_INVALID'],
  ['transform', '<g id="group1" i:label="Artwork" transform="scale(0)"><path d="M0 0H10V10H0Z"/></g>', 'SVG_TRANSFORM_UNSUPPORTED'],
  ['canonical polygons', '<path id="path1" i:label="Coin" d="M0 0L10 10L0 10L10 0Z"/>', 'POLYGON_INVALID'],
])('%s failures retain source display labels', (_, body, code) => {
  const result = load(svg(body));
  expect(result.status).toBe('rejected');
  const diagnostic = result.diagnostics.find(d => d.code === code)!;
  expect(diagnostic).toBeDefined();
  expect(diagnostic.location).toMatchObject({layerName:'Base',elementLabel:code === 'SVG_TRANSFORM_UNSUPPORTED' ? 'Artwork' : 'Coin'});
});

test.each(['gumi','teto'])('DIG-41/42 %s retains labels and stable source IDs', name => {
  const text = readFileSync(new URL('../../fixtures/regressions/' + name + (name === 'gumi' ? '-coin-dig41.svg' : '-coin-dig42.svg'),import.meta.url),'utf8');
  const result = load(text);
  expect(result.status,JSON.stringify(result.diagnostics)).toBe('imported');
  if (result.status !== 'imported') return;
  expect(result.coin.layers[0].id).toBe('source:g1');
  expect(result.coin.layers[0].sourceElements.find(e => e.elementId === 'path8')?.elementLabel).toBe('coin');
});

test('duplicate display labels do not become duplicate identities', () => {
  const result = load(svg('<path id="one" i:label="Coin" d="M0 0H10V10H0Z"/><path id="two" i:label="Coin" d="M2 2H8V8H2Z"/>'));
  expect(result.status).toBe('imported');
  if (result.status === 'imported') expect(result.coin.layers[0].sourceElements.map(e=>e.elementId)).toEqual(['one','two']);
});

test('geometry diagnostics resolve current layer names without changing locations', () => {
  const result = load(svg('<path id="one" i:label="Coin" d="M0 0H10V10H0Z"/>'));
  expect(result.status).toBe('imported');
  if (result.status !== 'imported') return;
  const diagnostic = {code:'MESH_INVALID',severity:'error',message:'Invalid mesh.',remediation:'Repair it.',
    location:{scope:'mesh',layerId:'source:layer1'}} as const;
  const html = renderToStaticMarkup(createElement(DiagnosticList, {diagnostics:[diagnostic],coin:result.coin}));
  expect(html).toContain('(layer Base, ID: source:layer1)');
  expect(html).toContain('ID: source:layer1');
  expect(diagnostic.location.layerId).toBe('source:layer1');
});
