import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import './setup';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';

test('DIG-41: original Gumi Coin imports deterministically with its short closing edge intact', () => {
  const svgText=readFileSync(new URL('../../fixtures/regressions/gumi-coin.svg',import.meta.url),'utf8');
  const source={svgText,fileName:'Gumi coin.svg',byteLength:new TextEncoder().encode(svgText).length,importId:'gumi'};
  const result=importCoinSvg(source);
  expect(result.status,JSON.stringify(result.diagnostics)).toBe('imported');
  if(result.status!=='imported') return;
  expect(result.coin.layers).toHaveLength(1);
  const layer=result.coin.layers[0];
  expect(layer.id).toBe('source:g1');
  expect(layer.sourceElements.map(e=>e.elementId)).toEqual(['path8','path10','path9','path7','path4','path3']);
  expect(layer.footprintMm).toHaveLength(1);
  expect(layer.footprintMm[0].holes).toHaveLength(0);
  expect(layer.areaMm2).toBeGreaterThan(0);
  expect(result.diagnostics).toEqual([]);
  // Test the failing contour alone, so the base cannot hide a repair in union.
  const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
  for(const path of doc.querySelectorAll('path')) if(path.id!=='path10') path.remove();
  const isolatedText=new XMLSerializer().serializeToString(doc);
  const isolated=importCoinSvg({...source,svgText:isolatedText,byteLength:new TextEncoder().encode(isolatedText).length});
  expect(isolated.status,JSON.stringify(isolated.diagnostics)).toBe('imported');
  if(isolated.status==='imported') {
    expect(isolated.coin.layers[0].footprintMm).toHaveLength(1);
    expect(isolated.coin.layers[0].footprintMm[0].holes).toHaveLength(0);
    expect(isolated.coin.layers[0].footprintMm[0].outer).toHaveLength(222);
  }
  expect(importCoinSvg(source)).toEqual(result);
});
