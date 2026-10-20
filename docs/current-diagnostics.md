# Current measurements and diagnostics (DIG-28)

`state/editorPresentation.ts` derives display state from the existing immutable
editor store. Only `selectCurrentGeneration` can supply measured dimensions,
checked mesh volume and active-tier Z. Renderer buffers, imported cached metrics,
previous meshes and arithmetic over the UI controls are never measurement truth.
The engine/import/Worker/serialization domains and precision/work limits do not
change. Display numbers use up to eight significant digits so tiny nonzero values
do not become a misleading zero.

## State and eligibility

`DimensionSummary` shows checked width X, depth Y, cumulative total height Z in mm
and checked mesh volume in mm³. Its bounded-height, keyboard-scrollable table
lists every active stable layer ID, bottom Z and top Z (cumulative height through
that tier). Hidden layers consume no height. Pending/importing/invalid/stale
states show explicit status and no dimension, volume or tier values.

While a replacement candidate is pending, the retained checked result is gated
and identified as stale. A successful source replacement clears the prior result
and prior preview before new geometry generation; it therefore has no stale
payload to describe. A geometry edit from a valid result retains a pending-only
previous snapshot, labelled stale and unavailable for measurements/export. A
completed invalid result clears that snapshot entirely. Preview continues to
remove parts during all noncurrent states, as established in DIG-26.

Keyless invalid results are legitimate engine/Worker outcomes. The presentation
never assumes their `input` exists. A mismatched keyed result instead shows stale
status and GEOMETRY_STALE without metrics. Old result errors cannot persist as
current errors during pending regeneration. Source warnings still apply to the
loaded source while its next geometry is pending.

A rejected replacement has its own ImportStatus diagnostics. The retained coin's
generation is still valid if its existing freshness gate passes: its preview and
measurements identify the retained loaded SVG, and candidate errors do not become
geometry errors for that coin. Import failure before any coin never invents one.

Both export buttons remain disabled. Text distinguishes current engine-valid
geometry from unavailable STL/3MF exporters; nothing downloads, serializes or
claims serialized-coordinate validation. Those remain M4 gates.

## Diagnostics and correction

`DiagnosticsPanel` shows explicit Error/Warning words, code, affected layer name
and stable ID, scoped element label/ID/path where applicable, message and Action.
Support errors also identify the actual immediately lower enabled layer by ID
from current settings. Duplicate display names cannot redirect the action.
The only diagnostic action selects an existing stable layer; settings, generation
token, geometry and colors do not change. Worker failure retains Retry generation
using the unchanged coordinator lifecycle. There is no hidden geometry repair.

Eight diagnostics are rendered per page, with total severity counts and labeled
Previous/Next controls giving access to every entry. Source/result duplicates are
removed without changing their diagnostics. New source/settings/status resets
the page. All text is escaped by React; no source SVG is mounted or executed.
The panels and buttons wrap at narrow widths and remain outside Canvas failure.

## Reproduction and evidence

After `npm run build:pages`, run `node scripts/verify-editor-workflow.mjs` and open
`http://127.0.0.1:4176/coinPrintMaker/`. Run editor workflow performs 14 assertions
through real DOM handlers: invalid hole support, layer selection without mutation,
hide recovery, rapid reorder/show/hide, current inferred-size warning, failed
replacement preserving checked measurements, new-import pending, geometry-edit
stale state, current volume/Z recovery, source-not-mounted and horizontal layout.
Run rapid layer edits loads its own fixture and independently checks latest-wins
order/visibility. Save editor evidence records subsequent native actions too.

The server is loopback-only, serves actual generated root entry/assets, adds a
developer observer outside the app and delays Worker **asset HTTP responses**
150 ms to expose pending transitions. Inputs are synthetic File/DataTransfer,
keyboard and click events; importer, Worker, engine and bundle are real. Neither
script is imported or published. Observer reads the private React store solely
for evidence, and writes reports under ignored `.profiling-results/`. No
performance claim follows from delayed-network runs. Stop the server after use.

The [committed evidence](evidence/dig28-editor.json) retains successful 1280×720
and 390×844 runs, each with all 14 checks, plus independent rapid-helper runs.
Native browser observations separately exercised the real filechooser and actual
Show Ring / move-button controls. The native chooser selected over-lower-hole;
support error named source:art above source:ring. Hiding Ring produced 2 mm,
displayed 2024.6853 mm³, Z [0,1.6]/[1.6,2]. A later synthetic tile thickness edit
produced 2.3 mm and displayed 2035.4853 mm³. All export buttons stayed disabled.

The IAB consistently showed the existing preview-unavailable fallback. Text,
measurements and controls remained usable. Console had only Three.Clock warnings,
no errors. Narrow native click tested the non-drag move alternative; its reverse
target measured 94.25×44 CSS px. Optional raw touch-emulation permission was
declined, so no raw command ran or workaround was used. No physical touch,
native GPU/orbit, cross-browser, slicer or physical-print acceptance is claimed.
Existing synthetic pointer and mocked WebGL scene tests retain their narrower
evidence boundaries. Screenshots are task artifacts, not published bundle files.

Ten new focused tests cover analytical volume/Z/current warnings, rapid races,
new import and failed replacement, invalid support with duplicate layer names,
keyless invalid/stale results, worker-failure retry, paging all 19 diagnostics,
safe selection, escaping and small-value display. Full current verification:
781 Vitest plus 22 retained Node tests, all three typechecks, build:pages,
check:pages and whitespace checks. Generated Worker bytes are unchanged; only
main JS/CSS/entry references change. The existing >500 kB bundle advisory remains.
Historical spikes/fixtures/reports/samples are untouched.

Library baselines were rechecked: no synced source files, Linear project documents
or connected document sessions were available. The live issue and current
repository contracts/decisions were read; missing Library documents are not
represented as read. See the [M3 checkpoint](m3-editor-checkpoint.md) for the
operator boundary. DIG-28 remains In Progress pending review and merge.
