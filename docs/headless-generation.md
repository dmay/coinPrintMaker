# Checked headless coin generation

Current generation extends every active footprint down through all lower tiers,
including the base, and permits detached closed components. Source SVGs remain
immutable. See [automatic downward support](support-validation.md).

`core/generateCoin.ts` implements current source/settings -> fresh support ->
closed parts + unified exterior -> independently checked actual coordinates.
No renderer, scene, DOM, UI/store, Worker, serializer or previous generation enters
this API. Pinned polygon-clipping and Earcut remain replaceable adapters.

## APIs and snapshots

`generateCoin(coin, settings, polygonKernel, triangulator, builders?)` returns a
serializable GeneratedCoin. Optional `builders.parts` / `builders.unified.build`
replace construction, never validation. Successful stages must match retained
source/settings key, ordered active tiers, exact footprints, Z intervals, height,
part IDs/order/names/colors and error-free diagnostics. Inputs to builders and
expected source truth are separate copies. The returned snapshot is detached
from source/settings and retained builder buffers. Warnings survive once.

A valid result contains checked parts, unified exterior, active tiers, recomputed
MeshMetrics, `[width,depth,height]` dimensionsMm, analyticalVolumeMm3 and
colorBoundaryHeightsMm. Boundary heights list **all internal active-tier
interfaces**, excluding final top, even when adjacent display colors match.
They are candidate cumulative change heights, not printer/filament instructions.
Each tier retains exact bottom/top Z.

Invalid results contain diagnostics and an input key only when nonempty source
identity exactly matches settings and revision is a nonnegative safe integer.
Invalid revision/identity never produces an invented or nonfinite key. Failures
have no tiers, meshes, parts, metrics, dimensions/volume/boundary metadata.
`isCurrentValidGeneration(result,current)` accepts only valid, error-free matching
import/revision. Callers increment revision for every edit, replace current
results on failure, and gate export. No old-valid fallback exists. This freshness
gate does not validate arbitrary JSON or later serialized coordinates.

`validateMesh(mesh,{expectedShellCount,expectedBoundsMm,expectedVolumeMm3,
layerId?,budget?})` returns `checked` with copied exact-weld mesh and recomputed
metrics, or diagnostics-only `rejected`. Expectations must be independent source
truth, never candidate metrics. Stitching and public validation share
meshTopology.ts; construction stitching remains a distinct, narrower stage.
