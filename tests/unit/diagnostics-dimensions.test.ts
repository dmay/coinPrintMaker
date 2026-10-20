// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { createEditorStore } from '../../app/src/state/editorStore';
import type { GenerationRequest } from '../../app/src/state/editorStore';
import type { GeneratedCoin, ImportedCoin } from '../../app/src/core/contracts';
import { createDiagnostic } from '../../app/src/core/diagnostics';
import { generateCoin } from '../../app/src/core/generateCoin';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';
import { selectGeometryPresentation } from '../../app/src/state/editorPresentation';
import { AppShell } from '../../app/src/components/AppShell';
import { DiagnosticsPanel } from '../../app/src/components/DiagnosticsPanel';
import { DimensionSummary, formatMeasurement } from '../../app/src/components/DimensionSummary';

vi.mock('../../app/src/preview/CoinPreview', () => ({ CoinPreview: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement('div'); document.body.append(container);
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => { await act(async () => root?.unmount()); root = null; vi.restoreAllMocks(); });
async function render(element: import('react').ReactNode) { root ??= createRoot(container); await act(async () => root!.render(element)); }
const footprint = [{ outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [] }] as ImportedCoin['layers'][number]['footprintMm'];
const coin: ImportedCoin = { schemaVersion: 1, source: { importId: 'one', fileName: 'retained.svg', byteLength: 6, svgText: '<svg/>' }, physicalPageMm: [10, 10], sizeOrigin: 'explicit', baseLayerId: 'base', diagnostics: [],
  layers: [{ id: 'base', name: '<Base>', sourceOrder: 0, sourceElements: [], footprintMm: footprint, boundsMm: [0, 0, 10, 10], areaMm2: 100 }] };
function harness() {
  const jobs: { request: GenerationRequest; finish: (result: GeneratedCoin) => void }[] = [];
  const store = createEditorStore({ execute: request => new Promise(resolve => jobs.push({ request, finish: resolve })) });
  return { store, jobs, import: () => { store.getState().finishImport(store.getState().beginImport('retained.svg'), { status: 'imported', coin, diagnostics: [] }); },
    finish: async (i: number) => { await act(async () => jobs[i].finish(generateCoin(jobs[i].request.coin, jobs[i].request.settings, polygonClippingKernel, earcutTriangulationKernel))); } };
}

test('shell shows checked width/depth/cumulative height/volume and Z, clears metrics during pending and keyless invalid, restores only latest checked result', async () => {
  const h = harness(); await render(createElement(AppShell, { store: h.store }));
  await act(async () => h.import()); await h.finish(0);
  const measurement = () => container.querySelector('.dimension-summary')!;
  expect(measurement().textContent).toContain('Width (X)10 mm'); expect(measurement().textContent).toContain('Depth (Y)10 mm');
  expect(measurement().textContent).toContain('Total cumulative height (Z)1.6 mm'); expect(measurement().textContent).toContain('Volume160 mm³');
  expect(measurement().querySelector('tbody')?.textContent).toContain('<Base>ID: base01.6');
  expect(container.querySelector('base,svg')).toBeNull();
  expect(container.querySelector('.export-controls')?.textContent).toContain('Current geometry is valid');
  await act(async () => h.store.getState().setThickness('base', 2));
  expect(measurement().textContent).toContain('Pending'); expect(measurement().textContent).toContain('stale'); expect(measurement().querySelector('dl,table')).toBeNull();
  await act(async () => h.jobs[1].finish({ schemaVersion: 1, status: 'invalid', diagnostics: [createDiagnostic('GENERATION_WORKER_FAILED', { scope: 'document' })] }));
  expect(measurement().textContent).toContain('invalid'); expect(measurement().querySelector('dl,table')).toBeNull();
  expect(container.querySelector('.diagnostics-panel')?.textContent).toContain('Error · GENERATION_WORKER_FAILED');
  expect(container.querySelector('.diagnostics-panel')?.textContent).toContain('Action:');
  await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent === 'Retry generation')!.click()); await h.finish(2);
  expect(measurement().textContent).toContain('Volume200 mm³');
  expect([...container.querySelectorAll<HTMLButtonElement>('.export-controls button')].map(b=>b.disabled)).toEqual([false,true]);
});

test('candidate failure and retained measurements remain distinct in the full shell', async () => {
  const h=harness(); await render(createElement(AppShell, {store:h.store})); await act(async ()=>h.import()); await h.finish(0);
  await act(async () => { const id=h.store.getState().beginImport('bad.svg'); h.store.getState().finishImport(id, { status: 'rejected', diagnostics: [createDiagnostic('SCRIPT_UNSUPPORTED', { scope:'document' })] }); });
  expect(container.querySelector('.import-status')?.textContent).toContain('Replacement failed');
  expect(container.querySelector('.dimension-summary')?.textContent).toContain('retained loaded SVG');
  expect(container.querySelector('.diagnostics-panel')?.textContent).not.toContain('SCRIPT_UNSUPPORTED');
  expect(container.querySelector('.diagnostics-panel')?.textContent).toContain('0 errors');
});

test('paged diagnostics retain all errors/warnings, stable layer selection is navigation only, and text is escaped', async () => {
  const h=harness(); await act(async ()=>h.import()); await h.finish(0);
  const state = h.store.getState(); const result = state.result;
  if (!result) throw new Error('Missing result');
  const diagnostics = Array.from({length: 19}, (_,i)=> ({ ...createDiagnostic(i===0 ? 'SUPPORT_OUTSIDE_LOWER' : 'ARTWORK_IGNORED', {scope:'layer',layerId:'base',layerName:'<script>bad</script>'}), message: `Entry ${i}` }));
  h.store.setState({generationStatus:'invalid',result:{schemaVersion:1,status:'invalid',diagnostics}});
  const view=selectGeometryPresentation(h.store.getState());
  await render(createElement(DiagnosticsPanel, { view, onSelectLayer:h.store.getState().selectLayer, onRetry:h.store.getState().retryGeneration }));
  expect(container.querySelectorAll('li')).toHaveLength(8); expect(container.textContent).toContain('1 error · 18 warnings');
  expect(container.textContent).toContain('Layer <Base> (ID: base)'); expect(container.querySelector('script')).toBeNull();
  const settings=h.store.getState().settings, token=h.store.getState().generationToken;
  await act(async ()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Select layer base')!.click());
  expect(h.store.getState().selectedLayerId).toBe('base'); expect(h.store.getState().settings).toBe(settings); expect(h.store.getState().generationToken).toBe(token);
  await act(async ()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Next diagnostics')!.click());
  expect(container.textContent).toContain('9–16 of 19'); expect(container.textContent).toContain('Entry 15');
  await act(async ()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Next diagnostics')!.click());
  expect(container.querySelectorAll('li')).toHaveLength(3); expect(container.textContent).toContain('Entry 18');
});

test('stale presentation never renders checked measurement values, including a forged ready revision', async () => {
  const h=harness(); await act(async ()=>h.import()); await h.finish(0);
  const state=h.store.getState(); if(!state.settings) throw new Error('Missing settings');
  h.store.setState({ settings:{...state.settings,revision:4} });
  await render(createElement(DimensionSummary,{view:selectGeometryPresentation(h.store.getState())}));
  expect(container.textContent).toContain('Stale'); expect(container.querySelector('dl,table')).toBeNull();
  expect(formatMeasurement(1e-10)).not.toBe('0');
});
