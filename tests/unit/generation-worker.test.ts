import { expect, test, vi } from 'vitest';
import type { GeneratedCoin, ImportedCoin } from '../../app/src/core/contracts';
import { generateCoin } from '../../app/src/core/generateCoin';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { createGenerationTransport, GenerationWorkerFailure } from '../../app/src/worker/generationTransport';
import type { WorkerPort } from '../../app/src/worker/generationTransport';
import { isWorkerRequest, packGeneration, requestKey, unpackGeneration } from '../../app/src/worker/protocol';
import type { GenerationRequest, WorkerRequest } from '../../app/src/worker/protocol';
import { createEditorStore, selectCurrentGeneration, selectExportableGeometry } from '../../app/src/state/editorStore';

const coin: ImportedCoin = { schemaVersion: 1, source: { importId: 'source', fileName: 'same.svg', byteLength: 1, svgText: '<svg/>' },
  physicalPageMm: [10, 10], sizeOrigin: 'explicit', baseLayerId: 'base', diagnostics: [],
  layers: [{ id: 'base', name: 'Base', sourceOrder: 0, sourceElements: [], boundsMm: [0, 0, 10, 10], areaMm2: 100,
    footprintMm: [{ outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [] }] }] };
const defaults = createDefaultCoinSettings(coin);
if (defaults.status !== 'created') throw Error('fixture');
const request: GenerationRequest = { token: 2, sourceRevision: 1, coin, settings: defaults.settings };
const compute = (r: GenerationRequest): GeneratedCoin => generateCoin(r.coin, r.settings, polygonClippingKernel, earcutTriangulationKernel);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
class Port implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  terminate = vi.fn();
  postMessage = vi.fn<(message: unknown) => void>();
  respond(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
  result(r: GenerationRequest = request, generated = compute(r)) {
    const packed = packGeneration(generated);
    this.respond({ ...requestKey(r), type: 'result', result: structuredClone(packed.result, { transfer: packed.transfers }) });
  }
}
function ports() {
  const instances: Port[] = [];
  const factory = vi.fn(() => { const port = new Port(); instances.push(port); return port; });
  return { transport: createGenerationTransport(factory), instances, factory };
}
function imported(store: ReturnType<typeof createEditorStore>, source = coin) {
  const id = store.getState().beginImport(source.source.fileName);
  store.getState().finishImport(id, { status: 'imported', coin: source, diagnostics: [] });
}
function sent(port: Port): WorkerRequest { return port.postMessage.mock.lastCall![0] as WorkerRequest; }
function generation(r: WorkerRequest): GenerationRequest { return { token: r.token, sourceRevision: r.sourceRevision, coin: r.coin, settings: r.settings }; }

test('Float64 transfer preserves every checked field, detaches only transport copies and hydrates independent tuples', () => {
  const generated = compute(request); expect(generated.status).toBe('valid');
  const before = structuredClone(generated), packed = packGeneration(generated);
  const transferred = structuredClone(packed.result, { transfer: packed.transfers });
  expect(packed.transfers.every(buffer => buffer.byteLength === 0)).toBe(true);
  const hydrated = unpackGeneration(transferred);
  expect(hydrated).toEqual(before); expect(generated).toEqual(before);
  if (generated.status === 'valid' && hydrated.status === 'valid') {
    expect(hydrated.unifiedMesh.vertices).not.toBe(generated.unifiedMesh.vertices);
    expect(hydrated.parts[0].mesh.vertices).not.toBe(generated.parts[0].mesh.vertices);
  }
  // Display Float32 would lose these bits; this wire format must retain them.
  if (transferred.status === 'valid') {
    transferred.unifiedMesh.positions[0] = 1.0000000000000002;
    const precise = unpackGeneration(transferred);
    if (precise.status === 'valid') expect(precise.unifiedMesh.vertices[0][0]).toBe(1.0000000000000002);
  }
});

test('strict keys/progress/result protocol rejects malformed/current responses and restarts cleanly', async () => {
  const { transport, instances } = ports(), progress = vi.fn();
  let promise = transport.execute(request, progress);
  expect(isWorkerRequest(sent(instances[0]))).toBe(true);
  instances[0].respond({ ...requestKey(request), type: 'progress', phase: 'generating' });
  expect(progress).toHaveBeenCalledWith('generating');
  instances[0].result(); expect(await promise).toEqual(compute(request));
  for (const wrong of [{ token: 1 }, { sourceRevision: 3 }, { importId: 'other' }, { settingsRevision: 3 }, { version: 2 }, { type: 'unexpected' }]) {
    promise = transport.execute(request); const rejected = expect(promise).rejects.toBeInstanceOf(GenerationWorkerFailure);
    instances.at(-1)!.respond({ ...requestKey(request), type: 'progress', phase: 'generating', ...wrong });
    await rejected; expect(instances.at(-1)!.terminate).toHaveBeenCalled();
  }
  promise = transport.execute(request); instances.at(-1)!.result(); expect((await promise).status).toBe('valid');
});

test('start, postMessage, runtime, message decoding, worker error response and malformed mesh failures reject and can restart', async () => {
  const factory = vi.fn<() => WorkerPort>().mockImplementationOnce(() => { throw Error('private start detail'); }).mockImplementation(() => new Port());
  const transport = createGenerationTransport(factory);
  await expect(transport.execute(request)).rejects.toBeInstanceOf(GenerationWorkerFailure);
  for (const failure of ['post', 'runtime', 'message', 'response', 'mesh', 'wrong-result-key']) {
    const port = new Port(); const local = createGenerationTransport(() => port);
    if (failure === 'post') port.postMessage.mockImplementation(() => { throw Error('private post'); });
    const promise = local.execute(request), rejected = expect(promise).rejects.toBeInstanceOf(GenerationWorkerFailure);
    if (failure === 'runtime') port.onerror?.({} as ErrorEvent);
    if (failure === 'message') port.onmessageerror?.({} as MessageEvent);
    if (failure === 'response') port.respond({ ...requestKey(request), type: 'error', reason: 'generation-failed' });
    if (failure === 'mesh') port.respond({ ...requestKey(request), type: 'result', result: { schemaVersion: 1, status: 'valid', diagnostics: [], parts: [], activeTiers: [], dimensionsMm: [1, 1, 1], input: requestKey(request), metrics: {}, unifiedMesh: { positions: new Float32Array(3), indices: new Uint32Array(3) } } });
    if (failure === 'wrong-result-key') port.result(request, { schemaVersion: 1, status: 'invalid', input: { importId: 'wrong', settingsRevision: 0 }, diagnostics: [] });
    await rejected; expect(port.terminate).toHaveBeenCalledOnce();
  }
  const retry = transport.execute(request); (factory.mock.results.at(-1)!.value as Port).result(); expect((await retry).status).toBe('valid');
});

test('supersession cancels old CPU work and ignores late success/failure/progress from detached ports', async () => {
  const { transport, instances } = ports();
  const first = transport.execute(request), rejected = expect(first).rejects.toBeInstanceOf(GenerationWorkerFailure);
  const staleListener = instances[0].onmessage!;
  const newer = { ...request, token: 3, settings: { ...request.settings, revision: 1 } };
  const progress = vi.fn(), second = transport.execute(newer, progress);
  await rejected;
  for (const data of [{ ...requestKey(request), type: 'error' }, { ...requestKey(request), type: 'result', result: packGeneration(compute(request)).result }, { ...requestKey(request), type: 'progress', phase: 'receiving' }]) staleListener({ data } as MessageEvent);
  expect(progress).not.toHaveBeenCalled(); instances[1].result(newer); expect((await second).input?.settingsRevision).toBe(1);
});

test('store keeps color-only pending/ready work, rejects reimport races and newest worker failure, retries and cleans up', async () => {
  const { transport, instances } = ports(); const store = createEditorStore({ transport });
  imported(store); await flush(); const first = generation(sent(instances[0]));
  store.getState().setColor('base', '#123456'); await flush();
  expect(instances).toHaveLength(1); expect(instances[0].postMessage).toHaveBeenCalledOnce(); expect(instances[0].terminate).not.toHaveBeenCalled();
  instances[0].result(first); await flush();
  const current = selectCurrentGeneration(store.getState())!; expect(current.input.settingsRevision).toBe(1); expect(current.parts[0].color).toBe('#123456');
  store.getState().setColor('base', '#abcdef'); await flush();
  expect(instances[0].postMessage).toHaveBeenCalledOnce(); expect(selectCurrentGeneration(store.getState())!.unifiedMesh).toBe(current.unifiedMesh);
  store.getState().setThickness('base', 2); await flush(); const old = instances.at(-1)!, listener = old.onmessage!, oldRequest = generation(sent(old));
  imported(store, { ...coin, source: { ...coin.source, importId: 'replacement' } }); await flush();
  expect(old.terminate).toHaveBeenCalledOnce(); expect(selectExportableGeometry(store.getState())).toBeNull();
  listener({ data: { ...requestKey(oldRequest), type: 'result', result: packGeneration(compute(oldRequest)).result } } as MessageEvent);
  const latest = instances.at(-1)!; latest.onerror?.({} as ErrorEvent); await flush();
  expect(store.getState().generationStatus).toBe('invalid'); expect(store.getState().result?.diagnostics[0].code).toBe('GENERATION_WORKER_FAILED');
  expect(store.getState().result?.input?.importId).toBe('replacement'); expect(selectExportableGeometry(store.getState())).toBeNull();
  store.getState().retryGeneration(); await flush(); const retry = instances.at(-1)!; retry.result(generation(sent(retry))); await flush();
  expect(selectCurrentGeneration(store.getState())?.input.importId).toBe('replacement');
  expect(Object.isFrozen(selectCurrentGeneration(store.getState())!.unifiedMesh.vertices[0])).toBe(true);
  store.getState().setThickness('base', 3); await flush(); const finalPort = instances.at(-1)!, finalListener = finalPort.onmessage!, finalRequest = generation(sent(finalPort));
  store.dispose(); expect(finalPort.terminate).toHaveBeenCalledOnce();
  finalListener({ data: { ...requestKey(finalRequest), type: 'result', result: packGeneration(compute(finalRequest)).result } } as MessageEvent); await flush();
  expect(selectCurrentGeneration(store.getState())).toBeNull();
  store.activate(); store.getState().setThickness('base', 4); await flush(); instances.at(-1)!.result(generation(sent(instances.at(-1)!))); await flush();
  expect(selectCurrentGeneration(store.getState())?.dimensionsMm[2]).toBe(4); store.dispose();
});

test('idle workers are reused, idle crash restarts on next edit and dispose releases an idle port', async () => {
  const { transport, instances, factory } = ports();
  const first = transport.execute(request); instances[0].result(); await first;
  transport.cancel(); expect(instances[0].terminate).not.toHaveBeenCalled();
  const second = transport.execute({ ...request, token: 3 }); instances[0].result({ ...request, token: 3 }); await second;
  expect(factory).toHaveBeenCalledOnce();
  instances[0].onerror?.({} as ErrorEvent); expect(instances[0].terminate).toHaveBeenCalledOnce();
  const third = transport.execute({ ...request, token: 4 }); instances[1].result({ ...request, token: 4 }); await third;
  transport.dispose(); expect(instances[1].terminate).toHaveBeenCalledOnce();
});

test('effect cleanup/reactivation restarts canceled pending work, and disposed late imports cannot start workers', async () => {
  const { transport, instances } = ports(), store = createEditorStore({ transport });
  imported(store); await flush(); const token = store.getState().generationToken;
  store.dispose(); store.activate(); await flush();
  expect(instances).toHaveLength(2); expect(store.getState().generationToken).toBeGreaterThan(token);
  instances[1].result(generation(sent(instances[1]))); await flush();
  expect(selectCurrentGeneration(store.getState())?.input.settingsRevision).toBe(0);
  const importId = store.getState().beginImport('late.svg'); store.dispose();
  store.getState().finishImport(importId, { status: 'imported', coin: { ...coin, source: { ...coin.source, importId: 'late' } }, diagnostics: [] }); await flush();
  expect(instances).toHaveLength(2); expect(store.getState().importState.coin?.source.importId).toBe('source');
});
