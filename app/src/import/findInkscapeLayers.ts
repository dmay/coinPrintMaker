import { createDiagnostic } from '../core/diagnostics';
import type { Diagnostic } from '../core/diagnostics';
import type { ExtractedLayer } from '../core/svgExtraction';
import { elementEntries, elementLocation, INKSCAPE_NAMESPACE, isInkscapeLayer, sourceIdentity } from './svgElements';

type LayerDiscovery = { readonly status: 'found'; readonly layers: readonly ExtractedLayer[] } | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] };
/** Internal detached DOM input; public result contains only source metadata. */
export function findInkscapeLayers(root: Element): LayerDiscovery {
  const layers: ExtractedLayer[] = [], diagnostics: Diagnostic[] = [], ids = new Set<string>();
  for (const { element, path, inert } of elementEntries(root)) {
    const elementId = element.getAttribute('id'), location = elementLocation(element, path);
    if (elementId) {
      if (ids.has(elementId)) diagnostics.push(createDiagnostic('LAYER_ID_DUPLICATE', location));
      ids.add(elementId);
    }
    if (inert || !isInkscapeLayer(element)) continue;
    const name = element.getAttributeNS(INKSCAPE_NAMESPACE, 'label');
    if (!name?.trim()) diagnostics.push(createDiagnostic('INKSCAPE_LAYERS_REQUIRED', location));
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (isInkscapeLayer(parent)) { diagnostics.push(createDiagnostic('NESTED_LAYER_UNSUPPORTED', location)); break; }
    }
    layers.push({ id: sourceIdentity(element, path), name: name ?? '', sourceOrder: layers.length, elementId, elementPath: path });
  }
  if (!layers.length) diagnostics.push(createDiagnostic('INKSCAPE_LAYERS_REQUIRED', { scope: 'document' }));
  return diagnostics.length ? { status: 'rejected', diagnostics } : { status: 'found', layers };
}
