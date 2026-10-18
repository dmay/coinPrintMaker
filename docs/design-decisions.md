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
