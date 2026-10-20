# Checked headless coin generation (DIG-22)

`core/generateCoin.ts` implements current source/settings -> fresh support ->
closed parts + unified exterior -> independently checked actual coordinates.
No renderer, scene, DOM, UI/store, Worker, serializer or previous generation enters
this API. Pinned polygon-clipping and Earcut remain replaceable adapters.

## APIs and snapshots

`generateCoin(coin, settings, polygonKernel, triangulator, builders?)` returns a
serializable GeneratedCoin. Optional `builders.parts` / `builders.unified.build`
replace construction, never validation. Successful stages must match retained
source/settings key, ordered active tiers, exact footprints, Z intervals, height,
part IDs/order/names/colors and error-free diagnostics. Inputs to builders and
expected source truth are separate copies. The returned snapshot is detached
from source/settings and retained builder buffers. Warnings survive once.

A valid result contains checked parts, unified exterior, active tiers, recomputed
MeshMetrics, `[width,depth,height]` dimensionsMm, analyticalVolumeMm3 and
colorBoundaryHeightsMm. Boundary heights list **all internal active-tier
interfaces**, excluding final top, even when adjacent display colors match.
They are candidate cumulative change heights, not printer/filament instructions.
Each tier retains exact bottom/top Z.

Invalid results contain diagnostics and an input key only when nonempty source
identity exactly matches settings and revision is a nonnegative safe integer.
Invalid revision/identity never produces an invented or nonfinite key. Failures
have no tiers, meshes, parts, metrics, dimensions/volume/boundary metadata.
`isCurrentValidGeneration(result,current)` accepts only valid, error-free matching
import/revision. Callers increment revision for every edit, replace current
results on failure, and gate export. No old-valid fallback exists. This freshness
gate does not validate arbitrary JSON or later serialized coordinates.

`validateMesh(mesh,{expectedShellCount,expectedBoundsMm,expectedVolumeMm3,
layerId?,budget?})` returns `checked` with copied exact-weld mesh and recomputed
metrics, or diagnostics-only `rejected`. Expectations must be independent source
truth, never candidate metrics. Stitching and public validation share
meshTopology.ts; construction stitching remains a distinct, narrower stage.

## Actual coordinate validation

* Weld identical finite XYZ only, treating signed zero equally. No fuzzy repair,
  snaps, new points, omitted nonzero triangles or artwork adjustment.
* Require integer in-range indices, finite nonzero numerical and exact dyadic
  normals, no duplicate welded faces, two opposite incidences per undirected edge,
  every vertex link one connected cycle, no unused vertices and expected shell
  count. Parts expect one component per filled region; holes add no component.
  Unified output expects one connected boundary.
* Measure positive outward signed volume for **every** component relative to its
  own local origin, with compensated accumulation, then sum. An inward component
  cannot hide behind positive total. Numerical overflow/underflow rejects.
* Sweep actual triangle AABBs on the longest axis, including adjacent pairs.
  Exact spatial/coplanar predicates permit contact only at the pair's exact
  shared indexed vertex/edge. Differently triangulated overlaps/internal caps,
  self-crossings and nonincident face/edge/point contacts reject.
* Lift actual finite IEEE-754 values to a common exact dyadic BigInt lattice using
  DataView, including arbitrary/subnormal Z; at most 2098 bits per coordinate.
  The earlier canonical-XY 2^80 construction assumption is not applied to Z.
* Check potentially contained components using exact ray parity, at most 64
  directions `(1,k,k²)`. Edge/vertex hits and coplanar rays retry. Unresolved
  ambiguity fails closed with a limit diagnostic. A separate island inside
  another region's through-hole bbox remains outside that region's material.

## Exact source-surface coverage

Topology, volume and bounds alone cannot identify intended artwork. Final
generation proves every face belongs to the current prismatic tier boundary.
Horizontal planes have required outward orientation: reversed base/part bottom,
positive terraces/final top. Expected terrace chains use original lower contour
minus original next contour, independently of Boolean output. Vertical faces
belong to an original oriented supporting line and exact tier slab. Sloped and
cross-tier walls reject.

For each oriented plane/slab, accumulate actual triangle edges minus expected
original contour edges / wall-rectangle edges. Primitive BigInt supporting
direction and moment group exact 3D lines. Signed endpoint events must cancel,
including differing subdivisions. Positive orientation and complete boundary
equality prove winding coverage: one in expected material, zero outside/in holes.
This is stronger than centroid/area-only checks. Alternate diagonals/interior
vertices can pass; relocated holes with identical bounds/volume cannot.
Independent actual triangle intersection checks remain a second gate.

## Expectations, tolerances and bounded work

Expected bounds/areas are freshly measured from original active footprints;
cached ImportedLayer and builder metrics are ignored. Analytical volume is
compensated sum of exact **emitted binary polygon** area times representable
`topZ-bottomZ`, using existing exact boundary-area conversion. This is distinct
from ideal curved SVG area. Signed volume must agree within relative 1e-9, with
no absolute small-volume deletion allowance. Bounds allow 1e-9 mm absolute plus
1e-12 times absolute expected coordinate. At 1e6 mm this is about 1e-6 mm; the
independent exact source-surface proof still rejects any shifted production
boundary, even within the measurement allowance.

All prior polygon/construction caps remain unchanged, including 2m construction
work. Final MeshValidationBudget has a separate explicit **8m charged work**
allowance shared across every retained part and unified mesh, with unchanged
aggregate 100k output vertices / 200k triangles. Conversion, broadphase scans and
sort comparisons, bounded pair predicates, containment and chain/gcd work are
charged. A pair predicate carries 32 units; a containment triangle carries 16.
These are bounded-work units, not CPU timings. Copied/expected/source bookkeeping
is bounded by retained/input and existing source/polygon caps; arbitrary adapter
internals are not interruptible. Every exhaustion returns no exportable result.

## Evidence and material limits

The new generate-coin.test.ts suite has independent analytic area/height, edge
and component oracles; malformed/index/nonfinite/degenerate/duplicate/inverted/
open/unused/pinched geometry; legal adjacency and coplanar crossing without
contained vertices; self-crossing closed manifold; overlapping/nested/contacting
shells; differently triangulated internal interfaces; distant tiny components;
subnormal Z; full-plane boundary cancellation and alternate triangulations;
same-metrics relocated holes/shifted geometry; forged builder metadata; shared
budget exhaustion; immutable snapshots; ignored cached metrics; warning retention;
current edits/freshness and finite JSON-safe rejection. Existing 632 Vitest +22
Node cases remain. All eleven accepted authored imports run through final
production generation: nine valid, outside-rim/over-lower-hole invalid.
D-10 artwork retains exact XY [4,24]-[10,30], Z [1.6,2], area 36 mm² and volume
14.4 mm³, with no repeated transform/Y inversion/recentering.

See [M2 checkpoint](m2-geometry-checkpoint.md) for criterion mapping, native
bundled evidence and all six issue/PR references. The supported-L 3x3 corner-fill
terrace still rejects because the planar service requires separated terrace
polygons; narrower 2x3 passes. Contact/grid/binary mismatch and bounded work or
ambiguous containment reject, with no policy relaxation. This is a bounded
mesh/prismatic-source validator, not universal geometry or repair, editor
responsiveness, new export/slicer or physical-print acceptance. Future serializers
must validate actual output coordinates. Original Library baselines remain
unavailable (empty synced sources rechecked), not represented as read.
