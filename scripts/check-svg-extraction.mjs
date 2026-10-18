import { JSDOM } from 'jsdom';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { extractSvg } from '../spikes/svg-import/extract.mjs';
globalThis.DOMParser = new JSDOM('').window.DOMParser;
const root = new URL('../', import.meta.url);
const results=[];
for (const file of (await readdir(new URL('fixtures/expected/',root))).sort()) {
  const expected=JSON.parse(await readFile(new URL(`fixtures/expected/${file}`,root),'utf8'));
  const xml=await readFile(new URL(expected.source,root),'utf8');
  if (expected.importOutcome==='reject') {
    assert.throws(()=>extractSvg(xml), undefined, file);
    results.push({source:expected.source,outcome:'rejected'}); continue;
  }
  const actual=extractSvg(xml);
  assert.deepEqual(actual,extractSvg(xml),'Deterministic extraction');
  assert.deepEqual(actual.layers.map(x=>[x.id,x.name,x.order]),expected.layers.map(x=>[x.id,x.name,x.order]));
  actual.physicalPageMm.forEach((x,i)=>assert.ok(Math.abs(x-expected.physicalPageMm[i])<1e-9));
  const measurements=actual.layers.map((x,i)=>{
    const e=expected.layers[i];
    // Canonical Y-up bounds, fixture oracle is page-relative Y-down.
    const b=[e.boundsMm[0],40-e.boundsMm[3],e.boundsMm[2],40-e.boundsMm[1]];
    x.boundsMm.forEach((v,j)=>assert.ok(Math.abs(v-b[j])<=.011,`${file}: ${x.name} bounds ${x.boundsMm} expected ${b}`));
    assert.equal(x.regions,e.regions,`${file}: regions`); assert.equal(x.holes,e.holes,`${file}: holes`);
    assert.ok(Math.abs(x.areaMm2-e.areaMm2)<=Math.max(.15,e.areaMm2*.003),`${file}: area ${x.areaMm2} expected ${e.areaMm2}`);
    assert.ok(x.sourceElementIds.length);
    const {footprintMm,...metrics}=x; return metrics;
  });
  results.push({source:expected.source,outcome:'accepted',physicalPageMm:actual.physicalPageMm,baseCandidateId:actual.baseCandidateId,layers:measurements});
}
await writeFile(new URL('fixtures/svg-extraction-verification.json',root),JSON.stringify({schemaVersion:1,three:'0.186.1',polygonClipping:'0.15.7',domHarness:'jsdom 26.1.0',toleranceMm:.01,coordinateConvention:'page-relative mm, +Y up',results},null,2)+'\n');
console.log(`${results.length} fixture extraction checks passed`);
