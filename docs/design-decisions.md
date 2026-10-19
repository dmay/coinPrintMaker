# CoinPrint design decisions

Baseline: project requirements and technical design dated 2026-10-17.
Evidence tasks: DIG-7 / M0.2, DIG-8 / M0.3 and DIG-9 / M0.4. These findings
establish bounded prototype contracts. Operator-reported acceptance on
2026-10-18 closes the M0 gate under the explicit export-only scope revision.
Joint manual evidence: [M0 worksheet](m0-slicer-validation.md).

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
On 2026-10-18 dmay confirmed all six STL samples imported at intended mm scale
and sliced without unexpected repair or defects in OrcaSlicer 2.4.2 build
8500fcdc. The joint worksheet records this operator-reported evidence.

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

## D-06 — 3MF assembly and aligned selectable parts

**Accepted for the M0 prototype contract, 2026-10-18.** One Core model
part declares millimeters. One build item references a components-only coin
assembly; its children reference one named mesh object per layer, each capped
and positioned at its absolute Z interval. No independent build items, per-part
recentering or transforms. Raised islands occupy multiple independently validated
closed shells inside the same named layer mesh. Layer volumes meet only at faces,
and their sum agrees with the unified STL volume.

**Automated evidence:** Six retained `.3mf` samples, two unsupported-stack
rejections, `fixtures/layered-3mf-verification.json`, ZIP/XML/resource checks,
reparsed mesh shell topology and volume, comparison with actual STL facets,
ThreeMFLoader assembly/dimension checks and independent Python ZIP/XML checks.
Pinned Three.js's bundled fflate avoids new dependencies; deterministic STORE
packages are a spike convenience, not a production performance choice. These
checks do not prove OrcaSlicer compatibility or full OPC/XSD conformance.

**Manual evidence:** dmay confirmed all six samples loaded at intended scale,
with aligned separately selectable layers, preserved absolute elevations,
holes/islands and no unexpected repair, then sliced without reported defects in
OrcaSlicer 2.4.2 build 8500fcdc. Twin-stars retains both shells in one logical
selectable layer. OrcaSlicer did not show special part names; exported names remain
present in the package. See the joint worksheet for evidence and its limits.

**Scope decision:** The operator limits responsibility to a correct generic 3MF
and correct initial loading. Slicer re-save/reopen, UI label preservation and
printer configuration are outside acceptance, not tests claimed passed. Retain
generic packaging; no vendor-specific project metadata or packaging change is
required by these observations. Verify production output again during M4 at the
package/initial-import boundary. Full format conformance certification and
universal consumer compatibility are not claimed.

## D-07 — Generic display-color intent and consumer boundary

**Accepted for the M0 prototype contract, 2026-10-18.** Core base-material
entries carry unique ordinal/name labels and opaque sRGB `displaycolor` values.
Each mesh references its material via `pid`/`pindex`. The spike harness explicitly
sets colors independently of SVG paint. Escaping/Unicode and a consumer color
round trip pass in ThreeMFLoader. Core specification chapters 4–5 distinguish
assembly placement and display properties from physical printer configuration:
[primary format reference](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md).

**Observed consumer behavior:** dmay reported no displayed colors and no special
sub-object names in OrcaSlicer 2.4.2 build 8500fcdc; no multi-filament configuration
was present. This does not establish the cause. Manual mapping and project
re-save/reopen were not tested. No successful OrcaSlicer name/color preservation
or reliable name-based assignment workflow is claimed.

**Scope decision:** Correct generic package names and color resources/references
remain CoinPrint requirements. Consumer display, filament/extruder mapping,
printer presets and downstream project handling are outside export acceptance,
per the operator's explicit 2026-10-18 decision. Retain best-effort generic color
intent; do not add vendor-specific metadata to force UI behavior. Future guidance
must describe this boundary and the observed limitations without promising a
tested assignment workflow.

## M0 consolidation and remaining risks

| Decision | Current evidence / next action |
|---|---|
| D-01 / D-02 | Import adapter and physical-unit contract established on DIG-7 fixtures; production hardening remains M1. |
| D-03 / D-04 | Shared-edge/holes/terrace topology pass DIG-8 automation; all six STL imports/slices accepted by operator in OrcaSlicer 2.4.2 build 8500fcdc. |
| D-05 | Reject disconnected bases; retain supported raised islands. |
| D-06 / D-07 | Generic package and initial loading accepted; observed UI name/color limits recorded. Downstream project handling and filament mapping are outside acceptance. |
| D-08 | Responsiveness/worker decision deferred to measured production UI work in M3. |
| D-09 | Root `index.html` / main Pages arrangement retained; reproducible production build remains M1/M5 work. |

The earlier authorization to code DIG-9 before DIG-8 manual acceptance retained
the M0 gate. That gate is now satisfied by the operator's six paired STL/3MF
results and exact version confirmation, together with the explicit scope revision
above. The written [M0 worksheet](m0-slicer-validation.md) is the retained manual
evidence; screenshots and slicer projects are not retained. Generated automated
reports are unchanged historical generator output and must not be interpreted as
the latest manual status. No unrecorded UI click path, per-layer print setting or
physical print is inferred.

M1 has no remaining M0 acceptance blocker. Production normalization, precision,
complexity budgets, arbitrary self-intersections and cross-version compatibility
remain bounded risks assigned to later work. M4 must validate production package
output and initial loading under this same boundary. Physical-print acceptance
remains a separate later gate; no later issue is completed by M0 acceptance.

## D-09 — Editable source and main-root Pages publication

**DIG-10 implementation, 2026-10-18:** Keep main-branch/root GitHub Pages
publication. Vite 8.3.4 builds `app/` React 19.3.1 / TypeScript 7.0.2 source with
relative `./` asset URLs. Existing pinned M0 libraries/tests/fixtures remain in
place; do not expose spike functionality as completed production features. Add
only the React/build/type dependencies needed by this shell. The lockfile pins
transitive packages; runtime bundles have no CDN or processing service.

`build:pages` type-checks, builds in a fresh child staging directory and validates
complete local asset references before replacing only `index.html`, `assets/` and
`.nojekyll`. Vite never cleans the repository root. Publication has an exclusive
lock, backup/rollback for ordinary replacement errors and retained recovery data
if rollback itself fails. Abrupt process/OS interruption is not crash-atomic and
may require recovery of the stage/lock. `check:pages` compares staged bytes without
publishing and fails on missing, modified or obsolete output; CI runs it with clean
install, type-checking and the existing plus build-specific tests. LF text and
explicit binary rules prevent Windows checkout conversion from invalidating byte
checks. The existing independent Python ZIP/XML audit is retained with a portable
command (`PYTHON` override supported); CI provisions Python explicitly.

**Evidence:** build safety tests preserve root/source/current output after failed
or incomplete builds, reject symbolic links/concurrent publication, detect drift
and serve real production JS/CSS at `/coinPrintMaker/`. Local clean install,
type-checking, all 24 tests, production build and generated-byte check pass on
Node 24.14.0 / Windows. GitHub CI supplies the separate Linux verification.
Import/domain/editor/geometry/export implementation remains later work. The
synced project Library source directory was empty during implementation; the
current issue and repository decisions define this bounded build scope.

## D-10 — Serializable canonical contracts and fixture boundaries

**DIG-11 implementation, 2026-10-18:** Canonical production DTOs use page-relative
mm with +Y up and +Z height, implicitly closed exterior CCW/hole CW rings, plain
indexed triangle tuples and immutable imported source separate from editable
settings. Opaque source-scoped layer IDs remain stable through edits; the base
is fixed first and enabled. Diagnostics have stable codes, explicit locations and
remediation. Generated results distinguish invalid diagnostics-only data from
validated geometry and carry an import/settings revision key. The small pure
freshness predicate does not validate meshes or implement UI state coordination.
Color-only changes may reuse geometry but must update result metadata/revision;
the async/cache/store policy remains DIG-24.

See [domain-contracts.md](domain-contracts.md) for the full contract and numerical
test thresholds. Core compiles without browser/Node ambient types. Vitest reads
all 21 authored SVG/JSON pairs without rewriting reports: 11 accepted and 10
rejected imports, nine derived valid planar stacks, two support rejections and
the six existing validated M0 mesh samples. It replaces the former two
report-writing Node fixture checks; other adversarial/export/build tests remain.
M0 closed-ring adaptation is test-only; production normalization stays DIG-16.
Fixture category labels are adopted as initial stable diagnostic codes; the M0
adapters do not yet emit structured diagnostics.

**Bounded finding:** An expanded mesh probe of the existing
`offset-nested-transforms.svg` reaches M0 `buildCoin` but throws
`Degenerate triangle`. It was never one of the six M0 mesh samples, and its
planar import metrics still pass. Keep the M0 mesher unchanged here; production
triangulation/stitching and validation must cover this input in
[DIG-20](https://linear.app/diggy-01/issue/DIG-20) /
[DIG-21](https://linear.app/diggy-01/issue/DIG-21) /
[DIG-22](https://linear.app/diggy-01/issue/DIG-22).
No previously passing fixture or manual acceptance is removed or broadened.

**Source limitation:** The synced Library directory remained empty. These
bounded contracts follow the live DIG-11 criteria and repository D-01 through
D-09; no unavailable baseline sections or future defaults are claimed reviewed.

## D-11 — Staged local SVG loading and provisional budgets

**DIG-12 implementation, 2026-10-18:** Read user-selected File bytes locally,
decode strict UTF-8 (optional BOM; explicit other encoding declarations reject),
parse detached SVG XML, and return plain SourceDocument data only. File extension
and MIME are hints; validate root namespace/content. Reject empty/read-error,
encoding, malformed/wrong-content and over-budget input with actionable document
diagnostics. Reject DTD/DOCTYPE before XML parsing to avoid entity processing.
No source markup is mounted or evaluated and no image/resource fetch is requested.

Loading is distinct from the successful canonical ImportedCoin transaction.
Do not fabricate geometry or treat a loaded source as exportable. DIG-13..16
retain security/artwork preflight, layers, dimensions/transforms and polygons.
A pure latest-selection-wins transition keeps the last loaded source during reads
and failures, ignores stale success/failure completions and swaps complete source
data only after a successful current result. Reset picker value permits same-file
retry; picker cancellation leaves state intact.

Adopt provisional inclusive budgets of 2 MiB source, 10,000 XML elements, 64
element levels and 500,000 aggregate SVG path-data characters. Byte checks precede
decoding/parsing; remaining checks use an iterative detached-DOM walk. These bound
initial source/traversal/path work but do not prove parser responsiveness or replace
future command/flattened-point/polygon/mesh budgets. Corpus maxima (1,568 bytes,
11 elements, depth 6, 48 path characters) give only small-fixture headroom, not
production performance evidence. Revisit with real artwork/browser measurements.
See [local-svg-loading.md](local-svg-loading.md) for policy, rationale and tests.

The Library baseline sources remain unavailable. This bounded decision follows
the live DIG-12 description, existing contracts and D-01/D-10; no unavailable
baseline text or later security/geometry acceptance is claimed.

## D-12 — Bounded SVG preflight and material-aware diagnostics

**DIG-13 implementation, 2026-10-18:** Run detached bounded XML preflight before
readLocalSvg can replace a staged source. No raw SVG DOM insertion, use expansion,
remote reference resolution, geometry generation or export authorization occurs.
Global active-content/reference checks include hidden/inert content. Metadata
text/RDF descriptive URLs and unused definitions remain inert. Accepted results
identify eligible shape element paths with resolved fill/fill-rule as plain DTOs;
later extraction must preserve these exclusions and validate remaining geometry.

Resolve the documented presentation/inline/inherited style subset explicitly,
including inline importance, currentColor, display:none subtree suppression,
inherited visibility that descendants can restore, and zero opacity suppression.
Nonprinting artwork warns; active content, unsafe references, unknown CSS,
partial opacity and visible unsupported material fail with corrective guidance.
Reject visible strokes even on filled shapes to prevent dropping their outline.
Retain D-01's explicit Z/z closure authoring rule: SVG implicit filled closure is
real, but supporting it is outside this P0 contract. Unused definitions do not
materialize; href/url use remains an error. This is a bounded validator rather
than a general-purpose SVG sanitizer or full CSS/path parser.

**Evidence:** app/core/test typechecking, adversarial Vitest coverage and retained
accepted M0 corpus, rendered warning/error/atomic replacement tests, and a native
Chrome 153.0.8010.48 Vite-bundled API smoke covering Unicode, XML errors, DTD,
security, style/visibility and atomic rejection. Native resource probes recorded
zero requests and no raw SVG/script execution. Budgets apply to direct preflight
calls; diagnostic output is bounded without losing rejection or all visible errors.
See [svg-preflight.md](svg-preflight.md) for exact policy, evidence and limits.

No M0 fixtures, reports or sample artifacts are changed. The Library baselines
remain unavailable. Layer/shape syntax extraction, units/transforms and robust
polygons remain DIG-14..16; browser performance, broader CSS and cross-browser
coverage are not claimed by this preflight acceptance.
