import { describe, expect, test } from 'vitest';
import type { BaseLayerSettings, CoinSettings, GeneratedCoin, ImportedCoin, InvalidGeneratedCoin, TriangleMesh, ValidGeneratedCoin } from '../../app/src/core/contracts';
import { createDiagnostic, diagnosticCatalog } from '../../app/src/core/diagnostics';
import { isCurrentValidGeneration } from '../../app/src/core/generation';

const imported: ImportedCoin = {
  schemaVersion: 1,
  source: { importId: 'import-1', fileName: 'example.svg', byteLength: 12, svgText: '<svg></svg>\n' },
  physicalPageMm: [40, 20], sizeOrigin: 'explicit', baseLayerId: 'base',
  layers: [{
    id: 'base', name: 'Base', sourceOrder: 0,
    sourceElements: [{ elementId: 'outline', elementPath: [0, 0] }],
    footprintMm: [{ outer: [[0, 0], [40, 0], [0, 20]], holes: [] }],
    boundsMm: [0, 0, 40, 20], areaMm2: 400,
  }],
  diagnostics: [],
};
const settings: CoinSettings = {
  importId: imported.source.importId, revision: 0,
  layers: [{ layerId: 'base', role: 'base', enabled: true, color: '#000000', thicknessMm: 1.6 }],
};
function plainJson(value: unknown): void {
  if (typeof value === 'number') { expect(Number.isFinite(value)).toBe(true); return; }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  expect(typeof value).toBe('object');
  expect(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype).toBe(true);
  Object.values(value as object).forEach(plainJson);
}
describe('serializable domain boundary', () => {
  test('source and editable settings survive JSON without scene objects or mutation', () => {
    const before = JSON.stringify(imported);
    const edited: CoinSettings = { ...settings, revision: 1, layers: [{ ...settings.layers[0], thicknessMm: 2, color: '#123456' }] };
    for (const dto of [imported, settings, edited]) {
      plainJson(dto);
      expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
    }
    expect(JSON.stringify(imported)).toBe(before);
    expect(edited.layers[0].thicknessMm).not.toBe(settings.layers[0].thicknessMm);
  });
  test('every stable code has actionable text and retains its precise location', () => {
    for (const code of Object.keys(diagnosticCatalog) as (keyof typeof diagnosticCatalog)[]) {
      const location = { scope: 'element', layerId: 'base', elementId: 'outline', elementPath: [0, 0] } as const;
      const diagnostic = createDiagnostic(code, location);
      expect(diagnostic.code).toBe(code);
      expect(diagnostic.message.length).toBeGreaterThan(10);
      expect(diagnostic.remediation.length).toBeGreaterThan(10);
      expect(diagnostic.location).toEqual(location);
      plainJson(diagnostic);
      expect(JSON.parse(JSON.stringify(diagnostic))).toEqual(diagnostic);
    }
  });
  test('freshness gate rejects invalid, absent, stale or error-bearing generation', () => {
    // Empty arrays are only a DTO stub here, not evidence of a validated mesh.
    const mesh: TriangleMesh = { vertices: [], triangles: [] };
    const result: ValidGeneratedCoin = {
      schemaVersion: 1, status: 'valid', input: { importId: 'import-1', settingsRevision: 0 },
      diagnostics: [], activeTiers: [], unifiedMesh: mesh, parts: [],
      metrics: { boundsMm: [[0, 0, 0], [40, 20, 1.6]], volumeMm3: 640, shellCount: 1 },
    };
    plainJson(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const current = { importId: settings.importId, settingsRevision: settings.revision };
    expect(isCurrentValidGeneration(result, current)).toBe(true);
    for (const value of [
      null,
      { schemaVersion: 1, status: 'invalid', input: current, diagnostics: [createDiagnostic('MESH_INVALID', { scope: 'mesh', layerId: null })] } as GeneratedCoin,
      { ...result, input: { ...current, settingsRevision: 1 } },
      { ...result, input: { ...current, importId: 'replacement' } },
      { ...result, diagnostics: [createDiagnostic('MESH_INVALID', { scope: 'mesh', layerId: null })] },
    ]) expect(isCurrentValidGeneration(value, current)).toBe(false);
  });
});

// Checked by tsc, independently of Vitest's transpilation.
function compileTimeConstraints(base: BaseLayerSettings, invalid: InvalidGeneratedCoin): void {
  // @ts-expect-error The locked base cannot be disabled.
  const disabledBase: BaseLayerSettings = { ...base, enabled: false };
  // @ts-expect-error No artwork can occupy the required base slot.
  const artworkFirst: CoinSettings['layers'] = [{ layerId: 'art', role: 'artwork', enabled: true, color: '#ffffff', thicknessMm: 1 }];
  // @ts-expect-error Failed generation cannot contain a mesh.
  invalid.unifiedMesh = { vertices: [], triangles: [] };
  void artworkFirst; void disabledBase;
}
void compileTimeConstraints;
