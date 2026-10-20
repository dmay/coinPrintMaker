import { createStore } from 'zustand/vanilla';
import type { CoinSettings, GeneratedCoin, LayerSettings, ValidGeneratedCoin } from '../core/contracts';
import type { CoinImportResult } from '../core/canonicalImport';
import { coinImportReducer, initialCoinImportState } from '../core/coinImportState';
import type { CoinImportState } from '../core/coinImportState';
import { createDiagnostic } from '../core/diagnostics';
import { isCurrentValidGeneration } from '../core/generation';
import { createDefaultCoinSettings, resolveStack } from '../core/resolveStack';
import { createGenerationTransport, GenerationWorkerFailure } from '../worker/generationTransport';
import type { GenerationRequest, GenerationPhase, GenerationTransport } from '../worker/protocol';
export type { GenerationRequest } from '../worker/protocol';
import { readLocalCoin } from '../import/importCoinSvg';

export interface EditorState {
  readonly importState: CoinImportState;
  readonly sourceRevision: number;
  readonly settings: CoinSettings | null;
  readonly generationToken: number;
  readonly generationStatus: 'idle' | 'pending' | 'ready' | 'invalid';
  readonly generationPhase: GenerationPhase | null;
  readonly result: GeneratedCoin | null;
  readonly previousValid: ValidGeneratedCoin | null;
  readonly selectedLayerId: string | null;
}
export interface EditorActions {
  beginImport(fileName: string): number;
  finishImport(requestId: number, result: CoinImportResult): void;
  selectFile(file: File): void;
  setThickness(layerId: string, thicknessMm: number): void;
  setColor(layerId: string, color: string): void;
  setEnabled(layerId: string, enabled: boolean): void;
  reorderArtwork(layerIds: readonly string[]): void;
  selectLayer(layerId: string | null): void;
  retryGeneration(): void;
}
export type EditorStoreState = EditorState & EditorActions;
export interface EditorDependencies {
  readonly execute?: (request: GenerationRequest) => GeneratedCoin | Promise<GeneratedCoin>;
  readonly read?: typeof readLocalCoin;
  readonly transport?: GenerationTransport;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
// Copy at ownership boundaries; do not freeze caller-owned DTOs or buffers.
function owned<T>(value: T): T { return freeze(structuredClone(value)); }
function next(value: number): number {
  if (!Number.isSafeInteger(value + 1)) throw new Error('Revision counter exhausted. Reload the editor.');
  return value + 1;
}
function key(settings: CoinSettings) { return { importId: settings.importId, settingsRevision: settings.revision }; }
/** Exact equality includes disabled settings and ordered identities. Revision and
 * display color alone may differ. No source/geometry edit can reuse a mesh. */
export function sameGeometrySettings(a: CoinSettings, b: CoinSettings): boolean {
  return a.importId === b.importId && a.layers.length === b.layers.length && a.layers.every((layer, i) => {
    const other = b.layers[i];
    return layer.layerId === other.layerId && layer.role === other.role && layer.enabled === other.enabled
      && Object.is(layer.thicknessMm, other.thicknessMm);
  });
}
function recolor(result: ValidGeneratedCoin, settings: CoinSettings): ValidGeneratedCoin {
  const colors = new Map(settings.layers.map(layer => [layer.layerId, layer.color]));
  // Meshes and validated metrics remain the same frozen snapshots. Only display
  // metadata and its revision change after the caller proves geometry equality.
  return freeze({ ...result, input: key(settings),
    activeTiers: result.activeTiers.map(tier => ({ ...tier, color: colors.get(tier.layerId)! })),
    parts: result.parts.map(part => ({ ...part, color: colors.get(part.layerId)! })),
  });
}
export function selectCurrentGeneration(state: EditorState): ValidGeneratedCoin | null {
  return state.importState.pendingFileName === null && state.generationStatus === 'ready' && state.settings
    && isCurrentValidGeneration(state.result, key(state.settings)) ? state.result : null;
}
/** Geometry eligibility only; M4 exporters must also validate emitted coordinates. */
export const selectExportableGeometry = selectCurrentGeneration;
export function selectStalePreview(state: EditorState): ValidGeneratedCoin | null {
  return state.generationStatus === 'pending' || state.importState.pendingFileName !== null
    ? state.previousValid : null;
}

export function createEditorStore(dependencies: EditorDependencies = {}) {
  const transport = dependencies.execute ? null : dependencies.transport ?? createGenerationTransport();
  const execute = dependencies.execute ?? ((request: GenerationRequest) => transport!.execute(request, phase => {
    if (active === request) store.setState({ generationPhase: phase });
  }));
  let disposed = false;
  let active: GenerationRequest | null = null;
  const store = createStore<EditorStoreState>()((set, get) => {
    function complete(request: GenerationRequest, candidate: GeneratedCoin) {
      if (disposed) return;
      const state = get(), source = state.importState.coin, settings = state.settings;
      if (active !== request || state.generationToken !== request.token || state.sourceRevision !== request.sourceRevision
        || source !== request.coin || !settings || !sameGeometrySettings(request.settings, settings)
        || state.importState.pendingFileName !== null) return;
      active = null;
      // A valid response must be checked for the exact submitted revision before
      // projecting display metadata. Invalid responses may honestly have no key.
      const valid = isCurrentValidGeneration(candidate, key(request.settings));
      const result: GeneratedCoin = valid ? recolor(owned(candidate), settings)
        : candidate.status === 'invalid' ? owned(candidate)
        : owned({ schemaVersion: 1, status: 'invalid', diagnostics: [createDiagnostic('MESH_INVALID', { scope: 'document' })] });
      set({ result, previousValid: null, generationPhase: null, generationStatus: result.status === 'valid' ? 'ready' : 'invalid' });
    }
    function generate() {
      const state = get(), coin = state.importState.coin, settings = state.settings;
      if (disposed || !coin || !settings || state.importState.pendingFileName !== null) return;
      const token = next(state.generationToken);
      const request: GenerationRequest = freeze({ token, sourceRevision: state.sourceRevision, coin, settings });
      transport?.cancel();
      active = request;
      const previousValid = selectCurrentGeneration(state) ?? state.previousValid;
      set({ generationToken: token, generationStatus: 'pending', generationPhase: 'starting', result: null, previousValid });
      // Defer invoking injected transports too: synchronous throws and rejected
      // promises both follow the same latest-request failure path.
      void Promise.resolve().then(() => {
        if (active !== request || disposed) throw new Error('Superseded request.');
        return execute(request);
      }).then(
        result => complete(request, result),
        error => complete(request, { schemaVersion: 1, status: 'invalid',
          ...(request.coin.source.importId === request.settings.importId && request.settings.importId.trim()
            && Number.isSafeInteger(request.settings.revision) && request.settings.revision >= 0 ? { input: key(request.settings) } : {}),
          diagnostics: [createDiagnostic(error instanceof GenerationWorkerFailure ? 'GENERATION_WORKER_FAILED' : 'MESH_INVALID', { scope: 'document' })] }),
      );
    }
    function commit(layers: CoinSettings['layers'], colorOnly = false) {
      const state = get(), previous = state.settings, coin = state.importState.coin;
      if (!previous || !coin || state.importState.pendingFileName !== null) return;
      const settings = owned({ ...previous, revision: next(previous.revision), layers });
      const current = selectCurrentGeneration(state);
      // resolveStack validates colors and every disabled numeric setting without
      // clipping or tessellation. Invalid settings cannot take the reuse path.
      const resolved = colorOnly ? resolveStack(coin, settings) : null;
      set({ settings, previousValid: current ?? state.previousValid });
      if (colorOnly && sameGeometrySettings(previous, settings) && resolved?.status === 'resolved') {
        if (current) set({ result: recolor(current, settings), previousValid: null });
        else if (active && sameGeometrySettings(active.settings, settings) && resolveStack(coin, active.settings).status === 'resolved') { /* keep the geometry request */ }
        else generate();
      } else generate();
    }
    function edit(layerId: string, update: (layer: LayerSettings) => LayerSettings, colorOnly = false) {
      const settings = get().settings;
      if (!settings) return;
      const layers = settings.layers.map(layer => layer.layerId === layerId ? update(layer) : layer);
      if (layers.every((layer, i) => layer === settings.layers[i])) return;
      commit(layers as unknown as CoinSettings['layers'], colorOnly);
    }
    return {
      importState: initialCoinImportState, sourceRevision: 0, settings: null,
      generationToken: 0, generationStatus: 'idle', generationPhase: null, result: null, previousValid: null, selectedLayerId: null,
      beginImport(fileName) {
        const state = get(), requestId = next(state.importState.requestId);
        active = null;
        transport?.cancel();
        set({ generationPhase: null, importState: coinImportReducer(state.importState, { type: 'start', requestId, fileName }),
          generationToken: next(state.generationToken),
          previousValid: selectCurrentGeneration(state) ?? state.previousValid });
        return requestId;
      },
      finishImport(requestId, candidate) {
        const state = get();
        if (disposed || requestId !== state.importState.requestId || state.importState.pendingFileName === null) return;
        let result = candidate;
        let settings: CoinSettings | null = null;
        if (candidate.status === 'imported') {
          const defaults = createDefaultCoinSettings(candidate.coin);
          if (defaults.status === 'rejected') result = { status: 'rejected', diagnostics: defaults.diagnostics };
          else {
            settings = owned(defaults.settings);
            result = candidate;
          }
        }
        result = owned(result);
        const importState = coinImportReducer(state.importState, { type: 'finish', requestId, result });
        if (result.status === 'imported') {
          active = null;
          set({ importState, settings, sourceRevision: next(state.sourceRevision),
            result: null, previousValid: null, generationStatus: 'idle', generationPhase: null, selectedLayerId: null });
          generate();
        } else {
          // Rejected candidates change diagnostics only. Keep the old source,
          // settings and checked result; restart work canceled by beginImport.
          set({ importState, previousValid: state.generationStatus === 'pending' ? state.previousValid : null });
          if (state.generationStatus === 'pending') generate();
        }
      },
      selectFile(file) {
        const requestId = get().beginImport(file.name);
        void Promise.resolve().then(() => (dependencies.read ?? readLocalCoin)(file)).then(
          result => get().finishImport(requestId, result),
          () => get().finishImport(requestId, { status: 'rejected', diagnostics: [createDiagnostic('SOURCE_UNREADABLE', { scope: 'document' })] }),
        );
      },
      setThickness(layerId, thicknessMm) { edit(layerId, layer => Object.is(layer.thicknessMm, thicknessMm) ? layer : { ...layer, thicknessMm }); },
      setColor(layerId, color) { edit(layerId, layer => layer.color === color ? layer : { ...layer, color }, true); },
      setEnabled(layerId, enabled) { edit(layerId, layer => layer.role === 'base' || layer.enabled === enabled ? layer : { ...layer, enabled }); },
      reorderArtwork(layerIds) {
        const settings = get().settings;
        if (!settings || layerIds.length !== settings.layers.length - 1 || new Set(layerIds).size !== layerIds.length) return;
        const artwork = new Map(settings.layers.slice(1).map(layer => [layer.layerId, layer]));
        if (layerIds.some(id => !artwork.has(id))) return;
        const layers = [settings.layers[0], ...layerIds.map(id => artwork.get(id)!)] as CoinSettings['layers'];
        if (layers.every((layer, i) => layer === settings.layers[i])) return;
        commit(layers);
      },
      retryGeneration() {
        const status = get().generationStatus;
        if (status === 'invalid' || (status === 'pending' && active === null)) generate();
      },
      selectLayer(layerId) {
        if (layerId === null || get().importState.coin?.layers.some(layer => layer.id === layerId)) set({ selectedLayerId: layerId });
      },
    };
  });
  return Object.assign(store, {
    activate() {
      const wasDisposed = disposed; disposed = false;
      if (wasDisposed && store.getState().generationStatus === 'pending') store.getState().retryGeneration();
    },
    dispose() { disposed = true; active = null; transport?.dispose(); },
  });
}
export type EditorStore = ReturnType<typeof createEditorStore>;
