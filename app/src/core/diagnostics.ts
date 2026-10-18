export const diagnosticCatalog = {
  MALFORMED_XML: ['error', 'The SVG XML is malformed.', 'Open and save a valid SVG in Inkscape.'],
  SVG_UNSUPPORTED: ['error', 'This SVG structure is unsupported.', 'Use named, non-nested Inkscape layers with closed filled artwork.'],
  IMPORT_LIMIT_EXCEEDED: ['error', 'The SVG exceeds an import complexity limit.', 'Simplify the artwork or split it into smaller files.'],
  LIVE_TEXT_UNSUPPORTED: ['error', 'Live text cannot become a printing layer.', 'Convert text to paths in Inkscape.'],
  STROKE_ONLY_UNSUPPORTED: ['error', 'Stroke-only artwork has no supported filled footprint.', 'Convert strokes to closed filled paths.'],
  OPEN_PATH_UNSUPPORTED: ['error', 'An artwork contour is open.', 'Close the path in Inkscape before importing.'],
  MASK_UNSUPPORTED: ['error', 'SVG masks are unsupported.', 'Replace the mask with explicit filled paths.'],
  CLIP_PATH_UNSUPPORTED: ['error', 'SVG clipping is unsupported.', 'Apply clipping as explicit filled paths.'],
  GRADIENT_UNSUPPORTED: ['error', 'Gradient artwork is unsupported.', 'Use a solid fill and set printing colors in CoinPrint.'],
  RASTER_IMAGE_UNSUPPORTED: ['error', 'Raster images cannot become printing layers.', 'Trace the image into closed filled paths.'],
  EXTERNAL_REFERENCE_UNSUPPORTED: ['error', 'SVG references are unsupported.', 'Replace references with local explicit paths.'],
  SCRIPT_UNSUPPORTED: ['error', 'SVG scripts are unsupported.', 'Remove scripts and import static artwork.'],
  SOURCE_SIZE_INFERRED: ['warning', 'Physical page size was inferred.', 'Set explicit page width and height in Inkscape to control physical size.'],
  PHYSICAL_SIZE_INVALID: ['error', 'Physical dimensions cannot be resolved.', 'Use a positive viewBox and supported absolute page dimensions.'],
  LAYER_ID_DUPLICATE: ['error', 'Source element IDs are duplicated.', 'Give source elements unique IDs in Inkscape.'],
  BASE_EMPTY: ['error', 'The base has no filled geometry.', 'Make the first Inkscape layer a nonempty coin base.'],
  BASE_DISCONNECTED: ['error', 'The base has disconnected regions.', 'Connect the base regions or create separate SVG files.'],
  SETTINGS_INVALID: ['error', 'Layer settings are invalid.', 'Keep the base enabled and first; use finite positive thicknesses.'],
  POLYGON_INVALID: ['error', 'Artwork could not be normalized safely.', 'Remove self-intersections and ambiguous or degenerate contours.'],
  SUPPORT_OUTSIDE_LOWER: ['error', 'Artwork extends outside the immediately lower active layer.', 'Resize or move the artwork, or adjust the lower layer to support it.'],
  MESH_INVALID: ['error', 'The generated mesh failed validation.', 'Correct the reported geometry before exporting.'],
  GEOMETRY_STALE: ['error', 'Geometry belongs to an earlier source or settings revision.', 'Regenerate the coin using the current source and settings.'],
} as const satisfies Record<string, readonly ['error' | 'warning', string, string]>;

export type DiagnosticCode = keyof typeof diagnosticCatalog;
export type DiagnosticLocation =
  | { readonly scope: 'document'; readonly line?: number; readonly column?: number }
  | { readonly scope: 'layer'; readonly layerId: string }
  | { readonly scope: 'element'; readonly layerId: string | null; readonly elementId: string | null; readonly elementPath: readonly number[] }
  | { readonly scope: 'mesh'; readonly layerId: string | null; readonly triangleIndex?: number };

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly location: DiagnosticLocation;
  readonly remediation: string;
}

export function createDiagnostic(code: DiagnosticCode, location: DiagnosticLocation): Diagnostic {
  const [severity, message, remediation] = diagnosticCatalog[code];
  return { code, severity, message, location, remediation };
}
