import type { LayerId, SourceElement } from './contracts';
import type { Diagnostic } from './diagnostics';

export interface ExtractedLayer extends SourceElement {
  readonly id: LayerId;
  readonly name: string;
  readonly sourceOrder: number;
}
// Root-user-coordinate curves: validated element transforms are already applied.
// These are NOT mm, flattened rings, canonical polygons or exportable geometry.
export type SvgPoint = readonly [number, number];
export type SvgCurve =
  | { readonly kind: 'line'; readonly from: SvgPoint; readonly to: SvgPoint }
  | { readonly kind: 'quadratic'; readonly from: SvgPoint; readonly control: SvgPoint; readonly to: SvgPoint }
  | { readonly kind: 'cubic'; readonly from: SvgPoint; readonly control1: SvgPoint; readonly control2: SvgPoint; readonly to: SvgPoint }
  | { readonly kind: 'ellipse'; readonly center: SvgPoint; readonly axisX: SvgPoint; readonly axisY: SvgPoint; readonly startAngle: number; readonly endAngle: number; readonly clockwise: boolean };
export interface ExtractedShape extends SourceElement {
  readonly id: string;
  readonly layerId: LayerId;
  readonly sourceOrder: number;
  readonly fill: string;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly contours: readonly { readonly autoClose: boolean; readonly curves: readonly SvgCurve[] }[];
}
export type SvgExtractionResult =
  | { readonly status: 'extracted'; readonly coordinateSpace: 'svg-user'; readonly baseCandidateId: LayerId; readonly layers: readonly (ExtractedLayer & { readonly shapes: readonly ExtractedShape[] })[]; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] };
