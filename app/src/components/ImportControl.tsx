import { useReducer, useRef } from 'react';
import { initialLocalImportState, localImportReducer } from '../core/localImport';
import { createDiagnostic } from '../core/diagnostics';
import { readLocalSvg } from '../import/readLocalSvg';

export function ImportControl() {
  const [state, dispatch] = useReducer(localImportReducer, initialLocalImportState);
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
          void readLocalSvg(file).then(
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
        {state.source && <p>Loaded: <strong>{state.source.fileName}</strong> ({state.source.byteLength.toLocaleString()} bytes)</p>}
        {!state.source && state.pendingFileName === null && <p>No SVG loaded.</p>}
      </div>
      {state.diagnostics.length > 0 && (
        <div role={rejected ? "alert" : "status"}>
          <p>{rejected ? (state.source ? 'Replacement failed. Your previous SVG is still loaded.' : 'The SVG could not be loaded.') : 'SVG loaded with warnings.'}</p>
          <ul>{state.diagnostics.map((diagnostic, index) => (
            <li key={index}>{diagnostic.message} {diagnostic.remediation}</li>
          ))}</ul>
        </div>
      )}
      <p className="import-note">Loading checks file format, size and supported SVG artwork. Layer extraction and coin generation are coming next.</p>
    </section>
  );
}
