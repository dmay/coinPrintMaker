import type { Bounds2Mm } from './contracts';
import { createDiagnostic } from './diagnostics';
import type { Diagnostic } from './diagnostics';
import type { ExtractedLayer, ExtractedShape, SvgExtractionResult } from './svgExtraction';
import { transformCurve } from './svgAffine';
import { curveBounds, unionBounds } from './svgCurveGeometry';
import type { SvgViewport } from './svgViewport';

export interface NormalizedShape extends ExtractedShape { readonly boundsMm: Bounds2Mm }
export interface NormalizedLayer extends ExtractedLayer {
  readonly shapes: readonly NormalizedShape[];
  readonly boundsMm: Bounds2Mm | null;
}
export type SvgNormalizationResult =
  | { readonly status: 'normalized'; readonly coordinateSpace: 'canonical-mm'; readonly physicalPageMm: readonly [number, number]; readonly sizeOrigin: 'explicit' | 'inferred'; readonly baseCandidateId: string; readonly layers: readonly NormalizedLayer[]; readonly boundsMm: Bounds2Mm; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] };

/** Root viewport and single Y inversion only: element transforms are already applied. */
export function normalizeSvgCoordinates(extraction: SvgExtractionResult, viewport: SvgViewport): SvgNormalizationResult {
  if (extraction.status === 'rejected') return extraction;
  const diagnostics = [...extraction.diagnostics];
  if (viewport.sizeOrigin === 'inferred') diagnostics.push(createDiagnostic('SOURCE_SIZE_INFERRED', { scope: 'document' }));
  const layers: NormalizedLayer[] = [];
  for (const layer of extraction.layers) {
    const shapes: NormalizedShape[] = [];
    for (const shape of layer.shapes) {
      try {
        const contours = shape.contours.map(contour => ({ ...contour, curves: contour.curves.map(curve => transformCurve(viewport.userToMm, curve)) }));
        const boundsMm = unionBounds(contours.flatMap(contour => contour.curves.map(curveBounds)));
        if (!boundsMm) throw new Error('Missing curve bounds.');
        shapes.push({ ...shape, contours, boundsMm });
      } catch {
        return { status: 'rejected', diagnostics: [...diagnostics, createDiagnostic('SVG_TRANSFORM_UNSUPPORTED', { scope: 'element', layerId: layer.id, elementId: shape.elementId, elementPath: shape.elementPath })] };
      }
    }
    layers.push({ ...layer, shapes, boundsMm: unionBounds(shapes.map(shape => shape.boundsMm)) });
  }
  const boundsMm = unionBounds(layers.flatMap(layer => layer.boundsMm ? [layer.boundsMm] : []));
  if (!boundsMm) return { status: 'rejected', diagnostics: [...diagnostics, createDiagnostic('BASE_EMPTY', { scope: 'document' })] };
  return { status: 'normalized', coordinateSpace: 'canonical-mm', physicalPageMm: viewport.physicalPageMm, sizeOrigin: viewport.sizeOrigin, baseCandidateId: extraction.baseCandidateId, layers, boundsMm, diagnostics };
}
