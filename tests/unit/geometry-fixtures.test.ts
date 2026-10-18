import './setup';
import { describe, expect, test } from 'vitest';
import { extractSvg } from '../../spikes/svg-import/extract.mjs';
import { buildCoin, writeStl } from '../../spikes/tiered-stl/mesh.mjs';
import type { TriangleMesh } from '../../app/src/core/contracts';
import { fromClosedRings, loadFixtures, measureFootprint, near, tolerance } from './helpers/fixtures';

const fixtures = (await loadFixtures()).filter(f => f.expected.importOutcome === 'accept');
// The bounded M0 mesh evidence intentionally covers six samples, not every SVG.
const meshSamples = new Set(['sun-medallion', 'monogram-o', 'twin-stars', 'letter-o-evenodd', 'edge-sharing', 'overlapping-shapes']);
describe('authored planar/stack and bounded mesh fixture oracles', () => {
  for (const fixture of fixtures) test(fixture.name, () => {
    const { expected } = fixture;
    const layers = extractSvg(fixture.svg).layers.map((layer, index) => ({ ...layer, thicknessMm: expected.layers[index].thicknessMm }));
    if (expected.geometryOutcome !== 'valid') {
      expect(() => buildCoin(layers)).toThrow(/Unsupported upper footprint/);
      return;
    }
    let z = 0, volume = 0;
    layers.forEach((layer, index) => {
      near(z, expected.layers[index].bottomZMm, tolerance.scalar);
      const area = measureFootprint(fromClosedRings(layer.footprintMm)).areaMm2;
      volume += area * layer.thicknessMm;
      z += layer.thicknessMm;
      near(z, expected.layers[index].topZMm, tolerance.scalar);
    });
    near(volume, expected.analyticalVolumeMm3!, expected.analyticalVolumeMm3! * tolerance.volumeRelative);
    near(z, expected.totalHeightMm!, tolerance.scalar);
    if (!meshSamples.has(fixture.name)) return;
    const actual = buildCoin(layers);
    near(actual.metrics.volumeMm3, expected.analyticalVolumeMm3!, expected.analyticalVolumeMm3! * tolerance.volumeRelative);
    near(actual.metrics.dimensionsMm[2], expected.totalHeightMm!, tolerance.scalar);
    expected.layers.forEach((layer, index) => {
      near(actual.tiers[index].bottomZMm, layer.bottomZMm, tolerance.scalar);
      near(actual.tiers[index].topZMm, layer.topZMm, tolerance.scalar);
    });
    for (let axis = 0; axis < 2; axis++) {
      const bounds = expected.layers[0].boundsMm;
      near(actual.metrics.dimensionsMm[axis], bounds[axis + 2] - bounds[axis], tolerance.dimensionMm);
    }
    expect(actual.metrics.components).toBe(1);
    expect(actual.metrics.edgeIncidence).toBe(2);
    // Retain the old fixture script's validation of actual float32 STL coordinates,
    // entirely in memory so tests never rewrite historical sample artifacts.
    const stl = writeStl(actual.mesh);
    expect(stl.length).toBe(84 + 50 * actual.mesh.faces.length);
    const mesh: TriangleMesh = { vertices: actual.mesh.vertices, triangles: actual.mesh.faces };
    expect(JSON.parse(JSON.stringify(mesh))).toEqual(mesh);
  });
});
