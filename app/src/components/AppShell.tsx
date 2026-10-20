import { useState } from 'react';
import { useStore } from 'zustand';
import { createEditorStore, selectCurrentGeneration, selectStalePreview } from '../state/editorStore';
import type { EditorState, EditorStore } from '../state/editorStore';
import { EditorErrorBoundary } from './EditorErrorBoundary';
import { DiagnosticList, ImportStatus } from './ImportStatus';
import { LayerPanel } from './LayerPanel';
import { PreviewViewport } from './PreviewViewport';
import type { PreviewState } from './PreviewViewport';
import { Toolbar } from './Toolbar';

function editorPreview(state: EditorState): PreviewState {
  const imported = state.importState;
  const stalePreview = selectStalePreview(state) !== null;
  if (imported.pendingFileName !== null) return { status: 'importing', fileName: imported.pendingFileName, stalePreview };
  if (imported.diagnostics.some(d => d.severity === 'error')) return { status: 'invalid', reason: 'import', retainedSource: imported.coin !== null };
  if (state.generationStatus === 'pending') return { status: 'generating', stalePreview };
  const result = selectCurrentGeneration(state);
  if (result) return { status: 'ready', result, current: result.input };
  if (state.generationStatus === 'invalid') return { status: 'invalid', reason: 'generation', retainedSource: imported.coin !== null };
  return { status: imported.coin ? 'imported' : 'empty' };
}

export function AppShell({ store: providedStore }: { readonly store?: EditorStore }) {
  const [store] = useState(() => providedStore ?? createEditorStore());
  const state = useStore(store);
  const diagnostics = state.result?.diagnostics ?? [];
  return <div className="app-shell">
    <a className="skip-link" href="#editor">Skip to editor</a>
    <Toolbar onSelect={state.selectFile} />
    <main id="editor" tabIndex={-1}>
      <EditorErrorBoundary resetKey={state.importState.requestId}>
        <div className="editor-layout">
          <div className="preview-column">
            <PreviewViewport state={editorPreview(state)} />
            <ImportStatus state={state.importState} />
            {diagnostics.length > 0 && <section className="notice" aria-label="Geometry diagnostics" role={state.generationStatus === 'invalid' ? 'alert' : 'status'}>
              <p>{state.generationStatus === 'invalid' ? 'Current geometry is invalid. Export is unavailable.' : 'Geometry warnings'}</p>
              <DiagnosticList diagnostics={diagnostics} />
            </section>}
          </div>
          <LayerPanel coin={state.importState.coin} />
        </div>
      </EditorErrorBoundary>
    </main>
    <footer>CoinPrint · Local SVG artwork, measured in millimeters.</footer>
  </div>;
}
