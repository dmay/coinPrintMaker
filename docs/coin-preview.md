# Checked Z-up coin preview (DIG-26)

The existing Zustand editor store owns source/settings/revisions, current checked
generation and selection. PreviewViewport applies isCurrentValidGeneration before
passing only checked current output to CoinPreview/CoinScene. No rendering object
enters the domain/store. Import, support, geometry, metrics, validation and later
serialization remain independent. Original Library baselines are unavailable
(empty synced sources); the live issue and current repository contracts were read.

## Coordinates, colors and views

Generated part vertices are absolute page-relative XY/+Z mm. The preview copies
them into indexed GPU buffers without centering, rotating, scaling or changing
canonical data. Display buffers use Float32 and may lose precision; they are never
exported or measured. The source SVG text is never mounted in the document.

Each part's current checked opaque sRGB #RRGGBB color drives its material; Three's
color conversion and lighting affect on-screen shading. Selection draws separate
edge lines. Neither selection nor camera actions commit settings, mutate source
colors or revise/recompute generation. Hidden layers have no generated part.

Drei OrbitControls supports left-drag orbit, right-drag/two-finger pan, and
wheel/pinch zoom. Fit recenters the checked bounds while retaining direction;
reset restores an oblique view. Top looks down Z with +X right/+Y up; side looks
from -Y with +X right/+Z up. The top direction is within 1e-6 radians of the pole,
matching OrbitControls' pole clamp and keeping an unambiguous Z-up orbit axis.
Camera position/target are local presentation state. Aspect-aware sphere framing
uses current checked bounds and refits on viewport resize; replacement dimensions
reset the view. A display-color update or selection keeps the view/resources.

## Lifetime and failure

After the first valid result, Canvas stays mounted across generation/replacement
transitions. Pending, importing and invalid states remove every part; the hidden
canvas retains its renderer and controls. Previous valid geometry is described as
stale in text while pending but is not drawn. Current dimensions disappear on
invalid/stale states. New checked geometry resets framing to its bounds.

Part resources allocate only in committed layout effects. A mesh identity change
or part removal explicitly disposes BufferGeometry, MeshStandardMaterial,
EdgesGeometry and LineBasicMaterial and removes their group. Color/selection effects
update presentation without reallocating these resources. Allocation in a memo or
render is avoided so StrictMode effect replay has matching cleanup. Drei disposes
OrbitControls on canvas unmount; Fiber handles renderer teardown. A preview-local
error boundary catches initialization/render failure, and a context-loss listener
removes the canvas. Dimensions, diagnostics, source/layer controls and a Retry 3D
preview button stay outside the failed canvas. Retry starts a new renderer for
current geometry. Failure never changes domain validity or enables export.

## Automated evidence

Six scene tests use actual imported offset-nested-transforms output through the
production generateCoin engine and the pinned React Three test renderer. WebGL is
mocked by that renderer; these tests are not native GPU evidence. They verify exact
off-center [4,24]-[10,30] mm placement, unchanged transforms, top/side projection,
framing every emitted vertex, narrow-aspect resize, fit/reset, checked colors,
selection nonmutation, renderer/control identity, replacement/pending cleanup of
all four resource kinds and Drei control cleanup on final unmount. Synthetic
mouse/pointer/wheel events exercise the actual Drei orbit/pan/zoom handlers;
jsdom pointer-capture functions are shimmed and WebGL remains mocked.

Four component tests mock Canvas/scene to test view commands and source/store
selection isolation, retained canvas, fresh dimensions, stale/invalid mesh removal,
mock initialization failure, synthetic context loss and retry. Existing importer,
engine, store and layer-control tests still exercise full validation. No physical
GPU failure, native touch hardware, cross-browser, serializer/slicer or print
acceptance follows from these tests. Native browser observations are recorded in
the PR/Linear handoff separately from mock/synthetic evidence.

Initial complete local verification: all three typecheck targets, 748 Vitest tests
and 22 retained Node checks, build:pages and check:pages pass. The generated bundle
includes actual production engine and scene (624 modules; approximately 1.31 MB JS,
369 kB gzip). Vite retains its >500 kB advisory; no warning suppression or Worker
is introduced. Runtime generation profiling/Worker decisions remain DIG-27.
Pinned dependencies report zero npm audit vulnerabilities at installation. Three's
Clock and test-renderer CommonJS deprecation notices do not fail the checks.



Native production-browser observations on 2026-10-19 local time were made by the
root agent in the in-app Chromium browser at
http://127.0.0.1:4174/coinPrintMaker/, using the actual generated root entry.
The exact browser version was not exposed. The real importer and engine accepted
offset-nested-transforms and reported 39.9975 x 39.9988 x 2 mm. Top visibly showed
the circular base with its off-center raised tile; side showed the thin Z slab.
The raised tier was selected and edited. After the event-value amendment and
reload, fill(2) + Enter committed without blur and regenerated current dimensions
to 39.9975 x 39.9988 x 3.6 mm. Console had Three.Clock deprecation warnings and no
errors. Native coordinate drag visibly changed the orbit and revealed the
selection outline; wheel zoom changed framing; Fit and Reset restored the oblique
Z-up view with the raised tile. Programmatic color fill did not commit, so no native color-picker claim
is made. Native GPU/context loss, narrow-device/touch and cross-browser acceptance
were not observed in these actions; mock/synthetic tests above cover the stated
handlers and resize behavior. No slicer, serializer or print behavior was tested.
