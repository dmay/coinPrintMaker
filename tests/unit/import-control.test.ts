// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import type { CoinImportResult } from '../../app/src/core/canonicalImport';
import { AppShell as ImportControl } from '../../app/src/components/AppShell';
import { readLocalCoin } from '../../app/src/import/importCoinSvg';

vi.mock('../../app/src/import/importCoinSvg', () => ({ readLocalCoin: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement('div');
document.body.append(container);
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.clearAllMocks();
});
async function render() {
  root = createRoot(container);
  await act(async () => root!.render(createElement(ImportControl)));
  return container.querySelector('input')!;
}
async function select(input: HTMLInputElement, selected: File | null) {
  Object.defineProperty(input, 'files', { configurable: true, value: selected ? [selected] : [] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
const loaded = (name: string): CoinImportResult => ({ status: 'imported', diagnostics: [], coin: {
  schemaVersion:1,source:{ importId: name, fileName: name, byteLength: 50, svgText: '<svg><script>unsafe</script></svg>' },
  physicalPageMm:[40,30],sizeOrigin:'explicit',baseLayerId:'base',diagnostics:[],layers:[{
    id:'base',name:'コイン <script> layer',sourceOrder:0,sourceElements:[],boundsMm:[1,2,11,12],areaMm2:100,
    footprintMm:[{outer:[[1,2],[11,2],[11,12],[1,12]],holes:[]}],
  }],
} });
test('selection, replacement, cancellation, same-file retry and escaped filenames', async () => {
  const input = await render();
  const selected = new File(['source'], '<img src=x onerror=alert(1)>.svg');
  vi.mocked(readLocalCoin).mockResolvedValue(loaded(selected.name));
  await select(input, selected);
  expect(container.textContent).toContain(selected.name);
  expect(container.querySelector('img,svg,script')).toBeNull();
  await select(input, null); // Closing the picker preserves current source.
  expect(readLocalCoin).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(selected.name);
  // The value reset makes browsers emit change for same-file reselection.
  expect(input.value).toBe('');
  await select(input, selected);
  expect(readLocalCoin).toHaveBeenCalledTimes(2);
  vi.mocked(readLocalCoin).mockResolvedValue({ status: 'rejected', diagnostics: [{
    code: 'SOURCE_EMPTY', severity: 'error', message: 'The selected file is empty.',
    remediation: 'Select a nonempty SVG.', location: { scope: 'document' },
  }] });
  await select(input, new File([], 'empty.svg'));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your previous SVG is still loaded');
  expect(container.textContent).toContain(selected.name);
  vi.mocked(readLocalCoin).mockResolvedValue(loaded('replacement.svg'));
  await select(input, new File(['new'], 'replacement.svg'));
  expect(container.textContent).toContain('replacement.svg');
  expect(container.textContent).not.toContain(selected.name);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
test('late asynchronous read cannot overwrite a newer selection in the rendered control', async () => {
  const input = await render();
  let finishOld!: (result: CoinImportResult) => void;
  vi.mocked(readLocalCoin).mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }));
  await select(input, new File(['old'], 'old.svg'));
  expect(container.textContent).toContain('Reading old.svg');
  vi.mocked(readLocalCoin).mockResolvedValueOnce(loaded('new.svg'));
  await select(input, new File(['new'], 'new.svg'));
  await act(async () => finishOld(loaded('old.svg')));
  expect(container.textContent).toContain('Loaded: new.svg');
  expect(container.textContent).not.toContain('old.svg');
});

test('unexpected read rejection clears pending state and preserves the previous source', async () => {
  const input = await render();
  vi.mocked(readLocalCoin).mockResolvedValueOnce(loaded('first.svg'));
  await select(input, new File(['first'], 'first.svg'));
  vi.mocked(readLocalCoin).mockRejectedValueOnce(new Error('Unexpected local API failure'));
  await select(input, new File(['new'], 'new.svg'));
  expect(container.textContent).not.toContain('Reading');
  expect(container.textContent).toContain('Loaded: first.svg');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be read');
});

test('accepted preflight warnings are shown as warnings and never a replacement failure', async () => {
  const input = await render();
  vi.mocked(readLocalCoin).mockResolvedValue({ ...loaded('warnings.svg'), diagnostics: [{
    code: 'ARTWORK_IGNORED', severity: 'warning', message: 'Hidden artwork was excluded.',
    remediation: 'Show it to include it.', location: { scope: 'document' },
  }] });
  await select(input, new File(['source'], 'warnings.svg'));
  expect(container.textContent).toContain('Loaded: warnings.svg');
  expect(container.textContent).toContain('SVG loaded with warnings.');
  expect(container.textContent).toContain('Hidden artwork was excluded.');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).not.toContain('failed');
});

test('inspector renders canonical metadata and XY metrics as escaped text', async () => {
  const input=await render();
  vi.mocked(readLocalCoin).mockResolvedValue(loaded('metrics.svg'));
  await select(input,new File(['source'],'metrics.svg'));
  const inspector=container.querySelector('.inspector')!;
  expect(inspector.textContent).toContain('40 × 30 mm');
  expect(inspector.textContent).toContain('コイン <script> layer');
  expect(inspector.textContent).toContain('Base · locked · always visible');
  expect(inspector.textContent).toContain('1, 2, 11, 12');
  expect(inspector.textContent).toContain('10 × 10');
  expect(inspector.textContent).toContain('100');
  expect(inspector.textContent).toContain('1 / 0');
  expect(container.querySelector('svg,script')).toBeNull();
});
