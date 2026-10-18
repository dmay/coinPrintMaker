# CoinPrint design decisions

Baseline: project requirements and technical design dated 2026-10-17.
Evidence task: DIG-7 / M0.2. These decisions establish the import spike contract;
they do not satisfy the M0 end-to-end slicer gate.

## D-01 — Layer identity, order, base and supported SVG

**Decision:** Use browser XML preflight plus pinned Three.js SVGLoader behind an
adapter. Read named Inkscape `g` layers in document order, bottom to top. The first
layer is the immutable initial base candidate; P0 requires authors to correct the
SVG when that is not the intended base. Ordinary nested groups preserve ancestry
and do not create tiers. Nested Inkscape layers are rejected until deliberately
specified. Duplicate labels are permitted; IDs or structural indices identify
layers. Duplicate source IDs are rejected. A nonempty base is required; import
alone does not prove its support or manifoldness.

**Evidence:** `spikes/svg-import/extract.mjs`, `npm test`, and the checked-in
`fixtures/svg-extraction-verification.json`. All 11 accepted fixtures preserve
names/order, source element mapping, disconnected regions, holes, union area and
mm bounds. Nonzero outlined O and same-winding evenodd O both retain their counter.
Overlapping bars union to 320 mm² rather than 384 mm². Offset viewBox plus nested
translation/rotation/nonuniform scale yields the tile at [4,24,10,30] mm in Y-up
coordinates (fixture oracle [4,10,10,16] is Y-down). Source mapping uses ancestry
in SVGLoader's own DOM, never path array order or label equality.

**Pinned evidence:** `three@0.186.1`, `polygon-clipping@0.15.7`; test-only
`jsdom@26.1.0`, Node 24.19.0. The lockfile pins transitive dependencies. Installed
primary source inspected: Three.js `examples/jsm/loaders/SVGLoader.js` attaches
`userData.node`, inherited `style`, and transforms after transforming paths;
`src/extras/core/ShapePath.js` implements nonzero/evenodd in `toShapes()`.
`SVGLoader.createShapes()` is deprecated since r185 and delegates to `toShapes()`;
the spike uses the latter. SVGLoader's default DPI remains 90, so set 96 explicitly.
The adapter performs root viewport/mm conversion itself, including viewBox offset.

**Supported target P0 contract:** closed filled paths, rectangles, circles,
ellipses, polygons, compound holes, multiple objects, inherited fill/fill-rule,
and nested ordinary groups/transforms. One color per physical layer is a settings
concern; SVG colors do not split tiers. There is no external file processing.
Reject live text, stroke-only artwork, open subpaths, raster images, gradients,
mask/clip/filter effects, use/references, scripts, external resources and CSS
painting effects. Parse SVG as data; never insert imported XML into the page.

**Spike limits:** This is a validation prototype, not the production importer.
It intentionally rejects opacity/visibility declarations, CSS classes/style
sheets, nested printing layers and unsupported aspect-ratio modes. Production
visibility handling, richer actionable diagnostics and complete complexity budgets
remain M1 tasks. Hidden artwork semantics must be tested before relaxing rejection.
Curve flattening uses physical chord tolerance 0.01 mm for this evidence, control
hull subdivision for Béziers and an ellipse second-derivative bound. Subdivision
and ellipse point limits are present; a full document path-command/point budget is
still required before public import. Broad skewed-arc, self-intersection and
crossing-contour fill correctness are not established by these fixtures. The
polygon union output uses explicitly closed rings; production canonical DTOs must
remove duplicate endpoints and standardize winding per design §3. No Three.js
objects escape the returned geometry/metadata DTO.

**Fallback:** Ancestry and fill tests pass, so no fallback is selected now. If a
future pinned version or supported input breaks these tests, keep the adapter
boundary and extract each layer with inherited transforms/styles retained, or
replace the path interpreter. Do not silently drop holes, guess path ownership,
or ship failing inputs as partial geometry. Pin upgrades require rerunning this suite.

## D-02 — Physical size and coordinates

**Decision:** Require a finite positive viewBox for this adapter. Resolve explicit
root mm/cm/in/pt/px (unitless root dimensions are CSS px), using 25.4 mm/in and
96 px/in. Prefer complete explicit width/height. If either is missing, infer a
40 mm target width and derive height from viewBox aspect ratio, with an explicit
warning; do not mix a lone declared dimension with an inferred axis. Reject invalid,
percentage, zero and non-finite dimensions. Additional absolute units can be added
only with tests. Source dimensions are not a promise that the coin fills its page.

Default `xMidYMid meet` centers uniform scale within the physical viewport;
`preserveAspectRatio="none"` permits independent axes. Other modes currently fail
explicitly. Apply viewBox origin and physical scale exactly once, then invert Y
about page height: canonical XY is page-relative mm, +Y up, Z reserved for height.
Do not shift each layer independently; relative placement and holes must remain
aligned. Shape-coordinate units other than unitless user coordinates and complex
root/nested viewport arrangements are outside the validated fixture contract.

**Evidence:** The px fixture's 151.18110236220474 CSS px page with a 96-unit viewBox
resolves to 40 × 40 mm. Tests cover all listed root units, missing-size warning,
nonzero viewBox origins, meet letterboxing and independent axis scaling. Fixture
bounds tolerance is 0.011 mm at 0.01 mm curve tolerance. Area tolerance is
max(0.15 mm², 0.3%), matching the independent fixture raster check; this is an
approximation threshold, not exact curve area or mesh acceptance. Exact polygon
cases retain their analytical area. Report data excludes timestamps for reproducibility.

**Deferred gates:** Immediately-lower containment, robust production normalization,
mesh construction, watertight STL, layered 3MF, OrcaSlicer and physical printing
remain separate tasks. Outside-rim and over-lower-hole parse successfully here;
this is intentional and never authorizes exporting their unsupported stacks.

## D-03 — Shared edges and holes in planar booleans

**M0 finding (DIG-8):** Retain polygon-clipping 0.15.7 behind the kernel boundary.
Exact containment permits identical footprints and shared boundary segments; do
not shrink/offset artwork. Empty difference against the immediately lower tier
is required, including its holes. Outside-rim and over-lower-hole fail explicitly.
The fixture suite covers overlap union, nonzero/evenodd holes, disconnected upper
islands, identical rings and partial shared boundaries. This is bounded evidence,
not a universal robustness claim: near-coincident edges, arbitrary intersecting
rings and extremely small slivers remain production normalization/precision work.

## D-04 — Terrace topology and STL

**M0 finding:** Keep explicit exterior terraces as the proposed production path.
`spikes/tiered-stl/mesh.mjs` triangulates caps with pinned Three.js's bundled Earcut,
adds outer/hole walls, welds coordinates and splits T-junction edges. Simply
concatenating capped extrusions would retain internal faces and is not used.
Six authored samples produce one shell, two opposite incidences per edge, cyclic
vertex links, consistent bounds and area-derived volume. Binary STL reparse tests
verify float32 output. Reproducible metrics: `fixtures/tiered-stl-verification.json`.

**Production policy:** Permit exact shared segments and identical tiers when the
result passes validation; fail closed on pinches, degenerate or disconnected
boundaries, invalid support, kernel exceptions and invalid meshes. No silent
repair. The spike's quadratic all-vertex edge stitcher and 1e-8 mm epsilon are not
production performance or precision decisions. Production still needs complexity
limits, robust canonical normalization, tiny-feature/near-contact and arbitrary
self-intersection checks, additional adversarial fixtures and browser tests.
Cavities/multiple boundary shells are outside this prototype's accepted contract.
OrcaSlicer is **not run**; this finding does not close DIG-8 or the M0 gate.

## D-05 — Disconnected base policy

**Decision:** Reject a normalized base with more than one planar region for P0;
a file represents a single coin. Ask the author to connect base regions or make
separate files. A base may have through holes, provided the generated mesh passes
validation. Disconnected raised artwork is allowed when supported by the immediately
lower footprint and physically connected through the base. The twin-stars fixture
proves the raised-island case, and explicit tests reject a disconnected base.
Point-touching geometry cannot substitute for a material connection: cyclic vertex
link and shell checks reject nonmanifold pinches. Revisit multi-coin input only as
an explicit scope change.
