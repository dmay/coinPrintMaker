export const diagnosticCatalog = {
  SOURCE_EMPTY: ['error', 'The selected SVG file is empty.', 'Select a nonempty SVG saved from Inkscape.'],
  SOURCE_UNREADABLE: ['error', 'The selected file could not be read.', 'Check file access, download a local copy if needed, and select it again.'],
  SOURCE_ENCODING_INVALID: ['error', 'The SVG is not valid supported UTF-8 text.', 'Save the SVG with UTF-8 encoding in Inkscape and select it again.'],
  SOURCE_NOT_SVG: ['error', 'The selected content is not an SVG document.', 'Save or export a valid SVG in Inkscape, then select that file.'],
  SOURCE_DOCTYPE_UNSUPPORTED: ['error', 'SVG document type declarations are unsupported.', 'Save a plain SVG without a DOCTYPE or custom entities.'],
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
  FILTER_UNSUPPORTED: ['error', 'SVG filters are unsupported.', 'Remove filters and create the intended outline with closed filled paths.'],
  STROKE_UNSUPPORTED: ['error', 'A visible stroke changes the filled artwork outline.', 'Convert the stroke to a path and union it with the fill, or remove the stroke.'],
  PAINT_UNSUPPORTED: ['error', 'This paint is outside the supported solid-fill subset.', 'Use an opaque named color, #RGB, #RRGGBB or comma-separated rgb() fill; remove paint servers and alpha paints.'],
  CSS_UNSUPPORTED: ['error', 'This SVG uses unsupported CSS.', 'Remove stylesheets and effects; use simple inline or presentation fill, fill-rule, display and visibility values.'],
  OPACITY_UNSUPPORTED: ['error', 'Partially transparent artwork has no supported printing interpretation.', 'Use fully opaque fills, or hide the artwork with display:none or opacity:0.'],
  ANIMATION_UNSUPPORTED: ['error', 'Animated SVG content is unsupported.', 'Remove animations and save static artwork as closed filled paths.'],
  ARTWORK_IGNORED: ['warning', 'Nonprinting artwork is excluded from the filled footprint.', 'Show the artwork and use an opaque fill if it should contribute to the coin.'],
  PREFLIGHT_DIAGNOSTICS_TRUNCATED: ['warning', 'Additional preflight diagnostics were omitted.', 'Correct the listed issues and import again to see remaining diagnostics.'],
  SOURCE_SIZE_INFERRED: ['warning', 'Physical page size uses a 40 mm target width and the viewBox aspect ratio.', 'Set explicit page width and height in Inkscape to control physical size.'],
  SVG_TRANSFORM_UNSUPPORTED: ['error', 'SVG coordinates cannot be mapped safely.', 'Use finite nonsingular SVG transforms on groups/shapes; remove nested viewports and unsupported root mappings.'],
  PHYSICAL_SIZE_INVALID: ['error', 'Physical dimensions cannot be resolved.', 'Use a positive viewBox and supported absolute page dimensions.'],
  LAYER_ID_DUPLICATE: ['error', 'Source element IDs are duplicated.', 'Give source elements unique IDs in Inkscape.'],
  INKSCAPE_LAYERS_REQUIRED: ['error', 'Named Inkscape printing layers are required.', 'Create layers in Inkscape and give every printing layer a nonempty label.'],
  NESTED_LAYER_UNSUPPORTED: ['error', 'Nested Inkscape printing layers are unsupported.', 'Move printing layers to separate non-nested tiers; ordinary groups may remain nested.'],
  ARTWORK_OUTSIDE_LAYER: ['error', 'Filled artwork is outside a named Inkscape layer.', 'Move each printing shape into a named Inkscape layer.'],
  SVG_SHAPE_INVALID: ['error', 'A supported shape could not be extracted completely.', 'Correct malformed or empty shape data in Inkscape and save the SVG again.'],
  SVG_LOADER_MAPPING_INVALID: ['error', 'The SVG loader could not account for every source shape.', 'Simplify the artwork and report this file as an importer compatibility issue.'],
  BASE_EMPTY: ['error', 'The base has no filled geometry.', 'Make the first Inkscape layer a nonempty coin base.'],
  LAYER_EMPTY: ['error', 'A printing layer has no filled geometry.', 'Add visible filled artwork to this layer, or remove the empty layer in Inkscape. Hidden artwork remains excluded.'],
  BASE_DISCONNECTED: ['error', 'The base has disconnected regions.', 'Connect the base regions or create separate SVG files.'],
  SETTINGS_INVALID: ['error', 'Layer settings are invalid.', 'Match every source layer exactly once; keep the original base first and enabled, positive finite thicknesses, and opaque #RRGGBB colors.'],
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
