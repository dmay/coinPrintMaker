import type { Diagnostic } from './diagnostics';

// All DTOs contain JSON values only. Numbers must be finite at runtime boundaries.
export type LayerId = string;
export type Point2Mm = readonly [x: number, y: number];
export type Point3Mm = readonly [x: number, y: number, z: number];
export type Bounds2Mm = readonly [minX: number, minY: number, maxX: number, maxY: number];
export type Bounds3Mm = readonly [min: Point3Mm, max: Point3Mm];
// Open storage, implicit closing edge; exterior CCW / holes CW in +Y-up mm.
export type RingMm = readonly [Point2Mm, Point2Mm, Point2Mm, ...Point2Mm[]];
export interface PolygonMm {
  readonly outer: RingMm;
  readonly holes: readonly RingMm[];
}
export type FootprintMm = readonly PolygonMm[];

export interface SourceElement {
  readonly elementId: string | null;
  // Zero-based element-child indices from the SVG root; independent of labels.
  readonly elementPath: readonly number[];
}
export interface SourceDocument {
  // Unique for each successful atomic import, even for the same filename.
  readonly importId: string;
  readonly fileName: string;
  readonly byteLength: number;
  readonly svgText: string;
}
export interface ImportedLayer {
  readonly id: LayerId;
  readonly name: string;
  readonly sourceOrder: number;
  readonly sourceElements: readonly SourceElement[];
  readonly footprintMm: FootprintMm;
  readonly boundsMm: Bounds2Mm;
  readonly areaMm2: number;
}
export interface ImportedCoin {
  readonly schemaVersion: 1;
  readonly source: SourceDocument;
  readonly physicalPageMm: readonly [width: number, height: number];
  readonly sizeOrigin: 'explicit' | 'inferred';
  readonly baseLayerId: LayerId;
  // Immutable source order; editable order/enabled/colors/thickness live in settings.
  readonly layers: readonly ImportedLayer[];
  readonly diagnostics: readonly Diagnostic[];
}
interface LayerSettingsFields {
  readonly layerId: LayerId;
  readonly thicknessMm: number;
  // Opaque sRGB #RRGGBB; display intent, independent of SVG paint/filament mapping.
  readonly color: string;
}
export interface BaseLayerSettings extends LayerSettingsFields {
  readonly role: 'base';
  readonly enabled: true;
}
export interface ArtworkLayerSettings extends LayerSettingsFields {
  readonly role: 'artwork';
  readonly enabled: boolean;
}
export type LayerSettings = BaseLayerSettings | ArtworkLayerSettings;
export interface CoinSettings {
  readonly importId: string;
  // Increment for every edit affecting generation, including colors/order.
  readonly revision: number;
  // Bottom-to-top editable order; base must be first and exactly once.
  readonly layers: readonly [BaseLayerSettings, ...ArtworkLayerSettings[]];
}
export interface ActiveTier {
  readonly layerId: LayerId;
  readonly name: string;
  readonly color: string;
  readonly footprintMm: FootprintMm;
  readonly thicknessMm: number;
  readonly bottomZMm: number;
  readonly topZMm: number;
}
export type Triangle = readonly [a: number, b: number, c: number];
export interface TriangleMesh {
  readonly vertices: readonly Point3Mm[];
  // Zero-based indices; outward CCW triangles viewed from outside.
  readonly triangles: readonly Triangle[];
}
export interface MeshMetrics {
  readonly boundsMm: Bounds3Mm;
  readonly volumeMm3: number;
  readonly shellCount: number;
}
export interface GenerationKey {
  readonly importId: string;
  readonly settingsRevision: number;
}
export interface GeneratedPart {
  readonly layerId: LayerId;
  readonly name: string;
  readonly color: string;
  // Absolute positions, no per-part centering or renderer transforms.
  readonly mesh: TriangleMesh;
  readonly metrics: MeshMetrics;
}
interface GenerationResult {
  readonly schemaVersion: 1;
  readonly input: GenerationKey;
  readonly diagnostics: readonly Diagnostic[];
}
export interface ValidGeneratedCoin extends GenerationResult {
  readonly status: 'valid';
  readonly activeTiers: readonly ActiveTier[];
  readonly unifiedMesh: TriangleMesh;
  readonly parts: readonly GeneratedPart[];
  readonly metrics: MeshMetrics;
}
export interface InvalidGeneratedCoin extends GenerationResult {
  readonly status: 'invalid';
  // Failed generation cannot carry exportable geometry.
  readonly activeTiers?: never;
  readonly unifiedMesh?: never;
  readonly parts?: never;
  readonly metrics?: never;
}
export type GeneratedCoin = ValidGeneratedCoin | InvalidGeneratedCoin;

// Stack resolution establishes settings and Z only, never mesh/export validity.
export interface ResolvedStack {
  readonly status: 'resolved';
  readonly input: GenerationKey;
  readonly activeTiers: readonly ActiveTier[];
  readonly totalHeightMm: number;
  readonly diagnostics: readonly Diagnostic[];
}
export interface RejectedStack {
  readonly status: 'rejected';
  readonly diagnostics: readonly Diagnostic[];
  readonly input?: never;
  readonly activeTiers?: never;
  readonly totalHeightMm?: never;
}
export type StackResolution = ResolvedStack | RejectedStack;
export type CoinSettingsResult =
  | { readonly status: 'created'; readonly settings: CoinSettings; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[]; readonly settings?: never };

// Planar support is a pre-mesh stage, distinct from GeneratedCoin validity.
export interface UnsupportedRemainder {
  readonly upperLayerId: LayerId;
  readonly lowerLayerId: LayerId;
  // Diagnostics only: upper-minus-lower, never a clipped replacement tier.
  readonly footprintMm: FootprintMm;
}
export interface SupportedStack {
  readonly status: 'supported';
  readonly input: GenerationKey;
  readonly activeTiers: readonly ActiveTier[];
  readonly totalHeightMm: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly unsupportedRemainders: readonly [];
}
export interface RejectedSupport {
  readonly status: 'rejected';
  // Absent when settings/source stack resolution fails.
  readonly input?: GenerationKey;
  readonly diagnostics: readonly Diagnostic[];
  // All successfully measured nonempty differences; failed pairs have diagnostics
  // instead. An empty list therefore does not establish support on rejection.
  readonly unsupportedRemainders: readonly UnsupportedRemainder[];
  readonly activeTiers?: never;
  readonly totalHeightMm?: never;
}
export type SupportValidation = SupportedStack | RejectedSupport;
