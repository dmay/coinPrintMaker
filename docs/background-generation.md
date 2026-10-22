# Background generation

Production `createEditorStore` dispatches the unchanged pure `generateCoin` to a
module Worker. The existing SVG file/preflight/DOMParser/SVGLoader/normalization
and complete-candidate import remain on the main thread. The Worker imports
only the engine, polygon-clipping, Three's standalone Earcut and transport DTOs;
it does not require DOM, React, scene or renderer state.

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
