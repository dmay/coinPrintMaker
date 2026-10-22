import type { GenerationPhase } from '../worker/protocol';
import type { GeneratedCoin, GenerationKey } from '../core/contracts';
import { isCurrentValidGeneration } from '../core/generation';
import { CoinPreview } from '../preview/CoinPreview';

export type PreviewState =
  | { readonly status: 'empty' }
  | { readonly status: 'importing'; readonly fileName: string; readonly stalePreview?: boolean }
  | { readonly status: 'imported' }
  | { readonly status: 'generating'; readonly stalePreview?: boolean }
  | { readonly status: 'ready'; readonly result: GeneratedCoin; readonly current: GenerationKey }
  | { readonly status: 'invalid'; readonly reason: 'import' | 'generation'; readonly retainedSource: boolean };

export function PreviewViewport({ state, selectedLayerId = null, generationPhase = null }: { readonly state: PreviewState; readonly selectedLayerId?: string | null; readonly generationPhase?: GenerationPhase | null }) {
  let title = '', description = '';
  let status: string = state.status;
  const checked = state.status === 'ready' && isCurrentValidGeneration(state.result, state.current) ? state.result : null;
  switch (state.status) {
    case 'empty':
      title = 'Start with your artwork';
      description = 'Open a layered Inkscape SVG to inspect its physical size and printing layers.';
      break;
    case 'importing':
      title = 'Checking SVG artwork';
      description = `Reading ${state.fileName} and checking layers, size and filled outlines. No new preview is ready.${state.stalePreview ? ' Previous checked geometry is stale while the replacement is pending and cannot be exported.' : ''}`;
      break;
    case 'imported':
      title = 'Artwork imported';
      description = 'Your 2D layers are available in the panel. 3D geometry has not been generated.';
      break;
    case 'generating':
      title = 'Generating coin';
      description = (generationPhase === 'starting' ? 'Starting background processing.' : generationPhase === 'receiving' ? 'Receiving checked geometry.' : 'Checking current geometry in the background.') + ' No current preview is ready.' + (state.stalePreview ? ' Previous checked geometry is stale while generation is pending and cannot be exported.' : '');
      break;
    case 'ready':
      if (!checked) {
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
    <CoinPreview result={checked} selectedLayerId={selectedLayerId} />
    {!checked && <div className="preview-placeholder" role="status" aria-live="polite">
      <div className="preview-symbol" aria-hidden="true">◎</div>
      <h3>{title}</h3><p>{description}</p>
    </div>}
  </section>;
}
