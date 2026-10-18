import { readFile, readdir } from 'node:fs/promises';
import { expect } from 'vitest';
import type { Bounds2Mm, FootprintMm, Point2Mm, PolygonMm, RingMm } from '../../../app/src/core/contracts';

export const tolerance = {
  coordinateMm: 0.011,
  dimensionMm: 0.022, // Both min and max can carry the coordinate approximation.
  scalar: 1e-9,
  areaAbsoluteMm2: 0.15,
  areaRelative: 0.003,
  volumeRelative: 0.003,
} as const;
export interface ExpectedLayer {
  id: string;
  name: string;
  order: number;
  boundsMm: Bounds2Mm; // Authored oracle is Y-down.
  areaMm2: number;
  regions: number;
  holes: number;
  thicknessMm: number;
  bottomZMm: number;
  topZMm: number;
}
export interface Fixture {
  name: string;
  svg: string;
  expected: {
    source: string;
    physicalPageMm: [number, number];
    layers: ExpectedLayer[];
    importOutcome: 'accept' | 'reject';
    geometryOutcome: 'valid' | 'unsupported' | 'blocked';
    analyticalVolumeMm3: number | null;
    totalHeightMm: number | null;
    expectedDiagnostics: string[];
  };
}
const root = new URL('../../../', import.meta.url);
export async function loadFixtures(): Promise<Fixture[]> {
  const files = (await readdir(new URL('fixtures/expected/', root))).filter(name => name.endsWith('.json')).sort();
  return Promise.all(files.map(async file => {
    const expected: Fixture['expected'] = JSON.parse(await readFile(new URL('fixtures/expected/' + file, root), 'utf8'));
    return { name: file.slice(0, -5), expected, svg: await readFile(new URL(expected.source, root), 'utf8') };
  }));
}
export function near(actual: number, expected: number, absolute: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected), `expected ${actual} ≈ ${expected} within ${absolute}`).toBeLessThanOrEqual(absolute);
}
export function expectedBoundsYUp(bounds: Bounds2Mm, pageHeightMm: number): Bounds2Mm {
  return [bounds[0], pageHeightMm - bounds[3], bounds[2], pageHeightMm - bounds[1]];
}
export function signedArea(ring: readonly Point2Mm[]): number {
  return ring.reduce((sum, p, index) => {
    const q = ring[(index + 1) % ring.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
}
// Test boundary only: adapt the M0 kernel's closed rings to the new DTO contract.
// This is not the production normalizer (DIG-16), and does not repair geometry.
export function fromClosedRings(input: number[][][][]): FootprintMm {
  const ring = (closed: number[][], ccw: boolean): RingMm => {
    expect(closed.length).toBeGreaterThanOrEqual(4);
    expect(closed[0]).toEqual(closed.at(-1));
    const open = closed.slice(0, -1).map(p => {
      expect(p).toHaveLength(2);
      expect(p.every(Number.isFinite)).toBe(true);
      return [p[0], p[1]] as Point2Mm;
    });
    expect(open.length).toBeGreaterThanOrEqual(3);
    expect(signedArea(open)).not.toBe(0);
    return ((signedArea(open) > 0) === ccw ? open : [...open].reverse()) as unknown as RingMm;
  };
  return input.map(polygon => ({ outer: ring(polygon[0], true), holes: polygon.slice(1).map(hole => ring(hole, false)) }));
}
export function measureFootprint(footprint: FootprintMm): { areaMm2: number; boundsMm: Bounds2Mm; regions: number; holes: number } {
  const points = footprint.flatMap(polygon => [polygon.outer, ...polygon.holes]).flat();
  return {
    areaMm2: footprint.reduce((sum, polygon: PolygonMm) => sum + signedArea(polygon.outer) + polygon.holes.reduce((s, hole) => s + signedArea(hole), 0), 0),
    boundsMm: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))],
    regions: footprint.length,
    holes: footprint.reduce((sum, p) => sum + p.holes.length, 0),
  };
}
