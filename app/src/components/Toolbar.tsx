import { useState } from 'react';
import { ImportControl } from './ImportControl';
import { SvgInstructions } from './SvgInstructions';

export function Toolbar({ onSelect, canExport, onExport }: {
  readonly onSelect: (file: File) => void;
  readonly canExport: boolean; readonly onExport: (format: 'stl' | '3mf') => void;
}) {
  const [showInstructions, setShowInstructions] = useState(false);
  return <header className="toolbar">
    <div className="brand"><p className="eyebrow">Layered SVG to printable coin</p><h1>CoinPrint</h1></div>
    <div className="import-step"><span className="step-number" aria-hidden="true">1</span>
      <ImportControl onSelect={onSelect} />
      <button className="info-button" type="button" aria-label="SVG file instructions" aria-haspopup="dialog" onClick={() => setShowInstructions(true)}>i</button>
    </div>
    <span className="step-arrow" aria-hidden="true">→</span>
    <a className="review-step" href="#editor"><span className="step-number" aria-hidden="true">2</span> Review</a>
    <span className="step-arrow" aria-hidden="true">→</span>
    <div className="export-controls" role="group" aria-label="Export coin">
      <span className="step-number" aria-hidden="true">3</span><span>Export:</span>
      <button disabled={!canExport} onClick={() => onExport('3mf')} type="button" aria-label="Export 3MF">3MF</button>
      <span>or</span><button disabled={!canExport} onClick={() => onExport('stl')} type="button" aria-label="Export STL">STL</button>
    </div>
    {showInstructions && <SvgInstructions onClose={() => setShowInstructions(false)} />}
  </header>;
}
