import type { ImportedCoin } from './contracts';
import type { Diagnostic } from './diagnostics';
import type { CoinImportResult } from './canonicalImport';

export interface CoinImportState {
  readonly requestId: number;
  readonly pendingFileName: string | null;
  readonly coin: ImportedCoin | null;
  readonly diagnostics: readonly Diagnostic[];
}
export const initialCoinImportState: CoinImportState={requestId:0,pendingFileName:null,coin:null,diagnostics:[]};
export type CoinImportAction=
  | {readonly type:'start';readonly requestId:number;readonly fileName:string}
  | {readonly type:'finish';readonly requestId:number;readonly result:CoinImportResult};
export function coinImportReducer(state:CoinImportState,action:CoinImportAction):CoinImportState {
  if (action.type==='start') return action.requestId<=state.requestId?state:{...state,requestId:action.requestId,pendingFileName:action.fileName,diagnostics:[]};
  if (action.requestId!==state.requestId || state.pendingFileName===null) return state;
  return action.result.status==='imported'
    ? {...state,pendingFileName:null,coin:action.result.coin,diagnostics:action.result.diagnostics}
    : {...state,pendingFileName:null,diagnostics:action.result.diagnostics};
}
