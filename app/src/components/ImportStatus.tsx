import type { ImportedCoin } from '../core/contracts';
import type { CoinImportState } from '../core/coinImportState';
import type { Diagnostic } from '../core/diagnostics';

export function DiagnosticList({ diagnostics, coin }: { readonly diagnostics: readonly Diagnostic[]; readonly coin?: ImportedCoin | null }) {
  return <ul className="diagnostic-list">{diagnostics.map((diagnostic, index) => {
    const location = diagnostic.location;
    return <li key={index}>
    <strong>{diagnostic.severity === 'error' ? 'Error' : 'Warning'} · {diagnostic.code}</strong>
    {location.scope !== 'document' ? ` (layer ${`${location.layerName || coin?.layers.find(layer => layer.id === location.layerId)?.name || 'unknown'}${location.layerId ? `, ID: ${location.layerId}` : ''}`})` : ''}
    {location.scope === 'element' && `, element ${location.elementLabel || location.elementId || location.elementPath.join('.')}`}
    {' — '}{diagnostic.message} {diagnostic.remediation}
  </li>;
  })}</ul>;
}

export function ImportStatus({ state }: { readonly state: CoinImportState }) {
  const rejected = state.diagnostics.some(d => d.severity === 'error');
  return <div className="import-status">
    <div role="status" aria-live="polite" aria-atomic="true">
      {state.pendingFileName !== null && <p>Reading {state.pendingFileName}…</p>}
      {state.coin && <p>Loaded: <strong>{state.coin.source.fileName}</strong> ({state.coin.source.byteLength.toLocaleString()} bytes)</p>}
      {!state.coin && state.pendingFileName === null && <p>No SVG loaded.</p>}
      {state.pendingFileName !== null && state.coin && <p>Your previous SVG stays loaded until the new artwork passes every import check.</p>}
    </div>
    {state.diagnostics.length > 0 && <div className={rejected ? 'notice error-notice' : 'notice'} role={rejected ? 'alert' : 'status'}>
      <p>{rejected ? (state.coin ? 'Replacement failed. Your previous SVG is still loaded.' : 'The SVG could not be loaded.') : 'SVG loaded with warnings.'}</p>
      <DiagnosticList diagnostics={state.diagnostics} />
    </div>}
  </div>;
}
