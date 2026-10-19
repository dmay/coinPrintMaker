import type { SourceDocument } from './contracts';
import type { Diagnostic } from './diagnostics';

// Loading/preflight-stage data only. Layer and geometry validation is still required.
export type LocalSvgResult =
  | { readonly status: 'loaded'; readonly source: SourceDocument; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] };

export interface LocalImportState {
  readonly requestId: number;
  readonly pendingFileName: string | null;
  readonly source: SourceDocument | null;
  readonly diagnostics: readonly Diagnostic[];
}
export const initialLocalImportState: LocalImportState = {
  requestId: 0, pendingFileName: null, source: null, diagnostics: [],
};
export type LocalImportAction =
  | { readonly type: 'start'; readonly requestId: number; readonly fileName: string }
  | { readonly type: 'finish'; readonly requestId: number; readonly result: LocalSvgResult };

export function localImportReducer(state: LocalImportState, action: LocalImportAction): LocalImportState {
  if (action.type === 'start') {
    if (action.requestId <= state.requestId) return state;
    return { ...state, requestId: action.requestId, pendingFileName: action.fileName, diagnostics: [] };
  }
  if (action.requestId !== state.requestId || state.pendingFileName === null) return state;
  return action.result.status === 'loaded'
    ? { ...state, pendingFileName: null, source: action.result.source, diagnostics: action.result.diagnostics }
    : { ...state, pendingFileName: null, diagnostics: action.result.diagnostics };
}
