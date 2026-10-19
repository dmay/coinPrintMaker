import { useReducer, useRef } from 'react';
import { initialCoinImportState, coinImportReducer } from '../core/coinImportState';
import { createDiagnostic } from '../core/diagnostics';
import { readLocalCoin } from '../import/importCoinSvg';

export function ImportControl() {
  const [state, dispatch] = useReducer(coinImportReducer, initialCoinImportState);
  const nextRequestId = useRef(0);
  const rejected = state.diagnostics.some(diagnostic => diagnostic.severity === 'error');
  return (
    <section aria-labelledby="import-heading">
      <h2 id="import-heading">Load SVG artwork</h2>
      <p>Select an Inkscape SVG from your device. Files stay in this browser.</p>
      <label htmlFor="svg-file">SVG file (up to 2 MiB)</label>
      <input
        id="svg-file"
        type="file"
        accept=".svg,image/svg+xml"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Allow selecting the same file again, including after a failed load.
          event.currentTarget.value = '';
          if (!file) return;
          const requestId = ++nextRequestId.current;
          dispatch({ type: 'start', requestId, fileName: file.name });
          void readLocalCoin(file).then(
            (result) => dispatch({ type: 'finish', requestId, result }),
            () => dispatch({
              type: 'finish', requestId,
              result: { status: 'rejected', diagnostics: [createDiagnostic('SOURCE_UNREADABLE', { scope: 'document' })] },
            }),
          );
        }}
      />
      <div role="status" aria-live="polite">
        {state.pendingFileName !== null && <p>Reading {state.pendingFileName}…</p>}
        {state.coin?.source && <p>Loaded: <strong>{state.coin?.source.fileName}</strong> ({state.coin?.source.byteLength.toLocaleString()} bytes)</p>}
        {!state.coin?.source && state.pendingFileName === null && <p>No SVG loaded.</p>}
      </div>
      {state.diagnostics.length > 0 && (
        <div role={rejected ? "alert" : "status"}>
          <p>{rejected ? (state.coin?.source ? 'Replacement failed. Your previous SVG is still loaded.' : 'The SVG could not be loaded.') : 'SVG loaded with warnings.'}</p>
          <ul>{state.diagnostics.map((diagnostic, index) => (
            <li key={index}><strong>{diagnostic.code}</strong>{diagnostic.location.scope === 'layer' || diagnostic.location.scope === 'element' ? ` (layer ${diagnostic.location.layerId ?? 'unknown'})` : ''}{diagnostic.location.scope === 'element' && `, element ${diagnostic.location.elementId ?? diagnostic.location.elementPath.join('.')}`} — {diagnostic.message} {diagnostic.remediation}</li>
          ))}</ul>
        </div>
      )}
      {state.coin && <section className="inspector" aria-labelledby="inspector-heading">
        <h3 id="inspector-heading">Imported layers</h3>
        <p>Page: {format(state.coin.physicalPageMm[0])} × {format(state.coin.physicalPageMm[1])} mm ({state.coin.sizeOrigin === 'explicit' ? 'declared size' : 'inferred size'}). Coordinates: millimeters, Y up.</p>
        <div className="table-scroll"><table>
          <caption>Source order, bottom to top</caption>
          <thead><tr><th>Layer</th><th>XY bounds (mm)</th><th>Width × height (mm)</th><th>Area (mm²)</th><th>Regions / holes</th></tr></thead>
          <tbody>{state.coin.layers.map(layer => <tr key={layer.id}>
            <th scope="row">{layer.name}{layer.id === state.coin!.baseLayerId && ' (base, locked)'}</th>
            <td>{layer.boundsMm.map(format).join(', ')}</td>
            <td>{format(layer.boundsMm[2]-layer.boundsMm[0])} × {format(layer.boundsMm[3]-layer.boundsMm[1])}</td>
            <td>{format(layer.areaMm2)}</td>
            <td>{layer.footprintMm.length} / {layer.footprintMm.reduce((sum,p)=>sum+p.holes.length,0)}</td>
          </tr>)}</tbody>
        </table></div>
        {rejected && state.coin.diagnostics.length > 0 && <p>Current coin warnings: {state.coin.diagnostics.map(d=>d.message).join(' ')}</p>}
      </section>}
      <p className="import-note">Import checks layers, physical size and filled XY footprints. Support, 3D geometry and export validation are later steps.</p>
    </section>
  );
}

function format(value: number): string { return value.toLocaleString(undefined, { maximumFractionDigits: 4 }); }
