import { expect, test } from 'vitest';
import type { GeneratedCoin, ImportedCoin } from '../../app/src/core/contracts';
import { createDiagnostic } from '../../app/src/core/diagnostics';
import { generateCoin } from '../../app/src/core/generateCoin';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { createEditorStore } from '../../app/src/state/editorStore';
import type { EditorStore, GenerationRequest } from '../../app/src/state/editorStore';
import { selectGeometryPresentation } from '../../app/src/state/editorPresentation';

const rectangle = (min: number, max: number) => [{ outer: [[min, min], [max, min], [max, max], [min, max]], holes: [] }] as ImportedCoin['layers'][number]['footprintMm'];
const warning = createDiagnostic('SOURCE_SIZE_INFERRED', { scope: 'document' });
export function source(importId = 'coin'): ImportedCoin {
  return { schemaVersion: 1, source: { importId, fileName: 'coin.svg', svgText: '<svg/>', byteLength: 6 },
    physicalPageMm: [10, 10], sizeOrigin: 'inferred', baseLayerId: 'base', diagnostics: [warning],
    layers: [
      { id: 'base', name: 'Same name', sourceOrder: 0, sourceElements: [], boundsMm: [0, 0, 10, 10], areaMm2: 100, footprintMm: rectangle(0, 10) },
      { id: 'middle', name: 'Same name', sourceOrder: 1, sourceElements: [], boundsMm: [1, 1, 9, 9], areaMm2: 64, footprintMm: rectangle(1, 9) },
      { id: 'top', name: 'Same name', sourceOrder: 2, sourceElements: [], boundsMm: [2, 2, 8, 8], areaMm2: 36, footprintMm: rectangle(2, 8) },
    ] };
}
export function importSource(store: EditorStore, coin = source()) {
  store.getState().finishImport(store.getState().beginImport(coin.source.fileName), { status: 'imported', coin, diagnostics: coin.diagnostics });
}
export function computed(request: GenerationRequest) { return generateCoin(request.coin, request.settings, polygonClippingKernel, earcutTriangulationKernel); }
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function harness() {
  const jobs: { request: GenerationRequest; finish: (result: GeneratedCoin) => void }[] = [];
  const store = createEditorStore({ execute: request => new Promise(resolve => jobs.push({ request, finish: resolve })) });
  return { store, jobs, view: () => selectGeometryPresentation(store.getState()), finish: async (i: number) => { jobs[i].finish(computed(jobs[i].request)); await flush(); } };
}

test('current measurements come from checked domain result and warnings do not become errors/exporter availability', async () => {
  const h = harness(); importSource(h.store); await flush(); await h.finish(0);
  const view = h.view();
  expect(view.status).toBe('current');
  expect(view.current?.dimensionsMm).toEqual([10, 10, 2.4]);
  expect(view.current?.metrics.volumeMm3).toBeCloseTo(200);
  expect(view.current?.activeTiers.map(t => [t.layerId, t.bottomZMm, t.topZMm])).toEqual([['base', 0, 1.6], ['middle', 1.6, 2], ['top', 2, 2.4]]);
  expect(view.warningCount).toBe(1); expect(view.errorCount).toBe(0);
  expect(view.exportNote).toContain('valid'); expect(view.exportNote).toContain('STL and 3MF are available');
  const current = view.current;
  h.store.getState().selectLayer('middle'); h.store.getState().setColor('top', '#abcdef'); await flush();
  expect(h.jobs).toHaveLength(1);
  expect(h.view().current?.metrics).toBe(current?.metrics);
  expect(h.view().current?.input.settingsRevision).toBe(1);
});

test('rapid reorder/hide/show renders no former measurements or geometry errors until newest result wins', async () => {
  const h = harness(); importSource(h.store); await flush(); await h.finish(0);
  h.store.getState().reorderArtwork(['top', 'middle']); await flush();
  expect(h.view().status).toBe('pending'); expect(h.view().stalePreview).toBe(true); expect(h.view().current).toBeNull();
  h.store.getState().setEnabled('middle', false); await flush();
  h.store.getState().setEnabled('middle', true); await flush();
  h.store.getState().reorderArtwork(['middle', 'top']); await flush();
  await h.finish(4); const latest = h.view().current;
  await h.finish(1); await h.finish(2); await h.finish(3);
  expect(h.view().status).toBe('current'); expect(h.view().current).toBe(latest); expect(h.view().errorCount).toBe(0);
  expect(latest?.input.settingsRevision).toBe(4);
});

test('reordered duplicate names retain stable identities and show current extended support', async () => {
  const h = harness(); importSource(h.store); await flush(); await h.finish(0);
  h.store.getState().reorderArtwork(['top', 'middle']); await flush(); await h.finish(1);
  const view = h.view();
  expect(view.status).toBe('current'); expect(view.stalePreview).toBe(false);
  expect(view.errorCount).toBe(0); expect(view.warningCount).toBe(1);
  expect(view.diagnostics.some(d => d.diagnostic.code === 'SUPPORT_OUTSIDE_LOWER')).toBe(false);
  expect(view.current?.activeTiers.map(t=>t.layerId)).toEqual(['base','top','middle']);
  expect(view.current?.parts[1].metrics.volumeMm3).toBeCloseTo(64 * .4);
  h.store.getState().setEnabled('top', false); await flush();
  expect(h.view().current).toBeNull();
  await h.finish(2);
  expect(h.view().current?.dimensionsMm[2]).toBe(2);
  expect(h.view().current?.activeTiers.map(t=>t.layerId)).toEqual(['base', 'middle']);
});

test('keyless invalid response remains actionable and mismatched keyed results never expose measurements', async () => {
  const h = harness(); importSource(h.store); await flush();
  h.jobs[0].finish({ schemaVersion: 1, status: 'invalid', diagnostics: [createDiagnostic('GENERATION_WORKER_FAILED', { scope: 'document' })] }); await flush();
  expect(h.view().status).toBe('invalid'); expect(h.view().diagnostics.some(d=>d.diagnostic.code === 'GENERATION_WORKER_FAILED')).toBe(true);
  h.store.setState({ result: { schemaVersion: 1, status: 'invalid', input: { importId: 'old', settingsRevision: 0 }, diagnostics: [] } });
  expect(h.view().status).toBe('stale'); expect(h.view().current).toBeNull();
  expect(h.view().diagnostics.some(d=>d.diagnostic.code === 'GEOMETRY_STALE')).toBe(true);
});

test('pending replacement gates retained geometry, failure restores it and candidate errors stay separate', async () => {
  const h = harness(); importSource(h.store); await flush(); await h.finish(0);
  const checked = h.view().current;
  const request = h.store.getState().beginImport('failed.svg');
  expect(h.view().status).toBe('importing'); expect(h.view().current).toBeNull(); expect(h.view().stalePreview).toBe(true);
  h.store.getState().finishImport(request, { status: 'rejected', diagnostics: [createDiagnostic('SCRIPT_UNSUPPORTED', { scope: 'document' })] });
  expect(h.view().status).toBe('current'); expect(h.view().rejectedImport).toBe(true); expect(h.view().current).toBe(checked);
  expect(h.view().diagnostics.map(d=>d.diagnostic.code)).toEqual(['SOURCE_SIZE_INFERRED']);
  importSource(h.store, source('replacement')); await flush();
  expect(h.view().current).toBeNull(); expect(h.view().stalePreview).toBe(false);
  await h.finish(1); expect(h.view().current?.input.importId).toBe('replacement');
});

test('presentation is a nonmutating projection and empty source has no pretend metrics', () => {
  const h = harness(); const state = h.store.getState();
  expect(h.view().status).toBe('empty'); expect(h.view().current).toBeNull();
  expect(h.store.getState()).toBe(state);
});
