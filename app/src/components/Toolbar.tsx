import { ImportControl } from './ImportControl';

export function Toolbar({ onSelect, exportNote, canExport, onExport }: {
  readonly onSelect: (file: File) => void; readonly exportNote: string;
  readonly canExport: boolean; readonly onExport: (format: 'stl' | '3mf') => void;
}) {
  return <header className="toolbar">
    <div className="brand"><p className="eyebrow">Layered SVG → printable coin</p><h1>CoinPrint</h1></div>
    <ImportControl onSelect={onSelect} />
    <div className="export-controls" role="group" aria-label="Export coin" aria-describedby="export-note">
      <div className="button-row"><button disabled={!canExport} onClick={() => onExport('stl')} type="button">Export STL</button><button disabled={!canExport} onClick={() => onExport('3mf')} type="button">Export 3MF</button></div>
      <p id="export-note">{exportNote}</p>
      <p>STL contains geometry only, with no colors or layers. Its format has no units; coordinates use millimeters. Choose millimeters when opening it.</p>
    </div>
  </header>;
}
