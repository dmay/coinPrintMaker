# Canonical domain contracts (DIG-11)

DIG-21 adds the pure [unified external coin surface](unified-coin-surface.md),
with exact contour subdivision, terrace boundary checks and bounded connected
manifold construction. This stage remains distinct from DIG-22 generation/export
validity. Later references below to pending unified construction are historical.

DIG-20 adds the pure [closed positioned layer-part stage](positioned-layer-meshes.md),
with fresh support checks, canonical holes/islands, exact absolute Z and checked
cap coverage. Its parts-built result is separate from unified/generated-coin and
export validity; DIG-21/22 retain those later gates.

DIG-19 now adds the pure [immediate-lower support stage](support-validation.md).
It resolves current order/visibility, retains unsupported differences for
diagnostics, and rejects with no active tier payload. Planar support success is
distinct from mesh/export validity. Earlier references below to pending support
describe the prior stage boundary.

Current production integration (DIG-16): the complete local importer now constructs
validated canonical polygons and atomically replaces ImportedCoin in the inspector.
See [canonical import and M1 checkpoint](canonical-svg-import.md). Stage-specific
boundaries and historical evidence below remain relevant; references to pending
DIG-16 integration are superseded by that document. Rounded rectangles now use
exact quarter-ellipse DTOs before affine mapping, per D-15.

The serializable contracts are in `app/src/core/contracts.ts`. This boundary has
no React, Three.js, DOM, file handles, functions, maps, typed arrays or scene
objects. `tsconfig.core.json` compiles it with ES2022 alone and no ambient
browser/Node types. Runtime adapters must validate finite numbers and all
invariants below; TypeScript types do not validate untrusted JSON or geometry.

## Coordinates and polygons

All coordinates, bounds, page sizes and heights are millimeters; areas are mm²
and volumes mm³. XY is page-relative, +X right and +Y up; Z increases above the
coin, starting at zero. Transform viewBox origins and page scaling once, including
Y inversion about physical page height. Preserve relative positions across layers.
Bounds are [minX, minY, maxX, maxY]; mesh bounds contain minimum/maximum XYZ tuples.

A `RingMm` stores at least three finite vertices, without a repeated terminal
vertex. Its final-to-first edge closes it implicitly. Exterior rings wind
counterclockwise (positive signed area); holes wind clockwise (negative signed
area) in these Y-up axes. Rings must be nondegenerate, simple and normalized.
A `PolygonMm` contains one outer ring and its holes; `FootprintMm` is an array
of disconnected filled polygons, unioned within a physical layer. No repeated
closure vertex, silent dropped contour or automatic repair belongs in canonical
data. Polygon kernel adapters must add/remove explicit closure at their boundary.
Production normalization, chord-error/snap policy and complexity limits belong to
DIG-16 and subsequent geometry work; this issue does not choose snap tolerances.

The [planar Boolean service](polygon-service.md) validates raw and snapped DTOs,
provides union/difference/intersection and checked area/bounds/isEmpty, and keeps
empty intermediate sets distinct from invalid geometry. Empty bounds are null.
The production importer reuses this service for each physical layer.

## Source, identity and settings

`ImportedCoin` is immutable successful-import data: original local filename/XML,
byte length, unique import identity, resolved page size, source layers, footprints,
metrics and diagnostics. Source text is data and must never be inserted as page
markup. Each successful replacement gets a new `importId`, including a reload
with the same filename. A failed import must leave the current model unchanged.

Layer IDs are opaque, unique within an import and stable across reorder, color,
thickness and enabled edits. They are derived from unique source IDs or stable
structural element paths, never display labels. The source element ID/path
mapping is retained for diagnostics. Prefix/namespace generated structural IDs
so they cannot collide with source IDs. Duplicate labels are allowed; duplicate
source IDs are errors. ID stability across edited/replaced SVG documents is not
promised. Source order is bottom-to-top document order per D-01.

`CoinSettings` references its import identity and stores separate bottom-to-top
layer settings. It contains each imported layer exactly once; its first member
is the one locked base (`baseLayerId`), always enabled and never moved or
replaced. Artwork may be reordered or disabled without changing imported source
data. Every thickness is finite and positive. Colors are opaque sRGB #RRGGBB,
chosen independently of SVG paint and not filament assignments. Contract
definitions choose no default thickness or palette; later settings work supplies
those policies. Increment settings revision for every generation-affecting edit.

`ActiveTier` is derived from enabled settings only; it retains layer identity and
canonical footprints and holds a positive thickness plus absolute cumulative Z
interval. The base begins at zero and every next active tier begins at the prior
tier's top. Disabled layers consume no height. Production resolution/containment
validation remains M2; import success alone does not authorize generation/export.

## Meshes, diagnostics and freshness

`TriangleMesh` contains plain XYZ tuples and zero-based index triples with outward
CCW winding viewed from outside. No Three.js buffers, materials or transforms
cross this boundary. `GeneratedCoin` is a discriminated result: an invalid result
carries diagnostics and no meshes/metrics; a valid result contains active tiers,
the unified exterior STL mesh, aligned per-layer 3MF part meshes and measured
bounds/volume/shell count. Part vertices retain absolute XY/Z, including separated
raised islands in the same named part.

A producer may return `status: 'valid'` only after support, finite/index/degenerate
triangle, winding, manifoldness, connected-coin and volume validation. A type
annotation alone proves none of those properties. Serializers must validate the
coordinates they actually emit (including STL float32 rounding). UI/rendering state
is never an input to geometry or serialization.

Results record `{ importId, settingsRevision }`. `isCurrentValidGeneration`
rejects invalid, absent, stale and error-bearing results against the current key.
It checks freshness of already-validated data, not mesh validity. Callers must
construct the key from the current imported model/settings, reject mismatched
settings/import identities and invalidate old results after edits/replacement.
Future export entry points must enforce both freshness and actual mesh validation.

`diagnostics.ts` freezes stable machine codes with severity, human message,
explicit document/layer/element/mesh location and remediation. Optional source
line/column and triangle indices are zero-based except document line/column,
which are one-based. Unknown external JSON codes require boundary validation.
Fixture category spellings are adopted as the initial public codes; future
additions are additive. Tests assert category coverage, not invented M0
code-specific diagnostics: the M0 adapters still throw unstructured errors.

## Repeatable fixture harness

`npm run test:unit` runs Vitest in Node. Only the fixture suites install a
test-only DOMParser. Helpers read all authored SVG/JSON pairs in sorted order
and never regenerate reports/samples. They adapt the retained M0 importer's
closed rings to canonical open winding, measure the DTOs and compare against
independent analytical expectations. Geometry tests verify all nine valid stacks'
derived tier intervals and volume,
check the two unsupported stacks' rejection, and run the six established M0 mesh
samples for dimensions, volume and topology. The other three accepted imports are
planar/derived-stack coverage only. An expanded probe of offset-nested-transforms
failed the existing M0 mesher with a degenerate triangle; that input was never
part of the six-sample mesh acceptance. Production mesher hardening remains later
work, and this contracts task does not repair or claim mesh acceptance for it.
The suite records bounded M0 regressions; production acceptance remains later work.

Numerical thresholds are explicit in `tests/unit/helpers/fixtures.ts`:

| Measurement | Allowed absolute error |
| --- | --- |
| XY bound | 0.011 mm (M0 flattening uses 0.01 mm chord tolerance) |
| XY dimension | 0.022 mm (error at both extrema) |
| Page/scalar/Z | 1e-9 mm |
| Filled area | max(0.15 mm², analytical area × 0.003) |
| Mesh volume | analytical volume × 0.003 |

Region/hole counts, IDs/names/order and rejection outcomes are exact comparisons.
Y-down fixture bounds are inverted using each fixture's actual page height.
The registry and DTO tests check plain JSON round trips and the freshness gate;
TypeScript additionally checks locked-base/failed-result shape constraints.
`npm test` runs Vitest and the retained Node build/export/adversarial suites.
The former report-writing fixture tests are replaced by these read-only oracles:
all original import metrics and six-mesh bounds/volume/topology checks remain,
including in-memory STL float32 validation, without writing samples or reports.
Explicit `spike:*` commands remain the way to regenerate M0 reports/samples.

## Staged local file loading

DIG-12 adds a local SourceDocument loading stage before canonical import. It
checks UTF-8/XML/SVG content and provisional source/structure limits, without
creating an ImportedCoin or validating artwork/geometry. The replacement state
transition retains the previous source on failure and ignores stale asynchronous
completions. See [local-svg-loading.md](local-svg-loading.md) for the exact boundary,
limits and future full-import transaction requirements.

## Intermediate named-layer/shape extraction

DIG-14 adds `core/svgExtraction.ts` plain DTOs and the isolated
`import/svgLoaderAdapter.ts`. They preserve source identities and ancestry while
returning source-ordered exact curve records in explicitly noncanonical
root-user coordinates (the DIG-15 adapter revision applies validated transforms
outside SVGLoader). They do not construct ImportedCoin or resolve physical mm,
flatten/union polygons or authorize export. See [layer extraction](svg-layer-extraction.md)
for projection, completeness, first-layer base and later-stage requirements.

## Intermediate physical curve normalization

DIG-15's `normalizeSvg` returns exact interpreted curves and analytical bounds in
page-relative Y-up mm, with physical page and explicit/inferred size metadata.
Ellipses use center and two affine axis vectors; their original angle traversal is
retained through all transforms. It never returns ImportedCoin, polygons, meshes
or export permission. DIG-16 must flatten this representation with a physical
error bound, normalize/union/validate polygons and complete the import transaction.
See [coordinate normalization](svg-coordinate-normalization.md) for sizing,
fallback, supported/rejected mappings and the revised extraction boundary.

## Active stack resolution

DIG-17 adds pure separate default-settings creation (1.6 mm base / 0.4 mm artwork)
and active-tier resolution with identity/base protection, settings validation and
cumulative absolute Z. Hidden tiers consume no height; consecutive active tiers
are recomputed after every order/visibility edit. Source canonical XY/holes are
retained. A resolved stack is not a valid generation or export authorization.
See [active stack contract and evidence](active-layer-stack.md).
