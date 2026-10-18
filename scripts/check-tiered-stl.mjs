import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractSvg } from '../spikes/svg-import/extract.mjs';
import { buildCoin, writeStl } from '../spikes/tiered-stl/mesh.mjs';
globalThis.DOMParser=new JSDOM('').window.DOMParser;
const root=new URL('../',import.meta.url), report={schemaVersion:1,coordinateConvention:'mm; XY face, +Z up',slicer:{status:'not run',version:null},samples:[]};
await mkdir(new URL('spikes/tiered-stl/samples/',root),{recursive:true});
for(const name of ['sun-medallion','monogram-o','twin-stars','letter-o-evenodd','edge-sharing','overlapping-shapes','outside-rim','over-lower-hole']) {
  const oracle=JSON.parse(await readFile(new URL(`fixtures/expected/${name}.json`,root),'utf8'));
  const imported=extractSvg(await readFile(new URL(`fixtures/svg/${name}.svg`,root),'utf8'));
  const layers=imported.layers.map((l,i)=>({...l,thicknessMm:oracle.layers[i].thicknessMm}));
  if(oracle.geometryOutcome!=='valid'){assert.throws(()=>buildCoin(layers),/Unsupported upper/);report.samples.push({name,outcome:'rejected: unsupported upper footprint'});continue;}
  const result=buildCoin(layers),bytes=writeStl(result.mesh);
  assert.ok(Math.abs(result.metrics.volumeMm3-oracle.analyticalVolumeMm3)<oracle.analyticalVolumeMm3*.003);
  assert.ok(Math.abs(result.metrics.dimensionsMm[2]-oracle.totalHeightMm)<1e-10);
  for(let k=0;k<2;k++) assert.ok(Math.abs(result.metrics.dimensionsMm[k]-(oracle.layers[0].boundsMm[k+2]-oracle.layers[0].boundsMm[k]))<.022);
  await writeFile(new URL(`spikes/tiered-stl/samples/${name}.stl`,root),bytes);
  report.samples.push({name,outcome:'validated',tiers:result.tiers.map(({name,bottomZMm,topZMm})=>({name,bottomZMm,topZMm})),...result.metrics,analyticalCurveVolumeMm3:oracle.analyticalVolumeMm3,stlBytes:bytes.length});
}
await writeFile(new URL('fixtures/tiered-stl-verification.json',root),JSON.stringify(report,null,2)+'\n');
console.log(`Verified ${report.samples.length} tiered STL cases`);
