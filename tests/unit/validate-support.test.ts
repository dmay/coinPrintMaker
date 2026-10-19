import './setup';
import { describe, expect, test, vi } from 'vitest';
import type { CoinSettings, FootprintMm, ImportedCoin, LayerSettings, RingMm, SupportValidation } from '../../app/src/core/contracts';
import { createDiagnostic } from '../../app/src/core/diagnostics';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { isCurrentSupportedStack, validateSupport } from '../../app/src/core/validateSupport';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { expectedBoundsYUp, loadFixtures, measureFootprint, near, tolerance } from './helpers/fixtures';

const box = (x = 0, y = 0, w = 10, h = 10): FootprintMm => [{ outer: [[x,y],[x+w,y],[x+w,y+h],[x,y+h]], holes: [] }];
const donut: FootprintMm = [{ outer: box()[0].outer, holes: [[[2,2],[2,8],[8,8],[8,2]]] }];
function coinOf(...footprints: FootprintMm[]): ImportedCoin {
  return { schemaVersion: 1, source: { importId: 'test-import', fileName: 'test.svg', byteLength: 0, svgText: '' },
    physicalPageMm: [40,40], sizeOrigin: 'explicit', baseLayerId: 'layer-0', diagnostics: [],
    layers: footprints.map((footprintMm, sourceOrder) => ({ id: `layer-${sourceOrder}`, name: `Tier ${sourceOrder}`, sourceOrder,
      sourceElements: [{ elementId: null, elementPath: [sourceOrder] }], footprintMm, boundsMm: [0,0,10,10], areaMm2: 100 })) };
}
function defaults(coin: ImportedCoin): CoinSettings {
  const result = createDefaultCoinSettings(coin);
  if (result.status !== 'created') throw new Error('Expected settings');
  return result.settings;
}
const check = (coin: ImportedCoin, settings = defaults(coin)) => validateSupport(coin, settings, polygonClippingKernel);
function supported(result: SupportValidation) {
  expect(result.status, JSON.stringify(result.diagnostics)).toBe('supported');
  if (result.status !== 'supported') throw new Error('Expected support');
  expect(result.unsupportedRemainders).toEqual([]);
  expect(result).not.toHaveProperty('unifiedMesh'); expect(result).not.toHaveProperty('parts');
  return result;
}
function rejected(result: SupportValidation, code = 'SUPPORT_OUTSIDE_LOWER') {
  expect(result.status).toBe('rejected');
  expect(result.diagnostics.some(d => d.code === code && d.severity === 'error')).toBe(true);
  for (const key of ['activeTiers','totalHeightMm','unifiedMesh','parts','metrics']) expect(result).not.toHaveProperty(key);
  return result;
}
function edited(settings: CoinSettings, entries: readonly LayerSettings[], revision = settings.revision + 1): CoinSettings {
  return { ...settings, revision, layers: entries } as CoinSettings;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe('difference-based support with independent analytic residuals', () => {
  test('contained artwork retains source XY, identities and cumulative absolute Z', () => {
    const coin = coinOf(box(2,3,20,20), box(4,5,10,10), box(6,7,2,2));
    const result = supported(check(coin));
    expect(result.input).toEqual({ importId: 'test-import', settingsRevision: 0 });
    expect(result.activeTiers.map(t => [t.layerId,t.bottomZMm,t.topZMm])).toEqual([
      ['layer-0',0,1.6],['layer-1',1.6,2],['layer-2',2,2.4],
    ]);
    result.activeTiers.forEach((tier,i) => expect(tier.footprintMm).toBe(coin.layers[i].footprintMm));
    expect(result.totalHeightMm).toBe(2.4);
  });
  test('lower hole rejects an upper whose bbox and smaller area fit, with exact 36 mm² remainder', () => {
    const coin = coinOf(donut, box(1,1,8,8));
    // Deliberately misleading cached metrics cannot prove containment.
    const result = rejected(check(coin));
    expect(result.unsupportedRemainders).toEqual([{ upperLayerId: 'layer-1', lowerLayerId: 'layer-0', footprintMm: box(2,2,6,6) }]);
    expect(measureFootprint(result.unsupportedRemainders[0].footprintMm).areaMm2).toBe(36);
    expect(result.diagnostics.at(-1)).toMatchObject({ location: { scope: 'layer', layerId: 'layer-1' },
      message: expect.stringContaining('Tier 0 (layer-0)'), remediation: expect.stringContaining('Tier 1 (layer-1)') });
  });
  test('equal area and identical bbox with different holes cannot pass', () => {
    const a: FootprintMm = [{ outer: box()[0].outer, holes: [[[1,1],[1,3],[3,3],[3,1]]] }];
    const b: FootprintMm = [{ outer: box()[0].outer, holes: [[[7,7],[7,9],[9,9],[9,7]]] }];
    const result = rejected(check(coinOf(a,b)));
    expect(result.unsupportedRemainders[0].footprintMm).toEqual(box(1,1,2,2));
  });
  test('all disconnected upper islands must be supported; retain each unsupported island without clipping', () => {
    supported(check(coinOf(box(), [...box(1,1,1,1), ...box(8,8,1,1)])));
    const upper = [...box(1,1,1,1), ...box(12,1,2,2), ...box(16,1,1,1)];
    const coin = coinOf(box(), upper), snapshot = JSON.stringify(coin);
    const result = rejected(check(coin));
    expect(result.unsupportedRemainders[0].footprintMm).toEqual([...box(12,1,2,2), ...box(16,1,1,1)]);
    expect(measureFootprint(result.unsupportedRemainders[0].footprintMm).areaMm2).toBe(5);
    expect(JSON.stringify(coin)).toBe(snapshot);
  });
  test('islands in the hole of an immediate lower raised tier reject despite solid base support', () => {
    const result = rejected(check(coinOf(box(), donut, [...box(3,3,1,1), ...box(6,6,1,1)])));
    expect(result.unsupportedRemainders).toHaveLength(1);
    expect(result.unsupportedRemainders[0]).toMatchObject({ lowerLayerId: 'layer-1', upperLayerId: 'layer-2' });
    expect(measureFootprint(result.unsupportedRemainders[0].footprintMm).areaMm2).toBe(2);
  });
  test('out-of-rim strip is retained at absolute position with analytic 20 mm²', () => {
    const result = rejected(check(coinOf(box(), box(8,0,4,10))));
    expect(result.unsupportedRemainders[0].footprintMm).toEqual(box(10,0,2,10));
    expect(measureFootprint(result.unsupportedRemainders[0].footprintMm).areaMm2).toBe(20);
  });
  test('multiple failing pairs retain complete remainders in active order', () => {
    const result = rejected(check(coinOf(box(), box(8,0,4,10), box(14,0,1,1))));
    expect(result.unsupportedRemainders.map(r => [r.lowerLayerId,r.upperLayerId])).toEqual([
      ['layer-0','layer-1'],['layer-1','layer-2'],
    ]);
    expect(result.unsupportedRemainders.map(r => measureFootprint(r.footprintMm).areaMm2)).toEqual([20,1]);
    expect(result.diagnostics.filter(d => d.code === 'SUPPORT_OUTSIDE_LOWER')).toHaveLength(2);
  });
  test.each([box(), donut].map(footprint=>({footprint})))('identical footprints, including identical holes, pass %#', ({footprint}) => {
    supported(check(coinOf(footprint, footprint)));
  });
  test('exact partial exterior/hole boundaries pass for contained material', () => {
    supported(check(coinOf(box(), box(0,2,3,6))));
    supported(check(coinOf(donut, box(0,2,2,6))));
    const triangle: FootprintMm = [{ outer: [[0,0],[10,0],[10,10]], holes: [] }];
    supported(check(coinOf(triangle, [{ outer: [[2,2],[6,2],[6,6]], holes: [] }])));
  });
  test('shared edge or point alone gives no support to outside material', () => {
    for (const upper of [box(10,2,4,6), box(10,10,2,2)]) {
      const result = rejected(check(coinOf(box(), upper)));
      expect(result.unsupportedRemainders[0].footprintMm).toEqual(upper);
    }
  });
  test('a disconnected base rejects even if the upper lies inside an island', () => {
    const coin = coinOf([...box(),...box(20,0)],box(1,1,1,1));
    const settings = { importId: 'test-import', revision: 0, layers: [
      { role: 'base', layerId: 'layer-0', enabled: true, thicknessMm: 1.6, color: '#808080' },
      { role: 'artwork', layerId: 'layer-1', enabled: true, thicknessMm: .4, color: '#808080' },
    ] } as CoinSettings;
    rejected(check(coin, settings), 'BASE_DISCONNECTED');
  });
  test('a base-only stack validates topology rather than treating no pairs as proof', () => {
    supported(check(coinOf(donut)));
    const bow: RingMm = [[0,0],[10,10],[0,10],[10,0]];
    const coin = coinOf([{ outer: bow, holes: [] }]);
    rejected(check(coin), 'POLYGON_INVALID');
    rejected(check(coinOf([{outer:box()[0].outer,holes:[[[5,0],[3,2],[5,4],[7,2]]]}])), 'POLYGON_INVALID');
  });
});

describe('current active adjacency, freshness and immutable inputs', () => {
  test('hide middle rechecks against base; show restores hole rejection and Z', () => {
    const coin = coinOf(box(), donut, box(3,3,2,2)), settings = defaults(coin);
    rejected(check(coin,settings));
    const hidden = edited(settings, [settings.layers[0],{...settings.layers[1],enabled:false},settings.layers[2]]);
    const result = supported(check(coin,hidden));
    expect(result.activeTiers.map(t => [t.layerId,t.bottomZMm,t.topZMm])).toEqual([['layer-0',0,1.6],['layer-2',1.6,2]]);
    rejected(check(coin,edited(hidden,settings.layers)));
  });
  test('formerly supported result becomes unsupported on show or reorder; key rejects stale success', () => {
    const coin = coinOf(box(),box(1,1,8,8),box(2,2,2,2),box(1,1,8,8)), settings = defaults(coin);
    const initialSettings = edited(settings,[settings.layers[0],settings.layers[1],{...settings.layers[2],enabled:false},settings.layers[3]],1);
    const initial = supported(check(coin,initialSettings));
    const shown = edited(initialSettings,settings.layers,2);
    rejected(check(coin,shown));
    const reordered = edited(settings,[settings.layers[0],settings.layers[2],settings.layers[1],settings.layers[3]],3);
    rejected(check(coin,reordered));
    expect(isCurrentSupportedStack(initial,{importId:'test-import',settingsRevision:1})).toBe(true);
    expect(isCurrentSupportedStack(initial,{importId:'test-import',settingsRevision:2})).toBe(false);
    expect(isCurrentSupportedStack(initial,{importId:'replacement',settingsRevision:1})).toBe(false);
    expect(isCurrentSupportedStack(check(coin,shown),{importId:'test-import',settingsRevision:2})).toBe(false);
    expect(isCurrentSupportedStack(null,initial.input)).toBe(false);
    expect(isCurrentSupportedStack({...initial,diagnostics:[createDiagnostic('POLYGON_INVALID',{scope:'document'})]},initial.input)).toBe(false);
  });
  test('hiding a tier in a supported nested stack preserves transitive support and recomputes adjacency', () => {
    const coin = coinOf(box(), box(1,1,8,8), box(2,2,2,2)), settings = defaults(coin);
    const initial = supported(check(coin,settings));
    const hidden = edited(settings,[settings.layers[0],{...settings.layers[1],enabled:false},settings.layers[2]]);
    const difference = vi.fn(polygonClippingKernel.difference);
    const result = supported(validateSupport(coin,hidden,{...polygonClippingKernel,difference}));
    expect(difference).toHaveBeenCalledTimes(1);
    expect(difference.mock.calls[0]).toEqual([coin.layers[2].footprintMm,coin.layers[0].footprintMm]);
    expect(result.totalHeightMm).toBe(2);
    expect(isCurrentSupportedStack(initial,{...initial.input,settingsRevision:1})).toBe(false);
  });
  test('frozen source/settings and earlier results survive later hide/order checks unchanged', () => {
    const coin = freeze(coinOf(box(),box(1,1,8,8),box(2,2,2,2))), settings = freeze(defaults(coin));
    const before = JSON.stringify([coin,settings]), original = supported(check(coin,settings)), snapshot = JSON.stringify(original);
    const hidden = edited(settings,[settings.layers[0],{...settings.layers[1],enabled:false},settings.layers[2]]);
    supported(check(coin,hidden));
    expect(JSON.stringify([coin,settings])).toBe(before); expect(JSON.stringify(original)).toBe(snapshot);
    expect(check(coin,settings)).toEqual(original); expect(JSON.parse(JSON.stringify(original))).toEqual(original);
  });
  test.each(['stale import','invalid hidden thickness','base moved','invalid revision'])('%s rejects before any kernel work', name => {
    const coin = coinOf(box(),box(1,1,1,1)), settings = defaults(coin);
    const bad = name === 'stale import' ? {...settings,importId:'old'} : name === 'invalid hidden thickness'
      ? edited(settings,[settings.layers[0],{...settings.layers[1],enabled:false,thicknessMm:NaN}])
      : name === 'base moved' ? edited(settings,[settings.layers[1],settings.layers[0]]) : {...settings,revision:-1};
    const difference = vi.fn(polygonClippingKernel.difference);
    const result = rejected(validateSupport(coin,bad,{...polygonClippingKernel,difference}),'SETTINGS_INVALID');
    expect(difference).not.toHaveBeenCalled(); expect(result).not.toHaveProperty('input');
    expect(result.unsupportedRemainders).toEqual([]);
  });
  test('source warnings propagate verbatim; source errors block without losing either message', () => {
    const warning = createDiagnostic('SOURCE_SIZE_INFERRED',{scope:'document'}), error = createDiagnostic('POLYGON_INVALID',{scope:'layer',layerId:'layer-0'});
    const coin = coinOf(box()), settings = defaults(coin);
    expect(supported(check({...coin,diagnostics:[warning]},settings)).diagnostics).toEqual([warning]);
    expect(rejected(check({...coin,diagnostics:[warning,error]},settings),'POLYGON_INVALID').diagnostics).toEqual([warning,error]);
  });
});

describe('precision and failure gating', () => {
  test('tiny 8e-12 mm² unsupported corner is preserved, never swallowed by an area epsilon', () => {
    const lower: FootprintMm = [{outer:[[-1,-1],[1001,-1],[1001,998.999996],[998.999996,1001],[-1,1001]],holes:[]}];
    const result = rejected(check(coinOf(lower,box(0,0,1000,1000))));
    const measured = measureFootprint(result.unsupportedRemainders[0].footprintMm);
    // Independent translated right-triangle formula avoids large-origin shoelace cancellation.
    const [x,y,maxX,maxY] = measured.boundsMm;
    expect((maxX-x)*(maxY-y)/2).toBeCloseTo(8e-12,19);
    expect(measured.boundsMm).toEqual([999.999996,999.999996,1000,1000]);
  });
  test.each([.0000004,.0000000004])('ambiguous tiny corner %s fails instead of passing', delta => {
    const corner = 999-delta;
    const lower: FootprintMm = [{outer:[[-1,-1],[1001,-1],[1001,corner],[corner,1001],[-1,1001]],holes:[]}];
    const result = rejected(check(coinOf(lower,box(0,0,1000,1000))),'POLYGON_INVALID');
    expect(result.unsupportedRemainders).toEqual([]); // Failed/uncomputed, not supported.
  });
  test.each([.0000019,.0000000004])('positive near-contact %s fails conservatively', delta => {
    rejected(check(coinOf(box(),box(delta,1,1,1))),'POLYGON_INVALID');
  });
  test('kernel exception fails one pair, preserves source warning, and checks subsequent pair', () => {
    const warning = createDiagnostic('SOURCE_SIZE_INFERRED',{scope:'document'});
    const coin = {...coinOf(box(),box(1,1,8,8),box(12,0,1,1)),diagnostics:[warning]};
    const difference = vi.fn(polygonClippingKernel.difference).mockImplementationOnce(()=>{throw new Error('private detail');});
    const result = rejected(validateSupport(coin,defaults(coin),{...polygonClippingKernel,difference}),'POLYGON_INVALID');
    expect(difference).toHaveBeenCalledTimes(2); expect(result.diagnostics[0]).toEqual(warning);
    expect(result.diagnostics[1]).toMatchObject({ location:{scope:'layer',layerId:'layer-1'},message:expect.stringContaining('layer-0') });
    expect(JSON.stringify(result)).not.toContain('private detail');
    expect(result.unsupportedRemainders).toEqual([{upperLayerId:'layer-2',lowerLayerId:'layer-1',footprintMm:box(12,0,1,1)}]);
  });
  test.each(([
    [{outer:[[0,0],[1,1],[2,2]],holes:[]}],
    [{outer:[[0,0],[Infinity,0],[0,1]],holes:[]}],
    [{outer:box()[0].outer,holes:[box(20,20,1,1)[0].outer]}],
    [{outer:[[0,0],[.0000004,0],[0,.0000004]],holes:[]}],
  ] as FootprintMm[]).map(output=>({output})))('malformed kernel remainder rejects %# without partial geometry', ({output}) => {
    const coin = coinOf(box(),box(1,1,1,1));
    const result = rejected(validateSupport(coin,defaults(coin),{...polygonClippingKernel,difference:()=>output}),'POLYGON_INVALID');
    expect(result.unsupportedRemainders).toEqual([]);
  });
  test('all pair operations share bounded document work and no diagnostics/remnants are silently capped', () => {
    const coin = coinOf(...Array.from({length:3300},()=>box()));
    const result = rejected(check(coin),'IMPORT_LIMIT_EXCEEDED');
    expect(result.diagnostics.at(-1)?.location).toEqual({scope:'layer',layerId:'layer-3299'});
    const outside = coinOf(...Array.from({length:105},(_,i)=>box(i*20,0,1,1)));
    const all = rejected(check(outside));
    expect(all.unsupportedRemainders).toHaveLength(104); expect(all.diagnostics).toHaveLength(104);
    expect(JSON.parse(JSON.stringify(all))).toEqual(all);
  });
});

const fixtures = (await loadFixtures()).filter(f => f.expected.importOutcome === 'accept');
describe('production import → settings → stack → support: authored fixtures', () => {
  test.each(fixtures)('$name', fixture => {
    const imported = importCoinSvg({ importId:fixture.name,fileName:fixture.name+'.svg',svgText:fixture.svg,byteLength:new TextEncoder().encode(fixture.svg).length });
    expect(imported.status).toBe('imported'); if(imported.status!=='imported')throw new Error('Expected import');
    const result = check(imported.coin);
    if(fixture.expected.geometryOutcome === 'blocked') {
      rejected(result);
      expect(result.unsupportedRemainders).not.toHaveLength(0);
      if (fixture.name === 'over-lower-hole') {
        expect(result.unsupportedRemainders).toEqual([{ upperLayerId:'source:art',lowerLayerId:'source:ring',footprintMm:box(17,17,6,6) }]);
      }
    } else {
      const success = supported(result);
      expect(success.activeTiers.map(t=>t.layerId)).toEqual(fixture.expected.layers.map(l=>'source:'+l.id));
      success.activeTiers.forEach((tier,index)=>{
        const expected = fixture.expected.layers[index], measured = measureFootprint(tier.footprintMm);
        near(tier.bottomZMm,expected.bottomZMm,tolerance.scalar); near(tier.topZMm,expected.topZMm,tolerance.scalar);
        measured.boundsMm.forEach((value,axis)=>near(value,expectedBoundsYUp(expected.boundsMm,fixture.expected.physicalPageMm[1])[axis],tolerance.coordinateMm));
        expect(measured.holes).toBe(expected.holes); expect(measured.regions).toBe(expected.regions);
      });
    }
  });
  test('authored over-lower-hole hides Ring and validates center directly on base at Z1.6–2.0', () => {
    const fixture = fixtures.find(f=>f.name==='over-lower-hole')!;
    const imported = importCoinSvg({importId:'hide-fixture',fileName:'over-lower-hole.svg',svgText:fixture.svg,byteLength:new TextEncoder().encode(fixture.svg).length});
    if(imported.status!=='imported')throw new Error('Expected import');
    const settings = defaults(imported.coin), original = rejected(check(imported.coin,settings));
    const snapshot = JSON.stringify(original);
    const hidden = edited(settings,[settings.layers[0],{...settings.layers[1],enabled:false},settings.layers[2]]);
    const result = supported(check(imported.coin,hidden));
    expect(result.activeTiers.map(t=>[t.layerId,t.bottomZMm,t.topZMm])).toEqual([['source:base',0,1.6],['source:art',1.6,2]]);
    expect(result.totalHeightMm).toBe(2); expect(JSON.stringify(original)).toBe(snapshot);
    rejected(check(imported.coin,edited(hidden,settings.layers)));
  });
});
