import { createDiagnostic } from '../core/diagnostics';
import { normalizeSvgCoordinates } from '../core/svgNormalization';
import type { SvgNormalizationResult } from '../core/svgNormalization';
import { resolveSvgViewport } from '../core/svgViewport';
import { parseSvgDocument } from './parseSvgDocument';
import { svgLoaderAdapter } from './svgLoaderAdapter';

/** Local detached adapter through exact canonical-mm curves; polygons remain DIG-16. */
export function normalizeSvg(svgText: string): SvgNormalizationResult {
  const extraction = svgLoaderAdapter(svgText);
  if (extraction.status === 'rejected') return extraction;
  const parsed = parseSvgDocument(svgText);
  if ('diagnostics' in parsed) return { status: 'rejected', diagnostics: parsed.diagnostics };
  const root = parsed.document.documentElement;
  try {
    return normalizeSvgCoordinates(extraction, resolveSvgViewport({ width: root.getAttribute('width'), height: root.getAttribute('height'), viewBox: root.getAttribute('viewBox'), preserveAspectRatio: root.getAttribute('preserveAspectRatio') }));
  } catch (error) {
    const diagnostic = createDiagnostic('PHYSICAL_SIZE_INVALID', { scope: 'document' });
    return { status: 'rejected', diagnostics: [...extraction.diagnostics, { ...diagnostic, message: diagnostic.message + ' ' + (error as Error).message }] };
  }
}
