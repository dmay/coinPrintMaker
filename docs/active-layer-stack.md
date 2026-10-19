# Active layer stack and cumulative Z (DIG-17)

DIG-19 now adds the pure [immediate-lower support stage](support-validation.md).
It resolves current order/visibility, retains unsupported differences for
diagnostics, and rejects with no active tier payload. Planar support success is
distinct from mesh/export validity. Earlier references below to pending support
describe the prior stage boundary.

`core/resolveStack.ts` exposes pure `createDefaultCoinSettings(ImportedCoin)` and
`resolveStack(ImportedCoin, CoinSettings)` functions. They use plain serializable
DTOs, with no renderer, UI, DOM, mesh or polygon-kernel dependency. The existing
inspector still displays imported geometry only; settings controls belong to M3.

## Separate defaults and exact identities

Default creation returns `status: 'created'` with separate settings at revision 0,
the current import identity, and source layer order. The original first base is
locked/enabled with 1.6 mm thickness; every artwork tier starts enabled at 0.4 mm.
The initial color is neutral opaque sRGB `#808080` for every layer, independent of
SVG paint and filament configuration. This reversible display choice does not
establish a palette or a filament assignment policy. Defaults never modify the
imported source or fabricate empty-layer geometry.

Resolution requires matching import identities, a nonnegative safe integer
revision, and each imported layer exactly once. IDs are nonblank, unique opaque
strings; labels are display text and may repeat. The base remains the first
imported layer and the first settings entry, with role `base` and enabled `true`.
Every later entry has role `artwork` and a boolean enabled flag. Every thickness
is finite and positive, and every color matches opaque `#RRGGBB` (either hex case).
Disabled entries must still satisfy these settings and source-footprint rules.
Settings from an earlier import reject even if the filename and layer IDs match.
Callers remain responsible for incrementing revision after generation-affecting
edits; this stateless function cannot detect a caller reusing an old revision.

Both functions propagate source warnings and reject any source error diagnostic.
The input is a canonical `ImportedCoin`, rather than arbitrary untrusted JSON.
The shared source checks enforce the stacking prerequisites: nonempty import/layer
identities, unique imported IDs, the original first base, nonempty footprints,
finite ring tuples of at least three vertices and the existing single-region
base policy. They do not rerun canonical winding, snap, union, simplicity, hole
containment or topology validation. Those guarantees come from successful
[DIG-16 canonical import](canonical-svg-import.md); its precision/budget policy
and later DIG-18 work are unchanged. Deserialized external data still needs a
complete DTO/canonical boundary validator before being supplied as ImportedCoin.

## Derived active adjacency and height

`status: 'resolved'` carries `{ importId, settingsRevision }`, `activeTiers`,
`totalHeightMm` and diagnostics. Each active tier retains the source ID/name and
exact canonical footprint reference, its settings color/thickness, and absolute
`bottomZMm`/`topZMm`. XY stays page-relative Y-up millimeters; holes and islands
retain their positions. Neither function edits or recenters geometry.

The enabled base starts at Z0. Each next enabled tier starts at the preceding
active tier's top and adds its positive thickness. Hidden tiers contribute no
height or adjacency entry. There is no cached source-order neighbor: consecutive
`activeTiers` are the immediately lower/upper pair for future support validation.
Every call derives the complete stack again after reorder/hide/show/thickness
edits. Total height is the final active top Z. Ordinary JavaScript floating-point
addition is used without a new Z snap/grid/minimum-thickness policy; overflow or
an addition that fails to increase Z rejects rather than emitting a zero interval.

For default base/middle/top settings the intervals are [0,1.6], [1.6,2.0],
[2.0,2.4] mm. Hiding the middle tier puts top directly on base at [1.6,2.0],
with total height 2.0 mm. Hiding all artwork leaves the base at [0,1.6].

Failures return `status: 'rejected'` and diagnostics, with no partial tiers,
height, generation key or default settings. Settings failures use the existing
`SETTINGS_INVALID` code with a reason and document/layer location; source-empty,
disconnected-base and malformed-ring failures retain the corresponding source
codes. Success establishes order and Z only: outside-rim and over-lower-hole
fixtures intentionally resolve but still need immediate-lower support validation
in DIG-19. Neither result contains meshes or grants generation/export permission.

## Evidence and limitations

`tests/unit/resolve-stack.test.ts` covers independent explicit default/edit/hide/
reorder Z tables, total height, locked base, duplicate/unknown/missing identities,
stale import settings, invalid revisions/colors/thickness (including hidden
entries), source errors, empty footprints, disconnected base, finite-ring checks,
cumulative overflow and precision collapse. Frozen source/settings and old-result
snapshots verify no mutation; JSON round trips verify result serialization.

All eleven accepted authored SVG fixtures run through the actual production
importer, default creation and resolver. Identity/name/thickness and each Z bound
are compared with authored golden values, while physical XY bounds, holes and
regions are independently measured against the existing oracle. The two
unsupported-footprint fixtures establish the intentional support boundary, not
mesh/export acceptance. Existing M0 fixtures/reports/samples are unchanged.

The original Library baselines remain unavailable (empty synced sources, no
project documents or connected document sessions). This bounded implementation
follows live DIG-17, canonical contracts and recorded repository decisions.
No new browser UI, performance, mesh, slicer or physical-print claim is made.

Local verification on Node 24.14.0: `npm run typecheck`, `npm test` (394 Vitest
cases, including 63 stack cases, plus 22 retained Node tests), `npm run build:pages`
and `npm run check:pages` pass. Root `index.html` and its generated JavaScript
asset are synchronized; the bundle change is the shared settings diagnostic
remediation text. No M0 fixtures, reports, samples or spike sources changed.
