# M0.3 tiered STL spike (DIG-8)

Run `npm ci --ignore-scripts`, `npm test`, and `npm run spike:stl`.
The last command regenerates the six binary `samples/*.stl` files and
`fixtures/tiered-stl-verification.json`. All deliverables stay in this repository.
The existing published root page has no build step and is unchanged by this spike.

`mesh.mjs` consumes geometry DTOs in mm and thicknesses; it has no DOM, filesystem,
network or renderer state. The harness alone installs jsdom and reads fixture files.
Triangulation uses the Earcut bundled with pinned Three.js 0.186.1; polygon booleans
use pinned polygon-clipping 0.15.7. No new dependencies. Node evidence: 24.19.0.

The builder emits the base bottom, differences between successive footprints as
top terraces, and correctly oriented outer/hole walls. Internal interfaces are
absent. Edge splits plus centroid fans stitch collinear boundary vertices, including
points Earcut removes. This is a quadratic, fixture-scale prototype, not the
production geometry engine. A fixed 1e-8 mm coordinate weld/edge-distance epsilon
is local to this spike. It does not establish a production snap grid or feature limit.

Checks include finite vertices/indices, unique triangles, nondegenerate faces,
two oppositely directed incidences per edge, cyclic vertex links, one connected
boundary shell, positive signed volume, Z0 and cumulative heights, oracle bounds,
and volume against the independent fixture oracles. Volume agrees with polygon
area × thickness within max(1e-6 mm³, 1e-7 relative); curved analytical volume within
0.3% at the importer's 0.01 mm chord tolerance. STL serialization revalidates float32
coordinates; a test reparses facets, welds exact positions and rechecks topology,
bounds and volume. These checks do not prove absence of all self-intersections.

| Sample | Dimensions mm | Triangles | Volume mm³ |
|---|---|---:|---:|
| sun-medallion | 40 × 40 × 2.4 | 972 | 2375.869152 |
| monogram-o | 40 × 40 × 2.4 | 444 | 2402.896625 |
| twin-stars | 40 × 40 × 2.4 | 858 | 2470.550262 |
| letter-o-evenodd | 40 × 40 × 2 | 428 | 2111.696625 |
| edge-sharing | 40 × 40 × 2 | 30 | 2720 |
| overlapping-shapes | 40 × 40 × 2 | 428 | 2137.296625 |

All start at Z=0. Three-tier samples use [0,1.6], [1.6,2.0], [2.0,2.4] mm;
two-tier samples omit the last interval. Twin stars tests disconnected raised
islands; monogram and evenodd O test holes. Outside-rim and over-lower-hole are
rejected before export. Additional tests exercise identical footprints, through
holes, repeated partial shared edges, disconnected bases and corrupted meshes.
See D-03–D-05 in `docs/design-decisions.md` for the production decisions and limits.

## OrcaSlicer acceptance — completed

On 2026-10-18 dmay confirmed all six paired STL samples passed the requested
dimensions, Z0/tier placement, no unexpected repair, slicing and feature checks
in **OrcaSlicer 2.4.2 build 8500fcdc**. This includes O counters, shared-edge
geometry and separate raised stars. The retained evidence is the operator's
written report and follow-up confirmation in the joint
[M0 worksheet](../../docs/m0-slicer-validation.md) and DIG-8/DIG-9.

No screenshots or slicer project files are retained. Exact UI commands and
per-layer print settings were not separately recorded. The agent did not run the
manual session. These are accepted prototype results, not universal robustness
or physical-print claims. STL stores no standardized units or colors;
physical-print acceptance remains a separate later gate.
