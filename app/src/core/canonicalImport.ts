import type { FootprintMm, ImportedCoin, ImportedLayer, Point2Mm, RingMm, SourceDocument } from './contracts';
import { createDiagnostic } from './diagnostics';
import type { Diagnostic, DiagnosticCode, DiagnosticLocation } from './diagnostics';
import type { SvgNormalizationResult } from './svgNormalization';
import type { PolygonKernel } from './polygonKernel';
import { createPolygonService } from './polygonService';
import { flattenCurves } from './flattenSvg';
import { assertNoNearObjectContact, assertSeparate, canonicalRing, footprintMetrics, inside, normalizeRing, PolygonBudget, PolygonFailure, signedRingArea } from './polygonGeometry';

export type CoinImportResult =
  | { readonly status: 'imported'; readonly coin: ImportedCoin; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] };

function filledContours(rings: readonly RingMm[], rule: 'evenodd' | 'nonzero', budget: PolygonBudget): FootprintMm {
  for (let i=0;i<rings.length;i++) for (let j=i+1;j<rings.length;j++) assertSeparate(rings[i],rings[j],budget);
  const parents = rings.map((ring,i) => {
    let parent = -1;
    for (let j=0;j<rings.length;j++) if (i!==j && inside(ring[0],rings[j],budget) && (parent<0 || Math.abs(signedRingArea(rings[j]))<Math.abs(signedRingArea(rings[parent])))) parent=j;
    return parent;
  });
  const winding = rings.map((ring,i) => {
    let value = Math.sign(signedRingArea(ring)), depth=1;
    for (let p=parents[i];p>=0;p=parents[p]) { budget.check(); value+=Math.sign(signedRingArea(rings[p])); depth++; }
    return rule==='evenodd' ? depth%2 : value;
  });
  const polygons: {outer:RingMm;holes:RingMm[]}[] = [];
  const outerByIndex = new Map<number,number>();
  for (let i=0;i<rings.length;i++) if (winding[i]!==0 && (parents[i]<0 || winding[parents[i]]===0)) {
    outerByIndex.set(i,polygons.length); polygons.push({outer:canonicalRing(rings[i],true),holes:[]});
  }
  for (let i=0;i<rings.length;i++) if (winding[i]===0 && parents[i]>=0 && winding[parents[i]]!==0) {
    let p=parents[i]; while (!outerByIndex.has(p)) { budget.check(); p=parents[p]; }
    polygons[outerByIndex.get(p)!].holes.push(canonicalRing(rings[i],false));
  }
  return polygons;
}
/** Pure candidate construction: no source/settings mutation, UI, DOM or Three. */
export function canonicalizeSvg(source: SourceDocument, normalized: SvgNormalizationResult, kernel: PolygonKernel): CoinImportResult {
  if (normalized.status==='rejected') return normalized;
  const diagnostics = [...normalized.diagnostics], layers: ImportedLayer[] = [], budget = new PolygonBudget();
  let location: DiagnosticLocation = {scope:'document'};
  const reject = (code: DiagnosticCode, detail=''): CoinImportResult => {
    const d=createDiagnostic(code,location);
    return {status:'rejected',diagnostics:[...diagnostics,{...d,message:d.message+(detail?' '+detail:'')}]};
  };
  try {
    for (const layer of normalized.layers) {
      location={scope:'layer',layerId:layer.id,layerName:layer.name};
      if (!layer.shapes.length) return reject(layer.id===normalized.baseCandidateId?'BASE_EMPTY':'LAYER_EMPTY');
      const shapes: FootprintMm[] = [];
      const previousShapes: (readonly Point2Mm[])[][] = [];
      for (const shape of layer.shapes) {
        location={scope:'element',layerId:layer.id,layerName:layer.name,elementId:shape.elementId,elementLabel:shape.elementLabel,elementPath:shape.elementPath};
        const raw=shape.contours.map(c => flattenCurves(c.curves,budget));
        const rings=raw.map(points => normalizeRing(points,budget));
        for (const previous of previousShapes) for (const a of previous) for (const b of raw) assertNoNearObjectContact(a,b,budget);
        previousShapes.push(raw);
        if (!rings.length) throw new PolygonFailure('Source shape has no contours.');
        // Nonzero contours with one winding sign describe a union of filled
        // regions, even where contours overlap. Keep them as separate Boolean
        // operands so the kernel resolves crossings without inventing holes.
        if (shape.fillRule==='nonzero' && rings.every(r=>Math.sign(signedRingArea(r))===Math.sign(signedRingArea(rings[0])))) {
          for (let i=0;i<raw.length;i++) for (let j=i+1;j<raw.length;j++) assertNoNearObjectContact(raw[i],raw[j],budget);
          shapes.push(...rings.map(r=>[{outer:canonicalRing(r,true),holes:[]}]));
          continue;
        }
        const filled=filledContours(rings,shape.fillRule,budget);
        if (!filled.length) throw new PolygonFailure('Source shape has no filled region.');
        shapes.push(filled);
      }
      location={scope:'layer',layerId:layer.id,layerName:layer.name};
      const union=createPolygonService(kernel).union(shapes,{budget,location});
      if(union.status==='rejected') return {status:'rejected',diagnostics:[...diagnostics,...union.diagnostics]};
      const footprintMm=union.value;
      if (!footprintMm.length) return reject(layer.id===normalized.baseCandidateId?'BASE_EMPTY':'LAYER_EMPTY');
      if (layer.id===normalized.baseCandidateId && footprintMm.length!==1) return reject('BASE_DISCONNECTED');
      layers.push({id:layer.id,name:layer.name,sourceOrder:layer.sourceOrder,sourceElements:layer.shapes.map(s=>({elementId:s.elementId,...(s.elementLabel ? {elementLabel:s.elementLabel} : {}),elementPath:s.elementPath})),footprintMm,...footprintMetrics(footprintMm)});
    }
    if (!layers.length || layers[0].id!==normalized.baseCandidateId) return reject('BASE_EMPTY');
    const coin: ImportedCoin={schemaVersion:1,source,physicalPageMm:normalized.physicalPageMm,sizeOrigin:normalized.sizeOrigin,baseLayerId:normalized.baseCandidateId,layers,diagnostics};
    return {status:'imported',coin,diagnostics};
  } catch (error) {
    return reject(error instanceof PolygonFailure && error.limit?'IMPORT_LIMIT_EXCEEDED':'POLYGON_INVALID',error instanceof PolygonFailure?error.message:'Polygon union failed. Simplify the artwork or report this file as a kernel compatibility issue.');
  }
}
