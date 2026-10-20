import type { ImportedCoin } from '../core/contracts';

function format(value: number): string { return value.toLocaleString(undefined, { maximumFractionDigits: 4 }); }

export function LayerPanel({ coin }: { readonly coin: ImportedCoin | null }) {
  return <aside className="layer-panel inspector" aria-labelledby="layers-heading">
    <div className="panel-heading"><h2 id="layers-heading">Layers</h2><span>{coin ? coin.layers.length : 0}</span></div>
    {coin ? <>
      <div className="source-summary"><h3>Imported layers</h3>
        <p>Page: {format(coin.physicalPageMm[0])} × {format(coin.physicalPageMm[1])} mm ({coin.sizeOrigin === 'explicit' ? 'declared size' : 'inferred size'}).</p>
        <p>Coordinates: millimeters, Y up.</p>
      </div>
      <p className="layer-order">Source order, bottom to top</p>
      <ol className="layer-list">{coin.layers.map(layer => <li key={layer.id}>
        <h3>{layer.name}{layer.id === coin.baseLayerId && ' (base, locked)'}</h3>
        <dl>
          <div><dt>Width × height (mm)</dt><dd>{format(layer.boundsMm[2] - layer.boundsMm[0])} × {format(layer.boundsMm[3] - layer.boundsMm[1])}</dd></div>
          <div><dt>XY bounds (mm)</dt><dd>{layer.boundsMm.map(format).join(', ')}</dd></div>
          <div><dt>Area (mm²)</dt><dd>{format(layer.areaMm2)}</dd></div>
          <div><dt>Regions / holes</dt><dd>{layer.footprintMm.length} / {layer.footprintMm.reduce((sum, p) => sum + p.holes.length, 0)}</dd></div>
        </dl>
      </li>)}</ol>
      {coin.diagnostics.length > 0 && <p className="retained-warnings">Current coin warnings: {coin.diagnostics.map(d => d.message).join(' ')}</p>}
      <p className="panel-note">Layer editing will be available in a later step.</p>
    </> : <div className="empty-layers"><h3>No layers yet</h3><p>Open an SVG to see named layers and their dimensions here. The first printing layer becomes the locked base.</p></div>}
  </aside>;
}
