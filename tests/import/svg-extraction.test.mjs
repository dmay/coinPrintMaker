import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { extractSvg } from '../../spikes/svg-import/extract.mjs';
globalThis.DOMParser = new JSDOM('').window.DOMParser;
const wrap = (body,attrs='width="40mm" height="20mm"') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="http://www.inkscape.org/namespaces/inkscape" viewBox="10 20 40 20" ${attrs}>${body}</svg>`;
const layer = (body,name='Base') => `<g i:groupmode="layer" i:label="${name}">${body}</g>`;
const rect = '<rect x="10" y="20" width="40" height="20"/>';
test('fixture analytical oracles and deterministic report', async()=>{ await import('../../scripts/check-svg-extraction.mjs'); });
test('missing source size uses 40mm width and aspect ratio with warning',()=>{
  const r=extractSvg(wrap(layer(rect),''));
  assert.deepEqual(r.physicalPageMm,[40,20]); assert.equal(r.warnings.length,1);
  assert.deepEqual(r.layers[0].boundsMm,[0,0,40,20]);
});
test('physical unit conversion agrees across supported root units',()=>{
  for (const [unit,value] of [['mm',40],['cm',4],['in',40/25.4],['pt',40*72/25.4],['px',40*96/25.4],['',40*96/25.4]]) {
    const r=extractSvg(wrap(layer(rect),`width="${value}${unit}" height="${value/2}${unit}"`));
    assert.ok(Math.abs(r.layers[0].boundsMm[2]-40)<1e-10);
  }
});
test('default centered meet and explicit none have distinct viewport mappings',()=>{
  const a=extractSvg(wrap(layer(rect),'width="40mm" height="40mm"'));
  const b=extractSvg(wrap(layer(rect),'width="40mm" height="40mm" preserveAspectRatio="none"'));
  assert.deepEqual(a.layers[0].boundsMm,[0,10,40,30]);
  assert.deepEqual(b.layers[0].boundsMm,[0,0,40,40]);
});
test('no IDs and duplicate labels retain structural layer ownership',()=>{
  const r=extractSvg(wrap(layer(rect,'Same')+layer('<rect x="20" y="25" width="5" height="5"/>','Same')));
  assert.deepEqual(r.layers.map(x=>x.id),['layer-0','layer-1']);
  assert.deepEqual(r.layers.map(x=>x.areaMm2),[800,25]);
});
test('inherited fill-rule preserves same-winding hole',async()=>{
  let xml=await readFile(new URL('../../fixtures/svg/letter-o-evenodd.svg',import.meta.url),'utf8');
  xml=xml.replace('fill-rule="evenodd"','').replace('inkscape:label="Letter O"','inkscape:label="Letter O" style="fill-rule:evenodd"');
  assert.equal(extractSvg(xml).layers[1].holes,1);
});
test('preflight rejects unsupported ambiguity and unsafe features',()=>{
  for (const xml of [wrap(rect),wrap(layer(layer(rect))),wrap(layer(rect),'width="50%"'),wrap(layer(rect),'preserveAspectRatio="xMinYMin slice"'),wrap(layer(rect.replace('/>',' style="filter:blur(2px)"/>'))),wrap(layer(rect.replace('/>',' onclick="alert(1)"/>'))), '<!DOCTYPE svg>'+wrap(layer(rect)),wrap(layer('<path d="M0 0 L2 2 M3 3 L4 4 Z"/>'))]) assert.throws(()=>extractSvg(xml));
});
