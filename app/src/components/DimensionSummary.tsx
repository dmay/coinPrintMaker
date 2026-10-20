import type { GeometryPresentation } from '../state/editorPresentation';

export function formatMeasurement(value: number): string {
  // Significant digits keep tiny positive dimensions from being displayed as 0.
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}
export function DimensionSummary({ view }: { readonly view: GeometryPresentation }) {
  const result = view.current;
  return <section className="dimension-summary" aria-labelledby="dimensions-heading" data-measurement-state={view.status}>
    <div className="panel-heading"><h2 id="dimensions-heading">Measurements</h2><span>{result ? 'Current · checked' : view.status}</span></div>
    <div className="panel-body">
      <p role="status">{view.summary}</p>
      {view.stalePreview && <p>Previous checked geometry is stale and is not used for these measurements or export.</p>}
      {view.rejectedImport && result && <p>These measurements belong to the retained loaded SVG. The failed replacement has no generated coin.</p>}
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
              <tbody>{result.activeTiers.map(tier => <tr key={tier.layerId}><th scope="row">{tier.name}<small>ID: {tier.layerId}</small></th><td>{formatMeasurement(tier.bottomZMm)}</td><td>{formatMeasurement(tier.topZMm)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}
    </div>
  </section>;
}
