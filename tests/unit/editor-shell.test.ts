// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import type { CoinImportResult } from '../../app/src/core/canonicalImport';
import type { ImportedCoin } from '../../app/src/core/contracts';
import { AppShell } from '../../app/src/components/AppShell';
import { EditorErrorBoundary } from '../../app/src/components/EditorErrorBoundary';
import { PreviewViewport } from '../../app/src/components/PreviewViewport';
import type { PreviewState } from '../../app/src/components/PreviewViewport';
import { readLocalCoin } from '../../app/src/import/importCoinSvg';
import { generateCoin } from '../../app/src/core/generateCoin';
import { createEditorStore } from '../../app/src/state/editorStore';
import type { GenerationRequest } from '../../app/src/state/editorStore';
import type { GeneratedCoin } from '../../app/src/core/contracts';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';

vi.mock('../../app/src/import/importCoinSvg', () => ({ readLocalCoin: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement('div');
document.body.append(container);
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function render(element: ReactNode = createElement(AppShell)) {
  root ??= createRoot(container);
  await act(async () => root!.render(element));
}
async function select(name: string) {
  const input = container.querySelector('input')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['source'], name)] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
const warning = { code: 'ARTWORK_IGNORED', severity: 'warning', message: 'Retained artwork warning.', remediation: 'Show artwork.', location: { scope: 'document' } } as const;
const failure: CoinImportResult = { status: 'rejected', diagnostics: [{ code: 'SOURCE_EMPTY', severity: 'error', message: 'Candidate is empty.', remediation: 'Select a nonempty SVG.', location: { scope: 'document' } }] };
const coin: ImportedCoin = {
  schemaVersion: 1, source: { importId: 'source-id', fileName: 'retained.svg', byteLength: 10, svgText: '<svg/>' },
  physicalPageMm: [10, 10], sizeOrigin: 'explicit', baseLayerId: 'base', diagnostics: [warning],
  layers: [{ id: 'base', name: 'Base', sourceOrder: 0, sourceElements: [], boundsMm: [0, 0, 10, 10], areaMm2: 100,
    footprintMm: [{ outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [] }] }],
};
const imported: CoinImportResult = { status: 'imported', coin, diagnostics: [warning] };

test('shell has labeled local input, skip destination, empty panel and gated exports', async () => {
  await render();
  expect(container.querySelector('main')?.id).toBe('editor');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('#editor');
  expect(container.querySelector('label')?.htmlFor).toBe(container.querySelector('input')?.id);
  expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBe('local-file-note');
  expect(container.querySelector('[data-state="empty"]')?.textContent).toContain('Start with your artwork');
  expect(container.textContent).toContain('No layers yet');
  expect([...container.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
  expect(container.querySelector('canvas,svg,img')).toBeNull();
});

test('imported starts generation; newest failed candidate beats older success and keeps old source/warnings', async () => {
  await render();
  vi.mocked(readLocalCoin).mockResolvedValueOnce(imported);
  await select('retained.svg');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(container.querySelector('[data-state="ready"]')?.textContent).toContain('Geometry checked');
  let finishOld!: (result: CoinImportResult) => void;
  vi.mocked(readLocalCoin).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
  await select('slow.svg');
  expect(container.querySelector('[aria-busy="true"]')?.textContent).toContain('slow.svg');
  expect(container.querySelector('.layer-panel')?.textContent).toContain('Base');
  vi.mocked(readLocalCoin).mockResolvedValueOnce(failure);
  await select('empty.svg');
  await act(async () => finishOld({ ...imported, coin: { ...coin, source: { ...coin.source, fileName: 'stale.svg' } } }));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Candidate is empty.');
  expect(container.querySelector('[role="alert"]')?.textContent).not.toContain('Retained artwork warning.');
  expect(container.querySelector('.layer-panel')?.textContent).toContain('Retained artwork warning.');
  expect(container.textContent).toContain('retained.svg');
  expect(container.textContent).not.toContain('stale.svg');
  expect(container.querySelector('[data-state="invalid"]')?.textContent).toContain('previous SVG remains');
  expect([...container.querySelectorAll<HTMLButtonElement>('.export-controls button')].every(b => b.disabled)).toBe(true);
});

test('first import rejection has no source or pretend preview', async () => {
  vi.mocked(readLocalCoin).mockResolvedValueOnce(failure);
  await render();
  await select('empty.svg');
  expect(container.querySelector('[data-state="invalid"]')?.textContent).toContain('SVG import failed');
  expect(container.textContent).toContain('No layers yet');
  expect(container.querySelector('canvas,svg,img')).toBeNull();
});

test('future preview variants require a checked current result and never mount geometry', async () => {
  const settings = createDefaultCoinSettings(coin);
  if (settings.status !== 'created') throw new Error('Invalid test defaults');
  const result = generateCoin(coin, settings.settings, polygonClippingKernel, earcutTriangulationKernel);
  expect(result.status).toBe('valid');
  const current = { importId: coin.source.importId, settingsRevision: 0 };
  const cases: readonly [PreviewState, string, string][] = [
    [{ status: 'generating' }, 'generating', 'Generating coin'],
    [{ status: 'ready', result, current }, 'ready', 'Geometry checked'],
    [{ status: 'ready', result, current: { ...current, settingsRevision: 1 } }, 'invalid', 'No current checked geometry'],
    [{ status: 'ready', result, current: { ...current, importId: 'replaced' } }, 'invalid', 'No current checked geometry'],
    [{ status: 'ready', result: { status: 'invalid', schemaVersion: 1, diagnostics: [], input: current }, current }, 'invalid', 'No current checked geometry'],
    [{ status: 'ready', result: { ...result, diagnostics: failure.diagnostics }, current }, 'invalid', 'No current checked geometry'],
    [{ status: 'invalid', reason: 'generation', retainedSource: true }, 'invalid', 'Coin geometry needs attention'],
  ];
  for (const [state, status, text] of cases) {
    await render(createElement(PreviewViewport, { state }));
    expect(container.querySelector('[data-state]')?.getAttribute('data-state')).toBe(status);
    expect(container.textContent).toContain(text);
    expect(container.querySelector('canvas,svg,img')).toBeNull();
  }
});

test('render failure keeps import access and source ownership; reset and new selection recover without exposing exception', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = false;
  function View({ source }: { source: string }) {
    if (fail) throw new Error('Private exception <secret>');
    return createElement('p', null, source);
  }
  function Harness() {
    const [source, setSource] = useState('held.svg');
    const [revision, setRevision] = useState(0);
    return createElement('div', null,
      createElement('button', { onClick: () => { setSource('replacement.svg'); setRevision(v => v + 1); } }, 'Open SVG'),
      createElement(EditorErrorBoundary, { resetKey: revision, children: createElement(View, { source }) }),
    );
  }
  await render(createElement(Harness));
  fail = true;
  await render(createElement(Harness));
  expect(container.textContent).toContain('editor view could not be displayed');
  expect(container.textContent).not.toContain('Private exception');
  fail = false;
  await act(async () => container.querySelectorAll('button')[1].click());
  expect(container.textContent).toContain('held.svg');
  fail = true;
  await render(createElement(Harness));
  fail = false;
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toContain('replacement.svg');
  expect(container.querySelector('[role="alert"]')).toBeNull();
});


test('store integration visibly gates former checked geometry while pending and shows current invalid diagnostics', async () => {
  const jobs: { request: GenerationRequest; finish: (result: GeneratedCoin) => void }[] = [];
  const store = createEditorStore({ execute: request => new Promise(resolve => jobs.push({ request, finish: resolve })) });
  await render(createElement(AppShell, { store }));
  await act(async () => {
    const id = store.getState().beginImport('retained.svg');
    store.getState().finishImport(id, imported);
  });
  expect(container.querySelector('[data-state="generating"]')?.textContent).toContain('No current preview is ready');
  await act(async () => jobs[0].finish(generateCoin(jobs[0].request.coin, jobs[0].request.settings, polygonClippingKernel, earcutTriangulationKernel)));
  expect(container.querySelector('[data-state="ready"]')?.textContent).toContain('10 × 10 × 1.6 mm');
  await act(async () => store.getState().setThickness('base', 0));
  expect(container.querySelector('[data-state="generating"]')?.textContent).toContain('Previous checked geometry is stale');
  expect([...container.querySelectorAll<HTMLButtonElement>('.export-controls button')].every(button => button.disabled)).toBe(true);
  await act(async () => jobs[1].finish(generateCoin(jobs[1].request.coin, jobs[1].request.settings, polygonClippingKernel, earcutTriangulationKernel)));
  expect(container.querySelector('[data-state="invalid"]')?.textContent).toContain('Coin geometry needs attention');
  expect(container.querySelector('[aria-label="Geometry diagnostics"]')?.textContent).toContain('SETTINGS_INVALID');
  expect(container.textContent).not.toContain('Geometry checked');
  expect(container.textContent).not.toContain('Previous checked geometry is stale');
});
