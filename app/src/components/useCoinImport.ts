import { useReducer, useRef } from 'react';
import { initialCoinImportState, coinImportReducer } from '../core/coinImportState';
import { createDiagnostic } from '../core/diagnostics';
import { readLocalCoin } from '../import/importCoinSvg';

// Local import ownership only. Revision/settings/generation coordination is DIG-24.
export function useCoinImport() {
  const [state, dispatch] = useReducer(coinImportReducer, initialCoinImportState);
  const nextRequestId = useRef(0);
  function selectFile(file: File) {
    const requestId = ++nextRequestId.current;
    dispatch({ type: 'start', requestId, fileName: file.name });
    void readLocalCoin(file).then(
      result => dispatch({ type: 'finish', requestId, result }),
      () => dispatch({
        type: 'finish', requestId,
        result: { status: 'rejected', diagnostics: [createDiagnostic('SOURCE_UNREADABLE', { scope: 'document' })] },
      }),
    );
  }
  return { state, selectFile };
}
