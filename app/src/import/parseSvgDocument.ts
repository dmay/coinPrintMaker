import { createDiagnostic } from '../core/diagnostics';
import type { Diagnostic } from '../core/diagnostics';

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const LOCAL_SVG_LIMITS = {
  sourceBytes: 2 * 1024 * 1024,
  elements: 10_000,
  depth: 64,
  pathDataCharacters: 500_000,
} as const;

type ParsedSvg = { readonly document: Document } | { readonly diagnostics: readonly Diagnostic[] };
function reject(code: Parameters<typeof createDiagnostic>[0], detail = ''): ParsedSvg {
  const diagnostic = createDiagnostic(code, { scope: 'document' });
  return { diagnostics: [{ ...diagnostic, message: diagnostic.message + (detail ? ` ${detail}` : '') }] };
}

/** Internal, detached XML only. Never mount this document or resolve resources. */
export function parseSvgDocument(svgText: string): ParsedSvg {
  if (!svgText.trim()) return reject('SOURCE_EMPTY');
  if (svgText.length > LOCAL_SVG_LIMITS.sourceBytes || new TextEncoder().encode(svgText).byteLength > LOCAL_SVG_LIMITS.sourceBytes) {
    return reject('IMPORT_LIMIT_EXCEEDED', 'Source files may be at most 2 MiB (2,097,152 bytes).');
  }
  // Conservative even inside comments/CDATA; block before any entity processing.
  if (/<!DOCTYPE|<!ENTITY/i.test(svgText)) return reject('SOURCE_DOCTYPE_UNSUPPORTED');
  if (/<\?xml-stylesheet/i.test(svgText)) return reject('EXTERNAL_REFERENCE_UNSUPPORTED');
  let document: Document;
  try {
    document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  } catch {
    return reject('MALFORMED_XML');
  }
  const root = document.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) {
    // Firefox/jsdom use Mozilla's error namespace; Chrome uses XHTML. Inspect
    // only error documents, not authored parsererror nodes within a valid SVG.
    if (['http://www.mozilla.org/newlayout/xml/parsererror.xml', 'http://www.w3.org/1999/xhtml'].some(
      namespace => document.getElementsByTagNameNS(namespace, 'parsererror').length,
    )) return reject('MALFORMED_XML');
    return reject('SOURCE_NOT_SVG');
  }
  let elements = 0, depth = 1, pathDataCharacters = 0;
  let element: Element | null = root;
  while (element) {
    if (++elements > LOCAL_SVG_LIMITS.elements) return reject('IMPORT_LIMIT_EXCEEDED', 'Use at most 10,000 XML elements, including the SVG root.');
    if (depth > LOCAL_SVG_LIMITS.depth) return reject('IMPORT_LIMIT_EXCEEDED', 'Use at most 64 nested element levels, including the SVG root.');
    if (element.localName === 'path' && element.namespaceURI === SVG_NAMESPACE) {
      pathDataCharacters += (element.getAttribute('d') ?? '').length;
      if (pathDataCharacters > LOCAL_SVG_LIMITS.pathDataCharacters) return reject('IMPORT_LIMIT_EXCEEDED', 'Use at most 500,000 path-data characters across all paths.');
    }
    if (element.firstElementChild) { element = element.firstElementChild; depth++; continue; }
    while (element && element !== root && !element.nextElementSibling) { element = element.parentElement; depth--; }
    element = element === root ? null : element?.nextElementSibling ?? null;
  }
  return { document };
}
