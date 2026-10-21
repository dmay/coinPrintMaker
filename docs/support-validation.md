# Automatic downward support (DIG-78)

`core/validateSupport.ts` resolves the current enabled order and extends hanging
artwork straight down through every lower enabled tier, including the base.
The effective footprint at tier i is the union of its original footprint and
every active footprint above it. Imported SVGs, source footprints, settings,
colors, layer identities and thicknesses are not changed.

The operator explicitly approved filling holes and extending the original base
outline, and rejected a disconnected-result restriction. Artwork outside the
original base becomes a separate column down to Z=0. No bridge, clipping,
resizing or recentering is added. Generated support belongs to each lower tier's
color and existing height interval; no new tier or color is created.

## Pure computation and validation

1. Resolve settings afresh using `resolveStack`. Hidden tiers contribute neither
   material nor height. Invalid source/settings still reject before Booleans.
2. Check base topology even for a base-only stack.
3. Walk from the top active tier toward the base. Compute `upper - lower` using
   the existing checked polygon service. Already-contained footprints keep their
   exact original coordinates and references.
4. For a nonempty difference, replace only the local effective lower footprint
   with the checked union of lower and upper. That union is propagated to the
   next lower tier. All operations share one bounded PolygonBudget.
5. On any polygon/precision/kernel/work-limit failure, return diagnostics and no
   active tiers or partial effective geometry. No SUPPORT_OUTSIDE_LOWER error is
   produced; unsupported material is extended rather than rejected.

The shared polygon policy is unchanged: no area allowance, precision relaxation,
near-contact repair or budget increase. Invalid point contacts and ambiguous
small features may still fail polygon or mesh validation. The original imported
base must still meet canonical import policy; this change allows multiple
regions in the **effective generated base**.

`SupportedStack` remains a pre-mesh result. Independent parts, the unified
boundary and final generation all call the same pure stage. Mesh validation
checks effective footprints, exact surface coverage, outward winding, volume,
intersections and closed manifold topology. The expected unified shell count is
the number of effective base regions, rather than a hardcoded one. This permits
separate downward columns without accepting unexpected extra shells.

## Current state and exports

Hide/show/reorder recomputes from immutable source footprints. Hiding the artwork
that required support removes that support on regeneration; added geometry is
not permanently written into lower source layers. Current-generation keys and
the existing stale/invalid export gates are unchanged. The Worker, preview, STL
and layered 3MF use the same checked effective tiers. STL retains all unified
components; 3MF retains each lower colored layer's complete closed mesh.

The layer panel explains that downward extension can fill holes, enlarge the
outline or create separate pieces.

## Regression evidence

Tests cover cascading unions, partial/complete hole filling, protruding artwork,
multiple islands, disjoint columns, enabled order/height/color, source immutability,
hide/show/reorder/freshness, existing topology/precision guards, malformed kernels,
shared budgets and all accepted authored SVGs.

The historical outside-rim and over-lower-hole examples now generate successfully.
Original fixture JSON remains unchanged for import and M0 spike oracles;
`tests/unit/helpers/downwardSupportExpectation.ts` supplies independently derived
current-generation expectations (a circle/rectangle integral and a 36 mm2 center
addition).

A production-imported detached-column regression independently expects areas
104/40/4 mm2, total volume 184 mm3, two unified shells, layer shell counts 2/2/1
and exact source position. It parses emitted STL float32 coordinates and 3MF XML,
revalidates closed meshes, checks layer colors and loads 3MF with ThreeMFLoader.
Automated round-trips are not slicer or physical-print acceptance.

Validation on this branch: 911 Vitest tests, 22 retained Node tests, typecheck,
build:pages and check:pages pass. The retained build tests were rerun through
the normal native Node runtime after sandbox temporary-directory rename errors.
Live browser smoke was unavailable: browser/app inventory returned no surfaces.
Editor controls/presentation are covered by the automated jsdom suite; no new
manual browser, target-slicer or physical-print acceptance is claimed.
