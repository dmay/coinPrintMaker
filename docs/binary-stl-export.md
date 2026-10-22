# Validated binary STL export

The app exports a binary STL from the checked **current unified domain mesh**.
`selectExportableGeometry` is the authority. The click action reads the store,
serializes synchronously, then checks the identical current snapshot, retained
source and source revision again before creating a download. It never reads
`previousValid`, renderer buffers, cameras, scene transforms or display materials.
Pending import/generation, invalid and stale revisions have a disabled STL button
and cannot reach serialization through the action. Rejected replacement imports
retain their original checked coin and filename. Color-only current revisions can
export the reused checked geometry. Export errors are local UI state only.

## Binary and precision contract

`core/serializeBinaryStl.ts` is DOM-free. It writes an 80-byte fixed ASCII header
with zero padding, a little-endian uint32 count and exactly 50 bytes per triangle:
float32 normal, three float32 XYZ vertices, zero uint16 attributes. Total length
is `84 + 50 * triangles`. Absolute +Y-up, Z-up mm coordinates are retained;
normals are recomputed from emitted coordinates. No centering, axis swap, scale,
color or layer metadata is applied. Surviving facets retain their source order except for local cap retriangulation.

The serializer first tries ordinary float32 rounding, welding identical emitted
positions and omitting facets whose emitted area is exactly zero. If that surface
cannot pass validation, it retries with a 0.001 mm coordinate grid before float32
encoding. Every source vertex must remain within **0.001 mm Euclidean distance**
of its emitted position, including float32 rounding. Source data is never changed.
If rounding reverses or flattens a thin horizontal cap triangle, a shared internal
diagonal may be flipped with its coplanar neighbour. Both replacement triangles
must face outward; the patch's directed boundary and all rounded positions remain
exactly unchanged. This also restores a subdivision that would otherwise become
a collinear gap. A patch that cannot meet these conditions still rejects.
This export-only cleanup may remove microscopic bevels or holes; it does not use
nozzle size as a simplification threshold.

Both attempts validate the actual output: finite coordinates, source and emitted
normals, index/count limits, duplicate facets, closed manifold edges and vertex
links, outward positive shells, unchanged shell count, exact intersections and
internal components. Cleanup cannot excuse holes or intersections in the emitted
mesh. Empty output, large coordinate loss and candidates that remain invalid
reject. Export cleanup does not change generation acceptance.

Emitted bounds must agree with checked metrics within the measured maximum vertex
displacement plus `1e-6 + abs(source) * 2e-7` mm. Volume must agree within `1e-6`
relative plus source surface area times measured maximum displacement (mm³).
These are output sanity checks; the absolute vertex displacement limit separately
bounds geometric changes. A compensated signed-volume calculation feeds the
existing topology consistency gate. No old result is substituted after failure.

STL has no unit field. The file contains millimeter coordinate values; consumers
must interpret them as millimeters. It carries geometry only, with no layer or
color intent.

## Local download boundary

`export/createDownload.ts` constructs a `model/stl` Blob and Object URL, attaches
a hidden anchor, invokes the download action, removes the anchor, and revokes the
URL on the next task. Its timer owns cleanup independently of React unmount.
Setup/click/scheduling failures revoke immediately and the UI exposes a bounded
retryable error without exception details or domain mutation. An invoked anchor
does not prove that the browser/OS saved a file; no success toast claims that.

`stlFileName` normalizes NFC, removes the last extension case-insensitively in
effect, replaces separators/control/portable reserved punctuation and bidi
override/isolate characters with underscores, trims leading/trailing dots/spaces,
and limits the stem to 100 code points and 180 UTF-8 bytes without splitting a
code point. Empty names become `coin`; DOS device stems receive `_`; the suffix
is always lowercase `.stl`. Filename sanitation does not establish content trust.
