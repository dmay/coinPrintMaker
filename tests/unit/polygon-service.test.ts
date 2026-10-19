import { describe, expect, test, vi } from 'vitest';
import './setup';
import type { FootprintMm, RingMm, SourceDocument } from '../../app/src/core/contracts';
import type { PolygonKernel } from '../../app/src/core/polygonKernel';
import { createPolygonService } from '../../app/src/core/polygonService';
import type { PolygonResult } from '../../app/src/core/polygonService';
import { PolygonBudget, POLYGON_POLICY, signedRingArea } from '../../app/src/core/polygonGeometry';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { canonicalizeSvg } from '../../app/src/core/canonicalImport';
import { normalizeSvg } from '../../app/src/import/normalizeSvg';

const box=(x=0,y=0,w=10,h=10):FootprintMm=>[{outer:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],holes:[]}];
const value=<T>(r:PolygonResult<T>):T=>{
  expect(r.status,JSON.stringify(r)).toBe('ok');
  if(r.status!=='ok')throw new Error('Expected success');
  return r.value;
};
const service=createPolygonService(polygonClippingKernel);
const area=(f:FootprintMm)=>value(service.area(f));
const bounds=(f:FootprintMm)=>value(service.bounds(f));
const fail=(r:PolygonResult<unknown>,code='POLYGON_INVALID')=>{
  expect(r.status).toBe('rejected');expect(r).not.toHaveProperty('value');
  if(r.status==='rejected')expect(r.diagnostics[0].code).toBe(code);
};
const reverse=(r:RingMm)=>[...r].reverse() as unknown as RingMm;
const donut:FootprintMm=[{outer:box()[0].outer,holes:[[[2,2],[2,8],[8,8],[8,2]]]}];

describe('regularized Boolean service: independent analytic sets',()=>{
  test('overlaps and repeated identical objects contribute filled area once',()=>{
    const a=box(),b=box(5,0),c=box(15,0,5,10);
    const result=value(service.union([a,b,a,c]));
    expect(area(result)).toBe(200);expect(bounds(result)).toEqual([0,0,20,10]);
    expect(result).toHaveLength(1);expect(result[0].holes).toEqual([]);
    expect(result).toEqual(value(service.union([c,a,b])));
    expect(result[0].outer).toEqual([[0,0],[20,0],[20,10],[0,10]]);
  });
  test('nested holes and an island remain distinct filled regions',()=>{
    const island=box(4,4,2,2),result=value(service.union([donut,island]));
    expect(area(result)).toBe(68);expect(result).toHaveLength(2);
    expect(result.reduce((n,p)=>n+p.holes.length,0)).toBe(1);
    expect(area(value(service.intersection(result,box(3,3,4,4))))).toBe(4);
    expect(area(value(service.difference(box(),result)))).toBe(32);
  });
  test('difference creates a hole, a split creates islands, and holes can be filled',()=>{
    const result=value(service.difference(box(),box(2,2,6,6)));
    expect(result).toEqual(donut);expect(area(result)).toBe(64);
    const split=value(service.difference(box(),box(4,-1,2,12)));
    expect(area(split)).toBe(80);expect(split).toHaveLength(2);
    expect(value(service.union([result,box(2,2,6,6)]))).toEqual(box());
    expect(value(service.intersection(result,box(2,2,6,6)))).toEqual([]);
  });
  test('identical footprints and exact partial shared edges are supported',()=>{
    const a=box();
    expect(value(service.difference(a,a))).toEqual([]);
    expect(value(service.intersection(a,a))).toEqual(a);
    const b=box(10,2,4,6);
    expect(value(service.intersection(a,b))).toEqual([]);
    expect(value(service.difference(a,b))).toEqual(a);
    const joined=value(service.union([a,b]));
    expect(area(joined)).toBe(124);expect(joined).toHaveLength(1);
  });
  test('exact oblique partial shared segments support nested endpoints',()=>{
    const a:FootprintMm=[{outer:[[0,0],[10,0],[10,10]],holes:[]}];
    const b:FootprintMm=[{outer:[[2,2],[6,6],[2,6]],holes:[]}];
    expect(area(value(service.union([a,b])))).toBe(58);
    expect(area(value(service.difference(a,b)))).toBe(50);
    expect(value(service.intersection(a,b))).toEqual([]);
    expect(value(service.union([a,b]))).toHaveLength(1);
  });
  test('point/edge tangency intersection is empty; point-pinched union rejects',()=>{
    const a=box(),corner=box(10,10);
    expect(value(service.intersection(a,corner))).toEqual([]);
    expect(value(service.difference(a,corner))).toEqual(a);
    fail(service.union([a,corner]));
    // A hole tangent to the exterior cannot be represented as a strict hole.
    fail(service.difference(a,[{outer:[[5,0],[7,2],[5,4],[3,2]],holes:[]}]));
  });
  test('empty operands and empty metrics are distinct from rejected geometry',()=>{
    expect(value(service.union([]))).toEqual([]);
    expect(value(service.union([[],box(),[]]))).toEqual(box());
    expect(value(service.difference([],box()))).toEqual([]);
    expect(value(service.difference(box(),[]))).toEqual(box());
    expect(value(service.intersection([],box()))).toEqual([]);
    expect(value(service.intersection(box(),[]))).toEqual([]);
    expect(value(service.area([]))).toBe(0);expect(value(service.bounds([]))).toBeNull();
    expect(value(service.isEmpty([]))).toBe(true);expect(value(service.isEmpty(box()))).toBe(false);
    fail(service.isEmpty([{outer:[[0,0],[1,1],[2,2]],holes:[]}]));
  });
  test('ordinary oblique intersections snap rational vertices without changing topology',()=>{
    const a=box(0,0,4,4),b:FootprintMm=[{outer:[[0,-1],[5,2],[0,5]],holes:[]}];
    const intersection=value(service.intersection(a,b));
    expect(area(intersection)).toBeCloseTo(191/15,5);
    expect(intersection[0].outer).toContainEqual([1.666667,0]);
    expect(area(value(service.difference(a,b)))).toBeCloseTo(49/15,5);
    expect(area(value(service.union([a,b])))).toBeCloseTo(274/15,5);
    expect(intersection).toHaveLength(1);
  });
  test('a tiny but representable nonempty difference is never suppressed by area',()=>{
    const subject=box(0,0,1000,1000);
    const clip:FootprintMm=[{outer:[[-1,-1],[1001,-1],[1001,998.999996],[998.999996,1001],[-1,1001]],holes:[]}];
    const residual=value(service.difference(subject,clip));
    expect(residual).toHaveLength(1);expect(value(service.isEmpty(residual))).toBe(false);
    expect(area(residual)).toBeCloseTo(8e-12,19);
    expect(bounds(residual)).toEqual([999.999996,999.999996,1000,1000]);
  });
  test.each([.0000004,.0000000004])('near-tangent residual %s below the contact/grid policy rejects',delta=>{
    const corner=999-delta;
    const clip:FootprintMm=[{outer:[[-1,-1],[1001,-1],[1001,corner],[corner,1001],[-1,1001]],holes:[]}];
    fail(service.difference(box(0,0,1000,1000),clip));
  });
  test.each([-.0000015,-.0000005,.0000005,.0000015])('grid ties preserve absolute positions: %s',x=>{
    const snapped=Math.round(x/POLYGON_POLICY.snapMm)*POLYGON_POLICY.snapMm||0;
    const f=value(service.union([box(x,0,1,1)]));
    expect(bounds(f)?.[0]).toBe(snapped);expect(area(f)).toBeCloseTo(1,6);
  });
  test('large legal coordinates and small grid features retain relative XY',()=>{
    const large=value(service.union([box(999999,999999,1,1)]));
    expect(area(large)).toBe(1);expect(bounds(large)).toEqual([999999,999999,1000000,1000000]);
    const small=value(service.union([box(999999,999999,.000004,.000004)]));
    expect(Math.abs(area(small)-16e-12)).toBeLessThan(1e-15);
    fail(service.union([box(1000000,0,1,1)]));
  });
  test('winding/start/order normalize deterministically without mutation',()=>{
    const source:FootprintMm=[{outer:reverse(box()[0].outer),holes:[box(2,2,6,6)[0].outer]}];
    const snapshot=JSON.stringify(source);
    for(const p of source){Object.freeze(p.outer);Object.freeze(p.holes);Object.freeze(p);}
    Object.freeze(source);
    const result=value(service.union([source]));expect(result).toEqual(donut);
    expect(JSON.stringify(source)).toBe(snapshot);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(signedRingArea(result[0].outer)).toBeGreaterThan(0);
    expect(signedRingArea(result[0].holes[0])).toBeLessThan(0);
  });
});

const operations=['union','difference','intersection'] as const;
const call=(s:ReturnType<typeof createPolygonService>,operation:typeof operations[number])=>
  operation==='union'?s.union([box(),box(5,0)],{location:{scope:'layer',layerId:'test'}}):s[operation](box(),box(5,0),{location:{scope:'layer',layerId:'test'}});
describe('replaceable adapter and untrusted input/output boundary',()=>{
  test.each(operations)('%s catches kernel exceptions and preserves scoped diagnostics',operation=>{
    const s=createPolygonService({...polygonClippingKernel,[operation]:()=>{throw new Error('private adapter details');}});
    const result=call(s,operation);fail(result);
    if(result.status==='rejected'){
      expect(result.diagnostics[0].location).toEqual({scope:'layer',layerId:'test'});
      expect(result.diagnostics[0].message).toContain(operation);
      expect(result.diagnostics[0].message).not.toContain('private adapter details');
    }
  });
  const malformed:FootprintMm[]=[
    [{outer:[[0,0],[1,1],[2,2]],holes:[]}],
    [{outer:box()[0].outer,holes:[reverse(box(20,20,1,1)[0].outer)]}],
    [...box(),...box(5,0)], // overlapping regions
    [...box(),...box(10,10)], // point pinch
    [...box(),...box(10.000001,0)], // near inter-ring separation
    [{outer:box()[0].outer,holes:[reverse(box(2,2,6,6)[0].outer),reverse(box(3,3,1,1)[0].outer)]}],
    [{outer:[[0,0],[Infinity,0],[0,1]],holes:[]}],
    // Raw noncollinear corner straightens on the grid without an edge collapse.
    [{outer:[[0,0],[5,.0000004],[10,0],[10,10],[0,10]],holes:[]}],
    // Raw nonzero edge would collapse after rounding.
    [{outer:[[0,0],[10,0],[10,10],[9.9999996,10],[9,9],[0,10]],holes:[]}],
    [{outer:[[0,0],[5,.0000004],[10,.0000006],[10,10],[0,10]],holes:[]}], // reversed turn after snap
    [{outer:[[0,0],[.0000004,0],[0,.0000004]],holes:[]}], // nonempty subgrid result
  ];
  for(const operation of operations)test.each(malformed.map((f,i)=>({f,i})))('case $i rejects malformed output '+operation,({f})=>{
    fail(call(createPolygonService({...polygonClippingKernel,[operation]:()=>f}),operation));
  });
  test('replacement kernel uses only DTOs and no production library-specific calls',()=>{
    const union=vi.fn<PolygonKernel['union']>(()=>box(0,0,15,10));
    const difference=vi.fn<PolygonKernel['difference']>(()=>box(0,0,5,10));
    const intersection=vi.fn<PolygonKernel['intersection']>(()=>box(5,0,5,10));
    const s=createPolygonService({union,difference,intersection});
    expect(area(value(call(s,'union')))).toBe(150);
    expect(area(value(call(s,'difference')))).toBe(50);
    expect(area(value(call(s,'intersection')))).toBe(50);
    for(const fn of [union,difference,intersection])expect(fn).toHaveBeenCalledTimes(1);
  });
  test.each(operations)('%s rejects ambiguous unsnapped near gap/overlap for direct callers',operation=>{
    for(const offset of [9.9999996,10.0000004,10.0000019,9.9999999996,10.0000000004]){
      const s=service,a=box(),b=box(offset,0);
      fail(operation==='union'?s.union([a,b]):s[operation](a,b));
    }
  });
  test('clearly separated islands retain a gap after normalization',()=>{
    const result=value(service.union([box(),box(10.000003,0)]));
    expect(result).toHaveLength(2);expect(area(result)).toBeCloseTo(200,10);
  });
  test('strict hole relationships and simplicity are checked on inputs too',()=>{
    for(const f of malformed)fail(service.area(f));
    const spy=vi.fn(polygonClippingKernel.union);
    fail(createPolygonService({...polygonClippingKernel,union:spy}).union([malformed[1]]));
    expect(spy).not.toHaveBeenCalled();
  });
  test('vertex/comparison budgets reject with limit diagnostics, including a shared import budget',()=>{
    fail(service.union(Array.from({length:3001},()=>box())),'IMPORT_LIMIT_EXCEEDED');
    const budget=new PolygonBudget();for(let i=0;i<POLYGON_POLICY.maxSegmentChecks;i++)budget.check();
    fail(service.union([box()],{budget}),'IMPORT_LIMIT_EXCEEDED');
    const vertices=new PolygonBudget();for(let i=0;i<POLYGON_POLICY.maxDocumentVertices;i++)vertices.vertex();
    fail(service.area(box(),{budget:vertices}),'IMPORT_LIMIT_EXCEEDED');
  });
});

test.each([.0000004,.0000000004])('production raw source crossing %s rejects before snapping can hide it',delta=>{
  const corner=999-delta;
  const svgText=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="http://www.inkscape.org/namespaces/inkscape" width="1000mm" height="1000mm" viewBox="0 0 1000 1000"><g id="base" i:groupmode="layer" i:label="Base"><rect width="1000" height="1000"/><polygon id="clip" points="-1,-1 1001,-1 1001,${corner} ${corner},1001 -1,1001"/></g></svg>`;
  const src:SourceDocument={svgText,fileName:'near-crossing.svg',byteLength:new TextEncoder().encode(svgText).length,importId:'test'};
  const union=vi.fn(polygonClippingKernel.union);
  const result=canonicalizeSvg(src,normalizeSvg(svgText),{...polygonClippingKernel,union});
  expect(result.status).toBe('rejected');expect(union).not.toHaveBeenCalled();
  if(result.status==='rejected'){
    expect(result.diagnostics.at(-1)?.code).toBe('POLYGON_INVALID');
    expect(result.diagnostics.at(-1)?.location).toMatchObject({scope:'element',elementId:'clip'});
    expect(result.diagnostics.at(-1)?.message).toContain('crossing');
  }
});

test.each([40,1000])('production oblique source contact on %s mm page has explicit precision outcome',size=>{
  const svgText=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="http://www.inkscape.org/namespaces/inkscape" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}"><g i:groupmode="layer" i:label="Base" id="base"><polygon points="0,0 10,0 10,10"/><polygon points="2,2 6,6 2,6"/></g></svg>`;
  const src:SourceDocument={svgText,fileName:'oblique.svg',byteLength:new TextEncoder().encode(svgText).length,importId:'test'};
  const result=canonicalizeSvg(src,normalizeSvg(svgText),polygonClippingKernel);
  if(size===40){
    expect(result.status).toBe('imported');
    if(result.status==='imported')expect(result.coin.layers[0].areaMm2).toBe(58);
  }else{
    // Root unit conversion produces 1000.0000000000001 mm, then affine
    // subtraction makes source-collinear points noncollinear at machine ULP.
    // Preserve the conservative rejection rather than bridging a real sliver.
    expect(result.status).toBe('rejected');
    if(result.status==='rejected')expect(result.diagnostics.at(-1)?.code).toBe('POLYGON_INVALID');
  }
});

test('production import uses one common service union per layer and no interior duplicates',()=>{
  const svgText='<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="http://www.inkscape.org/namespaces/inkscape" width="40mm" height="40mm" viewBox="0 0 40 40"><g id="base" i:groupmode="layer" i:label="Base"><rect width="20" height="20"/><rect width="20" height="20"/></g><g id="art" i:groupmode="layer" i:label="Art"><rect width="10" height="10"/><rect x="5" width="10" height="10"/></g></svg>';
  const src:SourceDocument={svgText,fileName:'overlap.svg',byteLength:new TextEncoder().encode(svgText).length,importId:'test'};
  const union=vi.fn(polygonClippingKernel.union),kernel={...polygonClippingKernel,union};
  const result=canonicalizeSvg(src,normalizeSvg(svgText),kernel);
  expect(result.status).toBe('imported');expect(union).toHaveBeenCalledTimes(2);
  if(result.status==='imported'){
    expect(result.coin.layers.map(l=>l.areaMm2)).toEqual([400,150]);
    expect(result.coin.layers.map(l=>l.id)).toEqual(['source:base','source:art']);
    expect(result.coin.layers.map(l=>l.boundsMm)).toEqual([[0,20,20,40],[0,30,15,40]]);
    expect(result.coin.layers.every(l=>l.footprintMm.length===1 && !l.footprintMm[0].holes.length)).toBe(true);
  }
});
