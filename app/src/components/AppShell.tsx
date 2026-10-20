import type { CoinImportState } from '../core/coinImportState';
import { EditorErrorBoundary } from './EditorErrorBoundary';
import { ImportStatus } from './ImportStatus';
import { LayerPanel } from './LayerPanel';
import { PreviewViewport } from './PreviewViewport';
import type { PreviewState } from './PreviewViewport';
import { Toolbar } from './Toolbar';
import { useCoinImport } from './useCoinImport';

function importPreview(state: CoinImportState): PreviewState {
  if (state.pendingFileName !== null) return { status: 'importing', fileName: state.pendingFileName };
  if (state.diagnostics.some(d => d.severity === 'error')) return { status: 'invalid', reason: 'import', retainedSource: state.coin !== null };
  return { status: state.coin ? 'imported' : 'empty' };
}

export function AppShell() {
  const { state, selectFile } = useCoinImport();
  return <div className="app-shell">
    <a className="skip-link" href="#editor">Skip to editor</a>
    <Toolbar onSelect={selectFile} />
    <main id="editor" tabIndex={-1}>
      <EditorErrorBoundary resetKey={state.requestId}>
        <div className="editor-layout">
          <div className="preview-column"><PreviewViewport state={importPreview(state)} /><ImportStatus state={state} /></div>
          <LayerPanel coin={state.coin} />
        </div>
      </EditorErrorBoundary>
    </main>
    <footer>CoinPrint · Local SVG artwork, measured in millimeters.</footer>
  </div>;
}
