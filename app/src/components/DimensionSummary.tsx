import type { ImportedCoin } from '../core/contracts';
import type { GeometryPresentation } from '../state/editorPresentation';

export function formatMeasurement(value: number): string {
  // Significant digits keep tiny positive dimensions from being displayed as 0.
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}
export function DimensionSummary({ view, coin = null }: { readonly view: GeometryPresentation; readonly coin?: ImportedCoin | null }) {
  const result = view.current;
  return <section className="dimension-summary" aria-labelledby="dimensions-heading" data-measurement-state={view.status}>
    <div className="panel-heading"><h2 id="dimensions-heading">Measurements</h2><span>{result ? 'Current · checked' : view.status}</span></div>
    <div className="panel-body">
      <p role="status">{view.summary}</p>
      {view.stalePreview && <p>Previous checked geometry is stale and is not used for these measurements or export.</p>}
      {view.rejectedImport && result && <p>These measurements belong to the retained loaded SVG. The failed replacement has no generated coin.</p>}
      {coin && <div className="imported-measurements">
        <p>Page: {formatMeasurement(coin.physicalPageMm[0])} &times; {formatMeasurement(coin.physicalPageMm[1])} mm ({coin.sizeOrigin === 'explicit' ? 'declared size' : 'inferred size'}).</p>
        <details className="tier-measurements"><summary>Imported measurements ({coin.layers.length} layers)</summary>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Imported layer measurements, scroll for all layers">
            <table><thead><tr><th scope="col">Layer</th><th scope="col">Width &times; height (mm)</th><th scope="col">XY bounds (mm)</th><th scope="col">Area (mm²)</th><th scope="col">Regions / holes</th></tr></thead>
            <tbody>{coin.layers.map(layer => <tr key={layer.id}><th scope="row">{layer.name}</th>
              <td>{formatMeasurement(layer.boundsMm[2] - layer.boundsMm[0])} &times; {formatMeasurement(layer.boundsMm[3] - layer.boundsMm[1])}</td>
              <td>{layer.boundsMm.map(formatMeasurement).join(', ')}</td><td>{formatMeasurement(layer.areaMm2)}</td>
              <td>{layer.footprintMm.length} / {layer.footprintMm.reduce((n, polygon) => n + polygon.holes.length, 0)}</td>
            </tr>)}</tbody></table>
          </div>
        </details>
      </div>}
      {result && <>
        <dl className="coin-measurements">
          <div><dt>Width (X)</dt><dd>{formatMeasurement(result.dimensionsMm[0])} mm</dd></div>
          <div><dt>Depth (Y)</dt><dd>{formatMeasurement(result.dimensionsMm[1])} mm</dd></div>
          <div><dt>Total cumulative height (Z)</dt><dd>{formatMeasurement(result.dimensionsMm[2])} mm</dd></div>
          <div><dt>Volume</dt><dd>{formatMeasurement(result.metrics.volumeMm3)} mm³</dd></div>
        </dl>
        <details className="tier-measurements" open>
          <summary>Checked layer Z intervals · bottom to top ({result.activeTiers.length})</summary>
          <p>Hidden layers contribute no height. Each top Z is the cumulative height through that tier.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Checked layer heights, scroll for all tiers">
            <table><thead><tr><th scope="col">Layer</th><th scope="col">Bottom Z (mm)</th><th scope="col">Top Z / cumulative (mm)</th></tr></thead>
              <tbody>{result.activeTiers.map(tier => <tr key={tier.layerId}><th scope="row">{tier.name}</th><td>{formatMeasurement(tier.bottomZMm)}</td><td>{formatMeasurement(tier.topZMm)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}
    </div>
  </section>;
}
