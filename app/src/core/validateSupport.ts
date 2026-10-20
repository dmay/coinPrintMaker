import type { CoinSettings, GenerationKey, ImportedCoin, SupportedStack, SupportValidation, UnsupportedRemainder } from './contracts';
import { createDiagnostic } from './diagnostics';
import type { Diagnostic } from './diagnostics';
import type { PolygonKernel } from './polygonKernel';
import { PolygonBudget } from './polygonGeometry';
import { createPolygonService } from './polygonService';
import { resolveStack } from './resolveStack';

/** Resolve current settings and validate planar support only. No meshes or export permission. */
export function validateSupport(coin: ImportedCoin, settings: CoinSettings, kernel: PolygonKernel): SupportValidation {
  const stack = resolveStack(coin, settings);
  if (stack.status === 'rejected') return { status: 'rejected', diagnostics: stack.diagnostics, unsupportedRemainders: [] };
  const service = createPolygonService(kernel);
  const budget = new PolygonBudget();
  const diagnostics: Diagnostic[] = [...stack.diagnostics];
  const unsupportedRemainders: UnsupportedRemainder[] = [];
  // Even a base-only stack must pass the checked polygon boundary. Do not trust
  // stack resolution's intentionally minimal finite-ring checks as topology proof.
  const base = stack.activeTiers[0];
  const baseCheck = service.isEmpty(base.footprintMm, { budget, location: { scope: 'layer', layerId: base.layerId, layerName: base.name } });
  if (baseCheck.status === 'rejected') diagnostics.push(...baseCheck.diagnostics);
  for (let index = 1; index < stack.activeTiers.length; index++) {
    const lower = stack.activeTiers[index - 1], upper = stack.activeTiers[index];
    const location = { scope: 'layer' as const, layerId: upper.layerId, layerName: upper.name };
    const difference = service.difference(upper.footprintMm, lower.footprintMm, { budget, location });
    if (difference.status === 'rejected') {
      diagnostics.push(...difference.diagnostics.map(diagnostic => ({ ...diagnostic,
        message: `${diagnostic.message} Support pair: ${upper.name} above ${lower.name}.` })));
      continue;
    }
    // The service has validated the complete result. Region presence is exact
    // emptiness for this regularized area set; never suppress residuals by area.
    if (difference.value.length === 0) continue;
    unsupportedRemainders.push({ upperLayerId: upper.layerId, lowerLayerId: lower.layerId, footprintMm: difference.value });
    const diagnostic = createDiagnostic('SUPPORT_OUTSIDE_LOWER', location);
    diagnostics.push({ ...diagnostic,
      message: `${diagnostic.message} ${upper.name} is not fully supported by ${lower.name}.`,
      remediation: `Move or resize ${upper.name}, extend the filled footprint of ${lower.name}, or change enabled layer order so the immediately lower tier supports all artwork, including holes and islands.` });
  }
  if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
    return { status: 'rejected', input: stack.input, diagnostics, unsupportedRemainders };
  }
  return { status: 'supported', input: stack.input, activeTiers: stack.activeTiers, totalHeightMm: stack.totalHeightMm,
    diagnostics, unsupportedRemainders: [] };
}

/** Freshness of already checked planar support, never mesh/export validity.
 * Callers must increment revision on every generation-affecting settings edit. */
export function isCurrentSupportedStack(result: SupportValidation | null, current: GenerationKey): result is SupportedStack {
  return result !== null && result.status === 'supported'
    && result.input.importId === current.importId && result.input.settingsRevision === current.settingsRevision
    && result.diagnostics.every(diagnostic => diagnostic.severity !== 'error');
}
