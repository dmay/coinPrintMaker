// @vitest-environment jsdom
import { act, createElement } from 'react';
import type { Ref } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from '../../app/src/components/AppShell';
import { PreviewViewport } from '../../app/src/components/PreviewViewport';
import { createEditorStore, selectCurrentGeneration } from '../../app/src/state/editorStore';
import { generateCoin } from '../../app/src/core/generateCoin';
import { GenerationWorkerFailure } from '../../app/src/worker/generationTransport';
import type { ImportedCoin } from '../../app/src/core/contracts';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';

const mock = vi.hoisted(() => ({ fail: false, scene: vi.fn() }));
vi.mock('@react-three/fiber', async () => {
  const React = await import('react');
  return { Canvas: React.forwardRef((_props: unknown, ref: Ref<HTMLCanvasElement>) => {
    if (mock.fail) throw new Error('Private WebGL initialization detail');
    return React.createElement('div', null, React.createElement('canvas', { ref }), (_props as { children: React.ReactNode }).children);
  }) };
});
vi.mock('../../app/src/preview/CoinScene', () => ({ CoinScene: (props: unknown) => { mock.scene(props); return null; } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const coin: ImportedCoin = {
  schemaVersion: 1, source: { importId: 'preview', fileName: 'source.svg', byteLength: 1, svgText: '<svg/>' },
  physicalPageMm: [20, 20], sizeOrigin: 'explicit', baseLayerId: 'base', diagnostics: [],
  layers: [{ id: 'base', name: 'Base', sourceOrder: 0, sourceElements: [], boundsMm: [2, 4, 12, 14], areaMm2: 100,
    footprintMm: [{ outer: [[2, 4], [12, 4], [12, 14], [2, 14]], holes: [] }] }],
};
const container = document.createElement('div'); document.body.append(container);
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => { await act(async () => root?.unmount()); root = null; mock.fail = false; mock.scene.mockClear(); vi.restoreAllMocks(); });
async function render(node: React.ReactNode) { root ??= createRoot(container); await act(async () => root!.render(node)); }
async function ready() {
  const store = createEditorStore({ execute: request => generateCoin(request.coin, request.settings, polygonClippingKernel, earcutTriangulationKernel) });
  await render(createElement(AppShell, { store }));
  await act(async () => { const id = store.getState().beginImport('source.svg'); store.getState().finishImport(id, { status: 'imported', coin, diagnostics: [] }); });
  return store;
}
function lastScene() { return mock.scene.mock.lastCall![0] as { result: unknown; selectedLayerId: string | null; command: { preset: string; sequence: number } }; }
test('checked results and view commands flow through retained canvas; selection never commits a setting', async () => {
  const store = await ready(), canvas = container.querySelector('canvas');
  expect(canvas).not.toBeNull();
  expect(container.querySelector('.preview-heading .view-controls')).not.toBeNull();
  expect(container.querySelector('.preview-viewport')?.textContent).not.toMatch(/Geometry checked|Dimensions in mm|Preview shading/);
  expect(container.querySelector<HTMLDetailsElement>('.diagnostics-panel')?.open).toBe(false);
  const result = selectCurrentGeneration(store.getState());
  const revision = store.getState().settings!.revision;
  await act(async () => store.getState().selectLayer('base'));
  expect(lastScene().selectedLayerId).toBe('base');
  expect(selectCurrentGeneration(store.getState())).toBe(result);
  expect(store.getState().settings!.revision).toBe(revision);
  for (const [label, preset] of [['Top view', 'top'], ['Side view', 'side'], ['Fit coin', 'fit'], ['Reset view', 'reset']]) {
    await act(async () => [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label)!.click());
    expect(lastScene().command.preset).toBe(preset);
  }
  await act(async () => store.getState().setColor('base', '#123456'));
  expect(container.querySelector('canvas')).toBe(canvas);
  await act(async () => store.getState().setThickness('base', 2.5));
  expect(container.querySelector('canvas')).toBe(canvas);
  expect(container.textContent).toContain('10 × 10 × 2.5 mm');
});
test('synthetic context loss retains text and editing; retry recreates only the canvas', async () => {
  const store = await ready(), canvas = container.querySelector('canvas')!;
  const lost = new Event('webglcontextlost', { cancelable: true });
  await act(async () => canvas.dispatchEvent(lost));
  expect(lost.defaultPrevented).toBe(true);
  expect(container.textContent).toContain('3D preview is unavailable');
  expect(container.textContent).toContain('10 × 10 × 1.6 mm');
  expect(container.querySelector('input[type=file]')?.hasAttribute('disabled')).toBe(false);
  await act(async () => store.getState().setThickness('base', 3));
  expect(container.textContent).toContain('10 × 10 × 3 mm');
  expect(container.querySelector('canvas')).toBeNull();
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Retry 3D preview')!.click());
  expect(container.querySelector('canvas')).not.toBeNull();
  expect(container.querySelector('canvas')).not.toBe(canvas);
  expect(container.textContent).not.toContain('3D preview is unavailable');
});
test('mock initialization failure is isolated from dimensions, source and controls', async () => {
  mock.fail = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const store = await ready();
  expect(container.textContent).toContain('3D preview is unavailable');
  expect(container.textContent).toContain('Geometry checked');
  expect(container.textContent).toContain('10 × 10 × 1.6 mm');
  expect(container.textContent).not.toContain('Private WebGL');
  expect(container.querySelector('.layer-panel')?.textContent).toContain('Base');
  expect(selectCurrentGeneration(store.getState())).not.toBeNull();
});
test('pending and invalid states send no stale mesh to retained renderer and keep diagnostics visible', async () => {
  const store = await ready(), result = selectCurrentGeneration(store.getState())!;
  const readyState = { status: 'ready', result, current: result.input } as const;
  await render(createElement(PreviewViewport, { state: readyState }));
  const canvas = container.querySelector('canvas');
  await render(createElement(PreviewViewport, { state: { status: 'generating', stalePreview: true } }));
  expect(lastScene().result).toBeNull();
  expect(container.querySelector('canvas')).toBe(canvas);
  expect(container.textContent).toContain('Previous checked geometry is stale');
  expect([...container.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
  await render(createElement(PreviewViewport, { state: { ...readyState, current: { ...result.input, settingsRevision: 99 } } }));
  expect(lastScene().result).toBeNull();
  expect(container.textContent).toContain('No current checked geometry');
  await render(createElement(PreviewViewport, { state: { status: 'invalid', reason: 'generation', retainedSource: true } }));
  expect(lastScene().result).toBeNull();
  expect(container.textContent).not.toContain('10 × 10');
});

test('background failure and retry stay usable with a failed preview and cannot expose old checked measurements', async () => {
  mock.fail = true; vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = false;
  const store = createEditorStore({ execute: request => {
    if (fail) throw new GenerationWorkerFailure();
    return generateCoin(request.coin, request.settings, polygonClippingKernel, earcutTriangulationKernel);
  } });
  await render(createElement(AppShell, { store }));
  await act(async () => { const id = store.getState().beginImport('source.svg'); store.getState().finishImport(id, { status: 'imported', coin, diagnostics: [] }); });
  fail = true;
  await act(async () => store.getState().setThickness('base', 2.7));
  expect(container.textContent).toContain('3D preview is unavailable');
  const diagnostics = container.querySelector('.diagnostics-panel')!;
  expect(diagnostics.textContent).toContain('GENERATION_WORKER_FAILED');
  expect(diagnostics.textContent).toContain('Current geometry is invalid');
  expect(container.querySelector('.preview-summary')).toBeNull();
  expect(container.querySelector('.internal-metrics')?.textContent).not.toContain('Unified mesh');
  expect(selectCurrentGeneration(store.getState())).toBeNull();
  expect([...container.querySelectorAll('button')].filter(button => button.textContent?.startsWith('Export')).every(button => button.disabled)).toBe(true);
  const revision = store.getState().settings!.revision, token = store.getState().generationToken;
  fail = false;
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Retry generation')!.click());
  expect(store.getState().settings!.revision).toBe(revision);
  expect(store.getState().generationToken).toBeGreaterThan(token);
  expect(selectCurrentGeneration(store.getState())?.input.settingsRevision).toBe(revision);
  expect(container.textContent).toContain('10 × 10 × 2.7 mm');
  expect(container.textContent).toContain('3D preview is unavailable');
});
