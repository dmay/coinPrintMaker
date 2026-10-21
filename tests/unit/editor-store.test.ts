import { expect, test, vi } from 'vitest';
import type { CoinImportResult } from '../../app/src/core/canonicalImport';
import type { GeneratedCoin, ImportedCoin } from '../../app/src/core/contracts';
import { generateCoin } from '../../app/src/core/generateCoin';
import { createDiagnostic } from '../../app/src/core/diagnostics';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { createEditorStore, selectCurrentGeneration, selectExportableGeometry, selectStalePreview, sameGeometrySettings } from '../../app/src/state/editorStore';
import type { EditorStore, GenerationRequest } from '../../app/src/state/editorStore';

function coin(importId = 'one'): ImportedCoin {
  const square = (min: number, max: number) => [{ outer: [[min, min], [max, min], [max, max], [min, max]], holes: [] }] as ImportedCoin['layers'][number]['footprintMm'];
  return { schemaVersion: 1, source: { importId, fileName: 'same.svg', byteLength: 6, svgText: '<svg/>' },
    physicalPageMm: [10, 10], sizeOrigin: 'explicit', baseLayerId: 'base', diagnostics: [],
    layers: [
      { id: 'base', name: 'Base', sourceOrder: 0, sourceElements: [], boundsMm: [0, 0, 10, 10], areaMm2: 100, footprintMm: square(0, 10) },
      { id: 'middle', name: 'Middle', sourceOrder: 1, sourceElements: [], boundsMm: [1, 1, 9, 9], areaMm2: 64, footprintMm: square(1, 9) },
      { id: 'top', name: 'Top', sourceOrder: 2, sourceElements: [], boundsMm: [2, 2, 8, 8], areaMm2: 36, footprintMm: square(2, 8) },
    ] };
}
const rejected: CoinImportResult = { status: 'rejected', diagnostics: [createDiagnostic('SOURCE_EMPTY', { scope: 'document' })] };
function imported(store: EditorStore, source = coin()) {
  const id = store.getState().beginImport(source.source.fileName);
  store.getState().finishImport(id, { status: 'imported', coin: source, diagnostics: [] });
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function computed(request: GenerationRequest) {
  return generateCoin(request.coin, request.settings, polygonClippingKernel, earcutTriangulationKernel);
}
function deferred() {
  const jobs: { request: GenerationRequest; resolve: (value: GeneratedCoin) => void; reject: (reason: unknown) => void }[] = [];
  const execute = vi.fn((request: GenerationRequest) => new Promise<GeneratedCoin>((resolve, reject) => jobs.push({ request, resolve, reject })));
  const store = createEditorStore({ execute });
  return { store, jobs, execute, finish(index: number) { jobs[index].resolve(computed(jobs[index].request)); } };
}

test('rapid edits discard older success and failure in either order; current token/revision wins', async () => {
  const { store, jobs, finish } = deferred();
  imported(store); await flush();
  store.getState().setThickness('base', 2); await flush();
  store.getState().setThickness('base', 3); await flush();
  expect(jobs.map(job => job.request.token)).toEqual([2, 3, 4]);
  expect(jobs.map(job => job.request.settings.revision)).toEqual([0, 1, 2]);
  finish(2); await flush();
  const current = selectCurrentGeneration(store.getState());
  expect(current?.dimensionsMm[2]).toBeCloseTo(3.8);
  finish(0); jobs[1].reject(new Error('old failure')); await flush();
  expect(selectCurrentGeneration(store.getState())).toBe(current);
  expect(current?.input.settingsRevision).toBe(2);
});

test('newest failure cannot be replaced by older success and has no geometry payload', async () => {
  const { store, jobs, finish } = deferred();
  imported(store); await flush();
  store.getState().setThickness('base', 0); await flush();
  finish(1); await flush(); finish(0); await flush();
  expect(store.getState().generationStatus).toBe('invalid');
  expect(store.getState().result?.status).toBe('invalid');
  expect(store.getState().result).not.toHaveProperty('unifiedMesh');
  expect(selectExportableGeometry(store.getState())).toBeNull();
  expect(selectStalePreview(store.getState())).toBeNull();
  expect(jobs[1].request.settings.revision).toBe(1);
});

test('import while generation pending replaces source/settings atomically and discards old completion', async () => {
  const { store, jobs, finish } = deferred();
  imported(store); await flush();
  imported(store, coin('two')); await flush();
  expect(store.getState().sourceRevision).toBe(2);
  expect(store.getState().settings?.revision).toBe(0);
  expect(jobs[1].request.coin).not.toBe(jobs[0].request.coin);
  expect(jobs[1].request.coin.layers[0].footprintMm).not.toBe(jobs[0].request.coin.layers[0].footprintMm);
  finish(0); await flush();
  expect(store.getState().generationStatus).toBe('pending');
  finish(1); await flush();
  expect(selectCurrentGeneration(store.getState())?.input.importId).toBe('two');
});

test('failed replacement preserves checked source/settings/result; pending replacement gates export', async () => {
  const { store, finish } = deferred();
  imported(store); await flush(); finish(0); await flush();
  const state = store.getState();
  const request = state.beginImport('bad.svg');
  expect(selectExportableGeometry(store.getState())).toBeNull();
  expect(selectStalePreview(store.getState())).toBe(state.result);
  store.getState().finishImport(request, rejected);
  expect(store.getState().importState.coin).toBe(state.importState.coin);
  expect(store.getState().settings).toBe(state.settings);
  expect(store.getState().result).toBe(state.result);
  expect(store.getState().sourceRevision).toBe(state.sourceRevision);
  expect(selectExportableGeometry(store.getState())).toBe(state.result);
});

test('failed replacement restarts canceled pending work under a new token and ignores old completion', async () => {
  const { store, jobs, finish } = deferred();
  imported(store); await flush();
  const before = store.getState();
  const id = before.beginImport('bad.svg');
  store.getState().finishImport(id, rejected); await flush();
  expect(jobs).toHaveLength(2);
  expect(jobs[1].request.token).toBeGreaterThan(jobs[0].request.token);
  expect(jobs[1].request.coin).toBe(jobs[0].request.coin);
  expect(jobs[1].request.settings).toBe(jobs[0].request.settings);
  finish(0); await flush();
  expect(store.getState().generationStatus).toBe('pending');
  finish(1); await flush();
  expect(selectCurrentGeneration(store.getState())?.status).toBe('valid');
});

test('color changes during pending work retain one request and project all current metadata after exact equality', async () => {
  const { store, execute, finish } = deferred();
  imported(store); await flush();
  store.getState().setThickness('base', 2); await flush();
  store.getState().setColor('top', '#123456');
  store.getState().setColor('base', '#abcdef');
  expect(execute).toHaveBeenCalledTimes(2);
  expect(store.getState().settings?.revision).toBe(3);
  finish(0); await flush(); expect(selectCurrentGeneration(store.getState())).toBeNull();
  finish(1); await flush();
  const current = selectCurrentGeneration(store.getState());
  expect(current?.input.settingsRevision).toBe(3);
  expect(current?.parts.map(part => part.color)).toEqual(['#abcdef', '#808080', '#123456']);
  expect(current?.activeTiers.map(tier => tier.color)).toEqual(['#abcdef', '#808080', '#123456']);
  expect(current?.dimensionsMm[2]).toBeCloseTo(2.8);
});

test('ready color-only edits do zero clipping/tessellation, preserve meshes and advance valid metadata revision', async () => {
  const difference = vi.fn(polygonClippingKernel.difference), union = vi.fn(polygonClippingKernel.union), intersection = vi.fn(polygonClippingKernel.intersection);
  const triangulate = vi.fn(earcutTriangulationKernel.triangulate);
  const execute = vi.fn((request: GenerationRequest) => generateCoin(request.coin, request.settings, { difference, union, intersection }, { triangulate }));
  const store = createEditorStore({ execute });
  imported(store); await flush();
  const before = selectCurrentGeneration(store.getState())!;
  expect(before.status).toBe('valid');
  const clippingCount = difference.mock.calls.length + union.mock.calls.length + intersection.mock.calls.length;
  const tessellationCount = triangulate.mock.calls.length;
  expect(clippingCount).toBeGreaterThan(0); expect(tessellationCount).toBeGreaterThan(0);
  store.getState().setColor('middle', '#ABCDEF'); await flush();
  const after = selectCurrentGeneration(store.getState())!;
  expect(execute).toHaveBeenCalledTimes(1);
  expect(difference.mock.calls.length + union.mock.calls.length + intersection.mock.calls.length).toBe(clippingCount);
  expect(triangulate).toHaveBeenCalledTimes(tessellationCount);
  expect(after.unifiedMesh).toBe(before.unifiedMesh);
  expect(after.parts[1].mesh).toBe(before.parts[1].mesh);
  expect(after.parts[1].color).toBe('#ABCDEF');
  expect(before.parts[1].color).toBe('#808080');
  expect(after.input.settingsRevision).toBe(1);
  expect(after.colorBoundaryHeightsMm).toEqual(before.colorBoundaryHeightsMm);
});

test('invalid thickness clears current geometry; reorder derives supported geometry afresh', async () => {
  const store = createEditorStore({ execute: computed });
  imported(store); await flush();
  const original = selectCurrentGeneration(store.getState())!;
  store.getState().setThickness('middle', -1);
  expect(selectExportableGeometry(store.getState())).toBeNull();
  expect(selectStalePreview(store.getState())).toBe(original);
  await flush();
  expect(store.getState().generationStatus).toBe('invalid');
  expect(selectStalePreview(store.getState())).toBeNull();
  store.getState().setThickness('middle', 0.4); await flush();
  expect(selectCurrentGeneration(store.getState())).not.toBeNull();
  store.getState().reorderArtwork(['top', 'middle']); await flush();
  expect(store.getState().generationStatus).toBe('ready');
  expect(store.getState().result?.diagnostics.some(d => d.code === 'SUPPORT_OUTSIDE_LOWER')).toBe(false);
  expect(selectExportableGeometry(store.getState())).not.toBeNull();
  expect(selectCurrentGeneration(store.getState())?.activeTiers.map(t => t.layerId)).toEqual(['base', 'top', 'middle']);
});

test('visibility/order/thickness edits generate again; locked base and invalid order are no-ops; selection is separate', async () => {
  const execute = vi.fn(computed), store = createEditorStore({ execute });
  imported(store); await flush();
  const source = store.getState().importState.coin;
  store.getState().setEnabled('base', false);
  store.getState().reorderArtwork(['base', 'middle']);
  store.getState().reorderArtwork(['top', 'top']);
  store.getState().selectLayer('top');
  store.getState().selectLayer('unknown');
  expect(store.getState().selectedLayerId).toBe('top');
  expect(store.getState().settings?.revision).toBe(0);
  store.getState().setEnabled('middle', false); await flush();
  expect(selectCurrentGeneration(store.getState())?.activeTiers.map(t => t.layerId)).toEqual(['base', 'top']);
  store.getState().setThickness('base', 2); await flush();
  store.getState().reorderArtwork(['top', 'middle']); await flush();
  expect(execute).toHaveBeenCalledTimes(4);
  expect(store.getState().importState.coin).toBe(source);
  expect(execute.mock.calls.every(([request]) => request.coin.layers[0].footprintMm === source!.layers[0].footprintMm)).toBe(true);
  imported(store, coin('again')); await flush();
  expect(execute).toHaveBeenCalledTimes(5);
  expect(store.getState().selectedLayerId).toBeNull();
  expect(store.getState().importState.coin).not.toBe(source);
});

test('store owns immutable detached plain DTO snapshots; caller and response mutation cannot alter current truth', async () => {
  const source = coin();
  const response = computed({ token: 0, sourceRevision: 0, coin: source, settings: { importId: 'one', revision: 0, layers: [
    { role: 'base', enabled: true, layerId: 'base', color: '#808080', thicknessMm: 1.6 },
    { role: 'artwork', enabled: true, layerId: 'middle', color: '#808080', thicknessMm: 0.4 },
    { role: 'artwork', enabled: true, layerId: 'top', color: '#808080', thicknessMm: 0.4 },
  ] } });
  const store = createEditorStore({ execute: () => response });
  imported(store, source); await flush();
  const current = selectCurrentGeneration(store.getState())!;
  expect(Object.isFrozen(store.getState().importState.coin?.layers[0].footprintMm[0].outer[0])).toBe(true);
  expect(Object.isFrozen(store.getState().settings?.layers[0])).toBe(true);
  expect(Object.isFrozen(current.unifiedMesh.vertices[0])).toBe(true);
  expect(JSON.parse(JSON.stringify(current))).toEqual(current);
  expect(Object.isFrozen(source)).toBe(false);
  expect(Object.isFrozen(response)).toBe(false);
  (source.source as { fileName: string }).fileName = 'changed';
  if (response.status === 'valid') (response.parts[0] as { color: string }).color = '#000000';
  expect(store.getState().importState.coin?.source.fileName).toBe('same.svg');
  expect(current.parts[0].color).toBe('#808080');
});

test('latest import wins including rejected defaults; unexpected transport failure and forged stale valid response fail closed', async () => {
  const { store, jobs, finish } = deferred();
  const first = store.getState().beginImport('slow.svg');
  imported(store, coin('new')); await flush();
  store.getState().finishImport(first, { status: 'imported', coin: coin('old'), diagnostics: [] });
  expect(store.getState().importState.coin?.source.importId).toBe('new');
  const oldState = store.getState(), malformed = { ...coin('bad'), layers: [] };
  imported(store, malformed);
  expect(store.getState().importState.coin).toBe(oldState.importState.coin);
  expect(store.getState().settings).toBe(oldState.settings);
  await flush();
  jobs[1].reject(new Error('private transport exception')); await flush();
  expect(store.getState().generationStatus).toBe('invalid');
  expect(JSON.stringify(store.getState().result)).not.toContain('private');
  finish(0); await flush(); expect(selectCurrentGeneration(store.getState())).toBeNull();
  store.getState().setThickness('base', 2); await flush();
  const stale = computed(jobs[0].request); jobs[2].resolve(stale); await flush();
  expect(store.getState().generationStatus).toBe('invalid');
  expect(selectExportableGeometry(store.getState())).toBeNull();
});


test('geometry reuse equality rejects every geometry edit, including disabled entries and order', async () => {
  const { store } = deferred(); imported(store); await flush();
  const settings = store.getState().settings!;
  expect(sameGeometrySettings(settings, { ...settings, revision: 99, layers: settings.layers.map(layer => ({ ...layer, color: '#123456' })) as unknown as typeof settings.layers })).toBe(true);
  for (const changed of [
    { ...settings, importId: 'other' },
    { ...settings, layers: [settings.layers[0], settings.layers[2], settings.layers[1]] as unknown as typeof settings.layers },
    { ...settings, layers: settings.layers.map(layer => ({ ...layer, thicknessMm: 2 })) as unknown as typeof settings.layers },
    { ...settings, layers: settings.layers.map(layer => layer.role === 'artwork' ? { ...layer, enabled: false } : layer) as unknown as typeof settings.layers },
  ]) expect(sameGeometrySettings(settings, changed)).toBe(false);
});

test('fixing invalid color while work is pending starts valid work instead of projecting a rejected request', async () => {
  const { store, jobs, finish } = deferred(); imported(store); await flush(); finish(0); await flush();
  store.getState().setColor('top', 'bad'); await flush();
  store.getState().setColor('top', '#123456'); await flush();
  expect(jobs).toHaveLength(3);
  finish(1); await flush(); expect(store.getState().generationStatus).toBe('pending');
  finish(2); await flush(); expect(selectCurrentGeneration(store.getState())?.parts[2].color).toBe('#123456');
});
