import './setup';
import { describe, expect, test, vi } from 'vitest';
import type { CoinSettings, FootprintMm, ImportedCoin, SupportValidation } from '../../app/src/core/contracts';
import { createDiagnostic } from '../../app/src/core/diagnostics';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { isCurrentSupportedStack, validateSupport } from '../../app/src/core/validateSupport';
import { polygonClippingKernel as kernel } from '../../app/src/import/polygonClippingKernel';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { loadFixtures, measureFootprint } from './helpers/fixtures';

const box = (x=0,y=0,w=10,h=10): FootprintMm => [{outer:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],holes:[]}];
const donut: FootprintMm = [{outer:box()[0].outer,holes:[[[2,2],[2,8],[8,8],[8,2]]]}];
function coinOf(...footprints:FootprintMm[]):ImportedCoin {
  return {schemaVersion:1,source:{importId:'test',fileName:'test.svg',byteLength:0,svgText:''},
    physicalPageMm:[40,40],sizeOrigin:'explicit',baseLayerId:'layer-0',diagnostics:[],
    layers:footprints.map((footprintMm,sourceOrder)=>({id:`layer-${sourceOrder}`,name:`Tier ${sourceOrder}`,sourceOrder,
      sourceElements:[],footprintMm,boundsMm:[999,999,999,999],areaMm2:-999}))};
}
function defaults(coin:ImportedCoin):CoinSettings {
  const r=createDefaultCoinSettings(coin); if(r.status!=='created')throw Error('settings');return r.settings;
}
const check=(coin:ImportedCoin,settings=defaults(coin))=>validateSupport(coin,settings,kernel);
function supported(r:SupportValidation) {
  expect(r.status,JSON.stringify(r.diagnostics)).toBe('supported');if(r.status!=='supported')throw Error('support');
  expect(r.unsupportedRemainders).toEqual([]); expect(r.diagnostics.some(d=>d.code==='SUPPORT_OUTSIDE_LOWER')).toBe(false);return r;
}
function rejected(r:SupportValidation,code:string) {
  expect(r.status).toBe('rejected');expect(r.diagnostics.some(d=>d.code===code)).toBe(true);
  for(const key of ['activeTiers','totalHeightMm','unifiedMesh','parts','metrics'])expect(r).not.toHaveProperty(key);
  expect(r.unsupportedRemainders).toEqual([]);return r;
}
const area=(f:FootprintMm)=>measureFootprint(f).areaMm2;
function freeze<T>(v:T):T {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}

describe('automatic downward support with independent area and contour oracles',()=>{
  test('contained footprints keep exact source XY, identities, colors and cumulative Z',()=>{
    const coin=coinOf(box(),box(1,1,8,8),box(2,2,2,2)),s=defaults(coin),r=supported(check(coin,s));
    r.activeTiers.forEach((t,i)=>expect(t.footprintMm).toBe(coin.layers[i].footprintMm));
    expect(r.activeTiers.map(t=>[t.layerId,t.bottomZMm,t.topZMm,t.color])).toEqual([
      ['layer-0',0,1.6,'#808080'],['layer-1',1.6,2,'#808080'],['layer-2',2,2.4,'#808080']]);
  });
  test('fills only material beneath an upper footprint inside a lower hole',()=>{
    const r=supported(check(coinOf(donut,box(3,3,2,2))));
    expect(r.activeTiers[0].footprintMm).toEqual([...donut,...box(3,3,2,2)]);
    expect(r.activeTiers.map(t=>area(t.footprintMm))).toEqual([68,4]);
  });
  test('upper artwork covering a hole fills that hole completely',()=>{
    const r=supported(check(coinOf(donut,box(1,1,8,8))));
    expect(r.activeTiers[0].footprintMm).toEqual(box());expect(area(r.activeTiers[0].footprintMm)).toBe(100);
  });
  test('equal bounds and equal area with different holes fills only the unsupported lower hole',()=>{
    const a:FootprintMm=[{outer:box()[0].outer,holes:[[[1,1],[1,3],[3,3],[3,1]]]}];
    const b:FootprintMm=[{outer:box()[0].outer,holes:[[[7,7],[7,9],[9,9],[9,7]]]}];
    const r=supported(check(coinOf(a,b)));expect(r.activeTiers.map(t=>area(t.footprintMm))).toEqual([100,96]);
  });
  test('extends the base outline without clipping the upper or resizing/recentering coordinates',()=>{
    const r=supported(check(coinOf(box(),box(8,0,4,10))));
    expect(r.activeTiers[0].footprintMm).toEqual(box(0,0,12,10));expect(r.activeTiers[1].footprintMm).toEqual(box(8,0,4,10));
  });
  test('propagates every island through multiple lower layers top-down, preserving disconnected columns',()=>{
    const upper=[...box(3,3,1,1),...box(16,1,2,2)],r=supported(check(coinOf(box(),donut,upper)));
    expect(r.activeTiers.map(t=>area(t.footprintMm))).toEqual([104,69,5]);
    expect(r.activeTiers[0].footprintMm).toEqual([...box(),...box(16,1,2,2)]);
    expect(r.activeTiers[1].footprintMm).toEqual([...donut,...box(16,1,2,2),...box(3,3,1,1)]);
  });
  test('exact shared edge extends the lower footprint; point-only contact retains the existing polygon guard',()=>{
    expect(supported(check(coinOf(box(),box(10,2,4,6)))).activeTiers.map(t=>area(t.footprintMm))).toEqual([124,24]);
    rejected(check(coinOf(box(),box(10,10,2,2))),'POLYGON_INVALID');
  });
  test.each([box(),donut].map(f=>({f})))('identical footprints, including holes, avoid union %#',({f})=>{
    const union=vi.fn(kernel.union),coin=coinOf(f,f);supported(validateSupport(coin,defaults(coin),{...kernel,union}));expect(union).not.toHaveBeenCalled();
  });
  test('small representable unsupported corner is added without an area epsilon',()=>{
    const lower:FootprintMm=[{outer:[[-1,-1],[1001,-1],[1001,998.999996],[998.999996,1001],[-1,1001]],holes:[]}];
    const coin=coinOf(lower,box(0,0,1000,1000)),union=vi.fn(kernel.union);
    const r=supported(validateSupport(coin,defaults(coin),{...kernel,union}));expect(union).toHaveBeenCalledTimes(1);
    expect(r.activeTiers[0].footprintMm[0].outer).toContainEqual([1000,1000]);
  });
});

describe('current enabled order, immutable originals and freshness',()=>{
  test('hiding upper artwork removes its generated support; showing recomputes from originals',()=>{
    const coin=freeze(coinOf(donut,box(3,3,2,2))),s=freeze(defaults(coin)),before=JSON.stringify([coin,s]);
    const r=supported(check(coin,s)),snapshot=JSON.stringify(r);
    const hidden:CoinSettings={...s,revision:1,layers:[s.layers[0],{...s.layers[1],enabled:false}]};
    expect(supported(check(coin,hidden)).activeTiers[0].footprintMm).toBe(coin.layers[0].footprintMm);
    expect(check(coin,{...s,revision:2})).toEqual({...r,input:{...r.input,settingsRevision:2}});
    expect(JSON.stringify([coin,s])).toBe(before);expect(JSON.stringify(r)).toBe(snapshot);expect(JSON.parse(snapshot)).toEqual(r);
    expect(isCurrentSupportedStack(r,{...r.input,settingsRevision:1})).toBe(false);
    expect(isCurrentSupportedStack(r,{...r.input,importId:'other'})).toBe(false);
    expect(isCurrentSupportedStack(r,r.input)).toBe(true);expect(isCurrentSupportedStack(null,r.input)).toBe(false);
  });
  test('reorder changes which original artwork receives support without changing identities or heights',()=>{
    const coin=coinOf(box(),box(1,1,8,8),box(2,2,2,2)),s=defaults(coin);
    const r=supported(check(coin,{...s,revision:1,layers:[s.layers[0],s.layers[2],s.layers[1]]}));
    expect(r.activeTiers.map(t=>[t.layerId,area(t.footprintMm),t.bottomZMm,t.topZMm])).toEqual([
      ['layer-0',100,0,1.6],['layer-2',64,1.6,2],['layer-1',64,2,2.4]]);
  });
  test('disabled intermediate footprint contributes neither geometry nor height',()=>{
    const coin=coinOf(box(),box(20,20,2,2),box(3,3,1,1)),s=defaults(coin);
    const r=supported(check(coin,{...s,revision:1,layers:[s.layers[0],{...s.layers[1],enabled:false},s.layers[2]]}));
    expect(r.activeTiers.map(t=>[t.layerId,t.bottomZMm,t.topZMm])).toEqual([['layer-0',0,1.6],['layer-2',1.6,2]]);
    expect(r.activeTiers[0].footprintMm).toEqual(box());
  });
});

describe('failure-atomic polygon and settings guards',()=>{
  test.each(['identity','revision','hidden thickness','base order'])('%s rejects before Boolean work',kind=>{
    const coin=coinOf(box(),box(1,1,1,1)),s=defaults(coin),difference=vi.fn(kernel.difference),union=vi.fn(kernel.union);
    const bad=kind==='identity'?{...s,importId:'old'}:kind==='revision'?{...s,revision:-1}:kind==='base order'?{...s,layers:[s.layers[1],s.layers[0]]}:{...s,layers:[s.layers[0],{...s.layers[1],enabled:false,thicknessMm:NaN}]};
    const r=rejected(validateSupport(coin,bad as CoinSettings,{...kernel,difference,union}),'SETTINGS_INVALID');
    expect(r).not.toHaveProperty('input');expect(difference).not.toHaveBeenCalled();expect(union).not.toHaveBeenCalled();
  });
  test('invalid topology in a base-only source still rejects; disconnected imported bases retain import policy',()=>{
    rejected(check(coinOf([{outer:[[0,0],[10,10],[0,10],[10,0]],holes:[]}])),'POLYGON_INVALID');
    const coin=coinOf([...box(),...box(20,0)]),settings={importId:'test',revision:0,layers:[{layerId:'layer-0',role:'base',enabled:true,thicknessMm:1,color:'#808080'}]} as CoinSettings;
    rejected(check(coin,settings),'BASE_DISCONNECTED');
  });
  test.each([.0000019,.0000000004])('positive ambiguous near-contact %s is not silently repaired',delta=>{
    rejected(check(coinOf(box(),box(delta,1,1,1))),'POLYGON_INVALID');
  });
  test.each(['difference','union'] as const)('kernel %s exception discards all effective geometry and preserves source warning',operation=>{
    const warning=createDiagnostic('SOURCE_SIZE_INFERRED',{scope:'document'}),coin={...coinOf(box(),box(20,0,2,2)),diagnostics:[warning]};
    const r=rejected(validateSupport(coin,defaults(coin),{...kernel,[operation]:()=>{throw Error('private');}}),'POLYGON_INVALID');
    expect(r.diagnostics[0]).toEqual(warning);expect(JSON.stringify(r)).not.toContain('private');
  });
  test.each(['difference','union'] as const)('malformed %s output cannot produce a partially supported stack',operation=>{
    const coin=coinOf(box(),box(20,0,2,2)),bad:FootprintMm=[{outer:[[0,0],[Infinity,0],[0,1]],holes:[]}];
    rejected(validateSupport(coin,defaults(coin),{...kernel,[operation]:()=>bad}),'POLYGON_INVALID');
  });
  test('all downward operations share bounded work',()=>{
    rejected(check(coinOf(...Array.from({length:3300},()=>box()))),'IMPORT_LIMIT_EXCEEDED');
  });
  test('many disjoint support additions remain bounded without publishing partial tiers',()=>{
    rejected(check(coinOf(...Array.from({length:105},(_,i)=>box(i*20,0,1,1)))),'IMPORT_LIMIT_EXCEEDED');
  });
  test('source errors remain blockers and source warnings survive unchanged',()=>{
    const coin=coinOf(box()),s=defaults(coin),warning=createDiagnostic('SOURCE_SIZE_INFERRED',{scope:'document'}),error=createDiagnostic('POLYGON_INVALID',{scope:'document'});
    expect(supported(check({...coin,diagnostics:[warning]},s)).diagnostics).toEqual([warning]);
    expect(rejected(check({...coin,diagnostics:[warning,error]},s),'POLYGON_INVALID').diagnostics).toEqual([warning,error]);
  });
});

const fixtures=(await loadFixtures()).filter(f=>f.expected.importOutcome==='accept');
test.each(fixtures)('production import and downward support: $name',fixture=>{
  const imported=importCoinSvg({importId:fixture.name,fileName:fixture.name+'.svg',svgText:fixture.svg,byteLength:fixture.svg.length});
  if(imported.status!=='imported')throw Error(JSON.stringify(imported));
  const r=supported(check(imported.coin));expect(r.activeTiers.map(t=>t.layerId)).toEqual(fixture.expected.layers.map(l=>'source:'+l.id));
});
