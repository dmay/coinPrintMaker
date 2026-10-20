import { ImportControl } from './ImportControl';

export function Toolbar({ onSelect, exportNote }: { readonly onSelect: (file: File) => void; readonly exportNote: string }) {
  return <header className="toolbar">
    <div className="brand"><p className="eyebrow">Layered SVG → printable coin</p><h1>CoinPrint</h1></div>
    <ImportControl onSelect={onSelect} />
    <div className="export-controls" role="group" aria-label="Export coin" aria-describedby="export-note">
      <div className="button-row"><button disabled type="button">Export STL</button><button disabled type="button">Export 3MF</button></div>
      <p id="export-note">{exportNote}</p>
    </div>
  </header>;
}
