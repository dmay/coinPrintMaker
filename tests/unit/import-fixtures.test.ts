import './setup';
import { describe, expect, test } from 'vitest';
import { extractSvg } from '../../spikes/svg-import/extract.mjs';
import { diagnosticCatalog } from '../../app/src/core/diagnostics';
import { expectedBoundsYUp, fromClosedRings, loadFixtures, measureFootprint, near, signedArea, tolerance } from './helpers/fixtures';

const fixtures = await loadFixtures();
describe('authored import fixture oracles (M0 adapter, canonical boundary)', () => {
  for (const fixture of fixtures) test(fixture.name, () => {
    const { expected, svg } = fixture;
    for (const code of expected.expectedDiagnostics) expect(code in diagnosticCatalog).toBe(true);
    if (expected.importOutcome === 'reject') {
      // M0 throws strings, not production diagnostics; do not fabricate code evidence.
      expect(() => extractSvg(svg)).toThrow();
      return;
    }
    const actual = extractSvg(svg);
    expect(actual).toEqual(extractSvg(svg));
    actual.physicalPageMm.forEach((value, axis) => near(value, expected.physicalPageMm[axis], tolerance.scalar));
    expect(actual.baseCandidateId).toBe(expected.layers[0].id);
    expect(actual.layers.map(l => [l.id, l.name, l.order])).toEqual(expected.layers.map(l => [l.id, l.name, l.order]));
    for (const [index, layer] of actual.layers.entries()) {
      const oracle = expected.layers[index], footprint = fromClosedRings(layer.footprintMm);
      const metrics = measureFootprint(footprint);
      near(metrics.areaMm2, oracle.areaMm2, Math.max(tolerance.areaAbsoluteMm2, oracle.areaMm2 * tolerance.areaRelative));
      metrics.boundsMm.forEach((value, axis) => near(value, expectedBoundsYUp(oracle.boundsMm, expected.physicalPageMm[1])[axis], tolerance.coordinateMm));
      expect(metrics.regions).toBe(oracle.regions);
      expect(metrics.holes).toBe(oracle.holes);
      expect(layer.sourceElementIds.length).toBeGreaterThan(0);
      for (const polygon of footprint) {
        expect(signedArea(polygon.outer)).toBeGreaterThan(0);
        polygon.holes.forEach(hole => expect(signedArea(hole)).toBeLessThan(0));
        for (const ring of [polygon.outer, ...polygon.holes]) expect(ring[0]).not.toEqual(ring.at(-1));
      }
      expect(JSON.parse(JSON.stringify(footprint))).toEqual(footprint);
    }
  });
});
