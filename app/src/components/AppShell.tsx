import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createEditorStore, selectCurrentGeneration, selectStalePreview } from '../state/editorStore';
import type { EditorState, EditorStore } from '../state/editorStore';
import { EditorErrorBoundary } from './EditorErrorBoundary';
import { ImportStatus } from './ImportStatus';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { DimensionSummary } from './DimensionSummary';
import { selectGeometryPresentation } from '../state/editorPresentation';
import { LayerPanel } from './LayerPanel';
import { PreviewViewport } from './PreviewViewport';
import type { PreviewState } from './PreviewViewport';
import { Toolbar } from './Toolbar';
import { exportCurrentCoin } from '../state/exportCoin';

function editorPreview(state: EditorState): PreviewState {
  const imported = state.importState;
  const stalePreview = selectStalePreview(state) !== null;
  if (imported.pendingFileName !== null) return { status: 'importing', fileName: imported.pendingFileName, stalePreview };
  if (state.generationStatus === 'pending') return { status: 'generating', stalePreview };
  const result = selectCurrentGeneration(state);
  if (result) return { status: 'ready', result, current: result.input };
  if (!imported.coin && imported.diagnostics.some(d => d.severity === 'error')) return { status: 'invalid', reason: 'import', retainedSource: false };
  if (state.generationStatus === 'invalid') return { status: 'invalid', reason: 'generation', retainedSource: imported.coin !== null };
  return { status: imported.coin ? 'imported' : 'empty' };
}

export function AppShell({ store: providedStore }: { readonly store?: EditorStore }) {
  const [store] = useState(() => providedStore ?? createEditorStore());
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  const state = useStore(store);
  const [exportError, setExportError] = useState<{ key: string; message: string } | null>(null);
  const exportKey = `${state.sourceRevision}:${state.settings?.revision}:${state.importState.requestId}`;
  const view = selectGeometryPresentation(state);
  return <div className="app-shell">
    <a className="skip-link" href="#editor">Skip to editor</a>
    <Toolbar onSelect={state.selectFile} canExport={view.current !== null}
      onExport={format => {
        const fileName = store.getState().importState.coin?.source.fileName ?? 'coin.svg';
        const message = exportCurrentCoin(store, { format, fileName });
        setExportError(message ? { key: exportKey, message } : null);
      }} />
    {exportError?.key === exportKey && <p className="export-error" role="alert">{exportError.message}</p>}
    <main id="editor" tabIndex={-1}>
      <EditorErrorBoundary resetKey={state.importState.requestId}>
        <div className="editor-layout">
          <div className="preview-column">
            <PreviewViewport state={editorPreview(state)} selectedLayerId={state.selectedLayerId} generationPhase={state.generationPhase} />
            <ImportStatus state={state.importState} />
            <DimensionSummary view={view} />
            <DiagnosticsPanel key={`${state.sourceRevision}:${state.settings?.revision}:${view.status}`} view={view} onSelectLayer={state.selectLayer} onRetry={state.retryGeneration} />
          </div>
          <LayerPanel store={store} />
        </div>
      </EditorErrorBoundary>
    </main>
    <footer>CoinPrint · Local SVG artwork, measured in millimeters.</footer>
  </div>;
}
