# Unified external coin surface (DIG-21)

DIG-78 supersedes the support rejection and single connected result policy below.
Current generation extends every active footprint down through all lower tiers,
including the base, and permits detached closed components. Source SVGs remain
immutable. See [automatic downward support](support-validation.md).

DIG-22 adds complete [checked headless generation](headless-generation.md).
Construction remains distinct from final current-revision validation.

`buildUnifiedMesh(current ImportedCoin, current CoinSettings, PolygonKernel,
TriangulationKernel)` resolves current settings and validates immediate-lower
support afresh, then constructs the complete external surface. The replaceable
`UnifiedMeshBuilder` interface and default `unifiedMeshBuilder` expose that same
stage. Geometry remains plain serializable tuples in page-relative Y-up mm with
exact absolute cumulative Z. Source/settings, identities, colors and relative XY
are preserved; no scene, renderer, second transform or recentering participates.

`unified-built` carries the current generation key, original active tiers, total
height, unified mesh, construction metrics and diagnostics. `rejected` carries
diagnostics and a key only when fresh support established one; it carries no
partial mesh, metrics, tiers or height. `isCurrentUnifiedMesh` checks freshness
of already constructed results, not arbitrary JSON validity. There is no cached
support input. Edits, disabled tiers, reorder and source replacement always pass
through fresh resolution/support. This result is distinct from `ValidGeneratedCoin`:
the complete `validateMesh`/`generateCoin` gate remains DIG-22, and serializers
must later validate the coordinates they actually emit.

## Exposed surfaces and exact conformity

Construct the reversed base bottom, each upward `lower minus next upper` terrace,
the final upward top, and outward walls for every original outer/hole boundary
over each tier's exact interval. Empty differences are valid: identical tiers
have no interface caps. Independent closed part meshes are never concatenated.
Canonical outer CCW and hole CW edges keep filled material left, so the same wall
triangle order points outward for both. Raised islands meet the lower tier through
their full footprints; they remain part of one coin boundary.

Before triangulation, collect original and terrace contour endpoints in indexed
exact supporting-line buckets. A primitive BigInt grid direction/intercept is the
line key; endpoints are sorted lexicographically and segment membership is exact.
Refine every relevant contour using these existing endpoints. Global XY refinement
is applied consistently to caps and both wall elevations, including identical,
partial shared-edge, full-side and aligned-hole cases. There is no invented point,
near-point weld, offset, artwork clipping or nonzero-face removal.

The existing 1e-6 mm grid is recovered for predicates without changing emitted XY.
The exact emitted binary values are also lifted to the dyadic 2^80 lattice, as in
DIG-20. Every proposed split must lie on its segment on **both** representations.
Endpoints sharing an ideal grid key but having unequal emitted values reject.
Only signed zero is identified with zero. After refinement, require complete exact
directed segment cancellation `boundary(lower) - boundary(upper) - boundary(terrace)
= 0` on both lattices. A Boolean snap cannot silently replace original geometry.
Any mismatch or unrepresentable subdivision rejects with a diagnostic.

Caps reuse checked `triangulateRegion`. DIG-21 extends its boundary restoration
for one observed compatibility case: the authored twin-stars terrace contains
two holes whose shoulders share a supporting line. Earcut can expose a long
cross-hole edge [12,23]→[25,23], plus the reverse bridge [20,23]→[17,23], while
the source shoulders are [12,23]→[17,23] and [20,23]→[25,23]. Split the exposed
edge at those existing endpoints; opposite interior bridge segments then cancel.
Indexed original/exposed-edge endpoint buckets replace the former same-ring-only
walk. This is exact subdivision, not a fallback triangulator or relaxed check.
Final positive orientation, every original directed boundary segment, opposite
paired internal edges and exact full area equality remain mandatory on both
lattices. Omitted meaningful corners and malformed/overlapping caps still reject.

`stitchTopology(surfaceMesh, { expectedVolumeMm3, budget? })` accepts already
conforming constructed surfaces, welds exact XYZ identity, and checks finite/index
validity, nonzero emitted normals, duplicate triangle identities, exactly two
opposite edge incidences, each vertex's connected cyclic link, and one connected
triangle boundary. An unrefined T-junction fails. This function does not search
all mesh vertices to repair arbitrary triangle edges. The builder owns contour
refinement before triangulation; the checked construction supplies the planar
coverage/nonintersection evidence that this bounded stitcher alone cannot prove
for arbitrary external meshes.

Translate volume accumulation to a local origin and compensate the sum. Expected
volume is the compensated sum of each original emitted filled area times its exact
Z interval. Require finite positive volume with relative accumulation error at
most 1e-9; no absolute small-feature cutoff is introduced. Bounds come from actual
stitched vertices and successful construction has one connected boundary shell.

## Reviewed limits and explicit rejection

The unchanged polygon policy remains: 0.005 mm chord error, 1e-6 mm grid, 2e-6 mm
ambiguous contact, redundant-endpoint-only 1e-9 mm closure allowance and maximum
absolute XY 1e6 mm. Source normalization can still reject nominal shared oblique
edges because of ULP-level non-contact; the 1000 mm source-affine limitation is
not relaxed by exact DTO support. Emitted collinearity/Boolean boundary mismatch
also reject; the fallback is author simplification/correction, never silent repair.

Fresh support keeps its existing shared polygon budget. All terrace Booleans and
cap topology checks share one further construction polygon budget. One
`MeshConstructionBudget` spans endpoint collection/refinement, all caps/walls and
stitching. Existing inclusive limits remain 12,000 vertices per region, 48,000
raw/restored triangles per cap, 50,000 aggregate input vertices, 100,000 aggregate
output vertices, 200,000 aggregate output triangles and 2,000,000 charged work.
Unified input charges original/terrace endpoints, retained refinements and cap
inputs; output charges unstitched surface allocations plus stitched output.
These conservative cumulative charges may reject before the final welded mesh
alone reaches a nominal bound. Oversized unstitched arrays reject before welding.

Each bucket sort comparison, candidate on-segment check, split, triangle incidence,
link traversal and output allocation is charged. Buckets avoid a global all-vertex
edge scan; many segments on one line can still cause quadratic candidate work
inside that bucket, bounded by the shared work limit. Euclidean grid-key arithmetic
uses bounded input coordinates. Limits bound ordinary retained work, not wall-clock
latency, third-party kernel internals or browser responsiveness; there is no Worker
or performance guarantee. Polygon limits may reject earlier.

D-04 still rejects pinched, disconnected and cavity/multiple-shell boundaries.
There is an additional explicit planar-service restriction: every nonempty terrace
must itself have valid separated polygon regions. For example, an L-shaped lower
tier with arms 10×3 and 3×10 and a shared-corner 3×3 upper square has a terrace
whose remaining two arms touch at one vertex. The existing Boolean output guard
rejects this point-touching terrace even though support succeeds. This restriction
is retained and tested rather than weakening the polygon policy or modifying the
artwork. A narrower 2×3 upper rectangle on that L passes. No general arbitrary
cap/mesh triangulator fallback is claimed.

## Evidence and remaining boundary

The unified suite adds 61 tests; a minimal two-hole shoulders regression also
extends the existing part suite. Analytical rectangles, concavity, donuts,
through-holes, islands, identical footprints, partial/full shared sides, oblique
segments, off-center placement, tiny nonzero triangles and thin tiers check
independent topology, winding, exact dimensions and volumes. Test-side edge
incidence, connected triangle components and cyclic vertex links do not call the
production checker. Analytical horizontal areas, centroid exclusion of internal
caps and dense inside/outside cap sampling check terrace/top coverage. The minimal
cross-hole cap additionally uses independent clipping overlap and hole coverage
oracles from the part suite, followed by closed-part validation.

All eleven authored accepted SVGs exercise production import → fresh support →
unified construction: nine pass, and outside-rim/over-lower-hole reject before a
mesh payload. Twin-stars now passes with supported raised islands. D-10's
`offset-nested-transforms` produces a closed unified coin with its top at exact
XY [4,24]–[10,30], Z 2, upward cap area 36 mm² and 14.4 mm³ artwork contribution.
Independent cap coverage and manifold checks pass. Authored ideal curved-area
volume comparisons retain the fixture's documented curve approximation tolerance;
the separate emitted-polygon area-height comparison uses relative 1e-9.

Adversarial checks cover stale identities/current edits, fresh support failures,
atomic later adapter failure, malformed/overlapping/degenerate/missing output,
exact-grid/binary mismatches, positive near-contact, pinched terraces, T-junctions,
duplicates/reversed/open/nonfinite meshes, disconnected/cavity/pinch boundaries,
wrong volume and shared input/output/work exhaustion. Prior part/tiny/bridge tests
remain in force; the shared-work prefill now accounts for charged line indexing
while still proving that the allowance accepts one box and rejects a second.

Historical M0 spikes, fixtures, reports and samples remain unchanged. Original
Library baseline documents remain unavailable (empty synced sources, no project
documents or connected document sessions); they are not represented as read.
This pure stage has no production UI runtime import, so no new browser smoke is
claimed. Root Pages output remains synchronized through the guarded normal build.
No new UI, exporter, serializer, slicer or physical-print acceptance follows.
