# Closed positioned layer parts (DIG-20)

DIG-21 adds the pure [unified external coin surface](unified-coin-surface.md),
with exact contour subdivision, terrace boundary checks and bounded connected
manifold construction. This stage remains distinct from DIG-22 generation/export
validity. Later references below to pending unified construction are historical.

The pure construction path is current `ImportedCoin` + `CoinSettings` →
`buildLayerParts(coin, settings, polygonKernel, triangulator)` → independent
closed per-layer meshes. It calls `validateSupport` afresh on every call before
any triangulation. Disabled tiers, order, thickness, colors and import/revision
identity therefore come from the current source/settings, never a cached support
result, renderer, scene transform or displayed mesh.

`status: 'parts-built'` carries the complete ordered parts, active tiers, total
height, input key and diagnostics. Each part preserves the opaque source layer ID,
name and color; all vertices have original page-relative Y-up XY and the tier's
exact absolute bottom/top Z. No transform, Y inversion or recentering is repeated.
`isCurrentLayerParts` checks the stage key and error-free status; it is a freshness
gate, not validation of arbitrary JSON. Callers still increment settings revisions.

`status: 'rejected'` has diagnostics and an input key only if support resolution
established one. It contains no partial parts, tiers, height, unified mesh or mesh
metrics. A later tier failure discards earlier constructed parts. Support failures
retain their scoped diagnostics; unsupported remainders remain available through
the separate support API, not as clipped replacement artwork in this stage.

This is deliberately distinct from `ValidGeneratedCoin`: independent parts have
intentional coincident caps at shared Z interfaces. Unified exposed-surface
construction/stitching is DIG-21; the complete generated-coin validator and
`generateCoin` are DIG-22. No serializer or export eligibility is introduced.

## Replaceable construction boundary

`core/triangulationKernel.ts` defines `TriangulationKernel.triangulate(vertices,
holeStarts)`, returning index triples into the supplied plain XY vertices. The
existing pinned Three.js 0.186.1 pure Earcut implementation lives only behind
`import/earcutTriangulationKernel.ts`; no Three type, scene mesh, buffer, material,
React or DOM object enters core. No dependency/version is added. The core service
distrusts adapter output, copies its inputs and owns boundary/coverage checks.

`triangulateRegion(polygon, kernel, options)` returns `triangulated` with a plain
XY cap, CCW triangles, original ordered boundary indices and emitted-coordinate
area, or diagnostics-only `rejected`. `buildPartMesh(tier, kernel, options)` returns
`built` with one `GeneratedPart`, or diagnostics-only rejection. Direct single-tier
construction proves no multi-tier support; callers constructing a stack use
`buildLayerParts`. The single-region/tier APIs accept an optional shared budget;
the stack API always creates one budget for its entire current construction.

Validate nonempty topology using the existing checked polygon policy without
changing source points. Require open, distinct, correctly wound canonical exterior
and hole vertices. Keep their original ordering and collinear subdivisions.
Build top caps CCW, bottom caps reversed, and two wall triangles along every
original boundary edge. Filled material is left of exterior CCW and hole CW edges,
so the same wall construction points outward on both. Separate polygons become
separate closed components within the same named part. Base connectivity remains
the support stage's one-region rule; raised islands remain supported components.

## Exact cap coverage and boundary conformity

Recover the existing 1e-6 mm lattice for predicates only. For each input coordinate,
the nearest grid integer must be safe and the coordinate must differ from that
integer times 1e-6 by at most `4 * Number.EPSILON * max(abs(value), abs(nearest))`.
This covers binary representation noise in existing canonical multiplication;
zero has zero allowance. Off-grid geometry rejects instead of being relocated.
Original XY is always emitted unchanged. The existing maximum coordinate of 1e6 mm
means integer coordinates are at most 1e12; BigInt determinants/areas avoid unsafe
integer products and distinguish genuinely nonzero tiny turns from collinearity.

Also lift the **actual emitted binary XY** exactly to a dyadic predicate lattice
by multiplying by 2^80 and converting the resulting integers to BigInt. Nonzero
canonical coordinates have magnitude at least approximately 1e-6 and at most 1e6,
so their IEEE-754 representation has at most 72 fractional bits; the lift preserves
every bit. These predicate coordinates never escape as mesh coordinates.

Earcut may omit collinear vertices while bridging holes or clipping ears. Inspect
only exposed cap edges, follow the original ring's forward index links and require
every skipped vertex to lie exactly on that lattice edge in order. Split its
adjacent triangle along that ordered path. This also handles subdivisions on
multiple sides of the same triangle. There is no global all-vertex stitcher, fuzzy
edge match, invented point, contour simplification or nonzero triangle deletion.
An omitted meaningful corner, cross-ring edge or incomplete boundary rejects.
Exactly zero-area adapter triangles also reject; no epsilon removes small faces.

Require every final cap triangle to have positive orientation on **both** lattices,
every original oriented exterior/hole segment exactly once, and every other edge
exactly twice in opposite directions. Require exact triangle-area equality to the
full exterior-minus-holes boundary on both lattices. These conditions prove cap
coverage by oriented boundary cancellation: the sum of positive triangle winding
numbers is one inside the filled polygon and zero outside/in holes. In particular,
positive overlaps and uncovered patches cannot hide behind equal total area.
This relies on the checked simple, separated polygon boundary and identical shared
vertex coordinates, rather than an area-only triangulator roundtrip.

A large-coordinate regression has ideal-grid triangle determinant +4 but negative
emitted binary determinant. An injected fan rejects rather than emitting its
reversed cap. Tiny 8e-12 mm² triangles at the origin and near 999999 mm, collinear
boundary/hole bridges and 4e-6 mm corner steps remain covered by passing tests.

## Construction metrics, precision and budgets

Part construction checks finite nonzero emitted triangle normals, opposite paired
edge incidence and positive signed volume. Volume uses translated coordinates and
compensated accumulation. Its expected value is emitted filled area times
`topZMm - bottomZMm`, with relative accumulation allowance 1e-9 and no absolute
small-triangle/volume cutoff. The emitted filled area is converted once from the
exact dyadic boundary area. Ideal lattice area and emitted binary-coordinate area
need not be numerically identical; this is especially visible for tiny features at
large XY. It is not an artwork-deletion allowance. Unrepresentable Z, overflow,
zero numeric normals or inconsistent volume reject. Exact Z endpoints are emitted
as supplied, including thin representable intervals at high elevations.

Metrics contain actual bounds, measured volume and component count derived from
validated disjoint region construction. Independent tests count triangle components
and connected cyclic vertex links rather than trusting this component count.
These bounded checks are not a general arbitrary-mesh or serialized-file validator.

The unchanged 0.005 mm chord, 1e-6 mm grid, 2e-6 mm ambiguous-contact, redundant
endpoint-only 1e-9 mm closure policy and all polygon limits still apply. Shared
`MeshConstructionBudget` also owns one `PolygonBudget` for all part construction
topology checks; fresh support has its own existing shared operation budget.

| Construction limit | Inclusive bound |
| --- | --- |
| Input vertices per region | 12,000 |
| Raw/restored triangles per cap | 48,000 |
| Aggregate input vertices | 50,000 |
| Aggregate retained mesh vertices | 100,000 |
| Aggregate retained mesh triangles | 200,000 |
| Charged cap reconstruction/incidence and part work | 2,000,000 |

These provisional caps match the existing scale of polygon budgets and bound
retained geometry across **all** regions/tiers, not just one loop iteration.
Polygon comparison limits may reject earlier. Limits report `MESH_LIMIT_EXCEEDED`
or the unchanged polygon limit diagnostic where support fails; construction and
compatibility failures report scoped `MESH_INVALID`. Unknown adapter exceptions
do not expose private detail. Caps and charged loops bound ordinary construction,
not wall-clock latency or arbitrary third-party adapter internals. Library changes
need the same acceptance suite. No Worker/performance guarantee is claimed.

## Evidence and remaining boundaries

The dedicated suite adds 66 cases to the existing 504 Vitest + 22 Node tests.
Independent analytical rectangle, concave L, donut, multiple holes and islands
verify area/volume, outward cap/wall winding, finite indices, all original XY and
exact Z. Convex triangle-clipping intersection and dense inside/outside sampling
check cap overlap, coverage and hole exclusion independently. Every tested part
checks directed edge incidence, actual connected components and each vertex's
connected cyclic link. Adversarial cases cover all-three-edge subdivisions,
hole bridges, tiny/large-coordinate geometry, thin high Z, immutable inputs,
adapter mutation/throws/malformed/overlapping/degenerate/missing output, off-grid
and noncanonical input, overflow, shared budget exhaustion, stable duplicate-label
identities, edits/freshness, fresh support rejection and no retained partial parts.

All eleven accepted authored SVGs run through the **current** production importer,
initial settings, fresh support and part construction. Nine succeed; outside-rim
and over-lower-hole reject before any mesh payload. Independent authored area,
bounds, component and interval oracles supplement the constructed closedness and
volume checks. The D-10 `offset-nested-transforms` artwork now produces a closed
part at XY `[4,24]–[10,30]`, Z `[1.6,2]`, volume 14.4 mm³, with independent cap
coverage. This fixes that fixture's **part construction** path; unified mesh,
serialized export and complete generated-coin acceptance still belong to DIG-21/22.

M0 spikes, historical fixtures/reports/samples and previous coverage are unchanged.
The original Library baseline documents remain unavailable (empty synced sources;
no project documents or connected document sessions); this bounded scope follows
live DIG-20, canonical contracts and recorded decisions. The production UI does
not yet import this pure stage, so no additional browser smoke is required. Root
Pages artifacts remain synchronized through the normal guarded build. No new UI,
export, slicer or physical-print acceptance is claimed. Operator merge remains
independent; DIG-20 stays unfinished while its PR is awaiting review.

Local verification on Node 24.14.0: typecheck, npm test (570 Vitest + 22 retained
Node checks), build:pages, check:pages and whitespace checks pass. The generated
root bundle changes only with the shared new construction-limit diagnostic;
no stage runtime or UI path is integrated. Final-head CI is recorded in the PR
and Linear handoff rather than claiming manual acceptance.
