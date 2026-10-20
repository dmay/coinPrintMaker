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

## Final native comparison and acceptance

The final generated app was profiled on clean implementation commit
`5013d685f3a0aa6613bdbad8677bb11041b8f366`, tree
`bf2b3c6f2875e56e17dd065edf399a8090536d43`. Main asset
`index-Cox_woU9.js` is 1,277,959 bytes (SHA-256
`6dc0fa23e261671cdedcc182fd7a188b6a03a08d852f4495ffbaeb46dc018419`);
`generation.worker-BBJGLBPc.js` is 82,177 bytes (SHA-256
`c044a178ca1562b2ee2f1fb17eb7c9c5b0e3aabb713b9d3d44cad792bae43735`).
Later documentation commits do not change these runtime assets.

Fifty completed action rows recorded 285 state snapshots, 3,828 animation frames,
4,292 timer samples, zero main-thread long tasks and zero window errors. Measured
action frame gaps stayed at 18.0–19.6 ms. The four scheduled Enter inputs arrived
0.1 / 1.9 / 3.9 / 6.9 ms late; the final checked source key/current revision 4
matched, with 3.1 mm height. Generation remains hundreds of milliseconds of real
work; the Worker removes observed input blocking, not the validation work itself.
See [all final samples and build hashes](evidence/dig27-worker.json).


| Fixture | Worker import generation interval ms | Worker edit generation interval ms | Total import ms | Total edit ms |
| --- | ---: | ---: | ---: | ---: |
| sun-medallion | 516.8–682.4 | 544.9–552.3 | 539.6–714.8 | 557.0–588.5 |
| twin-stars | 386.9–430.7 | 379.0–401.7 | 411.2–444.2 | 395.1–413.1 |
| monogram-o | 170.0–197.7 | 172.8–174.5 | 202.9–220.5 | 203.0–205.1 |
| offset-nested-transforms | 168.3–175.6 | 171.5–210.2 | 188.0–204.9 | 204.0–219.7 |
| polygon-600 | 453.3–476.3 | 460.4–465.3 | 474.7–492.3 | 476.0–477.1 |
| polygon-800 | 618.4–651.7 | 614.4–651.4 | 651.3–683.8 | 635.1–668.0 |
| near-source-cap | 183.5–194.4 | 171.6–181.5 | 234.5–237.0 | 203.5–204.9 |

Generation intervals use the first pending state of the completed token through
its ready state. Intermediate progress updates remain pending and must not reset
the interval. Totals include polling/file reading; these are three-run ranges,
not statistical percentiles or CPU-only measurements.

The 2,090,000-byte import finished in 234.5–237.0 ms total; frame gaps remained
18.1 ms and timer gaps 34.3–35.3 ms. The 8,191-point source (158,939 bytes) rejected
at the existing bounded import gate in 27.5–44.1 ms. The 8,192-point source
(158,957 bytes) rejected in 28.0 ms. Both retained the previous 800-point source
honestly. The accepted 600/800-point inputs are 11,865/15,737 bytes.

Root-agent native browser observations completed the real file-chooser path:
offset-nested-transforms reached checked 2 mm. Browser fill(2) plus Enter on raised
thickness reached checked 3.6 mm and current Z 1.6–3.6. The deliberate native
Worker fault displayed GENERATION_WORKER_FAILED, no current Z/preview eligibility,
disabled exports, and Retry generation. Clicking the real retry button restored
checked 3.12 mm. The local request log records the faulted Worker at
18:38:57.181Z and its fresh replacement at 18:38:59.058Z, both from
`/coinPrintMaker/assets/generation.worker-BBJGLBPc.js`.

The final viewport was 1280×720 CSS px, while baseline was 679×1044. Same device,
browser and DPR were used; differing viewport and desktop-only runs limit the
comparison. Baseline narrow-layout synthetic repeated input and final desktop
browser-native keyboard/chooser checks are distinguished from physical input.
In both root IAB/harness testing sequences Canvas displayed its existing
preview-unavailable fallback while text/controls remained usable; earlier console
contained only the Three.Clock warning. This does not diagnose a production GPU
defect or prove native orbit/GPU frame rate, touch hardware or cross-browser
acceptance. Main-thread callback responsiveness and independent diagnostics are
established; component/scene tests cover the documented rendering handlers.
