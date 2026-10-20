import type { GeneratedCoin, GenerationKey } from '../core/contracts';
import { isCurrentValidGeneration } from '../core/generation';

// Presentation states only; no geometry is created or inferred from an import.
export type PreviewState =
  | { readonly status: 'empty' }
  | { readonly status: 'importing'; readonly fileName: string }
  | { readonly status: 'imported' }
  | { readonly status: 'generating' }
  | { readonly status: 'ready'; readonly result: GeneratedCoin; readonly current: GenerationKey }
  | { readonly status: 'invalid'; readonly reason: 'import' | 'generation'; readonly retainedSource: boolean };

export function PreviewViewport({ state }: { readonly state: PreviewState }) {
  let title: string, description: string;
  let status: string = state.status;
  switch (state.status) {
    case 'empty':
      title = 'Start with your artwork';
      description = 'Open a layered Inkscape SVG to inspect its physical size and printing layers.';
      break;
    case 'importing':
      title = 'Checking SVG artwork';
      description = `Reading ${state.fileName} and checking layers, size and filled outlines. No new preview is ready.`;
      break;
    case 'imported':
      title = 'Artwork imported';
      description = 'Your 2D layers are available in the panel. 3D geometry has not been generated; the interactive preview is coming next.';
      break;
    case 'generating':
      title = 'Generating coin';
      description = 'Checking current geometry. No current preview is ready.';
      break;
    case 'ready':
      if (isCurrentValidGeneration(state.result, state.current)) {
        title = 'Geometry checked';
        description = 'Current geometry passed validation. Interactive 3D display is not available yet.';
      } else {
        status = 'invalid';
        title = 'No current checked geometry';
        description = 'The result is invalid or belongs to older artwork or settings. Generate the current coin before preview or export.';
      }
      break;
    case 'invalid':
      title = state.reason === 'import' ? 'SVG import failed' : 'Coin geometry needs attention';
      description = state.reason === 'import'
        ? (state.retainedSource ? 'The replacement was rejected. Your previous SVG remains in the layer panel; no new preview was created.' : 'Review the import diagnostics below and choose a supported SVG.')
        : 'Review the geometry diagnostics. Invalid geometry cannot be previewed or exported.';
  }
  return <section className="preview-viewport" aria-labelledby="preview-heading" aria-busy={status === 'importing' || status === 'generating'} data-state={status}>
    <div className="panel-heading"><h2 id="preview-heading">Preview</h2><span>Dimensions in mm</span></div>
    <div className="preview-placeholder" role="status" aria-live="polite">
      <div className="preview-symbol" aria-hidden="true">◎</div>
      <h3>{title}</h3><p>{description}</p>
    </div>
    <p className="preview-caption">Import checks 2D artwork. Support and 3D validation are separate steps.</p>
  </section>;
}
