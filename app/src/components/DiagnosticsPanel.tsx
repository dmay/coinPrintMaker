import type { ImportedCoin } from '../core/contracts';
import { useState } from 'react';
import type { GeometryPresentation } from '../state/editorPresentation';

const PAGE_SIZE = 8;
export function DiagnosticsPanel({ view, coin = null, onSelectLayer, onRetry }: {
  readonly view: GeometryPresentation;
  readonly coin?: ImportedCoin | null;
  readonly onSelectLayer: (id: string) => void;
  readonly onRetry: () => void;
}) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(view.diagnostics.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * PAGE_SIZE;
  return <details className="diagnostics-panel" aria-labelledby="diagnostics-heading">
    <summary className="panel-heading"><h2 id="diagnostics-heading">Internals</h2><span>{view.errorCount} errors · {view.warningCount} warnings · {view.status}</span></summary>
    <div className="panel-body">
      {view.current && <div className="geometry-checked"><h3>Geometry checked</h3><p>{view.current.dimensionsMm.map(n => n.toLocaleString(undefined, { maximumSignificantDigits: 8 })).join(' × ')} mm</p></div>}
      {coin && <dl className="internal-metrics">
        <div><dt>Source file</dt><dd>{coin.source.fileName} ({coin.source.byteLength.toLocaleString()} bytes)</dd></div>
        <div><dt>Imported layers</dt><dd>{coin.layers.length}</dd></div>
        <div><dt>Printable source objects</dt><dd>{coin.layers.reduce((n, layer) => n + layer.sourceElements.length, 0)}</dd></div>
        <div><dt>Imported regions / holes</dt><dd>{coin.layers.reduce((n, layer) => n + layer.footprintMm.length, 0)} / {coin.layers.reduce((n, layer) => n + layer.footprintMm.reduce((m, polygon) => m + polygon.holes.length, 0), 0)}</dd></div>
        <div><dt>Flattened contour points</dt><dd>{coin.layers.reduce((n, layer) => n + layer.footprintMm.reduce((m, polygon) => m + polygon.outer.length + polygon.holes.reduce((k, ring) => k + ring.length, 0), 0), 0).toLocaleString()}</dd></div>
        <div><dt>Coordinates</dt><dd>Millimeters, Y up</dd></div>
      </dl>}
      {view.current && <dl className="internal-metrics">
        <div><dt>Unified mesh vertices / triangles</dt><dd>{view.current.unifiedMesh.vertices.length.toLocaleString()} / {view.current.unifiedMesh.triangles.length.toLocaleString()}</dd></div>
        <div><dt>Unified mesh shells</dt><dd>{view.current.metrics.shellCount}</dd></div>
        <div><dt>Layer parts</dt><dd>{view.current.parts.length}</dd></div>
        <div><dt>Part mesh vertices / triangles</dt><dd>{view.current.parts.reduce((n, part) => n + part.mesh.vertices.length, 0).toLocaleString()} / {view.current.parts.reduce((n, part) => n + part.mesh.triangles.length, 0).toLocaleString()}</dd></div>
      </dl>}

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
  </details>;
}
