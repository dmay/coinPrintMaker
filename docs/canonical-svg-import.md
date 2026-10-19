# Canonical SVG import and M1 checkpoint (DIG-16)

DIG-20 adds the pure [closed positioned layer-part stage](positioned-layer-meshes.md),
with fresh support checks, canonical holes/islands, exact absolute Z and checked
cap coverage. Its parts-built result is separate from unified/generated-coin and
export validity; DIG-21/22 retain those later gates.

DIG-19 now adds the pure [immediate-lower support stage](support-validation.md).
It resolves current order/visibility, retains unsupported differences for
diagnostics, and rejects with no active tier payload. Planar support success is
distinct from mesh/export validity. Earlier references below to pending support
describe the prior stage boundary.

DIG-18 now routes each physical layer through the shared [planar Boolean service](polygon-service.md). Its raw/output guards, conservative near-crossing and subnoise-contact rejection, valid empty-set semantics and stricter work accounting supersede the M2-pending Boolean notes below. Source compound-contour restrictions, printing-layer/base policy and the M1 checkpoint remain in force.

`readLocalCoin(File)` reads local UTF-8 bytes and calls `importCoinSvg(SourceDocument)`.
The complete pipeline is detached XML/preflight → named layer/shape extraction →
physical curve normalization → canonical polygons. Only `status: 'imported'` has
an `ImportedCoin`. A rejected result contains diagnostics and no partial model.
`core/canonicalImport.ts` is pure, with a replaceable `PolygonKernel` interface;
the pinned polygon-clipping adapter owns explicit closed-ring conversion. There
are no DOM, Three.js, React or renderer objects in core contracts or polygons.
No source XML is mounted, executed, fetched or uploaded.

## Contours, fill and layer footprints

Flatten every eligible source contour in page-relative Y-up millimeters. Preserve
source direction until fill interpretation: simple disjoint/nested contours are
classified by their smallest enclosing contour. `nonzero` sums signed winding
through all ancestors, including magnitudes greater than one; `evenodd` uses
containment-depth parity. Only transitions between filled and unfilled space
create exterior/hole boundaries. This preserves counters, islands inside holes,
separate upper islands and redundant same-winding inner contours. This is fill
interpretation, not dropped artwork. Normalize exteriors CCW and holes CW after
interpretation. Union **separate filled objects** within each printing layer,
including real intersections and shared edges; do not union different layers.

Self-intersections, doubles-back, zero-area contours and crossing/touching compound
contours within a single source object reject the complete import. They require
an author-resolved compound path or separate filled objects in Inkscape. Near
contacts within 0.000002 mm are ambiguous and reject. Across separate objects,
actual intersections/shared edges are allowed, but nonzero near-contact is checked
on unsnapped samples before union so snapping cannot bridge a tiny gap. A point
pinch remaining in union output also rejects. General crossing compound-path
arrangements and broader near-coincident robustness remain explicit M2 work in
[DIG-18](https://linear.app/diggy-01/issue/DIG-18); this importer does not guess fill
regions or repair ambiguous contours.

Store implicitly closed rings without repeated endpoints, with a deterministic
lexicographically minimum starting vertex, winding and sorted holes/regions.
Validate kernel output for finite, in-range, simple, nondegenerate rings, strict
hole containment and mutually nonoverlapping filled polygons. Compute area and
bounds from the final canonical footprint; source colors do not split layers.
Source identity, order and eligible source element paths remain intact. Bounds
remain page-relative; no layer is recentered.

The base stays the first named printing layer and must have one connected planar
region (through holes allowed), per D-05. Raised artwork may contain disconnected
regions. Empty named nonbase layers now **reject** with `LAYER_EMPTY`: add visible
filled artwork or remove that empty layer. No layer is silently omitted or
promoted to base, and no synthetic bounds are fabricated. A layer containing only
hidden/nonpainting artwork first retains its preflight exclusion warning and then
receives the same empty-layer error. Support against the immediate lower layer,
meshes and export eligibility remain M2 and later; outside-rim/over-lower-hole
fixtures intentionally import and do not thereby authorize export.

## Physical precision and bounded work

The fixed internal policy is `POLYGON_POLICY` in `core/polygonGeometry.ts`:

| Policy | Limit |
| --- | --- |
| Curve chord error | 0.005 mm in canonical physical coordinates |
| Coordinate grid | 0.000001 mm, nearest grid point |
| Numerical closure noise | 0.000000001 mm |
| Ambiguous nonincident boundary contact | within 0.000002 mm |
| Absolute XY coordinate | at most 1,000,000 mm |
| Flattened samples per ring | at most 8,192, including a sampled closure |
| Canonical/kernel ring | at most 8,192 vertices, excluding closure |
| Aggregate document vertices | at most 50,000 work vertices across flattening, input normalization and output normalization |
| Segment/containment comparison work | at most 2,000,000 charged steps per document |
| Bézier subdivision depth | at most 24 |
| Boolean layer input | at most 12,000 vertices |
| Boolean output | at most 50,000 vertices per call, also charged to the document budget |

Béziers use iterative de Casteljau subdivision until every control point lies
within the physical tolerance of the chord **segment**, including longitudinal
overshoot. Ellipses use the second-derivative bound
`norm(axisX) + norm(axisY)`: angular step squared times that bound divided by 8
must not exceed 0.005 mm. Both affine axes participate, including skew/reflection;
angles and traversal are not inverted again. Rounded rectangles now bypass the
loader's fixed cubic approximation: exact local line/elliptical quarter-arc DTOs
use SVG rx/ry defaults, independent half-size clamps and square corners when
either resolved radius is zero, followed by the existing exact affine mapping.
The loader still must account for the original source node and return structurally
valid finite curve data before the rect DTO is substituted. This supersedes the
DIG-15 retained approximation note and avoids a radius-dependent hidden error.

Snap input and output to the same grid, collapsing only duplicate numerical
endpoints within the declared closure-noise allowance. Reject a nonzero edge
that would collapse beyond that allowance, a collapsed contour, near-contact or
invalid topology. Remove only exactly collinear forward vertices; never offset
artwork or discard a failed contour. Each grid snap moves a point by at most
sqrt(2)/2 × 0.000001 mm. A conservative local interpreted-curve-to-final-boundary
budget is 0.005002 mm for flattening plus two snaps. No exact curved-area equality
or sub-tolerance feature preservation is promised. Source curves with features
smaller than the approximation/precision policy require author simplification;
detected ambiguous/collapsed geometry fails instead of being partially imported.

Input caps and post-union validation bound ordinary work. The pinned kernel also
has internal one-million queue/sweep-segment failure guards, caught as
`POLYGON_INVALID`; this is not a wall-clock guarantee or universal robustness
proof. A synchronous local import may still occupy the main thread within those
caps. Measured responsiveness/Worker decisions remain D-08/M3.

## Complete replacement and inspector

`coinImportReducer` commits only a complete candidate and uses monotonic request
IDs. Start/failure retain the exact previous coin; only the latest outstanding
selection can complete. Failures at reading, preflight, extraction, normalization
or polygons cannot replace source, layers or metrics. Reloading the same file
creates a fresh import identity. Original source/settings remain separate;
this inspector creates no thickness/color/order settings or generated meshes.
The retained `localImport`/`readLocalSvg` API remains an explicitly staged loading
boundary for tests/adapters, not the production UI transaction.

The temporary inspector shows the selected local filename/byte length, physical
page and inferred-size warning, source layer names/order, locked base, XY bounds,
width/height, area and exact region/hole counts. Diagnostics include stable code,
source location, message and remediation as escaped text. A failed replacement
keeps the current inspector and explains which candidate failed. A narrow viewport
can scroll the table horizontally. No 3D or export dependency is required.

## M1 checkpoint before M2

- **D-01 / D-13 / D-14 parsing:** retain pinned Three SVGLoader only behind the
  detached, completeness-checked interpreter boundary; security, eligible painting,
  identity, strict transforms and rounded rectangles are owned explicitly by the
  importer. Unsupported artwork produces actionable errors; hidden/inert exclusions
  remain explicit warnings. Pin changes require the full import suite.
- **D-02 scaling:** explicit mm/cm/in/pt/CSS px at 96 DPI, finite positive viewBox,
  centered meet or none; if either physical dimension is absent use complete
  40 mm target-width/aspect fallback with warning. Preserve page origin and apply
  Y inversion once. There is no fit-to-artwork guess or per-layer recentering.
- **D-03 / D-15 fill and precision:** keep polygon-clipping 0.15.7 behind
  `PolygonKernel`; own simple-contour winding/parity interpretation, physical
  flattening, snap/complexity budgets, canonical validation and atomic commit.
  Broader booleans/precision remain DIG-18, with no implicit expansion of the
  supported compound-contour subset.
- **D-05:** reject disconnected bases and empty named printing layers, preserve
  supported raised islands. Import does not prove lower-layer support/manifoldness.
- **D-09:** root index.html and assets remain synchronized generated Pages output;
  main/root hosting and local browser-only processing remain unchanged.

All eleven accepted authored fixtures have independent golden checks for physical
page, names/order/identity, transforms, filled area/bounds and region/hole counts;
all ten rejected fixtures retain their diagnostic categories. Production tests
import no M0 mesher/exporter and do not rewrite historical fixtures/reports/samples.
Adversarial tests cover fill magnitudes, reordered/reflected nesting, exact overlap
and shared edges, crossing/self/touch/near-contact/collapse failures, injected kernel
failure/malformed output, budget guards, affine ellipse/Bézier chord error,
rounded corners, same-file identity and atomic failed/stale replacement.

Native Chrome 153.0.8010.48 exercised the actual generated Pages bundle at
`/coinPrintMaker/`: all 21 authored fixtures, six explicit import-stage failure
probes preserving the current inspector, real file selection with delayed older
read, Unicode/escaped filenames and labels, fallback warning and narrow table
scrolling passed. No processing network requests, page errors, source SVG mounts
or source script execution occurred. This is bounded native Chrome UI evidence;
no cross-browser, performance, slicer, new mesh or physical-print acceptance is
claimed. The original Library baselines remain unavailable in the empty synced
source directory; these decisions follow the current issue and repository evidence.

M1 implementation is reviewable when this change's final-head CI and generated
artifact checks pass. Operator merge remains the final handoff; no M2 work starts
as part of DIG-16. Later support/meshing/export/manual gates remain unfinished.
