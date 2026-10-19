import { describe, expect, test, vi } from 'vitest';
import './setup';
import type { FootprintMm, ImportedCoin, SourceDocument } from '../../app/src/core/contracts';
import type { SvgCurve } from '../../app/src/core/svgExtraction';
import { importCoinSvg, readLocalCoin } from '../../app/src/import/importCoinSvg';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { canonicalizeSvg } from '../../app/src/core/canonicalImport';
import { normalizeSvg } from '../../app/src/import/normalizeSvg';
import { flattenCurves } from '../../app/src/core/flattenSvg';
import { curvePoint } from '../../app/src/core/svgCurveGeometry';
import { canonicalFootprint, PolygonBudget, POLYGON_POLICY, segmentDistance, signedRingArea } from '../../app/src/core/polygonGeometry';
import { coinImportReducer, initialCoinImportState } from '../../app/src/core/coinImportState';
import { expectedBoundsYUp, loadFixtures, near, tolerance } from './helpers/fixtures';

const ink='http://www.inkscape.org/namespaces/inkscape';
const layer=(body:string,id='base')=>`<g i:groupmode="layer" i:label="${id}" id="${id}">${body}</g>`;
const wrap=(body:string,attributes='width="40mm" height="40mm" viewBox="0 0 40 40"')=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="${ink}" ${attributes}>${body}</svg>`;
const rect='<rect width="30" height="30"/>';
const source=(svgText:string,name='coin.svg'):SourceDocument=>({svgText,fileName:name,byteLength:new TextEncoder().encode(svgText).length,importId:name});
function accept(text:string):ImportedCoin {
  const result=importCoinSvg(source(text));
  expect(result.status,JSON.stringify(result.diagnostics)).toBe('imported');
  if(result.status!=='imported')throw new Error('Expected canonical import');
  return result.coin;
}
function reject(text:string,code='POLYGON_INVALID') {
  const result=importCoinSvg(source(text));
  expect(result.status).toBe('rejected');expect(result).not.toHaveProperty('coin');
  expect(result.diagnostics.some(d=>d.code===code)).toBe(true);
  return result;
}
const fixtures=await loadFixtures();
describe('production importer: independent authored golden oracles',()=>{
  test.each(fixtures)('$name',fixture=>{
    if(fixture.expected.importOutcome==='reject'){
      const result=reject(fixture.svg,fixture.expected.expectedDiagnostics[0]);
      expect(result.diagnostics.some(d=>fixture.expected.expectedDiagnostics.includes(d.code))).toBe(true);return;
    }
    const coin=accept(fixture.svg);
    expect(coin.physicalPageMm).toEqual(fixture.expected.physicalPageMm);
    expect(coin.layers).toHaveLength(fixture.expected.layers.length);
    for(const [i,expected] of fixture.expected.layers.entries()){
      const actual=coin.layers[i];
      expect(actual).toMatchObject({id:'source:'+expected.id,name:expected.name,sourceOrder:expected.order});
      actual.boundsMm.forEach((v,j)=>near(v,expectedBoundsYUp(expected.boundsMm,coin.physicalPageMm[1])[j],tolerance.coordinateMm));
      near(actual.areaMm2,expected.areaMm2,Math.max(tolerance.areaAbsoluteMm2,expected.areaMm2*tolerance.areaRelative));
      expect(actual.footprintMm).toHaveLength(expected.regions);
      expect(actual.footprintMm.reduce((sum,p)=>sum+p.holes.length,0)).toBe(expected.holes);
      for(const p of actual.footprintMm)for(const [j,ring] of [p.outer,...p.holes].entries()){
        expect(ring[0]).not.toEqual(ring.at(-1));expect(signedRingArea(ring)>0).toBe(j===0);
      }
    }
    expect(JSON.parse(JSON.stringify(coin))).toEqual(coin);
    expect(accept(fixture.svg)).toEqual(coin);
  });
});
const square=(a:number,b:number,c:number,d:number,reverse=false)=>reverse?`M${a} ${b}V${d}H${c}V${b}Z`:`M${a} ${b}H${c}V${d}H${a}Z`;
describe('explicit fill interpretation and canonical topology',()=>{
  test.each([
    ['nonzero',false,900,0,1],['nonzero',true,500,1,1],
    ['evenodd',false,500,1,1],['evenodd',true,500,1,1],
  ] as const)('%s nested reversed=%s',(rule,reverse,area,holes,regions)=>{
    const coin=accept(wrap(layer(rect)+layer(`<path fill-rule="${rule}" d="${square(0,0,30,30)} ${square(5,5,25,25,reverse)}"/>`,'art')));
    const l=coin.layers[1];expect(l.areaMm2).toBe(area);expect(l.footprintMm).toHaveLength(regions);expect(l.footprintMm[0].holes).toHaveLength(holes);
  });
  test.each(['nonzero','evenodd'] as const)('%s hole with nested island and disjoint island',rule=>{
    const text=wrap(layer(rect)+layer(`<path fill-rule="${rule}" d="${square(0,0,20,20)} ${square(2,2,18,18,true)} ${square(5,5,10,10)} ${square(25,25,28,28)}"/>`,'art'));
    const l=accept(text).layers[1];expect(l.areaMm2).toBe(178);expect(l.footprintMm).toHaveLength(3);expect(l.footprintMm.reduce((s,p)=>s+p.holes.length,0)).toBe(1);
  });
  test('winding magnitudes, reordered contours and reflection preserve filled semantics',()=>{
    const d=`${square(2,2,18,18)} ${square(4,4,16,16,true)} ${square(0,0,20,20)}`;
    const l=accept(wrap(layer(`<path d="${d}" transform="translate(20 0) scale(-1 1)"/>`))).layers[0];
    expect(l.areaMm2).toBe(400);expect(l.footprintMm[0].holes).toHaveLength(0);
  });
  test('overlapping separate objects union once and shared edges are supported',()=>{
    const a='<rect width="10" height="10"/>',b='<rect x="5" width="10" height="10"/>',c='<rect x="15" width="5" height="10"/>';
    const l=accept(wrap(layer(a+b+c))).layers[0];expect(l.areaMm2).toBe(200);expect(l.boundsMm).toEqual([0,30,20,40]);
    expect(accept(wrap(layer(c+b+a))).layers[0].footprintMm).toEqual(l.footprintMm);
  });
  test.each([
    'M0 0L10 10L0 10L10 0Z', // bow tie
    'M0 0H10V10H5V0H0Z', // repeated contact
    'M0 0H10H5V10H0Z', // adjacent backtrack
    `${square(0,0,10,10)} ${square(5,5,15,15)}`, // crossing compound
    `${square(0,0,10,10)} ${square(0,2,5,5,true)}`, // touching compound
    `${square(0,0,10,10)} ${square(.000001,2,5,5,true)}`, // ambiguous near contact
    'M0 0L.0000001 0L0 .0000001Z', // collapse
  ])('rejects ambiguous contour %s',d=>{
    const result=reject(wrap(layer(`<path id="bad" d="${d}"/>`)));
    expect(result.diagnostics.at(-1)?.location).toMatchObject({scope:'element',layerId:'source:base',elementId:'bad'});
  });
  test('snap cannot bridge a gap between objects or erase a tiny contour edge',()=>{
    reject(wrap(layer('<rect width="5" height="5"/><rect x="5.0000004" width="5" height="5"/>')));
    reject(wrap(layer('<path d="M0 0H10V10H9.9999996V5H0Z"/>')));
  });
  test('a single failed object rejects the entire candidate, never drops artwork',()=>reject(wrap(layer(rect+'<path d="M0 0L1 1L2 2Z"/>'))));
  test('point-touching separate regions and disconnected base reject',()=>{
    reject(wrap(layer('<rect width="5" height="5"/><rect x="5" y="5" width="5" height="5"/>')));
    reject(wrap(layer('<rect width="5" height="5"/><rect x="10" width="5" height="5"/>')),'BASE_DISCONNECTED');
  });
  test('empty/hidden nonbase layers preserve identity in an explicit rejection',()=>{
    for(const body of ['', '<circle display="none" r="3"/>']){
      const result=reject(wrap(layer(rect)+layer(body,'empty')),'LAYER_EMPTY');
      expect(result.diagnostics.at(-1)?.location).toEqual({scope:'layer',layerId:'source:empty'});
      if(body)expect(result.diagnostics.some(d=>d.code==='ARTWORK_IGNORED')).toBe(true);
    }
  });
  test('kernel exceptions, malformed output, collapsed output and overlapping regions fail closed',()=>{
    const src=source(wrap(layer(rect))),n=normalizeSvg(src.svgText);
    const outputs:FootprintMm[]=[[],[{outer:[[0,0],[1,1],[2,2]],holes:[]}],[{outer:[[0,0],[10,0],[10,10],[0,10]],holes:[[[20,20],[21,20],[20,21]]]}]];
    for(const out of outputs){const result=canonicalizeSvg(src,n,{...polygonClippingKernel,union:()=>out});expect(result.status).toBe('rejected');expect(result).not.toHaveProperty('coin');}
    const result=canonicalizeSvg(src,n,{...polygonClippingKernel,union:()=>{throw new Error('kernel failure');}});expect(result.status).toBe('rejected');expect(result.diagnostics.at(-1)?.code).toBe('POLYGON_INVALID');
  });
});
describe('physical approximation and bounded work',()=>{
  test.each([
    {kind:'quadratic',from:[0,0],control:[10,20],to:[20,0]},
    {kind:'cubic',from:[0,0],control1:[30,0],control2:[-10,20],to:[20,10]},
    {kind:'ellipse',center:[10,10],axisX:[-9,3],axisY:[6,4],startAngle:.5,endAngle:5.5,clockwise:false},
    {kind:'ellipse',center:[10,10],axisX:[-9,3],axisY:[6,4],startAngle:.5,endAngle:5.5,clockwise:true},
  ] as SvgCurve[])('dense independent nearest-segment oracle: $kind',curve=>{
    const points=flattenCurves([curve],new PolygonBudget());
    for(let i=0;i<=2000;i++){
      const p=curvePoint(curve,i/2000);let distance=Infinity;
      for(let j=1;j<points.length;j++)distance=Math.min(distance,segmentDistance(p,points[j-1],points[j]));
      expect(distance).toBeLessThanOrEqual(POLYGON_POLICY.chordErrorMm+1e-10);
    }
  });
  test.each(['rx="8"','ry="8"','rx="100" ry="100"','rx="0" ry="8"','rx="8" ry="0"'])('exact rounded rectangle defaults/clamps/zero axes %s',attrs=>{
    const l=accept(wrap(layer(`<rect width="20" height="10" ${attrs}/>`))).layers[0];
    const zero=attrs.includes('="0"'),rx=10,ry=5;
    const a=attrs==='rx="100" ry="100"'?200-(4-Math.PI)*rx*ry:200-(4-Math.PI)*8*5;
    near(l.areaMm2,zero?200:a,.15);expect(l.boundsMm).toEqual([0,30,20,40]);
  });
  test('affine rounded corners preserve ellipse area and physical bounds',()=>{
    const l=accept(wrap(layer('<rect width="20" height="10" rx="4" ry="2" transform="matrix(-2 1 3 2 5 6)"/>'))).layers[0];
    near(l.areaMm2,(200-(4-Math.PI)*8)*7,.3);
    const normalized=normalizeSvg(wrap(layer('<rect width="20" height="10" rx="4" ry="2" transform="matrix(-2 1 3 2 5 6)"/>')));
    if(normalized.status!=='normalized')throw new Error('Expected normalization');
    l.boundsMm.forEach((v,i)=>near(v,normalized.boundsMm[i],.006));
    expect(normalized.layers[0].shapes[0].contours[0].curves.filter(c=>c.kind==='ellipse')).toHaveLength(4);
  });
  test('huge ellipses, out-of-range coordinates, comparison and output caps reject promptly',()=>{
    reject(wrap(layer('<circle r="1000000"/>')),'IMPORT_LIMIT_EXCEEDED');
    reject(wrap(layer('<rect x="1000001" width="1" height="1"/>')));
    const budget=new PolygonBudget();for(let i=0;i<POLYGON_POLICY.maxDocumentVertices;i++)budget.vertex();expect(()=>budget.vertex()).toThrow('vertex limit');
    const checks=new PolygonBudget();for(let i=0;i<POLYGON_POLICY.maxSegmentChecks;i++)checks.check();expect(()=>checks.check()).toThrow('comparison limit');
    const ring=Array.from({length:POLYGON_POLICY.maxRingVertices+2},(_,i)=>[i,0] as const);
    expect(()=>canonicalFootprint([{outer:ring as never,holes:[]}],new PolygonBudget())).toThrow('Ring vertex limit');
  });
  test('snap is deterministic and bounded; no recentering or silent repair',()=>{
    const l=accept(wrap(layer('<rect x="1.12345678" y="2.12345678" width="10" height="5"/>'))).layers[0];
    expect(l.boundsMm).toEqual([1.123457,32.876543,11.123457,37.876543]);
  });
});
describe('complete canonical transaction',()=>{
  test('readLocalCoin creates a new complete identity on same-file reload',async()=>{
    const file=new File([wrap(layer(rect))],'same.svg');
    const a=await readLocalCoin(file),b=await readLocalCoin(file);
    expect(a.status).toBe('imported');expect(b.status).toBe('imported');
    if(a.status==='imported'&&b.status==='imported')expect(a.coin.source.importId).not.toBe(b.coin.source.importId);
  });
  test('every import-stage failure retains the exact previous coin and newest selection wins',()=>{
    const coin=accept(wrap(layer(rect))),ok={status:'imported',coin,diagnostics:[]} as const;
    const start=(requestId:number)=>({type:'start',requestId,fileName:String(requestId)} as const);
    const finish=(requestId:number,result:ReturnType<typeof importCoinSvg>)=>({type:'finish',requestId,result} as const);
    let state=coinImportReducer(coinImportReducer(initialCoinImportState,start(1)),finish(1,ok));
    for(const text of [wrap('<script/>'),wrap(rect),wrap(layer('<rect width="1" height="1" transform="scale(0)"/>')),wrap(layer('<path d="M0 0L1 1L2 2Z"/>'))]){
      state=coinImportReducer(state,start(state.requestId+1));state=coinImportReducer(state,finish(state.requestId,importCoinSvg(source(text))));expect(state.coin).toBe(coin);
    }
    state=coinImportReducer(state,start(10));state=coinImportReducer(state,start(11));
    const newer=coinImportReducer(state,finish(11,importCoinSvg(source(wrap(layer('<path d="M0 0L1 1L2 2Z"/>'))))));
    expect(coinImportReducer(newer,finish(10,ok))).toBe(newer);expect(newer.coin).toBe(coin);
    expect(coinImportReducer(newer,finish(11,ok))).toBe(newer);
  });
  test('files remain local and source markup stays detached',()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected network'));
    accept(wrap(layer(rect)));reject(wrap(layer(rect)+'<image href="https://invalid.example/probe"/>'),'EXTERNAL_REFERENCE_UNSUPPORTED');
    expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
});
