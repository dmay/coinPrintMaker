import { generateCoin } from '../../../app/src/core/generateCoin';
import { polygonClippingKernel } from '../../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../../app/src/import/earcutTriangulationKernel';
import { packGeneration } from '../../../app/src/worker/protocol';
import type { WorkerRequest } from '../../../app/src/worker/protocol';
import type { WorkerPort } from '../../../app/src/worker/generationTransport';

// Component tests exercise the real coordinator/engine with a simulated port.
// Native Worker scheduling and GPU behavior are separate production evidence.
export class InProcessWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  postMessage(message: unknown) {
    const request = message as WorkerRequest;
    void Promise.resolve().then(() => {
      const result = packGeneration(generateCoin(request.coin, request.settings, polygonClippingKernel, earcutTriangulationKernel));
      this.onmessage?.({ data: { ...request, type: 'result', result: result.result } } as MessageEvent);
    });
  }
  terminate() { this.onmessage = null; }
}
