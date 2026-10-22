// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from '../../app/src/components/AppShell';
import { createEditorStore, selectCurrentGeneration } from '../../app/src/state/editorStore';
import type { EditorDependencies } from '../../app/src/state/editorStore';
import type { ImportedCoin } from '../../app/src/core/contracts';
import { generateCoin } from '../../app/src/core/generateCoin';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';

vi.mock('../../app/src/preview/CoinPreview', () => ({ CoinPreview: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement('div'); document.body.append(container);
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); vi.restoreAllMocks(); });
const coin: ImportedCoin = {
  schemaVersion: 1, source: { importId: 'source', fileName: 'nested.svg', byteLength: 10, svgText: '<svg/>' },
  physicalPageMm: [10, 10], sizeOrigin: 'explicit', baseLayerId: 'base', diagnostics: [],
  layers: [ ['base', 'Base', 0, 10], ['middle', 'Middle', 1, 9], ['top', 'Top', 3, 7] ].map(([id, name, a, b], sourceOrder) => {
    const lo = a as number, hi = b as number;
    return { id: id as string, name: name as string, sourceOrder, sourceElements: [], boundsMm: [lo, lo, hi, hi], areaMm2: (hi - lo) ** 2,
      footprintMm: [{ outer: [[lo, lo], [hi, lo], [hi, hi], [lo, hi]], holes: [] }] };
  }),
};
async function setup(dependencies: EditorDependencies = {}) {
  const execute = vi.fn(dependencies.execute ?? (request => generateCoin(request.coin, request.settings, polygonClippingKernel, earcutTriangulationKernel)));
  const store = createEditorStore({ ...dependencies, execute });
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AppShell, { store }));
    const request = store.getState().beginImport('nested.svg');
    store.getState().finishImport(request, { status: 'imported', coin, diagnostics: [] });
  });
  return { store, execute };
}
function control<T extends HTMLElement = HTMLButtonElement>(label: string): T {
  const node = [...container.querySelectorAll<HTMLElement>('[aria-label]')].find(node => node.getAttribute('aria-label') === label);
  if (!node) throw new Error(`Missing control: ${label}`); return node as T;
}
function row(id: string) { return container.querySelector<HTMLElement>(`[data-layer-id="${id}"]`)!; }
function ids() { return [...container.querySelectorAll('[data-layer-id]')].map(node => node.getAttribute('data-layer-id')); }
async function click(label: string) { await act(async () => control<HTMLButtonElement>(label).click()); }
async function type(input: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(input: HTMLElement, key: string) { await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))); }
async function blur(input: HTMLElement) { await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))); }

test('base stays at the bottom; display order is top to bottom while settings stay bottom to top', async () => {
  const { store } = await setup();
  expect(selectCurrentGeneration(store.getState())?.dimensionsMm[2]).toBeCloseTo(2.4);
  expect(ids()).toEqual(['top', 'middle', 'base']);
  expect(container.querySelector('.source-summary,.layer-order,.reorder-help')).toBeNull();
  expect(control('Drag Top to reorder').textContent).toBe('=');
  expect(control('Move Middle toward base').textContent).toContain('\u21CA');
  expect(control('Move Middle toward top').textContent).toContain('\u21C8');
  expect(store.getState().settings!.layers.map(layer => layer.layerId)).toEqual(['base', 'middle', 'top']);
  expect(row('base').querySelector('.reorder-controls,input[type="checkbox"]')).toBeNull();
  const input = control<HTMLInputElement>('Thickness for Middle (mm)');
  await type(input, '0.75'); await key(input, 'Enter');
  await type(input, 'bad draft');
  const selection = row('middle').querySelector<HTMLButtonElement>('.layer-select')!;
  await act(async () => selection.focus());
  await click('Move Middle toward top');
  expect(ids()).toEqual(['middle', 'top', 'base']);
  expect(store.getState().selectedLayerId).toBe('middle');
  expect(document.activeElement).toBe(selection);
  expect(input.value).toBe('bad draft');
  expect(store.getState().settings!.layers[2]).toMatchObject({ layerId: 'middle', thicknessMm: .75, enabled: true });
  expect(store.getState().settings!.layers.map(layer => layer.layerId)).toEqual(['base', 'top', 'middle']);
  expect(container.textContent).toContain('Middle moved to raised position 2 of 2');
  expect(store.getState().generationStatus).toBe('ready');
  expect(container.textContent).not.toContain('SUPPORT_OUTSIDE_LOWER');
  expect(selectCurrentGeneration(store.getState())?.dimensionsMm[2]).toBeCloseTo(2.75);
  await click('Show Top');
  const result = selectCurrentGeneration(store.getState())!;
  expect(result.activeTiers.map(t => [t.layerId, t.bottomZMm, t.topZMm])).toEqual([['base', 0, 1.6], ['middle', 1.6, 2.35]]);
  expect(result.dimensionsMm[2]).toBe(2.35);
  expect(control<HTMLInputElement>('Show Top').checked).toBe(false);
  await click('Show Top');
  expect(store.getState().generationStatus).toBe('ready');
  await click('Move Middle toward base');
  expect(selectCurrentGeneration(store.getState())?.activeTiers.map(t => t.layerId)).toEqual(['base', 'middle', 'top']);
});

test.each(['', '-', '0', '-0.1', '1e', '1e309', 'Infinity', 'NaN', '0x10', '0.4junk'])('invalid thickness %j stays local on Enter/blur; Escape restores committed value', async text => {
  const { store, execute } = await setup();
  const input = control<HTMLInputElement>('Thickness for Top (mm)');
  await type(input, text); await key(input, 'Enter'); await blur(input);
  expect(input.value).toBe(text);
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(row('top').textContent).toContain('Committed thickness is 0.4 mm');
  expect(store.getState().settings!.revision).toBe(0);
  expect(execute).toHaveBeenCalledTimes(1);
  await key(input, 'Escape');
  expect(input.value).toBe('0.4'); expect(input.getAttribute('aria-invalid')).toBe('false');
});

test('valid numeric draft commits once per Enter/blur and updates actual Z without replacing source', async () => {
  const { store, execute } = await setup(); const source = store.getState().importState.coin;
  const input = control<HTMLInputElement>('Thickness for Top (mm)');
  await type(input, '.8');
  expect(store.getState().settings!.revision).toBe(0);
  await key(input, 'Enter'); await blur(input);
  expect(store.getState().settings!.revision).toBe(1); expect(execute).toHaveBeenCalledTimes(2);
  expect(selectCurrentGeneration(store.getState())?.dimensionsMm[2]).toBeCloseTo(2.8);
  await type(input, '1e-1'); await blur(input);
  expect(store.getState().settings!.revision).toBe(2);
  expect(selectCurrentGeneration(store.getState())?.dimensionsMm[2]).toBeCloseTo(2.1);
  expect(store.getState().importState.coin).toBe(source);
});

test('opaque color commits reuse checked meshes with zero new geometry execution', async () => {
  const { store, execute } = await setup(); const mesh = selectCurrentGeneration(store.getState())!.unifiedMesh;
  await type(control<HTMLInputElement>('Display color for Top'), '#f012ab');
  expect(execute).toHaveBeenCalledTimes(1);
  const result = selectCurrentGeneration(store.getState())!;
  expect(result.unifiedMesh).toBe(mesh);
  expect(result.activeTiers.find(t => t.layerId === 'top')!.color).toBe('#f012ab');
  expect(store.getState().settings!.revision).toBe(1);
});

test('pending edits never display old Z as current; pending replacement pauses controls and atomic reimport resets drafts', async () => {
  const { store } = await setup({ execute: () => new Promise(() => {}) });
  expect(container.querySelector('.dimension-summary')?.textContent).toContain('Pending');
  expect(row('top').querySelector('.tier-interval,details')).toBeNull();
  const input = control<HTMLInputElement>('Thickness for Top (mm)'); await type(input, 'unfinished');
  let request = 0;
  await act(async () => { request = store.getState().beginImport('replace.svg'); });
  expect(input.disabled).toBe(true);
  expect(control<HTMLButtonElement>('Drag Top to reorder').disabled).toBe(true);
  await act(async () => store.getState().finishImport(request, { status: 'imported', coin: { ...coin, source: { ...coin.source, importId: 'new' } }, diagnostics: [] }));
  expect(control<HTMLInputElement>('Thickness for Top (mm)').value).toBe('0.4');
  expect(store.getState().selectedLayerId).toBeNull();
});

test.each(['mouse', 'touch'])('captured %s drag commits on release only, keeps base and supports cancel', async pointerType => {
  const { store } = await setup();
  const handle = control<HTMLButtonElement>('Drag Top to reorder');
  handle.setPointerCapture = vi.fn();
  for (const id of ['top', 'middle', 'base']) vi.spyOn(row(id), 'getBoundingClientRect').mockImplementation(() => ({ top: ids().indexOf(id) * 100, height: 100 } as DOMRect));
  async function pointer(type: string, clientY: number) {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { button: 0, isPrimary: true, pointerId: 4, pointerType, clientY });
    await act(async () => handle.dispatchEvent(event));
  }
  await pointer('pointerdown', 50); await pointer('pointermove', 110);
  expect(ids()).toEqual(['top', 'middle', 'base']);
  await key(handle, 'Escape'); await pointer('pointerup', 110);
  expect(store.getState().settings!.revision).toBe(0);
  await pointer('pointerdown', 50); await pointer('pointermove', 190); await pointer('pointerup', 190);
  expect(ids()).toEqual(['middle', 'top', 'base']);
  expect(store.getState().generationStatus).toBe('ready');
  expect(store.getState().settings!.layers.map(layer => layer.layerId)).toEqual(['base', 'top', 'middle']);
  await pointer('pointerdown', 150); await pointer('pointermove', 50); await pointer('pointerup', 50);
  expect(ids()).toEqual(['top', 'middle', 'base']);
  expect(store.getState().settings!.layers.map(layer => layer.layerId)).toEqual(['base', 'middle', 'top']);
  await pointer('pointerdown', 50); await pointer('pointermove', 400); await pointer('pointercancel', 400); await pointer('pointerup', 400);
  expect(store.getState().settings!.revision).toBe(2);
});

test.each(['Enter', 'blur'])('commit reads the current field value on %s even before a draft render arrives', async trigger => {
  const { store, execute } = await setup();
  const input = control<HTMLInputElement>('Thickness for Top (mm)');
  // Native/integration input delivery can make the element current before the
  // rendered draft closure. Commit must use the event field, not stale state.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
  if (trigger === 'Enter') await key(input, 'Enter'); else await blur(input);
  expect(store.getState().settings!.layers[2].thicknessMm).toBe(2);
  expect(store.getState().settings!.revision).toBe(1);
  expect(selectCurrentGeneration(store.getState())?.dimensionsMm[2]).toBe(4);
  await blur(input);
  expect(store.getState().settings!.revision).toBe(1);
  expect(execute).toHaveBeenCalledTimes(2);
});
