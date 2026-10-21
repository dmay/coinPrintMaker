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

**DIG-18 production refinement:** D-17 and the [planar service](polygon-service.md)
extend the M1 adapter with checked difference/intersection and metrics. Exact
shared boundaries remain supported; raw/output validation rejects pinches and
precision ambiguity, including subnoise gaps and crossings near endpoints.

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

**Production ownership clarification — DIG-30, 2026-10-20:** The pure layered
writer emits the baseline Core base-material/display-color resources and
references because these remain explicit DIG-30 package acceptance requirements.
DIG-31 owns the export dialog/options, guarded editor/download integration,
color-only UI flow and consumer-facing explanation. This does not expand export
acceptance to slicer display or filament mapping. Production serialization keeps
the D-06 assembly arrangement, adds XML-safe `partnumber` for domain layer IDs,
and uses Deflate rather than prototype STORE compression. See
[the production writer contract and evidence limits](layered-3mf-export.md).
Production target-slicer initial loading still needs its own recorded evidence.

## M0 consolidation and remaining risks

| Decision | Current evidence / next action |
|---|---|
| D-01 / D-02 | Import adapter and physical-unit contract established on DIG-7 fixtures; production hardening remains M1. |
| D-03 / D-04 | Shared-edge/holes/terrace topology pass DIG-8 automation; all six STL imports/slices accepted by operator in OrcaSlicer 2.4.2 build 8500fcdc. |
| D-05 | Reject disconnected bases; retain supported raised islands. |
| D-06 / D-07 | Generic package and initial loading accepted; observed UI name/color limits recorded. Downstream project handling and filament mapping are outside acceptance. |
| D-08 | M0 deferred responsiveness; DIG-27 measured production UI blocking and selected a Worker (see D-08). |
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

## D-08 — Measured production generation requires a Worker

**DIG-27, 2026-10-20:** Offload the existing pure `generateCoin` pipeline to a
module Worker. The actual generated M3 editor exceeded the 150–250 ms decision
threshold repeatedly and delayed scheduled input delivery by up to 489 ms.
Promise/task yielding did not offload this synchronous work. DOM-based SVG
import and atomic candidate replacement remain on main; no geometry precision,
limit, validity or export policy changes.

Native in-app Chromium reported Chrome 155.0.0.0 on Windows 11 Pro 10.0.26200,
MSI Aegis ZS2 desktop / AMD Ryzen 9 9900X (12 cores/24 threads), 33,345,101,824
physical RAM bytes. Browser reported 24 cores/32 GB, 679×1044 CSS px and DPR 1.5.
The unchanged baseline was main `60f9865ad1bb5a0deb47e575ad24b1f79eb0608e`,
tree `b1992ed09a8d941a5d167b2a1ce1fcd9343422c5`, served under
`http://127.0.0.1:4175/coinPrintMaker/`. Three runs per action:

| Fixture | Source bytes | Canonical XY vertices | Unified vertices / triangles | Import total ms | Base-thickness regeneration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| sun-medallion | 1,413 | 486 | 972 / 1,940 | 539.1–692.6 | 555.8–587.3 |
| twin-stars | 1,568 | 408 | 816 / 1,628 | 411.9–461.0 | 396.0–459.1 |
| monogram-o | 1,473 | 211 | 422 / 840 | 187.4–220.0 | 186.8–188.1 |
| offset-nested-transforms | 1,505 | 203 | 406 / 808 | 187.1–188.9 | 172.0–188.1 |
| generated regular polygon | 15,737 | 800 | 1,600 / 3,196 | 652.1–684.2 | 651.6–684.1 |
| padded offset-nested | 2,090,000 | 203 | 406 / 808 | 203.2–220.2 | 187.0–203.7 |

Pending-to-ready intervals isolate generation wall time including coordinator
ownership: sun 516.0–666.6 ms on imports / 532.1–571.3 ms on edits; twin
399.1–438.3 / 374.0–449.7; monogram 176.0–198.6 / 173.0–179.8; offset
169.5–176.7 / 164.8–168.7; 800-point polygon 630.4–658.8 / 642.4–659.7.
Representative main-thread long tasks were 164–652 ms with frame gaps up to
650 ms. Four Enter edits scheduled 30 ms apart had later deliveries delayed
489.0, 467.1 and 438.1 ms. The eventual checked key matched current revision 4.

The baseline used native browser APIs/production code with synthetic input/File
events; it was not a physical input/picker study. The 8,192-point source rejected
at the existing flattened-ring guard in 27.0–44.3 ms, preserving the earlier
800-point coin. Its following baseline edit rows are excluded, as is the rapid
row wall timer which raced future inputs. The committed
[baseline samples](evidence/dig27-baseline.json) retain per-run values, keys and
these exclusions. [Background generation](background-generation.md) documents
the harness, final verification and native limits. Historical M2 timings only
motivated this new measurement and are not reused as M3 acceptance evidence.

Pre-rebase clean `5013d68` Worker runtime (same browser/device/DPR, viewport
1280×720) completed 50 action rows with zero main-thread long tasks/window errors;
frame gaps were 18.0–19.6 ms and queued input delays 0.1/1.9/3.9/6.9 ms. Total
sun regeneration remained 557.0–588.5 ms: offloading preserves validation rather
than claiming it became instantaneous. The 2,090,000-byte input took 234.5–237.0 ms
total with ~18.1 ms frame gaps; 8,191/8,192-point candidates rejected within
27.5–44.1/28.0 ms with prior source preserved. Native Worker fault/retry and a
real file chooser plus Enter edit passed the stated current-key/dimension gates.
The IAB/harness preview fallback prevented native GPU/orbit acceptance, while
text remained usable; differing viewport and synthetic-vs-native inputs limit
comparison. [Final samples/build hashes](evidence/dig27-worker.json) and the
[detailed native limitations](background-generation.md#original-native-comparison-before-rebase)
record the evidence without cross-browser/physical-device claims.

After rebasing onto current main `adbf9c3` (preserving DIG-40/41/42), a separate
clean `b0be2fb` native smoke/profile completed all 50 rows with zero main-thread
long tasks/window errors and rapid input delays up to 4.8 ms. Its checked token81
matched current source28/revision4. Upstream contour fixes move 8,191/8,192-point
rejection to MESH_LIMIT_EXCEEDED in generation; no limits were raised here.
[Separate rebased samples](evidence/dig27-rebased-worker.json) and
[compatibility limits](background-generation.md#rebased-current-base-smoke)
distinguish the amended runtime from historical 5013d68 evidence. Fresh full
verification passes 771 Vitest +22 Node and generated Pages checks.

Protocol version 1 echoes token/source/settings keys; current errors fail closed
with recoverable text outside Canvas. Fresh Float64/Uint32 transport copies
preserve exact domain coordinates and ownership. Supersession terminates active
CPU work; color-only metadata updates retain compatible checked/in-flight meshes
with zero additional clipping/tessellation. Relative Vite Worker assets preserve
main/root Pages hosting. No M4 serializer, slicer or physical-print gate changes.

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

## D-13 — Production named-layer and source-shape extraction

**DIG-14:** Retain D-01's named/non-nested actual Inkscape layers, document order,
first-layer base candidate and duplicate-source-ID rejection. IDs use disjoint
`source:` and `path:` namespaces; duplicate display labels never merge tiers.
Preserve empty nonbase tier identity at this intermediate stage; an empty base
fails without choosing another layer. Canonical empty-footprint policy remains
DIG-16, not a settings decision here.

Pinned SVGLoader source-node ancestry and inherited style mapping pass the eleven
accepted fixtures plus adversarial mapping/style tests. A detached eligible-node
projection makes preflight's resolved visibility/paint authoritative despite
SVGLoader CSS differences. Every eligible source must map exactly once; missing
or unsupported mappings reject without partial geometry. Complete supported shape
syntax is guarded before the permissive loader. See [extraction contract and
evidence](svg-layer-extraction.md).

The serializable intermediate curves are explicitly in SVGLoader coordinates:
element transforms already applied, 96 DPI/px configured, root viewport/mm/Y-up
normalization still DIG-15 and canonical polygons/complete import still DIG-16.
No Three.js/DOM objects escape and extraction cannot authorize export or replace a
canonical coin. Baseline Library documents remain unavailable; the live issue,
current contracts and accepted D-01/D-12 supply this bounded implementation.

## D-14 — Deterministic physical viewport and exact affine curve mapping

**DIG-15, 2026-10-18:** Retain D-02's positive viewBox, root mm/cm/in/pt/px and
96 DPI, complete explicit page or complete 40 mm target-width fallback, centered
meet/none policy and page-relative single Y inversion. Validate a lone physical
dimension before discarding it for fallback; invalid declarations never infer.
Reject other aspect mappings, relative/percent units, singular/nonfinite transforms
and complex root/nested viewport arrangements explicitly.

**Evidence-driven D-13 revision:** Do not delegate transformations to SVGLoader.
Its permissive parser can silently discard malformed operations, and its ellipse
shortcuts are unsafe for rotated/nonuniform or full sheared parameter mappings.
Keep the pinned detached interpreter/source-node mapping and authoritative styles,
but omit transforms/viewport from its projection. Numericize primitive local CSS
units first; compose strict SVG transforms once in pure DTO code. Extraction now
uses `coordinateSpace: 'svg-user'`. Ellipses store center plus two affine axis
vectors with unchanged source angles/traversal; apply reflection/Y inversion to
vectors rather than flipping angle direction a second time.

The pure viewport/normalizer returns intermediate canonical-mm curves and exact
interpreted-curve bounds, physical page and warning metadata. It does not create
ImportedCoin or authorize generation/export. DIG-16 must consume the new ellipse
representation with a physical error bound and own polygon closure/winding/holes,
union/validity and complete import/UI integration. SVGLoader's existing rounded
rectangle Bézier approximation remains an explicitly bounded interpreter limitation
for that tolerance work; no arbitrary-path/print acceptance is inferred here.

Analytical unit/viewport/composition/arc/Bézier/rejection tests pass the existing
eleven accepted fixture pages, identities and bounds. Native Chrome 153.0.8010.48
Vite-bundled API checks additionally pass three native SVG transform oracles,
unit/fallback/aspect cases and fail-closed rejection, with no imported DOM mount,
script execution, network processing or page errors. See [normalization contract](svg-coordinate-normalization.md) for equations, coverage and limitations.
M0 fixtures/reports/samples and staged atomic source loading remain unchanged;
Library baseline sources remain unavailable.

## D-15 — Canonical import, fill rules and M1 checkpoint

**DIG-16, 2026-10-18:** Retain pinned detached SVGLoader parsing with strict
preflight/source accounting and external affine mapping, explicit D-02 physical
scaling and replaceable polygon-clipping 0.15.7 union adapter. Own physical
0.005 mm curve flattening, 0.000001 mm grid, charged complexity caps, simple
compound-contour winding/parity interpretation, canonical ring/footprint validation
and complete latest-selection-only ImportedCoin replacement. Separate overlapping
filled objects union; self-intersecting or crossing/touching compound contours fail
with corrective diagnostics instead of guessed holes or partial artwork. General
arrangement/precision hardening remains DIG-18. D-05's single connected base
remains; empty named upper layers explicitly reject with LAYER_EMPTY.

**Evidence-driven revision to D-14:** pinned SVGLoader rounded rectangles use
fixed cubic coefficient 0.551915024494, whose error scales with corner radius.
After validating original loader curves/node mapping, construct exact local
elliptical quarter-arcs with SVG radius default/clamp/zero semantics, then apply
the existing affine transforms. This avoids an unbudgeted physical error without
changing dependencies or broadening supported SVG. Analytic rounded-area and
affine bound tests supplement dense physical Bézier/affine-ellipse error probes.

The production importer passes all 21 independent authored golden oracles,
including holes/islands/overlaps and rejection categories. Canonical/UI tests cover
snap collapse/near gaps, fill winding magnitudes, injected kernel failures and
complete atomic failures/stale reads. Native Chrome 153.0.8010.48 generated Pages
picker/inspector smoke passes all fixtures, source escaping, full-stage failures,
rapid file selection, warning and narrow viewport probes, with no processing
network requests, source mounting/execution or page errors. Root Pages artifacts
are synchronized. [Canonical import](canonical-svg-import.md) records exact limits,
tolerance accounting, parsing/scaling/fill decisions and M1/M2 boundary.

No M2 implementation or new mesh/export/slicer/physical-print acceptance is claimed.
The M1 implementation handoff remains subject to final-head CI and operator merge;
the missing original Library baselines are not represented as inspected documents.

## D-16 — Pure active stack and separate initial settings

**DIG-17:** Resolve the existing immutable canonical ImportedCoin plus matching
CoinSettings without UI/render state or a second polygon kernel. Require exact
source/settings layer identity, original base first/enabled, finite positive
thickness and opaque sRGB color on every entry, including disabled artwork.
Preserve the existing nonempty printing-layer and single-region base policies.
Default settings start at revision 0 with 1.6 mm base / 0.4 mm artwork, all enabled,
and neutral #808080 display color independent of SVG paint/filament. This is a
reversible initial color choice, not a palette or filament-mapping decision.

Consecutive enabled tiers define active adjacency; base starts at Z0 and all Z
intervals are cumulative/absolute. Hide/reorder/show recomputes from source and
settings without mutating source, settings or earlier results. Reject cumulative
overflow or a positive thickness too small to increase its current floating-point
Z; add no new precision grid/minimum thickness policy. Success carries its import/
revision key, active tiers and total height, with no mesh/export-valid status.

Source errors block resolution. Minimal source identity/nonempty/finite-ring/base
checks supplement canonical import without revalidating or changing its topology,
normalization or budgets. Broader polygon work remains DIG-18 and immediate-lower
support remains DIG-19. In particular outside-rim/over-lower-hole resolve a stack
but remain unsupported geometry until that later validation. No M0 mesher change
or new offset-nested-transforms mesh acceptance follows from this work.

Independent analytic/adversarial stack tests and all eleven accepted authored
fixtures exercise production import → defaults → resolution against golden
identity, Z and XY/holes/regions. See [active layer stack](active-layer-stack.md).
The Library baseline files remain unavailable; scope follows the live issue,
existing canonical DTOs and repository decisions. M3 controls, meshing/export,
browser/performance and slicer/physical-print gates remain separate.

## D-17 — Reusable checked planar Booleans

**DIG-18:** Keep polygon-clipping 0.15.7 behind the extended plain-DTO
PolygonKernel and reuse one core polygon service for import layer union,
difference/intersection and checked area/bounds/isEmpty. Empty area sets are
valid intermediates with zero area/null bounds; printing-layer/base and future
support policies remain callers' responsibilities. No duplicate M1 union path.

Retain M1 grid/chord/contact and complexity limits. Validate raw and snapped
operands, execute Booleans on raw operands, validate raw output relationships,
reject snap-erased edges or erased/reversed turns, then validate canonical
snapped topology. Cross-object closure noise is not allowed to bridge real gaps;
exact contact is allowed, while positive near-contact and strict crossings near
an endpoint reject. A nonempty residual is preserved or rejected, never area
suppressed. These conservative guards are bounded evidence, not exact arithmetic
or a universal topology-equivalence proof. Both validation passes charge the
shared budget, which may reject earlier than M1.

65 new analytic/adversarial tests supplement all 394 historical unit cases and
22 retained Node checks. Independent rational intersection and tiny residual
oracles caught and prevent pre-Boolean rounding loss. Exact partial oblique
shared edges, holes/islands, tangencies, subnoise contact, grid/large coordinates,
all-operation injected failures and a replacement adapter are covered. See the
[service contract and evidence](polygon-service.md) for outcomes and limitations.
No kernel replacement is warranted by current bounded fixtures; future failures
remain actionable diagnostics behind the replaceable boundary.

No DIG-19 support orchestration, production mesh/export, M3 UI, slicer or physical
print work follows from this issue. M0 sources/reports/samples remain unchanged;
missing Library baselines are not represented as inspected.


## D-18 — Immediate-lower support and diagnostics-only remainders

**DIG-19:** Resolve the current canonical coin/settings on every support call;
consecutive enabled tiers define deterministic adjacency and cumulative absolute
Z. Use the existing checked polygon service for each upper-minus-lower operation
with one shared support-call budget. Empty checked difference proves planar
containment; source metrics, area/bbox comparisons or tiny-area allowances do not.
Preserve every successfully computed unsupported remainder as diagnostics-only
geometry with both layer IDs and an upper-scoped remedy. Never replace artwork
with clipped geometry. Failed Boolean pairs retain scoped errors, not invented
empty remainders; later pairs are attempted in order. No silent output cap.

Retain D-05's single connected base (through holes allowed); raised islands may
be disconnected when every filled region is supported. Exact identical tiers
and shared exterior/hole/oblique boundary segments are allowed subject to the
same polygon validation. Point/line contact alone cannot support outside filled
material. Add no tolerance: retain 0.005 mm chord, 1e-6 mm grid, 2e-6 mm ambiguous
contact and redundant-endpoint-only 1e-9 mm closure noise. Nonempty slivers are
preserved or reject; the source-affine oblique ULP limitation is unchanged.

Support returns a separate supported/rejected DTO. Rejection has no active tiers,
height or meshes; success carries the import/revision key and planar tiers but
does not construct a valid GeneratedCoin. Base-only calls still check polygon
topology. A stage-specific freshness predicate rejects stale keys/error results;
callers still own revision increments and future mesh/export validation.

45 new independent analytic/adversarial and production-pipeline tests supplement
all historical coverage. Nine accepted authored inputs pass support; outside-rim
and over-lower-hole fail with retained remainders. Hiding Ring supports the center
directly on base at total height 2.0 mm; reorder/show can invalidate support.
See [support validation](support-validation.md) for exact outcomes and limits.
No DIG-20 meshing, M3 UI/store, exporter or new manual acceptance follows from
this issue. M0 sources/reports/samples remain unchanged, and unavailable Library
baselines are not represented as inspected. Operator merge remains required.

## D-19 — Pure closed positioned parts with checked cap coverage

**DIG-20:** Add replaceable plain-DTO triangulation and independent tier extrusion.
Keep pinned pure Earcut in an adapter, canonical source XY and exact cumulative
absolute Z, all outer/hole walls and both interface caps. Multi-part construction
always resolves current source/settings and checks immediate-lower support first;
failure exposes no partial parts. Stable source IDs/name/color remain attached to
their complete layer meshes, including disconnected raised islands. A separate
parts-built result/key never claims ValidGeneratedCoin or serialized exportability.

Preserve original boundary subdivisions: reconstruct only exposed cap edges along
ordered, exactly collinear original ring paths. Reject omitted meaningful corners,
zero triangles or invalid output; do not copy M0's fuzzy all-vertex stitcher.
Verified canonical-lattice BigInt predicates distinguish tiny nonzero turns without
silently snapping input. Exact dyadic predicates also check unchanged emitted
binary XY, which can differ from ideal lattice geometry by representation ULPs.
Positive triangle orientation, complete directed original boundary equality,
opposite paired interior edges and exact area equality establish cap coverage and
exclude positive-area overlaps/hole filling on both representations. Finite emitted
normals, closed edge incidence and translated compensated volume supplement these
bounded construction checks. Expected volume uses actual emitted-coordinate area
times the exact interval height, with 1e-9 relative accumulation error and no
absolute tiny-feature deletion threshold. Unrepresentable/overflowing cases reject.

Share existing polygon work limits and new explicit aggregate construction/output
budgets across all tiers, not separately per island. See
[positioned layer meshes](positioned-layer-meshes.md) for APIs, exact precision,
coverage reasoning, limits and independent evidence. Sixty-six new tests include
analytical concavity/holes/islands, cap-clipping overlap/coverage oracles, actual
edge/component/vertex-link checks, all-three-edge subdivisions, tiny/large-coordinate
features, thin elevated Z, malformed adapters, budgets and no-partial/stale failures.
All nine supported authored inputs pass the current importer/support/part pipeline;
the two unsupported authored inputs still reject. D-10's transformed tile now has
a closed art part at XY[4,24]–[10,30], Z[1.6,2], volume14.4mm³. This establishes
part construction only; unified-surface D-10 coverage remains DIG-21/22.

No M0 fixture/report/sample/spike changes, production UI/scene integration, unified
coin surface, full arbitrary-mesh validator, exporter or new slicer/physical-print
acceptance follows. Library baseline documents remain unavailable and are not
represented as inspected. Root Pages artifacts stay synchronized via the normal
guarded build. Operator merge remains independent; leave DIG-20 unfinished until
that merge is verified.

## D-20 — Exact unified exterior with indexed boundary subdivision

**DIG-21:** Construct base bottom, lower-minus-next terraces, final top and
original boundary walls, rather than concatenating independently capped parts.
Fresh source/settings support is mandatory and the replaceable pure builder
returns `unified-built`, never export-valid GeneratedCoin. Preserve exact absolute
Z, source XY and identities. Refine original/terrace contours through indexed
BigInt supporting-line buckets of existing endpoints before cap/wall construction.
Require exact lower-minus-upper terrace boundary cancellation on canonical-grid
and emitted binary lattices; reject unequal binary grid-key collisions and splits
that would require moving a point. Weld exact XYZ only, identifying signed zero.

The authored twin-stars terrace exposed a narrow DIG-20 cap-restoration gap:
Earcut can expose a collinear long edge spanning two holes with a reverse bridge.
Replace same-ring-only recovery with indexed exact existing-endpoint subdivision
of exposed edges. Opposite bridge segments then cancel. Positive orientation,
complete original directed boundary coverage, paired internal edges and exact
area on both representations remain mandatory. Minimal two-hole shoulders and
authored twin-stars unified/part checks pass without new geometry or filtering.

Bound construction through shared polygon/input/output/work budgets; cumulative
surface plus stitched allocations are charged. Exact buckets avoid M0's fuzzy
global all-vertex scan, but heavily collinear buckets can exhaust the shared work
cap. Runtime checks require finite nonzero faces, no duplicate triangle identity,
opposite paired edges, cyclic connected vertex links, one connected boundary and
compensated volume matching emitted area-height sum within relative 1e-9.
These checks support constructed surfaces; general validation/generateCoin and
serialized-coordinate acceptance remain DIG-22 and later.

Retain D-04 cavity/pinch/disconnected failure policy and the existing polygon
service's stricter requirement for separated terrace polygons. A supported L lower
with a corner-filling 3×3 upper square leaves a point-touching terrace and rejects;
no implicit split/offset/repair is introduced. Off-grid, binary-unrepresentable or
snap-altered boundaries also fail explicitly. See [unified coin surface](unified-coin-surface.md) for APIs, exact limits, analytical coverage and remaining
boundaries. All nine supported authored inputs, including D-10's transformed tile,
now pass production unified construction; unsupported inputs still reject. No
historical fixture/M0 changes, UI integration, exporter or new manual acceptance
is claimed. Unavailable Library baseline documents are not represented as read.

## D-21 — Final checked headless snapshots and exact source-surface coverage

**DIG-22:** generateCoin constructs current checked snapshots after fresh support,
replaceable positioned/unified builders and independent actual-coordinate checks.
Shared topology validates exact welds/incidences/links and each component's local
outward volume. Exact dyadic triangle tests include adjacency, coplanar overlaps
and arbitrary finite Z. At most 64 exact containment rays retry degeneracies;
unresolved ambiguity fails closed. No fuzzy geometry repair.

Positive cap/wall chains must equal original current tier boundaries on oriented
planes/slabs. Complete boundary equality proves full coverage/holes/terraces and
rejects same-bounds/same-volume semantic errors while allowing different diagonal
triangulations. Expected volume uses emitted polygon area and representable tier
interval, distinct from ideal curved oracles. Numerical volume relative 1e-9,
bounds 1e-9 mm +1e-12 relative; exact semantic checks still enforce source position.

Final aggregate validation gets its own explicit 8m-work cap; construction's 2m,
polygon and 100k-vertex/200k-triangle caps remain unchanged. Success is detached,
current and serializable with dimensions/volume/all internal candidate color
boundaries. Failure strips all exportable payload; invalid identity/revision gets
no fabricated key. Consumers still enforce revision freshness; serializer
coordinate checks remain later work. D-03-D-05 retain checked shared edges,
connected base/unified exterior, supported raised islands, through holes and
pinch/cavity/internal-boundary rejection. Point-touch terraces/binary mismatches
remain explicit limitations.

[M2 checkpoint](m2-geometry-checkpoint.md) maps criteria/tests, all six issue/PR
references and native bundled observations. Observed 168-633 ms flags D-08/DIG-27
profiling; no editor/Worker work starts. DIG-22/M2 remain unfinished until operator
merge verification. No universal geometry/performance, new export/slicer or
physical-print claim; absent Library baselines are not represented as read.

## D-22 — Bounded editor shell before revision and scene integration

**DIG-23:** AppShell owns only the existing complete-candidate latest-wins local
import transaction through a small React hook; the pure reducer/import/geometry
contracts remain unchanged. Presentational toolbar, preview and read-only layer
panel keep named source metrics and failed replacement diagnostics separate from
the retained source. Error recovery leaves parent-owned imported data intact and
local file selection accessible.

Successful import explicitly means 2D imported, not checked or rendered geometry.
Future preview states accept a full GeneratedCoin/current key and use the existing
freshness predicate before claiming a checked current result. No fake coin image,
generation coordinator, settings store or Worker is introduced. Both exports stay
disabled. DIG-24 replaces local ownership with revision-safe coordination, DIG-25
adds editing, DIG-26 adds the scene and DIG-27 profiles before a Worker decision.
This reversible boundary avoids choosing those later implementations in shell work.

The 320 px desktop panel stacks at narrow widths with labeled native controls,
visible focus, touch targets and units. [Shell contract](editor-shell.md) records
state reachability, tests, recovery and later boundaries. Live DIG-22/M2 confirms
the preceding headless gate was operator-merged; historical merge-pending prose
is not a current blocker. Unavailable Library baselines are not claimed read.
## D-23 — Immutable revision-safe editor ownership and proven display reuse

**DIG-24:** One factory-created Zustand 5.0.15 vanilla store owns imports,
committed settings, revisions/tokens, generation/diagnostics and selection.
Structured-clone/deep-freeze ownership boundaries preserve canonical source and
returned checked snapshots independently of caller data. Complete candidate plus
default settings commits atomically; failed imports retain checked data and restart
canceled pending work under a new token. Stale success and failure are discarded.

Source revision, monotonic token, exact source reference and ordered geometry
settings must match an active request. Valid response freshness is checked against
the submitted revision before display metadata projection. Colors alone can
reuse frozen checked meshes after exact source/ID/role/order/enabled/thickness
proof and valid settings checks; current tier/part colors and revision advance
without clipping or tessellation. Geometry edits always run complete validation.
Canonical imported footprints are retained stable 2D work; no raw Boolean cache
is added. Reimport replaces all source/candidate identities. Pending previous
geometry is explicitly stale and never current/export eligible; failure clears it.

[Reactive generation](reactive-generation.md) records the protocol, race/call-count
and ownership coverage, main-thread yielding limitation and later boundaries.
Numeric text stays local to DIG-25 controls. No Worker or scene is added; D-08
profiling/Worker decision remains DIG-27. Export selectors describe checked
geometry only; M4 buttons stay disabled and emitted-coordinate checks remain
required. No XY/Z, precision/support or manual acceptance policy changes.

## D-24 — Stable layer rows with explicit local numeric commits

**DIG-25:** Keep the existing immutable store as the only committed editor owner.
Layer rows are keyed by import identity and source layer ID, preserving drafts,
selection and settings through reorder. A native opaque color picker uses the
existing proven display-only reuse path. Numeric drafts stay text until Enter or
blur validates a complete finite positive decimal; malformed text stays visible
with committed values unchanged, and Escape restores the latest committed value.
No prefix parsing, clamp, implicit geometry setting or new minimum thickness.

Raised tiers use pointer capture with handle-only touch scrolling suppression,
edge autoscroll and a single drop commit; cancellation is a no-op. Native labeled
move buttons provide keyboard/single-pointer alternatives with retained-row focus
and position announcements. Base order/visibility stay locked. Current height/Z
come only from a checked current generation; all order/visibility/thickness edits
reuse the existing complete support/mesh pipeline. See [layer controls](layer-controls.md)
for exact edit behavior, validation and scope. No drag dependency, scene, Worker,
exporter, geometry tolerance or M0 acceptance policy changes.

## D-25 — Checked Z-up display with isolated renderer ownership

**DIG-26:** Keep the existing Zustand store as the sole owner of immutable
source, settings, revision-safe generation, colors and selected layer ID.
PreviewViewport checks current validity before passing generated parts to the
scene. Renderer buffers are detached Float32/index display copies; never use them
for metrics, geometry decisions, validation or serialization. No mesh centering,
rotation, XY transform, repeated Y inversion or Z scaling is introduced.

Use pinned Fiber 9.8.2 and Drei 10.7.9 with existing React 19.3.1 / Three 0.186.1;
their declared peer ranges support these versions. Drei OrbitControls handles
orbit/pan/zoom around a Z-up camera. Local view commands target checked bounds:
reset is oblique, side looks from -Y (+X right/+Z up), top looks down +Z
(+X right/+Y up) with the control's 1e-6-radian pole clamp. Fit keeps the orbit
direction and recenters; aspect-aware bounding-sphere framing covers resize.
These camera choices are presentation only and do not alter exported XY/+Z.

Each part's checked opaque sRGB #RRGGBB metadata drives its shaded material.
Lighting changes appearance, not stored color intent or filament mapping.
Selection toggles separate depth-tested edge lines without changing colors,
settings revisions or generated data. Pending/importing/invalid results clear all
part resources and current measurements; no stale mesh is retained. Keep the
canvas/renderer and controls mounted across those transitions and valid updates.
Custom geometry/material/edge allocations are effect-owned and explicitly disposed
on replacement/unmount; Drei owns control disposal and Fiber owns renderer teardown.
Preview-local initialization/context failure unmounts only the canvas and offers
retry; textual dimensions/diagnostics and import/layer workflows remain available.
See [coin preview](coin-preview.md) for evidence and limits. No engine, export,
Worker, geometry/color truth or manual acceptance policy changes.

## D-26 — Bounded contour sweep and same-winding nonzero unions

**DIG-42:** The original Teto upload contains a 4,014-vertex outline; enumerating
all segment pairs exhausts the existing 2,000,000-step document budget despite
its simple topology. Use an X-bound sweep with tolerance-expanded Y filtering
before existing contact predicates. Charge each X-overlap scan to preserve dense
input rejection. Keep all existing policy constants and failure-atomic gates.

The next exposed rejection was `path2`: its individually simple compound contours
all have the same winding sign but overlap. Under nonzero fill these represent
a union, so feed individual rings to the existing checked Boolean union. Validate
raw cross-contour precision before snapping. Preserve the nested-hole path for
other winding configurations and continue rejecting mixed-winding/evenodd
crossings. This is a limited evidence-driven extension of the import subset;
it does not implement arbitrary SVG paint order or accept self-intersecting rings.
See [canonical SVG import](canonical-svg-import.md#dig-42-detailed-teto-artwork)
for the retained source, acceptance evidence and limits.

## D-27 — Preserve short edges between diverging contour neighbours

**DIG-41:** The original Gumi upload's `path10` closes with a roughly 0.000002 mm
edge after snapping. Its two neighbouring segments are necessarily within the
0.000002 mm clearance, despite having no intersection. Treating this local
proximity as a self-contact incorrectly rejects valid artwork.

For same-ring segments separated by exactly one edge no longer than the existing
clearance, waive only proximity when the vectors departing the intervening edge
have a nonpositive dot product (diverging neighbours). Still reject actual
crossings, touches and overlaps. Hairpins, nonlocal pairs, cross-ring contacts,
snap-collapse and corner-preservation checks retain existing guards. Preserve the
edge and its endpoints; do not repair artwork, merge vertices, raise budgets or
change chord/snap tolerances. This applies to raw and snapped ring validation.

The original upload is retained at `fixtures/regressions/gumi-coin.svg`. Regression
coverage checks deterministic whole-file import and isolated `path10` import,
plus an analytical tiny bevel, reversed winding, actual crossings/touches and a
narrow channel. These are import checks, not slicer or physical-print acceptance.

## D-28 — Current-state measurements and scoped diagnostic presentation

**DIG-28:** Derive presentation from existing current-generation freshness gates.
Only checked current domain snapshots supply dimensions, volume and active-tier
Z. Keyless invalid results remain valid failure shapes. Retained geometry during
pending is explicitly stale and supplies no current measurements/export
eligibility; successful source replacement and invalid completion clear it.
A rejected import candidate has separate diagnostics and cannot invalidate or
rename a retained checked coin. No geometry/Worker/serializer policy changes.

Render eight diagnostics per page with total severity counts, Error/Warning text,
stable layer identities, corrective actions and actual immediate-lower support
context. A diagnostic action only selects an existing stable layer. Show width,
depth, cumulative height in mm, checked mesh volume in mm³, and a bounded-height
scrollable table of active-layer Z intervals. Both exporters remain unavailable
and disabled even when engine geometry is valid. See [current diagnostics and
evidence](current-diagnostics.md) and [pre-merge M3 checkpoint](m3-editor-checkpoint.md).

## D-29 — Validate float32 STL at the serialization boundary

**DIG-29:** Serialize only the exact current detached checked unified mesh, with
its absolute domain coordinates and outward triangle order. Float32 storage has
less precision than the geometry engine, so independently validate emitted
coordinates using existing bounded topology/exact intersection predicates and
compare checked bounds/volume/shells with the source snapshot. Rounding allowances
are owned by STL only: `1e-6 + abs(source) * 2e-7` mm per bounds coordinate and
`1e-6` relative volume. Generation/domain acceptance and tolerances are unchanged.
Overflow, collapse, changed orientation or topology reject; never transform,
repair, drop triangles, export previous geometry or obtain mesh data from Three.js.

Keep Blob/Object URL/filename/anchor/error ownership in a browser-only boundary.
The synchronous action rechecks current identity before side effects. Revoke on
the next task after a normal click, immediately on setup/click/scheduler failure,
and do not depend on a mounted component for cleanup. UI text explains that STL
is geometry-only and unitless, with millimeter coordinate convention. Browser
action success cannot establish an OS save. See [binary STL export](binary-stl-export.md)
for automated coverage and distinct instrumented/native evidence tracks.

## D-30 — Export choices resolve current checked state at submission

**DIG-31:** A native ExportDialog owns only format/filename/error choices. Both
formats resolve the current checked domain snapshot on submit and recheck exact
snapshot/source revision/source reference after pure serialization before any
download. No stale/previous result or renderer buffer can supply bytes. Color-only
edits reuse existing checked meshes through the store's proven metadata projection;
the unchanged DIG-30 writer receives current part/tier colors and emits its existing
Core material references. No duplicate color resource owner or geometry rebuild.

Keep the old STL action/wrapper behavior. A shared DOM-only download boundary
adds `model/3mf` alongside `model/stl`, normalizes the chosen suffix and preserves
exactly-once URL cleanup and retry. Native modal focus, Cancel/Escape, live status
and submit gating accompany bounded-width scrolling. Browser MIME hints/anchor
success cannot prove an OS save. Generic 3MF names/color intent remain package
requirements; consumer presentation/filament/printer configuration and vendor
project metadata remain outside acceptance. The operator deferred DIG-30 target-
slicer initial loading to later polish; no new slicer gate or acceptance claim.
See [export options and evidence](export-options.md). No DIG-32 height-guidance,
M5, geometry policy or hosting arrangement change.

## D-31 - Extend hanging artwork through lower active tiers

**DIG-78, operator clarification:** Automatically extend every enabled footprint
straight down through all lower enabled layers, including the base. The operator
approved filling holes and enlarging the outer outline, and explicitly declined
a disconnected-result rejection. Detached artwork becomes a separate column to
Z=0; no connecting bridge is invented. This supersedes D-05's single connected
generated-coin policy, while retaining the canonical source import requirements.

Compute effective footprints by checked top-down Boolean propagation after
current order/visibility resolution. Preserve already-supported binary geometry;
never modify imported footprints/settings. Support added to each tier uses that
tier's existing color and Z interval. Hiding or reordering regenerates all support
from source, so automatic additions do not persist after the need disappears.

Use effective footprints consistently for parts, unified surfaces, independent
surface/bounds/volume validation and both exports. Expected unified shell count
comes from effective base regions instead of the previous constant one. Retain
all precision, closed-manifold, orientation, intersection, work-limit and stale
result gates. No SUPPORT_OUTSIDE_LOWER diagnostic is emitted by generation;
polygon/mesh failures still fail atomically. See [support policy and regression
evidence](support-validation.md).


## D-32 — STL cleanup uses physical distance rather than exact facet preservation

**DIG-79, operator clarification:** Rejecting sub-micron float32 artifacts blocks
otherwise printable artwork. At export, weld identical emitted vertices and omit
zero-area emitted facets, then retry on a 0.001 mm grid when necessary. Require
at most 0.001 mm Euclidean displacement for every source vertex, including encoding
rounding. This supersedes D-29's prohibition on export repair and facet removal;
source geometry and generation acceptance remain unchanged. Nozzle diameter is
not the cleanup threshold.

Validate the resulting surface with the existing closed-manifold, shell-count,
orientation and exact intersection gates. Keep bounds and volume sanity checks
scaled to measured displacement. A microscopic hole may close; a 0.01 mm hole is
covered by preservation tests. This is bounded cleanup, not arbitrary mesh repair:
a candidate that cannot produce a valid surface still rejects. Synthetic STL
round-trips cover collapsed bevels, microscopic holes and preservation of a
0.01 mm hole. No slicer or physical-print result is claimed. See [binary STL export](binary-stl-export.md).
