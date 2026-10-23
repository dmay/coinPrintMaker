# coinPrintMaker

A browser-only utility for turning layered Inkscape SVG artwork into 3D-printable
coins. The current page is a responsive React/TypeScript editor with local canonical SVG import, revision-safe
checked generation, editable layers, interactive 3D preview and validated binary
STL and layered 3MF downloads using the imported SVG filename. Successful import alone
does not claim valid geometry. See the [production layered 3MF writer](docs/layered-3mf-export.md) and
[binary STL export](docs/binary-stl-export.md).

New to the codebase? Start with the [new-SDE whiteboard walkthrough](docs/sde-walkthrough.md)
for the module map, geometry flow and revision/export invariants.

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
repository root, source, documentation, fixtures and prototype samples are never cleaned.
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

