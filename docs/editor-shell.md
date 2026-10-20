# Responsive editor shell (DIG-23)

The one-page editor composes AppShell, Toolbar, PreviewViewport and LayerPanel.
At desktop widths the read-only layer panel is 320 px; at 700 px and below the
preview and layers stack in document order. The toolbar wraps first at 900 px.
Controls use native labels, a skip-to-editor link, visible keyboard focus and
44 px minimum button/file-picker targets. Layer metrics retain explicit mm/mm²
units and wrap long filenames, layer names and diagnostics.

## Ownership and truthful states

AppShell owns the local useCoinImport hook, which reuses the unchanged pure
coinImportReducer. The browser File adapter creates a complete canonical candidate
before the newest request may commit it. Canceling the picker does nothing;
same-file retries remain possible. Pending or rejected replacements retain the
previous complete ImportedCoin and its layer metrics/warnings. Candidate failures
are shown separately from retained-source warnings. No SVG source is mounted as
markup, image or script, and processing stays local.

Production currently reaches empty, importing, imported (explicitly **2D imported,
3D not generated**) and import-invalid presentation. Nothing infers checked
geometry from a successful import, including outside-rim/over-lower-hole artwork
that passes import but fails later support. No production generateCoin call or
interactive scene is wired in this issue.

PreviewViewport also accepts generating, geometry-invalid and ready presentation
variants for the following M3 tasks. These are component-tested integration seams,
not a claim they are reachable in this shell. Ready takes the complete GeneratedCoin
and current GenerationKey and checks isCurrentValidGeneration; invalid/error-bearing,
replaced-import or older-revision results show no current checked geometry.
Even a checked snapshot does not imply a rendered 3D scene. Both STL and 3MF
buttons remain disabled in every shell state until M4 exporters exist.

Toolbar/import access sits outside EditorErrorBoundary. A render failure shows
a generic recovery message without exception details; retry remounts the view
without clearing the parent-held source. A new file request also retries the
editor view. This boundary handles rendering exceptions, while expected import
failures use their existing typed diagnostics.

## Next integration boundaries

DIG-24 replaces local shell ownership with the revision-safe settings/generation
store and coordinator. It must increment revisions, clear/gate stale results and
atomically replace source/settings after a complete import. DIG-25 supplies actual
layer editing; DIG-26 supplies the Z-up interactive scene; DIG-27 profiles actual
generation before deciding whether a Worker is warranted; DIG-28 completes
diagnostics and M3 exit. This issue adds no second import/geometry pipeline,
settings model, renderer, Worker or dependency.

The pure engine policies and all historical coverage stay intact. D-22 records
this reversible shell boundary. Live DIG-22 and the M2 milestone confirm M2
completion after operator merge of PR #18; older repository statements about that
merge being pending describe their historical handoff, not a current blocker.
The original Library baselines remain unavailable and are not represented as read.

## Verification

Typechecking, 706 Vitest cases (701 retained plus five shell cases), 22 retained
Node cases, build:pages, check:pages and whitespace checks pass. Existing import
control tests now render the complete shell, preserving selection/cancellation,
same-file retry, source escaping, warnings, canonical metrics, replacement and
late-read coverage. New cases cover empty/export gating, imported versus unchecked,
newest failure before older success, retained warnings, first rejection, real
checked square-generation freshness variants and render-failure recovery.

Generated root index.html/assets are synchronized through the normal guarded
publisher; GitHub Pages remains main/repository root. No historical M0 fixture,
sample, report or spike has changed. Native browser evidence and remaining
limitations are recorded in the PR/Linear handoff. Component tests alone do not
establish responsive layout or real picker behavior. Cross-browser, editor
generation/performance, slicer and physical-print acceptance remain later gates.
