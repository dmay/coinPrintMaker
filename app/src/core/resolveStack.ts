import type { ActiveTier, CoinSettings, CoinSettingsResult, ImportedCoin, PolygonMm, RingMm, StackResolution } from './contracts';
import { createDiagnostic } from './diagnostics';
import type { Diagnostic, DiagnosticCode, DiagnosticLocation } from './diagnostics';

export const DEFAULT_BASE_THICKNESS_MM = 1.6;
export const DEFAULT_ARTWORK_THICKNESS_MM = 0.4;
// Neutral display intent only; independent of source SVG paint and filament.
export const DEFAULT_LAYER_COLOR = '#808080';

function failure(detail: string, layerId?: string, code: DiagnosticCode = 'SETTINGS_INVALID'): Diagnostic {
  const location: DiagnosticLocation = layerId === undefined ? { scope: 'document' } : { scope: 'layer', layerId };
  const diagnostic = createDiagnostic(code, location);
  return { ...diagnostic, message: `${diagnostic.message} ${detail}` };
}
const nonemptyId = (value: string): boolean => typeof value === 'string' && value.trim().length > 0;
const finiteRing = (ring: RingMm): boolean => Array.isArray(ring) && ring.length >= 3
  && ring.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));

// ImportedCoin is a canonical importer DTO, not arbitrary JSON. Check the source
// invariants needed by stacking, without a second polygon kernel/topology policy.
function sourceFailure(coin: ImportedCoin): Diagnostic | undefined {
  if (!nonemptyId(coin.source.importId)) return failure('The source import identity is empty.');
  if (!Array.isArray(coin.layers) || !coin.layers.length) return failure('The imported layer list is empty.');
  const ids = new Set<string>();
  for (const layer of coin.layers) {
    if (!layer || !nonemptyId(layer.id) || ids.has(layer.id)) return failure('Imported layer identities must be nonempty and unique.');
    ids.add(layer.id);
    if (!Array.isArray(layer.footprintMm) || !layer.footprintMm.length) {
      return failure('Every imported printing layer needs a footprint, even when disabled.', layer.id, layer.id === coin.baseLayerId ? 'BASE_EMPTY' : 'LAYER_EMPTY');
    }
    if (!layer.footprintMm.every((polygon: PolygonMm) => polygon && finiteRing(polygon.outer)
      && Array.isArray(polygon.holes) && polygon.holes.every(finiteRing))) {
      return failure('A footprint contains missing or nonfinite ring data; import the source again.', layer.id, 'POLYGON_INVALID');
    }
  }
  if (coin.layers[0].id !== coin.baseLayerId) return failure('The original base must remain the first imported layer.');
  if (coin.layers[0].footprintMm.length !== 1) return failure('The base must retain one connected region.', coin.baseLayerId, 'BASE_DISCONNECTED');
  return undefined;
}

function sourceDiagnostics(coin: ImportedCoin): readonly Diagnostic[] {
  if (coin.diagnostics.some(diagnostic => diagnostic.severity === 'error')) return coin.diagnostics;
  const error = sourceFailure(coin);
  return error ? [...coin.diagnostics, error] : coin.diagnostics;
}

/** Initialize separate editable settings; never add settings to imported source. */
export function createDefaultCoinSettings(coin: ImportedCoin): CoinSettingsResult {
  const diagnostics = sourceDiagnostics(coin);
  if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) return { status: 'rejected', diagnostics };
  const settings: CoinSettings = {
    importId: coin.source.importId,
    revision: 0,
    layers: [
      { layerId: coin.baseLayerId, role: 'base', enabled: true, thicknessMm: DEFAULT_BASE_THICKNESS_MM, color: DEFAULT_LAYER_COLOR },
      ...coin.layers.slice(1).map(layer => ({ layerId: layer.id, role: 'artwork' as const, enabled: true, thicknessMm: DEFAULT_ARTWORK_THICKNESS_MM, color: DEFAULT_LAYER_COLOR })),
    ],
  };
  return { status: 'created', settings, diagnostics };
}

/** Resolve order/visibility and absolute Z only. Success does not authorize export. */
export function resolveStack(coin: ImportedCoin, settings: CoinSettings): StackResolution {
  const diagnostics = sourceDiagnostics(coin);
  if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) return { status: 'rejected', diagnostics };
  const reject = (detail: string, layerId?: string): StackResolution => ({ status: 'rejected', diagnostics: [...diagnostics, failure(detail, layerId)] });
  if (settings.importId !== coin.source.importId) return reject('Settings belong to a different import.');
  if (!Number.isSafeInteger(settings.revision) || settings.revision < 0) return reject('Settings revision must be a nonnegative safe integer.');
  if (!Array.isArray(settings.layers) || settings.layers.length !== coin.layers.length) return reject('Settings must contain each imported layer exactly once.');
  const byId = new Map(coin.layers.map(layer => [layer.id, layer]));
  const seen = new Set<string>();
  // Validate disabled entries too; hiding cannot make corrupt settings acceptable.
  for (const [index, setting] of settings.layers.entries()) {
    if (!setting || !nonemptyId(setting.layerId) || !byId.has(setting.layerId) || seen.has(setting.layerId)) return reject('Settings contain an empty, unknown or repeated layer identity.');
    seen.add(setting.layerId);
    if (index === 0 ? setting.layerId !== coin.baseLayerId || setting.role !== 'base' || setting.enabled !== true
      : setting.layerId === coin.baseLayerId || setting.role !== 'artwork' || typeof setting.enabled !== 'boolean') {
      return reject('Keep the original base first and enabled; every remaining entry must be artwork.', setting.layerId);
    }
    if (!Number.isFinite(setting.thicknessMm) || setting.thicknessMm <= 0) return reject('Every thickness must be finite and greater than zero, including disabled tiers.', setting.layerId);
    if (typeof setting.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(setting.color)) return reject('Every color must be an opaque sRGB #RRGGBB value.', setting.layerId);
  }
  const activeTiers: ActiveTier[] = [];
  let totalHeightMm = 0;
  for (const setting of settings.layers) {
    if (!setting.enabled) continue;
    const topZMm = totalHeightMm + setting.thicknessMm;
    if (!Number.isFinite(topZMm) || topZMm <= totalHeightMm) return reject('Cumulative height cannot represent a finite positive Z interval.', setting.layerId);
    const layer = byId.get(setting.layerId)!;
    activeTiers.push({ layerId: layer.id, name: layer.name, color: setting.color, footprintMm: layer.footprintMm,
      thicknessMm: setting.thicknessMm, bottomZMm: totalHeightMm, topZMm });
    totalHeightMm = topZMm;
  }
  return { status: 'resolved', input: { importId: settings.importId, settingsRevision: settings.revision }, activeTiers, totalHeightMm, diagnostics };
}
