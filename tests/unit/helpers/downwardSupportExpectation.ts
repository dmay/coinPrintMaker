import type { Fixture } from './fixtures';

/** Current generation oracles for the two former unsupported M0 examples.
 * Retain original JSON for import measurements and historical spike tests. */
export function downwardSupportExpectation(fixture: Fixture): Fixture {
  if (!['outside-rim', 'over-lower-hole'].includes(fixture.name)) return fixture;
  const expected = structuredClone(fixture.expected);
  expected.geometryOutcome = 'valid';
  expected.expectedDiagnostics = [];
  if (fixture.name === 'outside-rim') {
    // Circle r=20 plus rectangle [34,18]-[42,22]. Integrate the circular
    // segment at y=center +/-2; the protrusion adds about 8.1335 mm2.
    expected.layers[0].areaMm2 = 400 * Math.PI + 88 - 2 * Math.sqrt(396) - 400 * Math.asin(.1);
    expected.layers[0].boundsMm = [0, 0, 42, 40];
  } else {
    expected.layers[1].areaMm2 = 676; // ring 640 + center 36
    expected.layers[1].regions = 2;
  }
  expected.analyticalVolumeMm3 = expected.layers.reduce((sum, layer) => sum + layer.areaMm2 * layer.thicknessMm, 0);
  return { ...fixture, expected };
}
