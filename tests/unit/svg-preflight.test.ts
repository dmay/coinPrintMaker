import './setup';
import { describe, expect, test, vi } from 'vitest';
import { preflightSvg } from '../../app/src/import/preflightSvg';
import { readLocalSvg } from '../../app/src/import/readLocalSvg';
import { initialLocalImportState, localImportReducer } from '../../app/src/core/localImport';
import { loadFixtures } from './helpers/fixtures';

const wrap = (content: string, attributes = '') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attributes}>${content}</svg>`;
const rect = '<rect id="coin" width="10" height="10"/>';
function rejected(text: string, code: string) {
  const result = preflightSvg(text);
  expect(result.status).toBe('rejected');
  expect(result.diagnostics.some(d => d.code === code && d.severity === 'error'), JSON.stringify(result)).toBe(true);
  expect('artwork' in result).toBe(false);
  for (const diagnostic of result.diagnostics) expect(diagnostic.remediation.length).toBeGreaterThan(10);
  return result;
}
function accepted(text: string) {
  const result = preflightSvg(text);
  expect(result.status).toBe('accepted');
  if (result.status !== 'accepted') throw new Error(JSON.stringify(result.diagnostics));
  expect(result.diagnostics.every(d => d.severity === 'warning')).toBe(true);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  return result;
}

describe('global security boundary, including inert and hidden content', () => {
  test.each([
    ['<script>alert(1)</script>', 'SCRIPT_UNSUPPORTED'],
    ['<g ONLOAD="alert(1)"/>', 'SCRIPT_UNSUPPORTED'],
    ['<g xmlns:e="urn:evil" e:onload="alert(1)"/>', 'SCRIPT_UNSUPPORTED'],
    ['<image href="https://example.invalid/image.png"/>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<use xlink:href="#coin"/>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<a href="jav&#x61;script:alert(1)"/>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<image href="data:image/png;base64,AAAA"/>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<g xml:base="https://example.invalid/"/>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<foreignObject><img xmlns="http://www.w3.org/1999/xhtml" src="//example.invalid/x"/></foreignObject>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<style>@import "https://example.invalid/x.css";</style>', 'CSS_UNSUPPORTED'],
    ['<g style="fill:u\\72l(https://example.invalid/x)"/>', 'CSS_UNSUPPORTED'],
    ['<g style="\\66ill:url(#coin)"/>', 'CSS_UNSUPPORTED'],
    ['<g fill="u/**/rl(https://example.invalid/x)"/>', 'CSS_UNSUPPORTED'],
    ['<g style="fill:u/**/rl(https://example.invalid/x)"/>', 'CSS_UNSUPPORTED'],
    ['<g fill="&#117;rl(https://example.invalid/x)"/>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<g style="fill:URL(//example.invalid/x)"/>', 'EXTERNAL_REFERENCE_UNSUPPORTED'],
    ['<animate attributeName="fill" values="red;blue"/>', 'ANIMATION_UNSUPPORTED'],
    ['<set attributeName="display" to="inline"/>', 'ANIMATION_UNSUPPORTED'],
  ])('%s', (content, code) => {
    for (const context of [content, `<defs>${content}</defs>`, `<g display="none">${content}</g>`, `<metadata>${content}</metadata>`]) {
      rejected(wrap(context), code);
    }
  });
  test.each([
    '<!DOCTYPE svg SYSTEM "https://example.invalid/evil.dtd">',
    '<!DOCTYPE svg [<!ENTITY payload "EXPANDED">]>',
    '<!ENTITY payload SYSTEM "file:///private">',
    '<!-- <!DOCTYPE svg> -->',
  ])('blocks declarations before DOMParser: %s', declaration => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    rejected(declaration + wrap(rect), 'SOURCE_DOCTYPE_UNSUPPORTED');
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });
  test('blocks XML stylesheet processing and malformed/undefined entities', () => {
    rejected('<?xml-stylesheet href="https://example.invalid/a.css"?>' + wrap(rect), 'EXTERNAL_REFERENCE_UNSUPPORTED');
    rejected(wrap('<title>&custom;</title>'), 'MALFORMED_XML');
    rejected(wrap('<g>'), 'MALFORMED_XML');
    expect(accepted(wrap('<title>A &amp; B &#x2600;</title>' + rect)).artwork).toHaveLength(1);
  });
  test('metadata and unused defs are inert; descriptive URLs are not resource loads', () => {
    const result = accepted(wrap(`<title>https://example.invalid/url(x)</title><desc>&lt;script&gt;</desc>
      <metadata xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:RDF><rdf:Description rdf:about="https://example.invalid/about" rdf:resource="https://example.invalid/license">url(https://example.invalid)</rdf:Description></rdf:RDF></metadata>
      <sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"/>
      <defs><linearGradient id="paint"><stop offset="0" style="stop-color:red"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="1"/></filter><text>Unused live text</text><path d="M0 0L1 1"/><mask id="m"><rect width="2" height="2"/></mask></defs>${rect}`));
    expect(result.artwork).toEqual([{ elementId: 'coin', elementPath: [5], fill: 'black', fillRule: 'nonzero' }]);
    expect(result.diagnostics).toEqual([]);
  });
  test('never fetches, evaluates or returns a live DOM while reading a rejected file', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected request'));
    const result = await readLocalSvg(new File([wrap('<script>throw new Error("executed")</script><image href="https://example.invalid/a"/>')], 'bad.svg'));
    expect(result.status).toBe('rejected');
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    fetch.mockRestore();
  });
});

describe('material artwork diagnostics', () => {
  test.each([
    ['<text>Coin</text>', 'LIVE_TEXT_UNSUPPORTED'],
    ['<image/>', 'RASTER_IMAGE_UNSUPPORTED'],
    ['<foreignObject/>', 'SVG_UNSUPPORTED'],
    ['<use/>', 'SVG_UNSUPPORTED'],
    ['<svg/>', 'SVG_UNSUPPORTED'],
    ['<switch/>', 'SVG_UNSUPPORTED'],
    ['<line x2="10"/>', 'OPEN_PATH_UNSUPPORTED'],
    ['<polyline points="0,0 10,0 10,10"/>', 'OPEN_PATH_UNSUPPORTED'],
    ['<path fill="none" stroke="black" d="M0 0L1 1"/>', 'STROKE_ONLY_UNSUPPORTED'],
    ['<rect width="10" height="10" stroke="black"/>', 'STROKE_UNSUPPORTED'],
    ['<path d="M0 0L10 0L10 10"/>', 'OPEN_PATH_UNSUPPORTED'],
    ['<path d="M0 0L10 0Z M1 1L2 2"/>', 'OPEN_PATH_UNSUPPORTED'],
    ['<path d="M0 0L10 0 M1 1L2 2Z"/>', 'OPEN_PATH_UNSUPPORTED'],
    ['<rect fill="url(#gradient)"/>', 'GRADIENT_UNSUPPORTED'],
    ['<rect mask="url(#mask)"/>', 'MASK_UNSUPPORTED'],
    ['<rect clip-path="url(#clip)"/>', 'CLIP_PATH_UNSUPPORTED'],
    ['<rect filter="url(#filter)"/>', 'FILTER_UNSUPPORTED'],
    ['<rect fill="url(#pattern)"/>', 'PAINT_UNSUPPORTED'],
    ['<rect fill="rgba(0,0,0,.5)"/>', 'PAINT_UNSUPPORTED'],
    ['<rect fill="#0008"/>', 'PAINT_UNSUPPORTED'],
    ['<rect fill="var(--paint)"/>', 'PAINT_UNSUPPORTED'],
    ['<rect color="none" fill="currentColor"/>', 'PAINT_UNSUPPORTED'],
    ['<rect fill="not-a-color"/>', 'PAINT_UNSUPPORTED'],
    ['<rect opacity="0.5"/>', 'OPACITY_UNSUPPORTED'],
    ['<rect fill-opacity="50%"/>', 'OPACITY_UNSUPPORTED'],
    ['<g opacity=".5"><rect/></g>', 'OPACITY_UNSUPPORTED'],
    ['<rect style="mix-blend-mode:multiply"/>', 'CSS_UNSUPPORTED'],
    ['<rect style="transform:translate(1px)"/>', 'CSS_UNSUPPORTED'],
    ['<rect style="width:50px"/>', 'CSS_UNSUPPORTED'],
    ['<rect style="fill red"/>', 'CSS_UNSUPPORTED'],
    ['<rect style="constructor:ignored"/>', 'CSS_UNSUPPORTED'],
    ['<rect style="display:contents"/>', 'CSS_UNSUPPORTED'],
    ['<rect style="visibility:banana"/>', 'CSS_UNSUPPORTED'],
    ['<rect fill-rule="bad"/>', 'CSS_UNSUPPORTED'],
    ['<rect filter="blur(2px)"/>', 'FILTER_UNSUPPORTED'],
    ['<rect transform-origin="50% 50%"/>', 'CSS_UNSUPPORTED'],
    ['<g systemLanguage="ru"><rect/></g>', 'CSS_UNSUPPORTED'],
    ['<rect clip="rect(0,1,1,0)"/>', 'CSS_UNSUPPORTED'],
  ])('%s', (content, code) => {
    rejected(wrap(`<defs><linearGradient id="gradient"/><pattern id="pattern"/><mask id="mask"/><clipPath id="clip"/><filter id="filter"/></defs>${content}`), code);
  });
  test('ignores nonpainting shapes with warnings, while preserving error/warning distinction', () => {
    for (const content of ['<g display="none"><text>hidden</text></g>', '<g opacity="0"><image/></g>', '<rect fill="none"/>', '<rect visibility="hidden"/>', '<rect fill-opacity="0"/>', '<rect fill="transparent"/>']) {
      const result = accepted(wrap(content));
      expect(result.artwork).toEqual([]);
      expect(result.diagnostics.some(d => d.code === 'ARTWORK_IGNORED')).toBe(true);
    }
    const result = rejected(wrap('<rect visibility="hidden"/>' + '<text id="label">visible</text>'), 'LIVE_TEXT_UNSUPPORTED');
    expect(result.diagnostics.map(d => d.severity)).toEqual(['warning', 'error']);
    expect(result.diagnostics[1].location).toEqual({ scope: 'element', layerId: null, elementId: 'label', elementPath: [1] });
  });
  test('diagnostic cap retains rejection and a visible actionable error', () => {
    const result = rejected(wrap('<rect display="none"/>'.repeat(110) + '<script/>'), 'SCRIPT_UNSUPPORTED');
    expect(result.diagnostics).toHaveLength(101);
    expect(result.diagnostics.at(-1)?.code).toBe('PREFLIGHT_DIAGNOSTICS_TRUNCATED');
  });
});

describe('supported inline and inherited style/visibility semantics', () => {
  test('inline beats presentation attributes, local values beat inheritance; classes alone are inert', () => {
    const result = accepted(wrap(`<g fill="none" fill-rule="evenodd" color="blue"><g fill="#00ff00">
      <rect id="a" class="no-stylesheet" fill="red" style="fill: currentColor"/>
      <rect id="b" fill="red" style="fill: #fff;fill:#123456"/>
      <rect id="c" style="fill: inherit; fill-rule:initial"/>
      <rect id="d" style="fill:initial;fill-rule:unset"/>
      </g></g>`));
    expect(result.artwork.map(a => [a.elementId, a.fill, a.fillRule])).toEqual([
      ['a', 'blue', 'evenodd'], ['b', '#123456', 'evenodd'], ['c', '#00ff00', 'nonzero'], ['d', 'black', 'evenodd'],
    ]);
  });
  test('inline importance and repeated declarations preserve CSS precedence', () => {
    const result = accepted(wrap(`<rect id="a" display="none" style="display: none;display: inline !important;display:none"/>
      <rect id="b" style="fill:red!important;fill:blue;fill:green !important"/>
      <rect id="c" style="visibility:hidden!important;visibility:visible"/>`));
    expect(result.artwork.map(a => [a.elementId, a.fill])).toEqual([['a', 'black'], ['b', 'green']]);
  });
  test('visibility can be restored by descendants; display:none and zero group opacity cannot', () => {
    const result = accepted(wrap(`<g visibility="hidden"><rect id="hidden"/><g visibility="visible"><rect id="shown"/></g></g>
      <g display="none"><g display="inline" visibility="visible"><text>still hidden</text></g></g>
      <g opacity="0"><g opacity="1"><image/></g></g>`));
    expect(result.artwork.map(a => a.elementId)).toEqual(['shown']);
    expect(result.diagnostics).toHaveLength(3);
  });
  test('fill-opacity is inherited but can be overridden; invisible strokes do not alter fills', () => {
    const result = accepted(wrap(`<g fill-opacity="0"><rect id="off"/><rect id="on" fill-opacity="1"/></g>
      <rect id="zero-width" stroke="red" stroke-width="0"/>
      <rect id="zero-alpha" stroke="red" stroke-opacity="0"/>`));
    expect(result.artwork.map(a => a.elementId)).toEqual(['on', 'zero-width', 'zero-alpha']);
  });
  test('currentColor on the color property inherits the parent color', () => {
    expect(accepted(wrap('<g color="red"><rect color="currentColor" fill="currentColor"/></g>')).artwork[0].fill).toBe('red');
  });
  test('direct preflight applies source, depth, element and path limits before style/artwork work', () => {
    for (const text of [wrap(' '.repeat(2 * 1024 * 1024)), wrap('<g>'.repeat(64) + '</g>'.repeat(64)), wrap('<g/>'.repeat(10000)), wrap('<path d="' + ' '.repeat(500001) + '"/>')]) rejected(text, 'IMPORT_LIMIT_EXCEEDED');
  });
  test('explicitly closed compounds and exponent coordinates remain eligible', () => {
    expect(accepted(wrap('<path d="M1e-3 0L2 0L2 2Z m1 1l1 0l0 1z" fill="rgb(10, 20, 30)"/>')).artwork).toHaveLength(1);
  });
  test('all previously accepted authored inputs still pass preflight', async () => {
    for (const fixture of await loadFixtures()) if (fixture.expected.importOutcome === 'accept') {
      expect(preflightSvg(fixture.svg).status, fixture.name).toBe('accepted');
    }
  });
  test('rejected security/artwork replacement preserves previous source; accepted warnings survive the transaction', async () => {
    const first = await readLocalSvg(new File([wrap(rect)], 'first.svg'));
    let state = localImportReducer(initialLocalImportState, { type: 'start', requestId: 1, fileName: 'first.svg' });
    state = localImportReducer(state, { type: 'finish', requestId: 1, result: first });
    const source = state.source;
    for (const [index, content] of ['<script/>', '<text>Live</text>', '<path d="M0 0L1 1"/>'].entries()) {
      const requestId = index + 2;
      state = localImportReducer(state, { type: 'start', requestId, fileName: 'bad.svg' });
      state = localImportReducer(state, { type: 'finish', requestId, result: await readLocalSvg(new File([wrap(content)], 'bad.svg')) });
      expect(state.source).toBe(source);
      expect(state.diagnostics.some(d => d.severity === 'error')).toBe(true);
    }
    state = localImportReducer(state, { type: 'start', requestId: 5, fileName: 'warnings.svg' });
    state = localImportReducer(state, { type: 'finish', requestId: 5, result: await readLocalSvg(new File([wrap(rect + '<text display="none">hidden</text>')], 'warnings.svg')) });
    expect(state.source?.fileName).toBe('warnings.svg');
    expect(state.diagnostics.map(d => d.severity)).toEqual(['warning']);
  });
});
