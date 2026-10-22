# Layered 3MF writer

`app/src/core/serialize3mf.ts` exports `serialize3mf(snapshot: ValidGeneratedCoin):
Uint8Array`. It consumes checked domain parts, never the spike, Three.js meshes,
scene transforms or preview buffers. It has no DOM, editor, file or download
dependency and does not rebuild geometry. The writer can be replaced without
changing the generation contract.

This function validates a snapshot, not its freshness in a running editor.
The export action obtains the exact current snapshot through
`selectExportableGeometry` and rechecks identity/revisions/source after serialization
and before download, as the STL action does. A historical valid snapshot remains
historical; calling this pure function does not authorize its delivery.

## Package contract

The generic Core model uses millimeters. Exactly one build item references a
components-only assembly; each component references one closed named layer mesh.
`object@partnumber` preserves the domain layer ID, independently of generated
resource IDs. Islands remain separate closed shells in the same logical part.
All vertices retain absolute domain XYZ; no transform or recentering is emitted.
Each part lies in a successive positive Z interval beginning at zero: open
volumes are disjoint, with intentional coincident caps between adjacent layers.

All IDs share one resource namespace: base materials are resource 1, layer meshes
are 2 through N+1, and the assembly is N+2. Every mesh references its ordinal base
material with `pid`/`pindex`. Opaque sRGB `#RRGGBBAA` display colors and unique
ordinal/name material labels retain display intent. There is
no filament assignment or vendor project metadata.

The archive contains `[Content_Types].xml`, `_rels/.rels`, and
`3D/3dmodel.model`, with the Core/OPC namespaces and start-part relationship.
Pinned Three.js bundled fflate writes ordinary Deflate ZIP entries, with fixed
entry order and timestamp for reproducibility. Compression is an implementation
choice, not a measured performance claim.

## Rejection boundary

The writer checks valid schema/status/key shape, error-free diagnostics,
ordered part/tier identity, unique layer IDs, names, colors and contiguous Z.
XML 1.0 characters are checked before escaping names/IDs; whitespace is emitted
as character references so attribute normalization cannot erase tabs/newlines.
Unpaired surrogates, forbidden control characters and empty names/IDs reject.

Finite coordinates use JavaScript's locale-independent round-trip number text;
Core's `ST_Number` allows exponent notation. Each exact emitted text value is
parsed back to a double before topology, winding, shell-count, intersection,
bounds, volume and exact tier-surface coverage checks. Aggregate bounds/volume
and dimensions must match the snapshot. Shared existing validation budgets bound
work and total output size. No rounding, silent facet removal or geometry repair
is performed. Invalid input throws before returning any archive bytes.

Format references: [Core 1.4, object attributes, coordinate types and materials](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md).
