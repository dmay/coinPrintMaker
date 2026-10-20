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
  const view = selectGeometryPresentation(state);
  return <div className="app-shell">
    <a className="skip-link" href="#editor">Skip to editor</a>
    <Toolbar onSelect={state.selectFile} exportNote={view.exportNote} />
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
