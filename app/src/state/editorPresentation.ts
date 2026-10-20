import type { Diagnostic } from '../core/diagnostics';
import { createDiagnostic } from '../core/diagnostics';
import type { ValidGeneratedCoin } from '../core/contracts';
import { selectCurrentGeneration, selectStalePreview } from './editorStore';
import type { EditorState } from './editorStore';

export interface PresentedDiagnostic {
  readonly diagnostic: Diagnostic;
  readonly layerId: string | null;
  readonly location: string;
  readonly supportPair: string | null;
}
export interface GeometryPresentation {
  readonly status: 'empty' | 'importing' | 'pending' | 'invalid' | 'stale' | 'current';
  readonly summary: string;
  readonly current: ValidGeneratedCoin | null;
  readonly stalePreview: boolean;
  readonly rejectedImport: boolean;
  readonly diagnostics: readonly PresentedDiagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly exportNote: string;
}

/** Presentation only. Never measure renderer buffers or promote a previous result.
 * Keyless invalid results are legitimate coordinator outcomes; only valid results
 * require a key. Candidate import errors belong to ImportStatus, not this coin. */
export function selectGeometryPresentation(state: EditorState): GeometryPresentation {
  const coin = state.importState.coin;
  const current = selectCurrentGeneration(state);
  const stalePreview = selectStalePreview(state) !== null;
  const rejectedImport = state.importState.diagnostics.some(d => d.severity === 'error');
  const pendingImport = state.importState.pendingFileName !== null;
  const invalid = state.generationStatus === 'invalid' && state.result?.status === 'invalid'
    && (!state.result.input || (state.result.input.importId === state.settings?.importId
      && state.result.input.settingsRevision === state.settings?.revision));
  const status = pendingImport ? 'importing' : current ? 'current' : state.generationStatus === 'pending' ? 'pending'
    : invalid ? 'invalid' : state.result ? 'stale' : coin ? 'pending' : 'empty';
  const summary = status === 'current' ? 'Current geometry passed validation.'
    : status === 'importing' ? 'Checking replacement artwork. Current measurements are unavailable.'
    : status === 'pending' ? 'Pending: checking current geometry. Measurements are unavailable until validation finishes.'
    : status === 'invalid' ? 'Current geometry is invalid. Measurements and export are unavailable.'
    : status === 'stale' ? 'Stale: no checked result matches the current artwork and settings. Measurements and export are unavailable.'
    : 'Open a layered SVG to generate checked measurements.';
  const resultDiagnostics = current?.diagnostics ?? (invalid && !pendingImport ? state.result!.diagnostics : []);
  // Retained source warnings remain useful during pending work and after a failed
  // replacement. Never relabel the rejected candidate's diagnostics as coin errors.
  const unique = new Map<string, Diagnostic>();
  for (const diagnostic of [...(coin?.diagnostics ?? []), ...resultDiagnostics,
    ...(status === 'stale' ? [createDiagnostic('GEOMETRY_STALE', { scope: 'document' })] : [])]) {
    unique.set(JSON.stringify(diagnostic), diagnostic);
  }
  const diagnostics = [...unique.values()].map(diagnostic => {
    const location = diagnostic.location;
    const id = location.scope === 'document' ? null : location.layerId;
    const layer = coin?.layers.find(item => item.id === id);
    const label = layer ? `${layer.name} (ID: ${layer.id})` : id ? `${location.layerName || 'Unknown layer'} (ID: ${id})` : null;
    const active = state.settings?.layers.filter(item => item.enabled) ?? [];
    const index = active.findIndex(item => item.layerId === id);
    const lower = index > 0 ? coin?.layers.find(item => item.id === active[index - 1].layerId) : null;
    return { diagnostic, layerId: layer?.id ?? null,
      location: label ? `Layer ${label}` : location.scope === 'mesh' ? 'Coin mesh' : 'Document',
      supportPair: diagnostic.code === 'SUPPORT_OUTSIDE_LOWER' && lower
        ? `Immediately lower active layer: ${lower.name} (ID: ${lower.id}).` : null };
  });
  const errorCount = diagnostics.filter(item => item.diagnostic.severity === 'error').length;
  const warningCount = diagnostics.length - errorCount;
  return { status, summary, current, stalePreview, rejectedImport, diagnostics, errorCount, warningCount,
    exportNote: current
      ? 'Current geometry is valid. STL is available; 3MF export is not available yet.'
      : 'No current validated geometry is eligible for export. 3MF export is not available yet.' };
}
