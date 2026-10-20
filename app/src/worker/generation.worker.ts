import { generateCoin } from '../core/generateCoin';
import { polygonClippingKernel } from '../import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../import/earcutTriangulationKernel';
import { isWorkerRequest, packGeneration } from './protocol';
import type { RequestKey, WorkerResponse } from './protocol';

// Worker entry imports only the pure engine, DOM-free numerical adapters and
// transport DTOs. SVGLoader/DOMParser and all React/Three scene APIs stay out.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<unknown>) => void;
  postMessage(message: WorkerResponse, transfers?: ArrayBuffer[]): void;
};
scope.onmessage = event => {
  if (!isWorkerRequest(event.data)) throw new Error('Unsupported generation request.');
  const request = event.data;
  const key: RequestKey = { version: 1, token: request.token, sourceRevision: request.sourceRevision,
    importId: request.importId, settingsRevision: request.settingsRevision };
  try {
    scope.postMessage({ ...key, type: 'progress', phase: 'generating' });
    const generated = generateCoin(request.coin, request.settings, polygonClippingKernel, earcutTriangulationKernel);
    scope.postMessage({ ...key, type: 'progress', phase: 'receiving' });
    const packed = packGeneration(generated);
    scope.postMessage({ ...key, type: 'result', result: packed.result }, packed.transfers);
  } catch {
    scope.postMessage({ ...key, type: 'error', reason: 'generation-failed' });
  }
};
