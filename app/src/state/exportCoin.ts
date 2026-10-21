import { serializeBinaryStl } from '../core/serializeBinaryStl';
import { serialize3mf } from '../core/serialize3mf';
import { createFileDownload } from '../export/createDownload';
import type { ExportFormat } from '../export/createDownload';
import { selectExportableGeometry } from './editorStore';
import type { EditorStore } from './editorStore';

export interface ExportChoices { readonly format: ExportFormat; readonly fileName: string }
export function exportFailure(format: ExportFormat): string {
  return `${format.toUpperCase()} export failed. Check current geometry and try again. Your artwork has not changed.`;
}
/** Choices never carry geometry. Resolve and guard the current domain snapshot at delivery. */
export function exportCurrentCoin(store: EditorStore, choices: ExportChoices, dependencies = {
  stl: serializeBinaryStl, threeMf: serialize3mf, download: createFileDownload,
}): string | null {
  if (choices.format !== 'stl' && choices.format !== '3mf') return 'Choose STL or 3MF to export.';
  const { format, fileName } = choices;
  try {
    const state = store.getState(), snapshot = selectExportableGeometry(state), source = state.importState.coin?.source;
    if (!snapshot || !source || source.importId !== snapshot.input.importId) return exportFailure(format);
    const bytes = format === 'stl' ? dependencies.stl(snapshot.unifiedMesh, snapshot.metrics)
      : dependencies.threeMf(snapshot).slice().buffer;
    const latest = store.getState();
    if (selectExportableGeometry(latest) !== snapshot || latest.sourceRevision !== state.sourceRevision
      || latest.importState.coin?.source !== source) return exportFailure(format);
    dependencies.download(bytes, fileName, format);
    return null;
  } catch { return exportFailure(format); }
}
