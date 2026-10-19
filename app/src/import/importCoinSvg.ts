import type { SourceDocument } from '../core/contracts';
import { canonicalizeSvg } from '../core/canonicalImport';
import type { CoinImportResult } from '../core/canonicalImport';
import { normalizeSvg } from './normalizeSvg';
import { polygonClippingKernel } from './polygonClippingKernel';
import { readLocalSvg } from './readLocalSvg';

/** Full local import; no intermediate source or curve result can be committed. */
export function importCoinSvg(source: SourceDocument): CoinImportResult {
  return canonicalizeSvg(source,normalizeSvg(source.svgText),polygonClippingKernel);
}
export async function readLocalCoin(file: File): Promise<CoinImportResult> {
  const loaded=await readLocalSvg(file);
  return loaded.status==='rejected'?loaded:importCoinSvg(loaded.source);
}
