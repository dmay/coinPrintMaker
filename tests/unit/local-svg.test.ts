import { describe, expect, test, vi } from 'vitest';
import './setup';
import { LOCAL_SVG_LIMITS, readLocalSvg } from '../../app/src/import/readLocalSvg';
import { initialLocalImportState, localImportReducer } from '../../app/src/core/localImport';
import type { LocalSvgResult } from '../../app/src/core/localImport';

const wrap = (content = '') => '<svg xmlns="http://www.w3.org/2000/svg">' + content + '</svg>';
const file = (text: string, name = 'coin.svg', type = 'image/svg+xml') => new File([text], name, { type });
async function rejected(input: File, code: string) {
  const result = await readLocalSvg(input);
  expect(result.status).toBe('rejected');
  if (result.status !== 'rejected') throw new Error('Expected rejection');
  expect(result.diagnostics[0]).toMatchObject({ code, severity: 'error', location: { scope: 'document' } });
  expect(result.diagnostics[0].remediation.length).toBeGreaterThan(10);

}
describe('local SVG loading boundary', () => {
  test('reads local bytes as serializable data and assigns a fresh identity even for the same file', async () => {
    const text = '<?xml version="1.0" encoding="UTF-8"?>' + wrap('<title>Монета ☀</title>');
    const selected = file(text, 'coin.bin', 'application/octet-stream');
    const first = await readLocalSvg(selected);
    const second = await readLocalSvg(selected);
    expect(first.status).toBe('loaded');
    if (first.status !== 'loaded' || second.status !== 'loaded') throw new Error('Expected load');
    expect(first.source).toMatchObject({ fileName: 'coin.bin', byteLength: selected.size, svgText: text });
    expect(first.source.importId).not.toBe(second.source.importId);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
  test('supports a UTF-8 BOM without introducing it into XML text', async () => {
    const result = await readLocalSvg(file('\uFEFF' + wrap()));
    expect(result.status).toBe('loaded');
    if (result.status === 'loaded') expect(result.source.svgText).toBe(wrap());
  });
  test.each(['', ' \n\t'])('rejects empty input %#', async (text) => rejected(file(text), 'SOURCE_EMPTY'));
  test('reports local read failures', async () => {
    const selected = file(wrap());
    vi.spyOn(selected, 'arrayBuffer').mockRejectedValue(new Error('Access revoked'));
    await rejected(selected, 'SOURCE_UNREADABLE');
  });
  test.each([
    new Uint8Array([0xc3, 0x28]),
    new Uint8Array([0xff, 0xfe, 0x3c, 0x00]),
    new Uint8Array([0xfe, 0xff, 0x00, 0x3c]),
  ])('rejects malformed UTF-8 and UTF-16 BOMs %#', async (bytes) => {
    await rejected(new File([bytes], 'coin.svg'), 'SOURCE_ENCODING_INVALID');
  });
  test.each(['ISO-8859-1', 'UTF-16'])('rejects unsupported declared encoding %s', async (encoding) => {
    await rejected(file('<?xml version="1.0" encoding="' + encoding + '"?>' + wrap()), 'SOURCE_ENCODING_INVALID');
  });
  test.each(['<html/>', '<svg/>', '<not-svg xmlns="http://www.w3.org/2000/svg"/>'])(
    'rejects wrong content despite an SVG filename/MIME: %s', async (text) => rejected(file(text), 'SOURCE_NOT_SVG'));
  test.each([wrap('<g>'), '<svg', 'not XML', wrap('<g a="1" a="2"/>')])(
    'rejects malformed XML: %s', async (text) => rejected(file(text), 'MALFORMED_XML'));
  test('rejects DTD/entity processing before DOMParser', async () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    await rejected(file('<!DOCTYPE svg [<!ENTITY x "payload">]>' + wrap('&x;')), 'SOURCE_DOCTYPE_UNSUPPORTED');
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });
  test('accepts exactly the byte cap; rejects over-cap before reading and before parsing', async () => {
    const text = wrap();
    expect((await readLocalSvg(file(text + ' '.repeat(LOCAL_SVG_LIMITS.sourceBytes - text.length)))).status).toBe('loaded');
    const oversized = file(' '.repeat(LOCAL_SVG_LIMITS.sourceBytes + 1));
    const read = vi.spyOn(oversized, 'arrayBuffer');
    await rejected(oversized, 'IMPORT_LIMIT_EXCEEDED');
    expect(read).not.toHaveBeenCalled();
    const mismatched = file(wrap());
    vi.spyOn(mismatched, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(LOCAL_SVG_LIMITS.sourceBytes + 1));
    await rejected(mismatched, 'IMPORT_LIMIT_EXCEEDED');
  });
  test('enforces inclusive element count, nesting and aggregate path-data budgets', async () => {
    for (const [atCap, overCap] of [
      [wrap('<g/>'.repeat(LOCAL_SVG_LIMITS.elements - 1)), wrap('<g/>'.repeat(LOCAL_SVG_LIMITS.elements))],
      [wrap('<g>'.repeat(63) + '</g>'.repeat(63)), wrap('<g>'.repeat(64) + '</g>'.repeat(64))],
      [wrap('<path d="' + ' '.repeat(250_000) + '"/><path d="' + ' '.repeat(250_000) + '"/>'),
        wrap('<path d="' + ' '.repeat(250_000) + '"/><path d="' + ' '.repeat(250_001) + '"/>')],
    ]) {
      expect((await readLocalSvg(file(atCap))).status).toBe('loaded');
      await rejected(file(overCap), 'IMPORT_LIMIT_EXCEEDED');
    }
  });
  test('keeps active SVG content as data without execution or fetches', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
    const text = wrap('<script>throw new Error("executed")</script><image href="https://example.invalid/image.png"/>');
    const result = await readLocalSvg(file(text));
    expect(result.status).toBe('rejected');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe('atomic latest-selection replacement', () => {
  const loaded = (name: string): LocalSvgResult => ({
    status: 'loaded', diagnostics: [], source: { importId: name, fileName: name, byteLength: 1, svgText: wrap() },
  });
  const failure: LocalSvgResult = { status: 'rejected', diagnostics: [{
    code: 'SOURCE_UNREADABLE', severity: 'error', message: 'Unreadable file',
    remediation: 'Select a readable file.', location: { scope: 'document' },
  }] };
  const start = (requestId: number, fileName = String(requestId)) => ({ type: 'start', requestId, fileName } as const);
  const finish = (requestId: number, result: LocalSvgResult) => ({ type: 'finish', requestId, result } as const);
  test('commits only successful replacement and retains the exact previous source after failure', () => {
    const first = localImportReducer(localImportReducer(initialLocalImportState, start(1)), finish(1, loaded('first')));
    const pending = localImportReducer(first, start(2));
    expect(pending.source).toBe(first.source);
    const failed = localImportReducer(pending, finish(2, failure));
    expect(failed.source).toBe(first.source);
    expect(failed.diagnostics).toEqual(failure.diagnostics);
    const replaced = localImportReducer(localImportReducer(failed, start(3)), finish(3, loaded('new')));
    expect(replaced.source?.fileName).toBe('new');
    expect(replaced.diagnostics).toEqual([]);
    expect(replaced.pendingFileName).toBeNull();
  });
  test.each([loaded('old'), failure])('ignores stale completion %# before and after newest completion', (stale) => {
    const secondPending = localImportReducer(localImportReducer(initialLocalImportState, start(1)), start(2));
    expect(localImportReducer(secondPending, finish(1, stale))).toBe(secondPending);
    const secondDone = localImportReducer(secondPending, finish(2, loaded('new')));
    expect(localImportReducer(secondDone, finish(1, stale))).toBe(secondDone);
    expect(localImportReducer(secondDone, finish(2, failure))).toBe(secondDone);
    expect(localImportReducer(secondDone, start(1))).toBe(secondDone);
  });
  test('newest failure does not allow an older pending success to replace the previous source', () => {
    let state = localImportReducer(localImportReducer(initialLocalImportState, start(1)), finish(1, loaded('first')));
    state = localImportReducer(localImportReducer(state, start(2)), start(3));
    state = localImportReducer(state, finish(3, failure));
    expect(localImportReducer(state, finish(2, loaded('old')))).toBe(state);
    expect(state.source?.fileName).toBe('first');
  });
});


test('recognizes the XHTML parser-error document used by current Chrome', async () => {
  const errorDocument = new DOMParser().parseFromString('<html xmlns="http://www.w3.org/1999/xhtml"><body><parsererror>XML error</parsererror></body></html>', 'application/xml');
  const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockReturnValueOnce(errorDocument);
  await rejected(file(wrap('<g>')), 'MALFORMED_XML');
  parse.mockRestore();
  expect((await readLocalSvg(file(wrap('<metadata><parsererror/><parsererror xmlns="http://www.w3.org/1999/xhtml"/></metadata>')))).status).toBe('loaded');
});
