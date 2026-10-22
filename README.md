# coinPrintMaker

A browser-only utility for turning layered Inkscape SVG artwork into 3D-printable
coins. The production UI is being built incrementally; the current page is a
responsive React/TypeScript editor with local canonical SVG import, revision-safe
checked generation, editable layers, interactive 3D preview and validated binary
STL and layered 3MF downloads using the imported SVG filename. Successful import alone
does not claim valid geometry. See [export options](docs/export-options.md), the
[production layered 3MF writer](docs/layered-3mf-export.md) and
[binary STL export](docs/binary-stl-export.md). M0 prototypes
remain reference implementations.

## Development and publication

Use Node.js 24 and Python 3.14 (the existing independent 3MF ZIP/XML audit uses
Python's standard library). Run `npm ci`, then `npm run dev` and open the local
address it prints. The editable entry point is `app/index.html`, with React and
TypeScript in `app/src/`; `vite.config.mjs` sets that source root. Type-check with
`npm run typecheck` and run all build/import/geometry/export tests with `npm test`.
The Python test uses `python` on Windows and `python3` elsewhere; set `PYTHON` to
an executable path if your installation uses another command.

GitHub Pages continues to publish **main, repository root**. Run
`npm run build:pages` after source changes and commit the generated root
`index.html`, `assets/` and `.nojekyll` together with source and lockfile changes.
Do not edit those generated files directly or point Vite's output at the repository
root. `npm run check:pages` builds into a fresh stage and fails if committed output
is missing, changed or contains stale assets. CI runs clean install, type-checking,
tests and this drift check; it does not change Pages settings or deploy a separate
artifact. Pull requests target main and require operator review/merge.

The guarded publisher builds and validates in a unique `.pages-build-*` directory
before touching published files. Only its three owned paths are replaced; the
repository root, source, documentation, fixtures and M0 samples are never cleaned.
An exclusive `.pages-build-lock` prevents concurrent publication. Ordinary
replacement errors trigger rollback; failed rollback retains backups and reports
the recovery path. A process interruption can leave a stage/lock behind: inspect it
and ensure no publisher is running before recovering or removing it. File replacement
is not a crash-atomic filesystem transaction.

Vite uses `base: './'`, so the same static output loads at
`/coinPrintMaker/` without a server rewrite. The build suite serves the real
production output under that prefix and checks its script/style resources. LF text
and binary artifact rules in `.gitattributes` keep byte checks reproducible on
Windows and Linux. Runtime scripts/styles are bundled locally; there is no backend,
authentication, CDN runtime or file-processing upload.

SVG authoring subset, preflight diagnostics and verification:
[docs/svg-preflight.md](docs/svg-preflight.md). The inspector shows validated XY polygons and metrics; unified meshes
and exports remain separate from the inspector. Pure support, independent layer-part construction and [unified external surface construction](docs/unified-coin-surface.md) are available as headless stages. See [canonical import and M1 checkpoint](docs/canonical-svg-import.md).

## Editor layout

The Preview header contains Fit, Reset, Top and Side controls. Layer cards contain
selection, color, thickness, visibility and reorder controls; the base remains
locked at the bottom. Move icons have tooltips and accessible names, and drag
handles support Escape to cancel.

Measurements separates imported page/layer dimensions from current checked 3D
dimensions and Z intervals. Internals is collapsed by default and contains
validation diagnostics, source object/contour counts and checked mesh statistics.
Pending or invalid geometry never contributes current mesh statistics or exports.

## Development fixtures

Representative Inkscape inputs, analytical geometry expectations and verification
instructions: [fixtures/README.md](fixtures/README.md).

## SVG extraction validation

M0.2 prototype, reproducible headless checks and measured library decisions:
[spikes/svg-import/README.md](spikes/svg-import/README.md) and
[docs/design-decisions.md](docs/design-decisions.md).

## Tiered coin / STL validation

M0.3 prototype, generated STL samples, topology/volume evidence and completed
OrcaSlicer acceptance: [spikes/tiered-stl/README.md](spikes/tiered-stl/README.md).
Run `npm run spike:stl` to regenerate retained samples and metrics.

## Layered 3MF / joint M0 validation

M0.4 prototype, six paired 3MF samples and automated package/mesh checks:
[spikes/layered-3mf/README.md](spikes/layered-3mf/README.md).
Run `npm run spike:3mf` to regenerate, or
`node scripts/check-layered-3mf.mjs --check` to verify retained artifacts.
Completed operator-reported STL/3MF acceptance and the export-only scope decision
are recorded in the [M0 worksheet](docs/m0-slicer-validation.md). All six pairs
passed in OrcaSlicer 2.4.2 build 8500fcdc; the M0 gate is satisfied. Production
implementation and later QA/physical-print gates remain separate work.

## Canonical domain and fixture tests

Pure serializable types for import, settings, active tiers, diagnostics and mesh
results live in `app/src/core/`. Their units, ring winding/closure, stable layer
identity, base protection and generation-freshness rules are documented in
[docs/domain-contracts.md](docs/domain-contracts.md).

`npm run test:unit` runs the read-only Vitest fixture/contract suite; `npm test`
also runs the retained Node build/export/adversarial suites. Fixture metrics are
analytical oracles with explicit tolerances, adapted from the retained M0
prototypes until the production importer/mesher replaces them. Tests do not
regenerate historical M0 fixture reports or samples. Use the explicit `spike:*`
commands for that purpose. `npm run typecheck` checks app, ES-only core and tests.

## Local SVG loading

Select or replace a local SVG on the current page. Files remain in the browser;
failed replacements preserve the previous complete imported coin. Strict UTF-8/XML/SVG,
painting, layer, transform and canonical polygon checks have actionable errors.
The inspector reports source names, physical page, XY bounds, dimensions, area,
regions and holes. Import alone does not validate support or create exportable
coin meshes; the editor now schedules checked production generation separately after import. See [revision-safe generation](docs/reactive-generation.md) for settings ownership, stale-result gating and color-only reuse.
See [docs/local-svg-loading.md](docs/local-svg-loading.md) for supported encoding,
exact budgets, atomic replacement behavior and the staged import boundary.

## Active layer stack core

Pure default-settings creation and active-stack resolution now preserve imported
geometry while validating order/visibility/color/thickness and deriving cumulative
Z intervals. Defaults use 1.6 mm base / 0.4 mm artwork. This core stage adds no
editor controls or exportable mesh; support validation is a separate core stage.
See [docs/active-layer-stack.md](docs/active-layer-stack.md).

## Planar Boolean core

The shared pure polygon service validates canonical layer unions, difference,
intersection and area/bounds/isEmpty behind a replaceable adapter. Precision
failures produce diagnostics and valid empty results retain null bounds.
See [docs/polygon-service.md](docs/polygon-service.md) for expected boundary,
hole/island/tangency outcomes and bounded precision evidence.

## Automatic downward support

Each active layer's artwork extends straight down through every lower enabled
layer, including the base. This fills only needed material, may enlarge the
outline or fill holes, and permits separate columns without adding bridges.
Hide/show/reorder recomputes from the original SVG; support takes the lower
layer's color and thickness. Preview, STL and 3MF use the same checked geometry.
Polygon/mesh failures and stale results still block export.
See [docs/support-validation.md](docs/support-validation.md) for policy and evidence.

## Closed positioned layer-part core

Pure triangulation and tier extrusion build independent closed layer parts with
holes/islands at exact absolute Z. Stack construction checks current immediate-
lower support first and preserves stable layer identity; any failure discards all
partial parts. This stage is available separately from the inspector. Unified
coin surfaces, complete generated-coin validation and export remain later stages.
See [docs/positioned-layer-meshes.md](docs/positioned-layer-meshes.md) for cap coverage,
precision, bounded construction checks and independent analytical evidence.

## Checked headless generation core

`generateCoin` returns independently checked current parts/unified exterior,
metrics, dimensions, analytical volume and internal active-tier boundary heights.
All failures strip geometry; revision freshness rejects old valid results after
edits. This pure API is separate from the current inspector. Editor/preview/export
remain later work. See [headless generation](docs/headless-generation.md) and the
[M2 checkpoint](docs/m2-geometry-checkpoint.md) for tests/native evidence, precision
and work limits, and the independent operator-merge boundary.

## Interactive Z-up preview

Current checked layer parts appear in a Z-up 3D view with orbit/pan/zoom and
Fit coin, Reset view, Top view and Side view controls. Selection adds an outline;
settings colors remain separate from source SVG paint. Pending or invalid geometry
is cleared. If WebGL fails, dimensions/diagnostics and layer editing remain usable.
See [coin preview](docs/coin-preview.md) for renderer ownership, camera conventions,
validation evidence and limits. STL export uses the current checked domain mesh;
it remains usable when WebGL is unavailable. 3MF remains disabled.

## Background geometry processing

Checked generation now runs in a local Web Worker with current-revision gating,
coarse progress and recoverable failure diagnostics. Color-only edits reuse checked
geometry. See [background generation and profiling](docs/background-generation.md)
for the measured D-08 decision, protocol, ownership and reproducible developer
harness. SVG parsing/import remains a separate atomic main-thread operation.

## Current measurements and diagnostics

Checked current width/depth/height in mm, volume in mm³ and per-layer cumulative
Z appear below the preview, including when WebGL is unavailable. Pending, stale
and invalid geometry has no current measurements. Errors/warnings identify
stable layers and corrective actions; diagnostic buttons select layers only.
Failed replacement imports are kept separate from the retained checked coin.
STL is enabled only for current checked geometry and independently validates
float32 output before local download; 3MF remains unavailable and disabled.
See [current diagnostics](docs/current-diagnostics.md) and the
[pre-merge M3 checkpoint](docs/m3-editor-checkpoint.md) for evidence and limits.
