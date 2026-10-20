# Background generation and measured D-08 decision (DIG-27)

Production `createEditorStore` dispatches the unchanged pure `generateCoin` to a
module Worker. The existing SVG file/preflight/DOMParser/SVGLoader/normalization
and complete-candidate import remain on the main thread. The measured import
preparation did not warrant moving that browser-only adapter. The Worker imports
only the engine, polygon-clipping, Three's standalone Earcut and transport DTOs;
it does not require DOM, React, scene or renderer state. Main/root Pages hosting
and every M2 precision, construction and validation limit remain unchanged.

## Request, progress, ownership and failure

Protocol version 1 envelopes echo monotonic generation token, sourceRevision,
importId and settingsRevision. Request type is `generate`; responses are coarse
`progress` (`generating`, then `receiving`), `result`, or safe `error`. Progress
describes actual stages, not invented percentage completion. Main verifies all
envelope keys and result freshness before the existing active-request/source
identity/ordered-geometry-settings gate can commit. Unknown or malformed current
responses fail closed; callbacks retained from detached ports cannot affect a
new request. A failed result never carries meshes or current dimensions.

The domain remains immutable JSON tuples. The Worker creates separate Float64
position and Uint32 triangle arrays for each checked part and unified exterior,
transfers their buffers, and main hydrates independent domain tuples and applies
the existing owned clone/deep freeze. Float64 preserves the original binary
coordinate bits; the Uint32 indices are within the unchanged 100k-vertex bound.
All other checked fields, including tiers, exact Z, metrics, diagnostic locations,
colors and boundary heights, survive unchanged. No authoritative domain array or
derived renderer buffer is detached. Rendering still uses separate Float32 views.

Geometry supersession or reimport terminates active CPU work. Idle workers are
reused; idle crashes discard the port so the next request can start cleanly.
Color-only edits retain the compatible pending job or current checked meshes;
the existing revision/color projection proof still applies. They dispatch no
new generation and add zero clipping/tessellation calls. Import replacement and
failed replacement remain atomic, including restarting canceled prior generation.

Constructor, postMessage, runtime, decoding and protocol failures reject only the
current request with `GENERATION_WORKER_FAILED`, an honest submitted key, no
partial payload and no old export eligibility. The text diagnostic and Retry
generation button remain outside Canvas. Retry uses the same current settings
revision and a new token/worker; it never rekeys old geometry. There is no
synchronous fallback. Shell unmount terminates pending/idle workers and ignores
late import/results. StrictMode effect replay can activate the store again.

## Reproducing production measurements

After `npm run build:pages`, run `node scripts/profile-generation.mjs` and open
`http://127.0.0.1:4175/coinPrintMaker/`. The server binds loopback, serves the actual
generated root entry and assets, and adds a developer observer outside the app.
It is never bundled or published. `COINPRINT_PROFILE_PORT` and
`COINPRINT_PROFILE_OUTPUT` override the default port and ignored
`.profiling-results/` directory. Stop the server after use.

Run generation profile performs three imports and three committed base-thickness
edits per accepted fixture, then four Enter edits scheduled 30 ms apart. Inputs
use synthetic DataTransfer/File and DOM Enter events through the real file input
and layer handler, with native File.arrayBuffer, DOMParser, importer, coordinator,
Worker, engine and preview. This is native Chromium execution with synthetic
inputs, not a real picker, physical keyboard/touch or simulated Worker. Separate
native chooser/input observations are recorded with the results.

The observer locates the actual store through React's private fiber hook only to
subscribe to state. That developer-only dependency may need adjustment after a
React change; it is not an application API. It records source/settings/token and
checked-result keys, polygon/part/unified counts, phases, PerformanceObserver
longtasks, animation-frame gaps, 16 ms timer gaps, and scheduled/actual rapid-input
delivery. Import totals include native file-read and polling overhead. Generation
intervals are pending-to-ready wall time, including transport/ownership, not a
CPU-only timer. Wait for literal Complete; a displayed prior row does not mean a
run has finished. Save measurements also captures current native manual actions.

The server records asset hashes and worker paths. Test Worker failure injects one
explicit local Worker exception on the next Worker request and supersedes an
active edit to force startup. Inspect invalid diagnostics/current gating, then use
the actual Retry generation button and Save. That is deliberate fault injection,
not a naturally occurring browser failure.

Fixtures: the four authored SVGs are unchanged. Generated 600/800/8191/8192-point
regular polygons use radius 18 mm on a 40 mm page, six-decimal source coordinates
and one named base. The near-source-cap fixture pads offset-nested-transforms with
an inert comment to exactly 2,090,000 bytes (99.66% of 2 MiB). The 8192-point
candidate rejects at an existing complexity gate; retained prior geometry is not
misreported as its successful result, and its subsequent baseline edits are
excluded. These probes exercise source-size and bounded-complexity behavior;
they do not prove universal worst-case latency at every independent cap.

## Verification boundaries

Focused transport tests cover exact transfer/hydration, independent ownership,
all envelope keys, stale ports, worker start/post/runtime/message/protocol failure,
retry, rapid supersession/reimport, color-only pending/ready reuse, frozen current
snapshots, idle reuse/crash, unmount and reactivation. Existing store tests retain
actual clipping/tessellation call counts and revision/support transitions.
Component tests explicitly use an in-process port with the real engine; they do
not establish native Worker scheduling or WebGL behavior.

The existing production-build/subpath test now resolves and fetches the emitted
Worker below `/coinPrintMaker/assets/`, then executes that actual bundle with only
standard ECMAScript globals in a DOM-free VM. This proves adapter compatibility
and relative asset publication, separately from native browser observations.

Full local verification passes 756 Vitest and 22 retained Node tests, three
typecheck targets, build:pages and check:pages. The main bundle retains its
existing >500 kB advisory. There is no new exporter, changed geometry policy,
slicer/print acceptance or later milestone work. Original Library baselines were
rechecked: synced sources and Linear project documents were empty; connected
document control was unavailable. Those absent files are not represented as read.

Measured results and native limitations are recorded in D-08 and the committed
evidence summary. DIG-27 remains In Progress until operator merge.
