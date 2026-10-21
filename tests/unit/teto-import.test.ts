import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import './setup';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';

test('DIG-42: original Teto Coin imports deterministically without exhausting contour budget', () => {
  const svgText=readFileSync(new URL('../../fixtures/regressions/teto-coin-dig42.svg',import.meta.url),'utf8');
  const source={svgText,fileName:'Teto coin.svg',byteLength:new TextEncoder().encode(svgText).length,importId:'teto'};
  const result=importCoinSvg(source);
  expect(result.status,JSON.stringify(result.diagnostics)).toBe('imported');
  if(result.status!=='imported') return;
  expect(result.coin.layers).toHaveLength(1);
  const layer=result.coin.layers[0];
  expect(layer.id).toBe('source:g1');
  expect(layer.sourceElements.map(e=>e.elementId)).toEqual(['path8','path2','path6']);
  expect(layer.footprintMm).toHaveLength(1);
  expect(layer.footprintMm[0].holes).toHaveLength(0);
  expect(layer.areaMm2).toBeCloseTo(6979.470906,5);
  expect(importCoinSvg(source)).toEqual(result);
});
