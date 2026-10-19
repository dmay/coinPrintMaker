import type { SourceElement } from './contracts';
import type { Diagnostic } from './diagnostics';

// Preflight is not geometry validation. Paths identify eligible source shapes for
// a later extractor; no browser DOM or renderer state crosses this boundary.
export interface PreflightArtwork extends SourceElement {
  readonly fill: string;
  readonly fillRule: 'nonzero' | 'evenodd';
}
export type SvgPreflightResult =
  | { readonly status: 'accepted'; readonly artwork: readonly PreflightArtwork[]; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] };
