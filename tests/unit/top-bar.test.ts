// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { Toolbar } from '../../app/src/components/Toolbar';
import { exportFileName } from '../../app/src/export/createDownload';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => { await act(async () => root?.unmount()); root = null; vi.restoreAllMocks(); document.body.innerHTML = ''; });
async function render() {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  const onSelect = vi.fn();
  await act(async () => root!.render(createElement(Toolbar, { onSelect, canExport: false, onExport: vi.fn() })));
  return { container, onSelect };
}

test('instructions use a modal with Escape/Close and focus restoration, independent of export availability', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  const { container } = await render();
  const opener = container.querySelector<HTMLButtonElement>('[aria-label="SVG file instructions"]')!;
  for (const method of ['escape', 'close']) {
    opener.focus(); await act(async () => opener.click());
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true); expect(dialog.textContent).toContain('named Inkscape layers');
    expect(dialog.textContent).toContain('Convert text and strokes to paths');
    const close = dialog.querySelector('button')!; expect(document.activeElement).toBe(close);
    await act(async () => { if (method === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true })); else close.click(); });
    expect(container.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(opener);
  }
});

test('drop target accepts one local file via the import callback and rejects multiple without replacing artwork', async () => {
  const { container, onSelect } = await render();
  const target = container.querySelector('.import-control')!;
  const file = new File(['<svg/>'], 'Coin.svg', { type: 'image/svg+xml' });
  async function drop(files: File[]) {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    await act(async () => target.dispatchEvent(event)); expect(event.defaultPrevented).toBe(true);
  }
  await drop([file, file]); expect(onSelect).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')?.textContent).toContain('one SVG');
  await drop([file]); expect(onSelect).toHaveBeenCalledExactlyOnceWith(file); expect(container.querySelector('[role="alert"]')).toBeNull();
  const event = new Event('dragover', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { dropEffect: 'none' } });
  await act(async () => target.dispatchEvent(event)); expect(target.getAttribute('data-dragging')).toBe('true');
  await drop([file]); expect(target.getAttribute('data-dragging')).toBe('false');
});

test.each(['stl', '3mf'] as const)('%s source names replace only the SVG extension', format => {
  expect(exportFileName('My.coin.STL.svg', format)).toBe('My.coin.STL.' + format);
  expect(exportFileName('Coin.svg.svg', format)).toBe('Coin.svg.' + format);
  expect(exportFileName('Coin.SVG', format)).toBe('Coin.' + format);
});
