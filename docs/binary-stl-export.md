# Validated binary STL export (DIG-29)

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
color or layer metadata is applied. Surviving facets retain their source order.

The serializer first tries ordinary float32 rounding, welding identical emitted
positions and omitting facets whose emitted area is exactly zero. If that surface
cannot pass validation, it retries with a 0.001 mm coordinate grid before float32
encoding. Every source vertex must remain within **0.001 mm Euclidean distance**
of its emitted position, including float32 rounding. Source data is never changed.
This export-only cleanup may remove microscopic bevels or holes; it does not use
nozzle size as a simplification threshold. It supersedes the previous policy of
rejecting any collapsed facet regardless of physical significance.

Both attempts validate the actual output: finite coordinates, source and emitted
normals, index/count limits, duplicate facets, closed manifold edges and vertex
links, outward positive shells, unchanged shell count, exact intersections and
internal components. Cleanup cannot excuse holes or intersections in the emitted
mesh. Empty output, large coordinate loss and candidates that remain invalid
reject. Generation acceptance and construction/validation work limits are unchanged.

Emitted bounds must agree with checked metrics within the measured maximum vertex
displacement plus `1e-6 + abs(source) * 2e-7` mm. Volume must agree within `1e-6`
relative plus source surface area times measured maximum displacement (mm³).
These are output sanity checks; the absolute vertex displacement limit separately
bounds geometric changes. A compensated signed-volume calculation feeds the
existing topology consistency gate. No old result is substituted after failure.

STL has no unit field. The file contains millimeter coordinate values; consumers
must interpret them as millimeters. It carries geometry only, with no layer or
color intent. 3MF remains disabled and belongs to later M4 issues.

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

## Verification and browser reproduction

The unit suite reparses every valid development fixture and compares mm bounds,
volume, orientation, normal values and preserved triangle order with production
`GeneratedCoin`. It checks exact header/count/LE bytes/attributes/length and
adversarial malformed/overflow/collapse/open/inward inputs. Microscopic bevel and
hole regressions independently reparse cleaned STL facets and verify closed edges,
volume, normals, unchanged input and retention of a 0.01 mm hole. jsdom coverage checks
Blob content, filename edge cases, anchor lifecycle, setup/click/scheduler failure,
current-only export, rapid edit races, retained-source names and retry/unmount.
These are automated byte/lifecycle checks, not native browser-save evidence.

After `npm run build:pages`, run `node scripts/verify-stl-export.mjs`, then open
`http://127.0.0.1:4177/coinPrintMaker/`. The loopback-only developer observer serves
the generated root application and assets; the injected observer is never bundled
or published. It delays Worker asset HTTP responses 150 ms to expose pending.
Run STL workflow (intercepted) uses synthetic File/DataTransfer/DOM events with
the actual importer, Worker, engine, serializer and app handlers. It intercepts
anchor actions, reparses actual Blobs, checks revisions/metrics/filename/URL
revocation, exercises browser failure/retry and saves reports in ignored
`.profiling-results/`. It never claims a native picker or saved file.

For separate native-download evidence, load the native-download fixture (synthetic
input), enable real STL download, then click the app's Export STL button. Expected
filename: `offset-nested-transforms.stl`. The original anchor action runs. Inspect
the browser Downloads UI and downloaded file separately, then Save STL evidence
to record Blob/URL metadata. Browser/version, native actions and observed saving
must be reported explicitly. No slicer, cross-browser or physical-print result
follows from these checks.

Local Windows verification also retains the known historical JSON report CRLF
byte-drift failure in the Node suite; historical M0 artifacts are not rewritten.
Exact PR-head Linux CI is the retained-artifact verification authority for this
checkout limitation. Browser outcomes and final commit/CI links are recorded in
the PR/Linear handoff after execution, without treating unavailable Library
documents as read.
