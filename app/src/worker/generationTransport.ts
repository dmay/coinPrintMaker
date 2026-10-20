import type { GeneratedCoin } from '../core/contracts';
import type { GenerationRequest, GenerationTransport, RequestKey, WorkerResponse } from './protocol';
import { matchesKey, requestKey, unpackGeneration } from './protocol';

export interface WorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}
export class GenerationWorkerFailure extends Error {
  constructor() { super('Coin processing failed. Retry generation.'); }
}
/** One current CPU job. Termination preempts synchronous work; next job lazily
 * starts a clean worker. No synchronous fallback can block the editor. */
export function createGenerationTransport(factory: () => WorkerPort = () =>
  new Worker(new URL('./generation.worker.ts', import.meta.url), { type: 'module' })) : GenerationTransport {
  let worker: WorkerPort | null = null;
  let pending: { key: RequestKey; reject: (error: Error) => void } | null = null;
  function stop(reject: boolean) {
    const previous = pending;
    pending = null;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate(); worker = null;
    }
    if (reject) previous?.reject(new GenerationWorkerFailure());
  }
  return {
    cancel() { if (pending) stop(true); },
    dispose() { stop(true); },
    execute(request: GenerationRequest, progress) {
      if (pending) stop(true);
      return new Promise<GeneratedCoin>((resolve, reject) => {
        const key = requestKey(request), task = { key, reject };
        pending = task;
        try {
          worker ??= factory();
          const port = worker;
          port.onerror = port.onmessageerror = () => { if (worker === port) stop(true); };
          port.onmessage = event => {
            // Detached ports and earlier tasks cannot report progress or failure.
            if (pending !== task || worker !== port) return;
            if (!matchesKey(event.data, key)) { stop(true); return; }
            const response = event.data as WorkerResponse;
            if (response.type === 'progress') {
              if (response.phase !== 'generating' && response.phase !== 'receiving') { stop(true); return; }
              progress?.(response.phase); return;
            }
            if (response.type !== 'result') { stop(true); return; }
            try {
              const result = unpackGeneration(response.result);
              if (result.input && (result.input.importId !== key.importId || result.input.settingsRevision !== key.settingsRevision)) throw new GenerationWorkerFailure();
              pending = null;
              port.onmessage = null;
              resolve(result);
            } catch { stop(true); }
          };
          port.postMessage({ ...key, type: 'generate', coin: request.coin, settings: request.settings });
        } catch { stop(true); }
      });
    },
  };
}
