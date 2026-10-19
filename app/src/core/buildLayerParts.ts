import type { CoinSettings, GeneratedPart, GenerationKey, ImportedCoin, SupportedStack } from './contracts';
import type { Diagnostic } from './diagnostics';
import type { PolygonKernel } from './polygonKernel';
import type { TriangulationKernel } from './triangulationKernel';
import { MeshConstructionBudget } from './meshConstructionPolicy';
import { buildPartMesh } from './buildPartMesh';
import { validateSupport } from './validateSupport';

export type LayerPartsResult =
  | { readonly status: 'parts-built'; readonly input: GenerationKey; readonly activeTiers: SupportedStack['activeTiers']; readonly totalHeightMm: number; readonly parts: readonly GeneratedPart[]; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'rejected'; readonly input?: GenerationKey; readonly diagnostics: readonly Diagnostic[]; readonly parts?: never; readonly activeTiers?: never; readonly totalHeightMm?: never };

/** Rebuild current support first; no stale SupportedStack or render mesh input.
 * This stage does not create ValidGeneratedCoin or authorize export. */
export function buildLayerParts(coin: ImportedCoin,settings: CoinSettings,polygonKernel: PolygonKernel,triangulator: TriangulationKernel): LayerPartsResult {
  const support=validateSupport(coin,settings,polygonKernel);
  if(support.status==='rejected') return {status:'rejected',...(support.input?{input:support.input}:{}),diagnostics:support.diagnostics};
  const budget=new MeshConstructionBudget(),parts: GeneratedPart[]=[];
  for(const tier of support.activeTiers) {
    const result=buildPartMesh(tier,triangulator,{budget});
    if(result.status==='rejected') return {status:'rejected',input:support.input,diagnostics:[...support.diagnostics,...result.diagnostics]};
    parts.push(result.part);
  }
  return {status:'parts-built',input:support.input,activeTiers:support.activeTiers,totalHeightMm:support.totalHeightMm,parts,diagnostics:support.diagnostics};
}

export function isCurrentLayerParts(result: LayerPartsResult | null,current: GenerationKey): result is Extract<LayerPartsResult,{status:'parts-built'}> {
  return result?.status==='parts-built' && result.input.importId===current.importId && result.input.settingsRevision===current.settingsRevision && !result.diagnostics.some(d=>d.severity==='error');
}
