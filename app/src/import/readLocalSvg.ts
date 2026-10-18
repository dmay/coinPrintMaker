import { createDiagnostic } from '../core/diagnostics';
import type { DiagnosticCode } from '../core/diagnostics';
import type { LocalSvgResult } from '../core/localImport';

// Provisional loading budgets, independent of later polygon/mesh budgets.
export const LOCAL_SVG_LIMITS = {
  sourceBytes: 2 * 1024 * 1024,
  elements: 10_000,
  depth: 64, // SVG root has depth 1.
  pathDataCharacters: 500_000, // Aggregate d attribute length.
} as const;

function reject(code: DiagnosticCode, detail?: string): LocalSvgResult {
  const diagnostic = createDiagnostic(code, { scope: 'document' });
  return { status: 'rejected', diagnostics: [
    detail ? { ...diagnostic, message: `${diagnostic.message} ${detail}` } : diagnostic,
  ] };
}

/** Reads only a user-selected local File. No markup is mounted and no resource is fetched. */
export async function readLocalSvg(file: File): Promise<LocalSvgResult> {
  if (file.size === 0) return reject('SOURCE_EMPTY');
  if (file.size > LOCAL_SVG_LIMITS.sourceBytes) {
    return reject('IMPORT_LIMIT_EXCEEDED', 'Source files may be at most 2 MiB (2,097,152 bytes).');
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return reject('SOURCE_UNREADABLE');
  }
  // Check actual bytes too, before decoding or parsing.
  if (bytes.byteLength > LOCAL_SVG_LIMITS.sourceBytes) {
    return reject('IMPORT_LIMIT_EXCEEDED', 'Source files may be at most 2 MiB (2,097,152 bytes).');
  }
  let svgText: string;
  try {
    svgText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return reject('SOURCE_ENCODING_INVALID');
  }
  if (!svgText.trim()) return reject('SOURCE_EMPTY');
  const encoding = /^<\?xml\s[^?]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(svgText)?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding)) return reject('SOURCE_ENCODING_INVALID');

  // Reject DTDs before parsing: loading never needs entity expansion/external subsets.
  // A matching string inside a comment is conservatively rejected as well.
  if (/<!DOCTYPE/i.test(svgText)) return reject('SOURCE_DOCTYPE_UNSUPPORTED');

  let document: Document;
  try {
    document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  } catch {
    return reject('MALFORMED_XML');
  }
  const root = document.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
    // Firefox/jsdom use Mozilla's error namespace; current Chrome uses XHTML.
    // Only inspect error documents, so authored SVG/foreign parsererror nodes
    // inside a valid SVG are not confused with parser-generated failures.
    const errorNamespaces = [
      'http://www.mozilla.org/newlayout/xml/parsererror.xml',
      'http://www.w3.org/1999/xhtml',
    ];
    if (errorNamespaces.some((namespace) => document.getElementsByTagNameNS(namespace, 'parsererror').length)) {
      return reject('MALFORMED_XML');
    }
    return reject('SOURCE_NOT_SVG');
  }

  // Iterative walk, with no recursive call stack or retained DOM in source data.
  let elements = 0;
  let depth = 1;
  let pathDataCharacters = 0;
  let element: Element | null = root;
  while (element) {
    elements++;
    if (elements > LOCAL_SVG_LIMITS.elements) {
      return reject('IMPORT_LIMIT_EXCEEDED', 'Use at most 10,000 XML elements, including the SVG root.');
    }
    if (depth > LOCAL_SVG_LIMITS.depth) {
      return reject('IMPORT_LIMIT_EXCEEDED', 'Use at most 64 nested element levels, including the SVG root.');
    }
    if (element.localName === 'path' && element.namespaceURI === root.namespaceURI) {
      pathDataCharacters += (element.getAttribute('d') ?? '').length;
      if (pathDataCharacters > LOCAL_SVG_LIMITS.pathDataCharacters) {
        return reject('IMPORT_LIMIT_EXCEEDED', 'Use at most 500,000 path-data characters across all paths.');
      }
    }
    if (element.firstElementChild) {
      element = element.firstElementChild;
      depth++;
      continue;
    }
    while (element && element !== root && !element.nextElementSibling) {
      element = element.parentElement;
      depth--;
    }
    element = element === root ? null : element?.nextElementSibling ?? null;
  }

  return {
    status: 'loaded',
    source: { importId: crypto.randomUUID(), fileName: file.name, byteLength: bytes.byteLength, svgText },
  };
}
