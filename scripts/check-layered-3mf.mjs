import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {extractSvg} from '../spikes/svg-import/extract.mjs';
import {buildLayeredCoin, write3mf} from '../spikes/layered-3mf/export.mjs';

globalThis.DOMParser=new JSDOM('').window.DOMParser;
const root=new URL('../',import.meta.url), check=process.argv.includes('--check');
const palette=['#242424','#D4AF37','#F5F5F5']; // explicit spike configuration, not SVG paint extraction
const report={schemaVersion:1, coordinateConvention:'mm; XY face, +Z up; absolute part vertices',
  packaging:'3MF Core; one assembly build item; one named mesh per layer; base-material display colors',
  slicer:{status:'not run',version:null}, decisions:{D06:'pending joint STL/3MF validation',D07:'pending joint STL/3MF validation'},samples:[]};
async function retain(path,bytes) {
  if(check) assert.deepEqual(new Uint8Array(await readFile(new URL(path,root))),new Uint8Array(bytes),`Stale generated artifact: ${path}`);
  else await writeFile(new URL(path,root),bytes);
}
if(!check) await mkdir(new URL('spikes/layered-3mf/samples/',root),{recursive:true});
for(const name of ['sun-medallion','monogram-o','twin-stars','letter-o-evenodd','edge-sharing','overlapping-shapes','outside-rim','over-lower-hole']) {
  const oracle=JSON.parse(await readFile(new URL(`fixtures/expected/${name}.json`,root),'utf8'));
  const imported=extractSvg(await readFile(new URL(`fixtures/svg/${name}.svg`,root),'utf8'));
  const layers=imported.layers.map((l,i)=>({...l, thicknessMm:oracle.layers[i].thicknessMm, color:palette[i]}));
  if(oracle.geometryOutcome!=='valid') {
    assert.throws(()=>write3mf(layers,{name}),/Unsupported upper footprint/);
    report.samples.push({name,outcome:'rejected: unsupported upper footprint'});continue;
  }
  const result=buildLayeredCoin(layers), bytes=write3mf(layers,{name});
  assert.ok(Math.abs(result.unifiedMetrics.volumeMm3-oracle.analyticalVolumeMm3)<oracle.analyticalVolumeMm3*.003);
  await retain(`spikes/layered-3mf/samples/${name}.3mf`,bytes);
  report.samples.push({name,outcome:'automated checks passed; slicer pending',
    comparisonStl:`spikes/tiered-stl/samples/${name}.stl`,
    dimensionsMm:result.unifiedMetrics.dimensionsMm, volumeMm3:result.unifiedMetrics.volumeMm3,
    parts:result.parts.map((p,i)=>({objectId:i+2,name:p.name,displayColor:p.color,
      bottomZMm:p.bottomZMm,topZMm:p.topZMm,closedShells:p.shells.length,
      vertices:p.mesh.vertices.length,triangles:p.mesh.faces.length,
      volumeMm3:p.shells.reduce((s,m)=>s+m.volumeMm3,0)})),
    packageBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await retain('fixtures/layered-3mf-verification.json',new TextEncoder().encode(JSON.stringify(report,null,2)+'\n'));
console.log(`${check?'Checked retained':'Generated'} 6 layered 3MF packages; 2 invalid stacks rejected`);
