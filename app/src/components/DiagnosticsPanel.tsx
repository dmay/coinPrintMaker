import { useState } from 'react';
import type { GeometryPresentation } from '../state/editorPresentation';

const PAGE_SIZE = 8;
export function DiagnosticsPanel({ view, onSelectLayer, onRetry }: {
  readonly view: GeometryPresentation;
  readonly onSelectLayer: (id: string) => void;
  readonly onRetry: () => void;
}) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(view.diagnostics.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * PAGE_SIZE;
  return <section className="diagnostics-panel" aria-label="Geometry diagnostics" aria-labelledby="diagnostics-heading">
    <div className="panel-heading"><h2 id="diagnostics-heading">Diagnostics</h2><span>{view.status}</span></div>
    <div className="panel-body">
      <div role={view.errorCount ? 'alert' : 'status'} aria-atomic="true">
        <p>{view.summary}</p>
        <p>{view.errorCount} {view.errorCount === 1 ? 'error' : 'errors'} · {view.warningCount} {view.warningCount === 1 ? 'warning' : 'warnings'} for the loaded coin.</p>
      </div>
      {view.rejectedImport && <p>Failed import candidate diagnostics are listed separately above. The loaded coin is retained.</p>}
      {(view.status === 'pending' || view.status === 'importing') && <p>Geometry checks are pending. Any listed source warnings still apply to the retained artwork.</p>}
      {view.diagnostics.length === 0 && <p>{view.current ? 'No warnings or geometry errors.' : 'No current geometry diagnostics to show.'}</p>}
      <ol className="diagnostic-list" start={start + 1}>{view.diagnostics.slice(start, start + PAGE_SIZE).map((item, index) => {
        const d = item.diagnostic;
        return <li key={start + index} className={d.severity === 'error' ? 'diagnostic-error' : 'diagnostic-warning'}>
          <strong>{d.severity === 'error' ? 'Error' : 'Warning'} · {d.code}</strong>
          <p>{item.location}{d.location.scope === 'element' && ` · Element: ${d.location.elementLabel || d.location.elementId || d.location.elementPath.join('.')}`}</p>
          {item.supportPair && <p>{item.supportPair}</p>}
          <p>{d.message}</p><p><strong>Action:</strong> {d.remediation}</p>
          {item.layerId && <button type="button" onClick={() => onSelectLayer(item.layerId!)}>Select layer {item.layerId}</button>}
        </li>;
      })}</ol>
      {pages > 1 && <div className="diagnostic-pages" role="group" aria-label="Diagnostic pages">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous diagnostics</button>
        <p role="status">{start + 1}–{Math.min(start + PAGE_SIZE, view.diagnostics.length)} of {view.diagnostics.length}</p>
        <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>Next diagnostics</button>
      </div>}
      {view.diagnostics.some(item => item.diagnostic.code === 'GENERATION_WORKER_FAILED') && <button type="button" onClick={onRetry}>Retry generation</button>}
    </div>
  </section>;
}
