import type { CoinSettings, GenerationKey, ImportedCoin, SupportedStack, SupportValidation } from './contracts';
import type { Diagnostic } from './diagnostics';
import type { PolygonKernel } from './polygonKernel';
import { PolygonBudget } from './polygonGeometry';
import { createPolygonService } from './polygonService';
import { resolveStack } from './resolveStack';

/** Extend active artwork straight down through every lower tier, including the
 * base. Effective footprints are derived afresh; imported artwork is immutable.
 * This planar stage never authorizes mesh export. */
export function validateSupport(coin: ImportedCoin, settings: CoinSettings, kernel: PolygonKernel): SupportValidation {
  const stack = resolveStack(coin, settings);
  if (stack.status === 'rejected') return { status: 'rejected', diagnostics: stack.diagnostics, unsupportedRemainders: [] };
  const service = createPolygonService(kernel);
  const budget = new PolygonBudget();
  const diagnostics: Diagnostic[] = [...stack.diagnostics];
  const activeTiers = [...stack.activeTiers];
  const reject = (errors: readonly Diagnostic[]): SupportValidation => ({
    status: 'rejected', input: stack.input, diagnostics: [...diagnostics, ...errors], unsupportedRemainders: [],
  });
  // Even a base-only stack must pass the checked polygon boundary. Do not trust
  // stack resolution's intentionally minimal finite-ring checks as topology proof.
  const base = stack.activeTiers[0];
  const baseCheck = service.isEmpty(base.footprintMm, { budget, location: { scope: 'layer', layerId: base.layerId, layerName: base.name } });
  if (baseCheck.status === 'rejected') return reject(baseCheck.diagnostics);
  // Top-down propagation includes support added to intermediate tiers. A
  // bottom-up pass would miss upper artwork absent from multiple lower tiers.
  for (let index = activeTiers.length - 1; index > 0; index--) {
    const lower = activeTiers[index - 1], upper = activeTiers[index];
    const location = { scope: 'layer' as const, layerId: lower.layerId, layerName: lower.name };
    const difference = service.difference(upper.footprintMm, lower.footprintMm, { budget, location });
    if (difference.status === 'rejected') {
      return reject(difference.diagnostics.map(diagnostic => ({ ...diagnostic,
        message: `${diagnostic.message} Support pair: ${upper.name} above ${lower.name}.` })));
    }
    // Keep already-supported footprints intact, including their exact binary
    // coordinates. Never suppress a nonempty residual using an area allowance.
    if (difference.value.length === 0) continue;
    const extended = service.union([lower.footprintMm, upper.footprintMm], { budget, location });
    if (extended.status === 'rejected') return reject(extended.diagnostics);
    activeTiers[index - 1] = { ...lower, footprintMm: extended.value };
  }
  return { status: 'supported', input: stack.input, activeTiers, totalHeightMm: stack.totalHeightMm,
    diagnostics, unsupportedRemainders: [] };
}

/** Freshness of already checked planar support, never mesh/export validity.
 * Callers must increment revision on every generation-affecting settings edit. */
export function isCurrentSupportedStack(result: SupportValidation | null, current: GenerationKey): result is SupportedStack {
  return result !== null && result.status === 'supported'
    && result.input.importId === current.importId && result.input.settingsRevision === current.settingsRevision
    && result.diagnostics.every(diagnostic => diagnostic.severity !== 'error');
}
