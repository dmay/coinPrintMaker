# Automatic downward support

`core/validateSupport.ts` resolves the current enabled order and extends hanging
artwork straight down through every lower enabled tier, including the base.
The effective footprint at tier i is the union of its original footprint and
every active footprint above it. Imported SVGs, source footprints, settings,
colors, layer identities and thicknesses are not changed.

Artwork outside the
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
