import './setup';
import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { Box3, Mesh } from 'three';
import type { TriangleMesh, ValidGeneratedCoin } from '../../app/src/core/contracts';
import { serialize3mf } from '../../app/src/core/serialize3mf';
import { generateCoin } from '../../app/src/core/generateCoin';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { validateMesh } from '../../app/src/core/validateMesh';
import { assertTierSurfaces } from '../../app/src/core/meshSurfaceSemantics';
import { MeshValidationBudget } from '../../app/src/core/meshConstructionPolicy';
import { loadFixtures } from './helpers/fixtures';

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
function generate(svg: string): ValidGeneratedCoin {
  const imported = importCoinSvg({importId:'3mf-test',fileName:'coin.svg',byteLength:svg.length,svgText:svg});
  if (imported.status !== 'imported') throw Error(JSON.stringify(imported));
  const settings = createDefaultCoinSettings(imported.coin);
  if (settings.status !== 'created') throw Error('settings');
  const result = generateCoin(imported.coin,settings.settings,polygonClippingKernel,earcutTriangulationKernel);
  if (result.status !== 'valid') throw Error(JSON.stringify(result));
  return result;
}
const fixtures = (await loadFixtures()).filter(f => f.expected.geometryOutcome === 'valid');
const snapshot = generate(fixtures.find(f => f.name === 'twin-stars')!.svg);
const parse = (bytes: Uint8Array) => new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');
function inspect(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  expect(Object.keys(entries)).toEqual(['[Content_Types].xml','_rels/.rels','3D/3dmodel.model']);
  for (const entry of Object.values(entries)) expect(parse(entry).querySelector('parsererror')).toBeNull();
  const types = parse(entries['[Content_Types].xml']), rels = parse(entries['_rels/.rels']), doc = parse(entries['3D/3dmodel.model']);
  expect(types.documentElement.namespaceURI).toBe('http://schemas.openxmlformats.org/package/2006/content-types');
  expect(types.querySelector('Default[Extension="model"]')!.getAttribute('ContentType')).toBe('application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
  expect(types.querySelector('Default[Extension="rels"]')!.getAttribute('ContentType')).toBe('application/vnd.openxmlformats-package.relationships+xml');
  expect(rels.documentElement.namespaceURI).toBe('http://schemas.openxmlformats.org/package/2006/relationships');
  const relationships = [...rels.querySelectorAll('Relationship')]; expect(relationships).toHaveLength(1);
  expect(relationships[0].getAttribute('Type')).toBe('http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel');
  expect(relationships[0].getAttribute('Target')).toBe('/3D/3dmodel.model');
  expect(doc.documentElement.namespaceURI).toBe('http://schemas.microsoft.com/3dmanufacturing/core/2015/02');
  expect(doc.documentElement.getAttribute('unit')).toBe('millimeter');
  const ids = [...doc.querySelector('resources')!.children].map(e => e.getAttribute('id'));
  expect(new Set(ids).size).toBe(ids.length); ids.forEach(id => expect(id).toMatch(/^[1-9]\d*$/));
  const items = [...doc.querySelectorAll('build > item')]; expect(items).toHaveLength(1);
  const assembly = doc.querySelector(`object[id="${items[0].getAttribute('objectid')}"]`)!;
  expect(assembly.querySelector('mesh')).toBeNull();
  const objects = [...doc.querySelectorAll('object')].filter(o => o.querySelector('mesh'));
  const components = [...assembly.querySelectorAll('component')];
  expect(components.map(e => e.getAttribute('objectid'))).toEqual(objects.map(e => e.getAttribute('id')));
  for (const e of [...components,...items]) expect(e.hasAttribute('transform')).toBe(false);
  const bases = [...doc.querySelectorAll('basematerials > base')]; expect(bases).toHaveLength(objects.length);
  objects.forEach((o,i) => {
    expect(o.getAttribute('pid')).toBe(doc.querySelector('basematerials')!.getAttribute('id'));
    expect(o.getAttribute('pindex')).toBe(String(i)); expect(bases[i].getAttribute('displaycolor')).toMatch(/^#[A-F0-9]{8}$/);
  });
  return {doc,objects,bases};
}
function meshFrom(object: Element): TriangleMesh {
  return {vertices:[...object.querySelectorAll('vertex')].map(e => ['x','y','z'].map(k => Number(e.getAttribute(k))) as unknown as TriangleMesh['vertices'][number]),
    triangles:[...object.querySelectorAll('triangle')].map(e => ['v1','v2','v3'].map(k => Number(e.getAttribute(k))) as unknown as TriangleMesh['triangles'][number])};
}

test.each(fixtures)('production $name preserves exact meshes, holes, shells, IDs and assembly', fixture => {
  const result = generate(fixture.svg), bytes = serialize3mf(result), {objects} = inspect(bytes);
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(serialize3mf(result)).toEqual(bytes);
  objects.forEach((object,i) => {
    const part = result.parts[i], mesh = meshFrom(object);
    expect(object.getAttribute('name')).toBe(part.name); expect(object.getAttribute('partnumber')).toBe(part.layerId);
    expect(mesh).toEqual(part.mesh);
    const checked = validateMesh(mesh,{expectedBoundsMm:part.metrics.boundsMm,expectedShellCount:part.metrics.shellCount,expectedVolumeMm3:part.metrics.volumeMm3});
    expect(checked.status).toBe('checked');
    assertTierSurfaces(mesh,[result.activeTiers[i]],'part',new MeshValidationBudget());
    // Measure actual emitted Z. Every part lies in a disjoint open interval;
    // only the intentional shared cap plane can meet an adjacent tier.
    const z = mesh.vertices.map(v => v[2]);
    expect(Math.min(...z)).toBe(i ? result.activeTiers[i - 1].topZMm : 0);
    expect(Math.max(...z)).toBe(result.activeTiers[i].topZMm);
    expect(Math.min(...z)).toBeLessThan(Math.max(...z));
  });
  if (fixture.name === 'twin-stars') expect(result.parts.some(p => p.metrics.shellCount === 2)).toBe(true);
  // Consumer round-trip is independent of the writer and our XML inspection.
  const scene = new ThreeMFLoader().parse(bytes.slice().buffer), bounds = new Box3().setFromObject(scene);
  expect(scene.children).toHaveLength(1);
  bounds.min.toArray().forEach((v,k) => expect(v).toBeCloseTo(result.metrics.boundsMm[0][k],5));
  bounds.max.toArray().forEach((v,k) => expect(v).toBeCloseTo(result.metrics.boundsMm[1][k],5));
  const names: string[] = []; scene.traverse(o => {
    if (!(o instanceof Mesh)) return;
    const i = names.length; names.push(o.name);
    const b = new Box3().setFromObject(o);
    expect(b.min.z).toBeCloseTo(result.activeTiers[i].bottomZMm,5);
    expect(b.max.z).toBeCloseTo(result.activeTiers[i].topZMm,5);
  });
  expect(names).toEqual(result.parts.map(p => p.name));
},30_000);

test('XML-safe names and layer IDs preserve Unicode and attribute whitespace; color intent uses current part metadata',() => {
  const result = structuredClone(snapshot) as Mutable<ValidGeneratedCoin>;
  result.parts.forEach((p,i) => {
    const name = `Tier ${i} & <“β”> "quoted" 'apostrophe'\t\n\r😀`;
    const id = `id ${i} & <"'>\t\n\rД`;
    p.name = result.activeTiers[i].name = name; p.layerId = result.activeTiers[i].layerId = id;
    p.color = result.activeTiers[i].color = '#aBcDeF';
  });
  const {objects,bases} = inspect(serialize3mf(result));
  objects.forEach((o,i) => {
    expect(o.getAttribute('name')).toBe(result.parts[i].name);
    expect(o.getAttribute('partnumber')).toBe(result.parts[i].layerId);
    expect(bases[i].getAttribute('displaycolor')).toBe('#ABCDEFFF');
  });
  const before = structuredClone(result);
  const scene = new ThreeMFLoader().parse(serialize3mf(result).slice().buffer);
  scene.traverse(o => { if (o instanceof Mesh && !Array.isArray(o.material) && 'color' in o.material)
    expect((o.material.color as {getHexString():string}).getHexString()).toBe('abcdef'); });
  expect(result).toEqual(before);
});

test('small exponent coordinates retain exact double values rather than float32 or decimal rounding',() => {
  const result = generate('<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="1mm" height="1mm" viewBox="0 0 1 1"><g id="base" inkscape:groupmode="layer" inkscape:label="Base"><rect width="1" height="1"/></g></svg>');
  const shifted = structuredClone(result) as Mutable<ValidGeneratedCoin>;
  for (const p of shifted.parts) {
    p.mesh.vertices.forEach(v => {v[0] += 1e-7;});
    p.metrics.boundsMm.forEach(v => {v[0] += 1e-7;});
  }
  shifted.activeTiers.forEach(t => t.footprintMm.forEach(p => [p.outer,...p.holes].forEach(r => r.forEach(v => {v[0] += 1e-7;}))));
  shifted.metrics.boundsMm.forEach(v => {v[0] += 1e-7;});
  const bytes = serialize3mf(shifted), {objects} = inspect(bytes);
  expect(new TextDecoder().decode(unzipSync(bytes)['3D/3dmodel.model'])).toContain('x="1e-7"');
  expect(meshFrom(objects[0])).toEqual(shifted.parts[0].mesh);
});

const corruptions: [string,(result: Mutable<ValidGeneratedCoin>) => void][] = [
  ['schema',r => {r.schemaVersion = 2 as 1;}],
  ['invalid status',r => {r.status = 'invalid' as 'valid';}],
  ['error diagnostic',r => {r.diagnostics.push({severity:'error'} as never);}],
  ['bad revision',r => {r.input.settingsRevision = NaN;}],
  ['missing part',r => {r.parts.pop();}],
  ['duplicate layer ID',r => {r.parts[1].layerId = r.activeTiers[1].layerId = r.parts[0].layerId;}],
  ['metadata mismatch',r => {r.parts[0].name += ' changed';}],
  ['invalid color',r => {r.parts[0].color = r.activeTiers[0].color = 'red';}],
  ['overlapping intervals',r => {r.activeTiers[1].bottomZMm = 0;}],
  ['nonfinite vertex',r => {r.parts[0].mesh.vertices[0][0] = Infinity;}],
  ['bad index',r => {r.parts[0].mesh.triangles[0][0] = -1;}],
  ['open part',r => {r.parts[0].mesh.triangles.pop();}],
  ['reversed winding',r => {r.parts[0].mesh.triangles[0].reverse();}],
  ['wrong metrics',r => {r.parts[0].metrics.volumeMm3 *= 2;}],
  ['wrong shell count',r => {r.parts[1].metrics.shellCount++;}],
  ['wrong bounds',r => {r.parts[0].metrics.boundsMm[0][0]++;}],
  ['nonfinite bounds',r => {r.parts[0].metrics.boundsMm[0][0] = NaN;}],
  ['duplicate triangle',r => {r.parts[0].mesh.triangles.push(r.parts[0].mesh.triangles[0]);}],
  ['aggregate mismatch',r => {r.metrics.volumeMm3 *= 2;}],
  ['dimensions mismatch',r => {r.dimensionsMm[0]++;}],
  ['analytical mismatch',r => {r.analyticalVolumeMm3 *= 2;}],
  ['plausible translated part',r => {
    const p = r.parts[1]; p.mesh.vertices.forEach(v => {v[0]++;});
    p.metrics.boundsMm.forEach(v => {v[0]++;});
  }],
];
test.each(corruptions)('rejects %s before returning package bytes',(_, corrupt) => {
  const result = structuredClone(snapshot) as Mutable<ValidGeneratedCoin>; corrupt(result);
  expect(() => serialize3mf(result)).toThrow();
});
test.each(['',' ','\u0000','\u0001','\uD800','\uDC00','\uFFFE','\uFFFF'])('rejects invalid XML characters %j in names AND layer IDs',bad => {
  for (const field of ['name','layerId'] as const) {
    const result = structuredClone(snapshot) as Mutable<ValidGeneratedCoin>;
    result.parts[0][field] = result.activeTiers[0][field] = bad;
    expect(() => serialize3mf(result)).toThrow();
  }
});

test('independent Python ZIP/CRC/XML reader checks production archives without fflate or ThreeMFLoader',() => {
  const packages = fixtures.map(f => Buffer.from(serialize3mf(generate(f.svg))).toString('base64'));
  const code = `import sys,json,io,zipfile,base64,xml.etree.ElementTree as ET
ns={'c':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
for encoded in json.load(sys.stdin):
 with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded))) as z:
  assert z.testzip() is None
  assert z.namelist()==['[Content_Types].xml','_rels/.rels','3D/3dmodel.model']
  assert all(i.compress_type==zipfile.ZIP_DEFLATED for i in z.infolist())
  for name in z.namelist(): ET.fromstring(z.read(name).decode('utf-8'))
  model=ET.fromstring(z.read('3D/3dmodel.model'))
  resources=model.find('c:resources',ns); ids=[e.attrib['id'] for e in resources]
  assert len(ids)==len(set(ids))
  items=model.findall('c:build/c:item',ns); assert len(items)==1
  assembly=next(e for e in resources if e.attrib['id']==items[0].attrib['objectid'])
  assert assembly.find('c:mesh',ns) is None
  meshes=[e for e in resources if e.find('c:mesh',ns) is not None]
  refs=assembly.findall('c:components/c:component',ns)
  assert [e.attrib['objectid'] for e in refs]==[e.attrib['id'] for e in meshes]
  assert all('transform' not in e.attrib for e in refs+items)
print('independent ZIP/CRC/XML passed: '+str(${fixtures.length}))`;
  const result = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['-c',code],{input:JSON.stringify(packages),encoding:'utf8'});
  expect(result.error).toBeUndefined(); expect(result.status,result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe(`independent ZIP/CRC/XML passed: ${fixtures.length}`);
},30_000);
