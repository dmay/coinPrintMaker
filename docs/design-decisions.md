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
