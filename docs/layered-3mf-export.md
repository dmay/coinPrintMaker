# Production layered 3MF writer — DIG-30

`app/src/core/serialize3mf.ts` exports `serialize3mf(snapshot: ValidGeneratedCoin):
Uint8Array`. It consumes checked domain parts, never the spike, Three.js meshes,
scene transforms or preview buffers. It has no DOM, editor, file or download
dependency and does not rebuild geometry. The writer can be replaced without
changing the generation contract.

This function validates a snapshot, not its freshness in a running editor.
The future export action must obtain the exact current snapshot through
`selectExportableGeometry` and recheck identity/revisions/source after serialization
and before download, as the STL action does. A historical valid snapshot remains
historical; calling this pure function does not authorize its delivery. The UI
3MF button remains disabled until DIG-31 adds the guarded integration.

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
ordinal/name material labels retain the minimum D-07 package contract. Structural
metadata belongs to DIG-30; export options, UI/download integration, the latest
color-only editor flow and consumer-facing guidance belong to DIG-31. There is
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

## Reproducible automated evidence and limits

`npx vitest run tests/unit/serialize-3mf.test.ts` uses the production importer,
settings and generator for all six accepted geometry fixtures. It checks exact
serialized vertices/triangles, layer names/IDs, colors, absolute tier intervals,
holes, multi-shell islands and malformed-input rejection. JSDOM XML inspection
checks package structure, namespace/resource/reference invariants and Unicode
attribute round trips. Python's independent standard-library ZIP/CRC/XML reader
checks the generated packages without fflate or ThreeMFLoader. Pinned
ThreeMFLoader checks one assembly, named meshes, absolute bounds and color intent.
It uses consumer float32 buffers, so those bounds have a 1e-5 mm assertion
precision; package coordinates are checked for exact double equality separately.

These are unit/consumer-parser results, not native-browser, WebGL or target-slicer
observations. No production 3MF UI flow is added or exercised in this issue.
On 2026-10-20, local validation passed all 42 new focused cases and all 881 unit
tests, plus `npm run typecheck`, `npm run build:pages` and
`npm run check:pages`. Generated root artifacts were unchanged. Local legacy
verification with repository-contained TEMP/TMP passed 19 cases, failed two,
and skipped the Windows symlink case. The failures were the existing retained
M0 report's CRLF working bytes versus LF regeneration, and sandbox refusal of
the localhost Pages test connection (`connect EACCES 127.0.0.1`). An initial run
also encountered sandbox OS-temp rename restrictions; contained temp resolved
that restriction. Historical fixture reports, Git settings and build tests were
left untouched. Clean Linux pull-request CI is the full-suite acceptance check.
The unreferenced writer adds no published runtime surface yet.

Production OrcaSlicer initial loading remains a manual acceptance gate: record
version/operator/package identity and intended scale, alignment, selectable layer
parts, absolute Z, holes/islands and absence of unexpected repair. The historical
[M0 worksheet](m0-slicer-validation.md) establishes the chosen structure, not
production output acceptance. No new slicer, physical-print, native picker/touch,
browser export, performance, universal compatibility or full OPC/XSD certification
claim is made by these automated checks.
