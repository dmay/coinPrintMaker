# Planar Boolean service (DIG-18)

DIG-19 now adds the pure [immediate-lower support stage](support-validation.md).
It resolves current order/visibility, retains unsupported differences for
diagnostics, and rejects with no active tier payload. Planar support success is
distinct from mesh/export validity. Earlier references below to pending support
describe the prior stage boundary.

`core/polygonService.ts` exposes `createPolygonService(PolygonKernel)` with
`union(footprints)`, `difference(subject, clip)`, `intersection(subject, clip)`,
`area(footprint)`, `bounds(footprint)` and `isEmpty(footprint)`. Every call returns
`{ status: 'ok', value }` or `{ status: 'rejected', diagnostics }`, with no partial
value on failure. Options supply a diagnostic location (document by default) and
an optional shared `PolygonBudget`. Coordinates remain page-relative Y-up mm;
the service applies no transforms, Y inversion, recentering, offsets or settings.

The injectable `PolygonKernel` owns only the three Boolean operations on plain
DTOs. `import/polygonClippingKernel.ts` is the sole production library boundary:
it owns polygon-clipping 0.15.7 calls and explicit ring closure conversion. The
service distrusts adapter output and validates it. A replacement adapter needs
no library types in core. Compatibility failures reject; there is no automatic
fallback or repair that could change geometry. The current bounded fixtures do
not justify changing the pinned library.

The production canonical importer calls this same service once per physical
layer, replacing its former direct kernel call and output validation. It retains
source-level fill interpretation and the unsnapped cross-object contact check.
Overlapping/identical source objects contribute filled area once; physical layers
are never unioned together. Source identities/settings, base protection and stack
Z are unaffected. General crossing/touching compound source contours remain an
explicit import rejection, rather than a new fill-arrangement interpretation.

## Set outcomes and empty geometry

Each operand is a disjoint canonical footprint (polygons with holes); overlaps
belong between union operands. Winding/start vertices/hole and polygon order are
normalized without mutation. Successful output has implicit closure, exterior
CCW/hole CW, finite mm coordinates and deterministic ordering.

| Case | Expected result |
| --- | --- |
| Overlap/repeated identical union operands | One filled set; no duplicate interiors. |
| Identical operands | Difference `[]`; intersection that footprint. |
| Strictly contained subtraction | Hole with CW winding. |
| Hole with a nested filled island | Hole retained, island a separate region. |
| Subtraction through an exterior | Separate islands when the cut disconnects it. |
| Exact shared boundary segment, including partial oblique segments | Union joins material; difference unchanged and intersection `[]` when interiors are disjoint. |
| Point-only tangency | Regularized intersection `[]`; difference unchanged; point-pinched union rejects. |
| Hole tangent to its exterior | Reject pinched/non-strict output. |
| Clearly separated islands | Retain all regions at their original XY. |
| Ambiguous near gap, overlap or crossing near an endpoint | Reject under the precision policy below. |
| Nonempty sliver | Preserve if representable and valid, otherwise reject; never silently suppress by area. |
| Disjoint operands / fully removed difference | Valid empty set `[]`. |

These are regularized **area** Booleans: isolated points and lines are not filled
polygons. `area([])` is 0, `bounds([])` is null and `isEmpty([])` is true. Invalid
nonempty geometry rejects rather than becoming empty. `isEmpty` validates the
footprint and uses region presence, with no area epsilon. The importer still
rejects empty printing layers (`BASE_EMPTY`/`LAYER_EMPTY`) and a disconnected
base (`BASE_DISCONNECTED`); those caller policies are not imposed on useful
intermediate Boolean results. Support orchestration remains DIG-19.

## Precision and failure boundary

Retain M1's fixed `POLYGON_POLICY`: 0.005 mm curve chord error, 0.000001 mm nearest
grid, 0.000002 mm ambiguous nonincident boundary contact, coordinate magnitude
at most 1,000,000 mm, and the same ring/document/Boolean/comparison work caps.
Numerical duplicate closure noise remains 0.000000001 mm **only for redundant
ring endpoints**. It is not a tolerance for bridging separate objects.

Before Booleans, inspect raw cross-operand segments. Exact endpoint-on-segment
and collinear shared contacts are permitted. Other near-distances at or below
0.000002 mm reject, including positive distances smaller than closure noise.
A strict crossing at or within 0.000002 mm of either endpoint also rejects:
otherwise snapping input could erase a tiny corner residual before output
validation sees it. This shared helper protects both raw SVG samples before M1
input snapping and direct service callers. Floating-point ambiguous oblique
contacts can reject conservatively; no fuzzy offset is used to force contact.

Validate each operand's raw and snapped representation, but pass the **raw
validated geometry** to the kernel. Direct off-grid input must not be rounded
before the Boolean erases/detects material. Service metrics describe the validated
snapped footprint. Production imported operands are already on the M1 grid.

Validate raw kernel output before rounding: finite/in-range coordinates, simple
nondegenerate rings, strict ring separation, hole containment, non-nested holes
and disjoint filled regions. Then reject any nonzero edge that snapping would
collapse and any noncollinear local turn whose sign would change or become zero.
Apply the same complete canonical topology validation after snapping. Normal
rational intersection vertices can move to the nearest grid point (at most
sqrt(2)/2 grid); a raw nonempty sliver cannot disappear through ring cleanup.
The existing grid-area degeneracy check (at most one grid cell squared) rejects
the contour; it never converts that contour to `[]`.

Turn guards are conservative and can reject valid artwork that is unsuitable
for this grid. They supplement global validation; they do not prove universal
topology equivalence or exact arithmetic. JavaScript floating-point subtraction
still limits relative accuracy of tiny features at large coordinate magnitudes.
Tests explicitly allow 1e-15 mm² absolute error for a 16e-12 mm² square near
999999 mm, rather than claiming exact grid arithmetic. No universal kernel
robustness or exact curved-area equality follows from these tests.

The shared document budget now charges both raw and snapped operand/output
validation in addition to existing flattening/input work. This is stricter than
M1 accounting: staying under the 12,000 Boolean input or individual ring cap does
not guarantee the aggregate 50,000 work-vertex / 2,000,000 comparison cap will
pass. Work-cap failures return `IMPORT_LIMIT_EXCEEDED`; kernel exceptions or
invalid/ambiguous output return `POLYGON_INVALID` with operation and location.
Unknown adapter exception details are not exposed. No partial model is committed.
The library's internal guards remain bounded failure protections, not a browser
wall-clock/performance guarantee.

## Evidence and limits

The dedicated suite adds 65 tests with independent analytic areas/bounds and
explicit region/hole outcomes, rather than relying on Boolean algebra alone:
overlap 200 mm², donut 64 mm², nested island 68 mm², split 80 mm², partial shared
edge 124 mm², oblique shared edge 58 mm², and rational intersection 191/15 mm².
A 1000 mm square minus a near-tangent oblique clip retains an 8e-12 mm² residual;
smaller 4e-7 and 4e-10 mm corner residuals explicitly reject. Grid ties, large
coordinates, subnoise gap/overlap and clearly separated islands are covered.
Every Boolean operation has injected exception and malformed-output probes,
including raw hole/region/pinch/contact errors and snap-erased/reversed turns.
A replacement DTO-only adapter is tested independently. Production import tests
prove one union per physical layer, duplicate-interior removal, identity/relative
XY preservation and raw-source near-crossing rejection before snap.

All 394 historical Vitest cases and 22 retained Node checks remain unchanged
apart from extending injected M1 kernel stubs with the new interface methods.
The authored import golden fixtures, M0 spikes/reports/six mesh samples remain
historical coverage. No production mesh, D-10 offset-nested-transforms mesh fix,
export, slicer, physical-print or cross-browser acceptance is claimed. Original
Library baselines remain unavailable (empty synced sources, no project documents
or connected document sessions); this scope follows the live DIG-18 issue and
the current repository contracts/decisions.


Generated Pages browser smoke on the in-app Chromium browser (reported UA
Chrome/155.0.0.0, Windows) passed 30 checks: all 21 authored inputs plus nine
synthetic shared-boundary/rational-crossing/precision/pinch cases. This used the
actual root bundle served at /coinPrintMaker/, native browser File/DataTransfer
objects and synthetic change events. It verifies native XML/import/rendering and
failed-replacement inspector preservation, not a real picker interaction. The
instrumented processing fetch count and page-error count were zero; no source
SVG was mounted. No cross-browser or real-picker evidence is claimed here.

A concrete conservative limitation is retained in both unit and browser tests:
source polygons sharing the oblique segment (2,2)–(6,6) on the triangle edge
(0,0)–(10,10) import on a 40 mm square page with area 58 mm². On a 1000 mm page,
existing root unit conversion yields 1000.0000000000001 mm and mapping introduces
different machine-ULP errors across these source-collinear points. The raw
contact guard then rejects POLYGON_INVALID (crossing too close to an endpoint),
rather than treating the tiny discrepancy as permission to bridge material.
The exact DTO shared-segment contract passes; universal source oblique-contact
acceptance through floating-point affine normalization is not promised.

Final local checks: app/core/test typechecking, npm test (459 Vitest +22 retained
Node cases), build:pages, check:pages and whitespace checks pass. The root index
and generated JavaScript are synchronized; no M0 spike/fixture/report/sample
changes are part of this issue. Operator review/merge and final-head CI were the
original PR boundary.
