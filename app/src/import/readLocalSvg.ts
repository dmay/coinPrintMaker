import { createDiagnostic } from '../core/diagnostics';
import type { DiagnosticCode } from '../core/diagnostics';
import type { LocalSvgResult } from '../core/localImport';
import { LOCAL_SVG_LIMITS } from './parseSvgDocument';
import { preflightSvg } from './preflightSvg';
export { LOCAL_SVG_LIMITS } from './parseSvgDocument';

function reject(code: DiagnosticCode, detail?: string): LocalSvgResult {
  const diagnostic = createDiagnostic(code, { scope: 'document' });
  return { status: 'rejected', diagnostics: [detail ? { ...diagnostic, message: `${diagnostic.message} ${detail}` } : diagnostic] };
}

/** Reads only a user-selected local File; preflight must pass before replacement. */
export async function readLocalSvg(file: File): Promise<LocalSvgResult> {
  if (file.size === 0) return reject('SOURCE_EMPTY');
  if (file.size > LOCAL_SVG_LIMITS.sourceBytes) return reject('IMPORT_LIMIT_EXCEEDED', 'Source files may be at most 2 MiB (2,097,152 bytes).');
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); } catch { return reject('SOURCE_UNREADABLE'); }
  if (bytes.byteLength > LOCAL_SVG_LIMITS.sourceBytes) return reject('IMPORT_LIMIT_EXCEEDED', 'Source files may be at most 2 MiB (2,097,152 bytes).');
  let svgText: string;
  try { svgText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return reject('SOURCE_ENCODING_INVALID'); }
  if (!svgText.trim()) return reject('SOURCE_EMPTY');
  const encoding = /^<\?xml\s[^?]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(svgText)?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding)) return reject('SOURCE_ENCODING_INVALID');
  const preflight = preflightSvg(svgText);
  if (preflight.status === 'rejected') return preflight;
  return {
    status: 'loaded', diagnostics: preflight.diagnostics,
    source: { importId: crypto.randomUUID(), fileName: file.name, byteLength: bytes.byteLength, svgText },
  };
}
