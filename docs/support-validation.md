# Immediate-lower support validation (DIG-19)

`core/validateSupport.ts` exposes the pure `validateSupport(ImportedCoin,
CoinSettings, PolygonKernel)` stage. It calls `resolveStack` on the supplied
current source/settings on **every call**, then uses the shared
[planar Boolean service](polygon-service.md) to calculate each consecutive
active pair's `upper − lower`. The base is always first and enabled. Disabled
tiers consume neither height nor adjacency. Reorder/show/hide therefore changes
the actual pair list rather than consulting source-order or cached neighbors.

No renderer, UI state, DOM or library geometry object enters this stage. The
caller supplies the existing `polygonClippingKernel` production adapter (or a
compatible plain-DTO replacement); there is no second Boolean implementation.
Source/settings and earlier results are not mutated. Active tiers retain their
source identity and footprint references, page-relative Y-up XY and cumulative
absolute Z intervals from stack resolution. Cached source bounds/area are never
used to prove support.

## Outcomes and failure gating

- `status: 'supported'` contains the generation key, complete active tiers,
  total height, source warnings and an empty `unsupportedRemainders` list.
  Every active upper-minus-lower result was valid and empty. Even a base-only
  stack passes the checked polygon boundary to validate its planar topology.
- `status: 'rejected'` contains diagnostics and `unsupportedRemainders`, with
  **no active tiers, height, mesh, parts or mesh metrics**. It carries the input
  key only after stack resolution succeeded. A settings/source-resolution
  failure short-circuits before any Boolean operation and has no input key.
- Each successfully computed nonempty difference is retained in full as
  `{ upperLayerId, lowerLayerId, footprintMm }`, in active pair order. This is
  diagnostics-only geometry, never a clipped replacement tier. Its diagnostic
  has `SUPPORT_OUTSIDE_LOWER`, an upper-layer location, both names/identities,
  and a remedy to move/resize the upper, extend filled lower material, or change
  the enabled order. Holes and every disconnected upper island participate.
- Kernel, malformed-output, precision and work-limit failures retain the
  service's error code/location and add both support-pair identities. Later
  pairs are still attempted in order, using the same budget. Their successfully
  measured unsupported remainders remain available. A pair that failed to
  compute has an error diagnostic **instead of a remainder**; an empty remainder
  list on rejection does not establish support. There is no silent diagnostic
  or remainder cap. Existing canonical import/preflight and shared work budgets
  bound inputs and geometry work; exhausted budget rejects subsequent pairs.

`SupportedStack` is distinct from `GeneratedCoin`. This stage establishes planar
support, never export validity. A future mesher must consume only the supported
branch and must run its own mesh/connected-coin validation before constructing
a valid generated result. Rejected support blocks that pipeline by exposing no
resolved active tier payload. No production mesher, serializer, exporter, editor,
store or UI integration is introduced in this issue.

`isCurrentSupportedStack(result, currentKey)` checks already-validated planar
support's status, import identity, settings revision and absence of errors.
It does not validate arbitrary deserialized data or mesh/export eligibility.
Callers must construct the key from current source/settings and increment
revision on every generation-affecting edit. The pure stage recomputes every
call; asynchronous state coordination/caching remains M3. An old supported
result fails freshness after reorder/show/hide or source replacement.

## Precision and policy

Support adds **no area or distance allowance**. Empty means that the checked
regularized area difference contains zero regions. In particular, equal bounds,
less/equal area, very small area, or base support several tiers below cannot
override a nonempty difference against the immediately lower active tier.
An 8e-12 mm² unsupported corner remains a failure; smaller ambiguous residuals
fail polygon validation instead of being swallowed as empty.

The documented tolerance is the existing canonical polygon representation:
0.005 mm physical curve chord error, 0.000001 mm grid, 0.000002 mm ambiguous
nonincident contact, and 0.000000001 mm closure noise **only for redundant ring
endpoints**. The service checks raw operands/output before snapping, preserves
nonempty representable residuals, and rejects collapsed/reversed turns or
ambiguous contacts. One new `PolygonBudget` is shared by base validation and all
pair operations during this call, retaining the service's stricter raw/snapped
work accounting. The import's earlier budget is a separate operation lifetime.
No new offset, artwork repair, clipping or precision relaxation is applied.

Retain D-05: one connected planar base region, through holes allowed; disconnected
bases reject. Raised disconnected islands are allowed when **all** their filled
material is contained in the immediate lower footprint. Exact identical tiers,
shared exterior/hole segments and partial oblique segments are allowed subject
to checked polygon validation. A line or point of contact alone does not support
an outside filled region. Positive near-contact or crossings near endpoints
reject conservatively. The existing 1000 mm source-affine oblique-contact ULP
limitation remains unchanged; exact DTO contact is not a universal promise that
every nominally shared source edge survives floating-point normalization.

For the authored `over-lower-hole` input, the center fails against Ring despite
the solid base below it. Hide Ring: center is checked against base and succeeds
at absolute Z[1.6,2.0], total height 2.0 mm. Showing Ring restores failure.
In a fully supported nested stack, hiding an intermediate tier preserves support
by transitivity; showing a narrower intervening tier or reordering can invalidate
support. Each call still recomputes the actual pairs.

## Evidence and limitations

45 focused tests supplement the 459 historical Vitest and 22 retained Node cases.
Independent analytic cases verify a 36 mm² lower-hole remainder, equal-bound/equal-
area footprints with different holes, all upper islands, 20 mm² out-of-rim strip,
multiple complete residuals, identical/donut/partial shared boundaries, a supported
oblique boundary, outside point/edge-only contact, disconnected-base rejection,
base-only topology validation, show/hide/reorder adjacency, immutable snapshots,
JSON results, stale keys, source warnings/errors, invalid settings, kernel throws,
malformed output, tiny residuals, positive near-contact, shared work exhaustion
and 104 untruncated pair remainders. All eleven accepted authored SVGs run through
the production importer → settings → stack → support. Nine pass planar support;
outside-rim and over-lower-hole reject. The authored hidden-Ring case also passes
with the exact expected identity and Z changes.

The original Library baselines remain unavailable (empty synced sources; no
project documents or connected document sessions). This bounded scope follows
the live DIG-19 description, current canonical contracts and recorded decisions.
No M0 fixture/report/sample/spike change, production mesh, D-10 offset-nested-
transforms mesher fix, export, browser/performance, slicer or physical-print
acceptance is claimed. No production UI path changes, so no additional browser
smoke is required for this pure stage. Pages artifacts are checked by the normal
guarded build; the application runtime does not import this new stage yet.

Local final verification: typecheck, npm test (504 Vitest + 22 retained Node
tests), build:pages, check:pages and whitespace checks pass. Operator review/merge
and final-head CI remain the PR boundary; DIG-19 stays In Progress until the
operator merge is independently verified.
