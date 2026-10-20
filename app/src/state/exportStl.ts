import { serializeBinaryStl } from '../core/serializeBinaryStl';
import { createDownload } from '../export/createDownload';
import { selectExportableGeometry } from './editorStore';
import type { EditorStore } from './editorStore';

export const STL_EXPORT_FAILURE = 'STL export failed. Check current geometry and try again. Your artwork has not changed.';
export function exportCurrentStl(store: EditorStore, dependencies = { serialize: serializeBinaryStl, download: createDownload }): string | null {
  try {
    const state = store.getState(), snapshot = selectExportableGeometry(state), source = state.importState.coin?.source;
    if (!snapshot || !source || source.importId !== snapshot.input.importId) return STL_EXPORT_FAILURE;
    const bytes = dependencies.serialize(snapshot.unifiedMesh, snapshot.metrics);
    const latest = store.getState();
    if (selectExportableGeometry(latest) !== snapshot || latest.sourceRevision !== state.sourceRevision
      || latest.importState.coin?.source !== source) return STL_EXPORT_FAILURE;
    dependencies.download(bytes, source.fileName);
    return null;
  } catch { return STL_EXPORT_FAILURE; }
}
