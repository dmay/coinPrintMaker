import './setup';
import { describe, expect, test } from 'vitest';
import type { CoinSettings, FootprintMm, ImportedCoin, LayerSettings, ResolvedStack, RingMm } from '../../app/src/core/contracts';
import { createDefaultCoinSettings, resolveStack } from '../../app/src/core/resolveStack';
import { createDiagnostic } from '../../app/src/core/diagnostics';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { expectedBoundsYUp, loadFixtures, measureFootprint, near, tolerance } from './helpers/fixtures';

const square: RingMm = [[2, 3], [22, 3], [22, 23], [2, 23]];
const hole: RingMm = [[6, 7], [6, 9], [8, 9], [8, 7]];
const footprint: FootprintMm = [{ outer: square, holes: [hole] }];
const coin: ImportedCoin = {
  schemaVersion: 1, source: { importId: 'first-import', fileName: 'coin.svg', byteLength: 0, svgText: '' },
  physicalPageMm: [40, 40], sizeOrigin: 'explicit', baseLayerId: 'base', diagnostics: [],
  layers: ['base', 'middle', 'top'].map((id, sourceOrder) => ({ id, name: 'Same label', sourceOrder,
    sourceElements: [{ elementId: id, elementPath: [sourceOrder] }], footprintMm: footprint,
    boundsMm: [2, 3, 22, 23], areaMm2: 396 })),
};
function defaults(imported = coin): CoinSettings {
  const result = createDefaultCoinSettings(imported);
  expect(result.status).toBe('created');
  if (result.status !== 'created') throw new Error('Expected default settings');
  return result.settings;
}
const settings = defaults();
function edit(entries: readonly LayerSettings[], revision = 1): CoinSettings {
  // The casts deliberately exercise runtime boundaries that static DTOs forbid.
  return { ...settings, revision, layers: entries } as CoinSettings;
}
function resolved(imported = coin, edited = settings): ResolvedStack {
  const result = resolveStack(imported, edited);
  expect(result.status, JSON.stringify(result.diagnostics)).toBe('resolved');
  if (result.status !== 'resolved') throw new Error('Expected resolved stack');
  return result;
}
function rejected(imported: ImportedCoin, edited: CoinSettings, code = 'SETTINGS_INVALID') {
  const result = resolveStack(imported, edited);
  expect(result.status).toBe('rejected');
  expect(result.diagnostics.some(diagnostic => diagnostic.code === code && diagnostic.severity === 'error')).toBe(true);
  for (const key of ['activeTiers', 'totalHeightMm', 'input', 'unifiedMesh', 'parts', 'metrics']) expect(result).not.toHaveProperty(key);
  return result;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

describe('separate defaults and immutable active stack', () => {
  test('defaults are 1.6/0.4 mm, neutral opaque color, source order, enabled and revision zero', () => {
    expect(settings).toEqual({ importId: 'first-import', revision: 0, layers: [
      { layerId: 'base', role: 'base', enabled: true, thicknessMm: 1.6, color: '#808080' },
      { layerId: 'middle', role: 'artwork', enabled: true, thicknessMm: 0.4, color: '#808080' },
      { layerId: 'top', role: 'artwork', enabled: true, thicknessMm: 0.4, color: '#808080' },
    ] });
    const result = resolved();
    expect(result.activeTiers.map(tier => [tier.bottomZMm, tier.topZMm])).toEqual([[0, 1.6], [1.6, 2], [2, 2.4]]);
    expect(result.totalHeightMm).toBe(2.4);
    expect(result.input).toEqual({ importId: 'first-import', settingsRevision: 0 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result).not.toHaveProperty('unifiedMesh');
    expect(defaults(coin).layers).not.toBe(coin.layers);
  });
  test('reorders by opaque identity, carries each color/thickness, and preserves absolute XY/holes', () => {
    const edited = edit([settings.layers[0], { ...settings.layers[2], thicknessMm: 0.25, color: '#aBc123' }, { ...settings.layers[1], thicknessMm: 0.75, color: '#123456' }]);
    const result = resolved(coin, edited);
    expect(result.activeTiers.map(tier => [tier.layerId, tier.color, tier.bottomZMm, tier.topZMm])).toEqual([
      ['base', '#808080', 0, 1.6], ['top', '#aBc123', 1.6, 1.85], ['middle', '#123456', 1.85, 2.6],
    ]);
    expect(result.totalHeightMm).toBe(2.6);
    expect(result.input.settingsRevision).toBe(1);
    for (const tier of result.activeTiers) expect(tier.footprintMm).toBe(coin.layers[0].footprintMm);
    expect(result.activeTiers[1].footprintMm[0]).toEqual({ outer: square, holes: [hole] });
  });
  test('hiding a middle tier recomputes adjacency/height; showing restores its current order', () => {
    const hidden = edit([settings.layers[0], { ...settings.layers[1], enabled: false }, settings.layers[2]]);
    expect(resolved(coin, hidden).activeTiers.map(tier => [tier.layerId, tier.bottomZMm, tier.topZMm])).toEqual([
      ['base', 0, 1.6], ['top', 1.6, 2],
    ]);
    expect(resolved(coin, hidden).totalHeightMm).toBe(2);
    const reordered = edit([settings.layers[0], settings.layers[2], { ...settings.layers[1], enabled: false }], 2);
    expect(resolved(coin, reordered).activeTiers.map(tier => tier.layerId)).toEqual(['base', 'top']);
    const shown = edit([settings.layers[0], settings.layers[2], settings.layers[1]], 3);
    expect(resolved(coin, shown).activeTiers.map(tier => tier.layerId)).toEqual(['base', 'top', 'middle']);
    expect(resolved(coin, shown).totalHeightMm).toBe(2.4);
  });
  test('base-only source and all artwork hidden both resolve to base at Z0', () => {
    const baseOnly = { ...coin, layers: [coin.layers[0]] };
    expect(resolved(baseOnly, defaults(baseOnly)).totalHeightMm).toBe(1.6);
    const hidden = edit([settings.layers[0], ...settings.layers.slice(1).map(layer => ({ ...layer, role: 'artwork' as const, enabled: false }))]);
    expect(resolved(coin, hidden).activeTiers).toHaveLength(1);
    expect(resolved(coin, hidden).totalHeightMm).toBe(1.6);
  });
  test('frozen source/settings resolve repeatedly without changing source or old results', () => {
    const frozenCoin = deepFreeze(structuredClone(coin)), frozenSettings = deepFreeze(structuredClone(settings));
    const before = JSON.stringify([frozenCoin, frozenSettings]);
    expect(defaults(frozenCoin)).toEqual(frozenSettings);
    const original = resolved(frozenCoin, frozenSettings);
    const snapshot = JSON.stringify(original);
    const later = edit([frozenSettings.layers[0], { ...frozenSettings.layers[1], enabled: false }, frozenSettings.layers[2]]);
    resolved(frozenCoin, later);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(JSON.stringify([frozenCoin, frozenSettings])).toBe(before);
    expect(original.activeTiers[0].footprintMm).toBe(frozenCoin.layers[0].footprintMm);
    expect(resolved(frozenCoin, frozenSettings)).toEqual(original);
  });
});

describe('settings rejection is atomic and protects the original base', () => {
  test.each([
    ['disabled base', [{ ...settings.layers[0], enabled: false }, ...settings.layers.slice(1)]],
    ['moved base', [settings.layers[1], settings.layers[0], settings.layers[2]]],
    ['promoted artwork', [{ ...settings.layers[1], role: 'base' }, { ...settings.layers[0], role: 'artwork' }, settings.layers[2]]],
    ['wrong base role', [{ ...settings.layers[0], role: 'artwork' }, ...settings.layers.slice(1)]],
    ['extra base role', [settings.layers[0], { ...settings.layers[1], role: 'base' }, settings.layers[2]]],
    ['nonboolean visibility', [settings.layers[0], { ...settings.layers[1], enabled: 'false' }, settings.layers[2]]],
    ['repeated ID', [settings.layers[0], settings.layers[1], settings.layers[1]]],
    ['unknown ID', [settings.layers[0], settings.layers[1], { ...settings.layers[2], layerId: 'missing' }]],
    ['blank ID', [settings.layers[0], settings.layers[1], { ...settings.layers[2], layerId: ' ' }]],
    ['missing tier', settings.layers.slice(0, 2)],
    ['extra tier', [...settings.layers, settings.layers[1]]],
    ['empty list', []],
  ])('%s', (_name, entries) => { rejected(coin, edit(entries as LayerSettings[])); });
  test('a same-filename replacement cannot reuse old settings', () => {
    const replacement = { ...coin, source: { ...coin.source, importId: 'second-import' } };
    rejected(replacement, settings);
    expect(defaults(replacement).importId).toBe('second-import');
    expect(resolved(replacement, defaults(replacement)).input.importId).toBe('second-import');
  });
  test.each([0, -0, -1, NaN, Infinity, -Infinity, '0.4', null, undefined])('invalid thickness %s is rejected even when hidden', thicknessMm => {
    for (const enabled of [true, false]) {
      const entries = [settings.layers[0], { ...settings.layers[1], enabled, thicknessMm }, settings.layers[2]];
      const result = rejected(coin, edit(entries as LayerSettings[]));
      expect(result.diagnostics.at(-1)?.location).toEqual({ scope: 'layer', layerId: 'middle' });
    }
    rejected(coin, edit([{ ...settings.layers[0], thicknessMm }, ...settings.layers.slice(1)] as LayerSettings[]));
  });
  test.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('invalid revision %s', revision => { rejected(coin, edit(settings.layers, revision)); });
  test.each(['red', '#fff', '#12345678', '#12345g', ' #123456', '', null])('invalid hidden color %s', color => {
    rejected(coin, edit([settings.layers[0], { ...settings.layers[1], enabled: false, color }, settings.layers[2]] as LayerSettings[]));
  });
  test('cumulative overflow and positive thickness lost to floating-point addition reject', () => {
    rejected(coin, edit([{ ...settings.layers[0], thicknessMm: Number.MAX_VALUE }, { ...settings.layers[1], thicknessMm: Number.MAX_VALUE }, settings.layers[2]]));
    rejected(coin, edit([{ ...settings.layers[0], thicknessMm: 1e20 }, { ...settings.layers[1], thicknessMm: 1 }, settings.layers[2]]));
    // Representable small positives have no invented minimum thickness policy.
    expect(resolved(coin, edit([{ ...settings.layers[0], thicknessMm: 1e-6 }, { ...settings.layers[1], thicknessMm: 1e-6 }, { ...settings.layers[2], thicknessMm: 1e-6 }])).totalHeightMm).toBeCloseTo(3e-6, 12);
  });
});

describe('required canonical source invariants', () => {
  const malformedSources: [string, ImportedCoin, string][] = [
    ['duplicate source ID', { ...coin, layers: [coin.layers[0], coin.layers[1], coin.layers[1]] }, 'SETTINGS_INVALID'],
    ['empty source ID', { ...coin, layers: [coin.layers[0], { ...coin.layers[1], id: '' }, coin.layers[2]] }, 'SETTINGS_INVALID'],
    ['empty import ID', { ...coin, source: { ...coin.source, importId: '' } }, 'SETTINGS_INVALID'],
    ['wrong source base', { ...coin, baseLayerId: 'middle' }, 'SETTINGS_INVALID'],
    ['unknown source base', { ...coin, baseLayerId: 'missing' }, 'SETTINGS_INVALID'],
    ['no source layers', { ...coin, layers: [] }, 'SETTINGS_INVALID'],
    ['empty base footprint', { ...coin, layers: [{ ...coin.layers[0], footprintMm: [] }, ...coin.layers.slice(1)] }, 'BASE_EMPTY'],
    ['empty artwork footprint', { ...coin, layers: [coin.layers[0], { ...coin.layers[1], footprintMm: [] }, coin.layers[2]] }, 'LAYER_EMPTY'],
    ['disconnected base', { ...coin, layers: [{ ...coin.layers[0], footprintMm: [...footprint, ...footprint] }, ...coin.layers.slice(1)] }, 'BASE_DISCONNECTED'],
    ['missing outer ring', { ...coin, layers: [coin.layers[0], { ...coin.layers[1], footprintMm: [{ outer: [] as unknown as RingMm, holes: [] }] }, coin.layers[2]] }, 'POLYGON_INVALID'],
    ['nonfinite ring point', { ...coin, layers: [coin.layers[0], { ...coin.layers[1], footprintMm: [{ outer: [[0, 0], [NaN, 1], [1, 0]], holes: [] }] }, coin.layers[2]] }, 'POLYGON_INVALID'],
  ];
  test.each(malformedSources)('%s cannot be repaired by defaults or hiding', (_name, imported, code) => {
    const result = createDefaultCoinSettings(imported);
    expect(result.status).toBe('rejected'); expect(result).not.toHaveProperty('settings');
    rejected(imported, edit([settings.layers[0], { ...settings.layers[1], enabled: false }, settings.layers[2]]), code);
  });
  test('source warnings survive and source errors block defaults and resolution', () => {
    const warning = createDiagnostic('SOURCE_SIZE_INFERRED', { scope: 'document' });
    const warned = { ...coin, diagnostics: [warning] };
    expect(createDefaultCoinSettings(warned).diagnostics).toEqual([warning]);
    expect(resolved(warned).diagnostics).toEqual([warning]);
    const error = createDiagnostic('POLYGON_INVALID', { scope: 'layer', layerId: 'middle' });
    const errored = { ...coin, diagnostics: [warning, error] };
    expect(createDefaultCoinSettings(errored)).toEqual({ status: 'rejected', diagnostics: [warning, error] });
    expect(rejected(errored, settings, 'POLYGON_INVALID').diagnostics).toEqual([warning, error]);
  });
});

const fixtures = (await loadFixtures()).filter(fixture => fixture.expected.importOutcome === 'accept');
describe('production importer to defaults to stack: authored independent oracles', () => {
  test.each(fixtures)('$name', fixture => {
    const imported = importCoinSvg({ importId: fixture.name, fileName: fixture.name + '.svg', svgText: fixture.svg, byteLength: new TextEncoder().encode(fixture.svg).length });
    expect(imported.status).toBe('imported');
    if (imported.status !== 'imported') throw new Error('Expected fixture import');
    const result = resolved(imported.coin, defaults(imported.coin));
    expect(result.activeTiers).toHaveLength(fixture.expected.layers.length);
    result.activeTiers.forEach((tier, index) => {
      const expected = fixture.expected.layers[index];
      expect(tier.layerId).toBe('source:' + expected.id);
      expect(tier.name).toBe(expected.name);
      expect(tier.thicknessMm).toBe(expected.thicknessMm);
      near(tier.bottomZMm, expected.bottomZMm, tolerance.scalar);
      near(tier.topZMm, expected.topZMm, tolerance.scalar);
      expect(tier.footprintMm).toBe(imported.coin.layers[index].footprintMm);
      const measured = measureFootprint(tier.footprintMm);
      measured.boundsMm.forEach((value, axis) => near(value, expectedBoundsYUp(expected.boundsMm, fixture.expected.physicalPageMm[1])[axis], tolerance.coordinateMm));
      expect(measured.regions).toBe(expected.regions); expect(measured.holes).toBe(expected.holes);
    });
    near(result.totalHeightMm, fixture.expected.layers.at(-1)!.topZMm, tolerance.scalar);
    if (fixture.expected.totalHeightMm !== null) near(result.totalHeightMm, fixture.expected.totalHeightMm, tolerance.scalar);
    // Outside-rim / over-lower-hole resolve Z too: support is a later validation.
    expect(result).not.toHaveProperty('unifiedMesh');
  });
});
