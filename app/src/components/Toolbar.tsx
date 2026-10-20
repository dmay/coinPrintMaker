import { ImportControl } from './ImportControl';

export function Toolbar({ onSelect, exportNote, canExportStl, onExportStl, exportError }: {
  readonly onSelect: (file: File) => void; readonly exportNote: string;
  readonly canExportStl: boolean; readonly onExportStl: () => void; readonly exportError: string | null;
}) {
  return <header className="toolbar">
    <div className="brand"><p className="eyebrow">Layered SVG → printable coin</p><h1>CoinPrint</h1></div>
    <ImportControl onSelect={onSelect} />
    <div className="export-controls" role="group" aria-label="Export coin" aria-describedby="export-note">
      <div className="button-row"><button disabled={!canExportStl} onClick={onExportStl} type="button">Export STL</button><button disabled type="button">Export 3MF</button></div>
      <p id="export-note">{exportNote}</p>
      <p>STL contains geometry only, with no colors or layers. Its format has no units; coordinates use millimeters. Choose millimeters when opening it.</p>
      {exportError && <p role="alert">{exportError}</p>}
    </div>
  </header>;
}
