# Revision-safe editor state and generation (DIG-24)

`state/editorStore.ts` creates one Zustand 5.0.15 vanilla store per editor mount.
React subscribes through `useStore`; rendering is never an input to the engine.
The store owns the complete import transaction, source revision, committed
CoinSettings, generation token/status/result, pending-only previous checked
snapshot, diagnostics and selected layer. Local numeric input strings belong to
future DIG-25 controls: typing is not a committed settings edit. No numeric text,
scene object, material or DOM handle enters a generation request.

## Ownership and revision protocol

Successful imports are structured-cloned and recursively frozen, independently
of the caller's candidate. Defaults are built with the existing pure default
factory before a single source/settings replacement. Source remains separate
from settings; every successful import resets settings revision to zero and
increments sourceRevision. Same-file imports still get new importer identities.
Selections reset on replacement. The pure latest-wins coinImportReducer remains
the import arbiter; rejected imports never partly replace source/settings/result.

Committed thickness/order/enabled/color changes increment settings revision.
Locked-base edits, invalid order permutations, unknown IDs and identical edits
are no-ops. Invalid committed numbers/colors fail the normal engine/settings
gate; they cannot retain an old valid result as current. Controls will keep
incomplete numeric text locally and decide when to commit in DIG-25. Settings
commits pause while an import candidate is pending.

A serializable GenerationRequest carries monotonic token, sourceRevision, source
and settings. The coordinator owns the active request reference. Completion must
match that request/token/source revision, exact owned source reference and all
ordered geometry settings. Old success and failure cannot change current state.
A valid response additionally passes isCurrentValidGeneration against its exact
submitted key. Unexpected transport rejection becomes a generic MESH_INVALID
failure; exception details do not reach the page. Invalid responses may honestly
lack an input key, as the existing engine contract allows.

Import start invalidates the pending generation token. A pending replacement
gates current/export selectors and labels retained geometry stale. If replacement
fails, the previous checked result remains exactly intact. If generation was
pending, failed import restarts it once under a newer token; the canceled
completion cannot become current. Successful import clears old results and
starts generation for the new source/settings.

## Proven color reuse and stable 2D work

sameGeometrySettings compares import identity and every ordered layer's ID,
role, enabled state and exact thickness, including disabled entries. Only color
and settings revision may differ. Current colors must pass resolveStack; pending
request settings must also have been valid. This prevents a corrected color from
reusing work that originally rejected invalid settings.

After that proof, a checked result can retain its frozen meshes/metrics and
project the new settings revision and colors into all active-tier/part metadata.
Pending color edits keep the compatible geometry request; completion is checked
for its original submitted key before projecting current color metadata. This
is an explicit display-only derivation of verified equivalent geometry, never a
fallback or rekeying after a geometry edit. Candidate/source and older result
objects remain unchanged. Tests count actual clipping and triangulation calls:
ready color edits add zero; pending colors create no additional generation job.

Canonical imported footprints are the stable cached 2D work: thickness, order,
visibility and color do not parse/flatten/union SVG again. Each geometry edit
still runs the complete generateCoin, including fresh support, construction and
final independent validation. No raw Boolean or tessellation cache is introduced;
these retain their existing validation and bounded-work behavior. Reimport
replaces owned footprint identity and drops all prior generation candidates.

## Current, pending and invalid presentation

selectCurrentGeneration and selectExportableGeometry return only a current,
ready checked result outside a pending import. The latter describes geometry
eligibility, not implemented export permission: both export buttons remain
disabled until M4 and serializers must validate coordinates they emit.
selectStalePreview returns retained checked geometry only while pending; it never
grants current/export eligibility. Failure clears prior-preview payload entirely.

AppShell replaces useCoinImport with this one store owner. Imports automatically
schedule production generateCoin. The preview shows generating, checked dimensions
or invalid geometry; geometry diagnostics appear separately from import errors.
There is no interactive scene yet. DIG-25 adds accessible editing, DIG-26 renders
the Z-up scene, and DIG-27 profiles responsiveness before deciding on a Worker.

The default async executor yields to the browser task queue before running the
existing synchronous engine on the main thread. This permits pending presentation
but does not establish responsiveness or cancel CPU work already executing.
The protocol permits a future Worker transport; no Worker exists here, so no
Worker crash/restart claim is made. D-08 remains deferred to DIG-27. Existing
Y-up/page-relative XY, absolute cumulative Z and all precision policies are intact.

## Evidence

Thirteen store tests cover rapid edits and completion order, newest failure then
older success, reimport while pending, failed import preserving checked data,
failed import cancel/restart, color during pending and ready, exact geometry
reuse predicates, invalid-color recovery, former valid to invalid thickness or
support, order/visibility regeneration, locked base, selection isolation, frozen
ownership and caller mutation, malformed defaults, transport failure and forged
stale valid response. Shell coverage adds real store integration, checked
measurements, visible pending/stale language, invalid diagnostics and export
button gating. Historical import/geometry/export fixtures remain unchanged.

Full local checks, production-browser observations and exact PR-head CI are
recorded in the PR/Linear handoff. Original Library baseline files are still
unavailable; they are not represented as read. No slicer, physical-print,
cross-browser, scene or worker/performance acceptance is claimed.

Production browser evidence on 2026-10-19 local time used the real generated root
entry under `http://127.0.0.1:4174/coinPrintMaker/`, with the actual file-picker
flow and native SVG parsing. offset-nested-transforms reached Geometry checked,
39.9975 x 39.9988 x 2 mm, preserving transformed artwork XY [4,24]-[10,30],
6 x 6 mm and 36 mm2. outside-rim then replaced it and reached current geometry
invalid with SUPPORT_OUTSIDE_LOWER, no checked presentation and disabled exports.
Reimporting the valid fixture recovered; unsupported-script was then rejected
while the former filename and full layer metrics remained. Browser console
errors/warnings were empty. Screenshots are retained in the task artifacts, not
inside the published bundle. Browser evidence verifies these production paths;
concurrency/color reuse remains covered by controlled store/engine tests because
editing controls are DIG-25. No native timing/responsiveness claim is inferred.

Full local verification passes 720 Vitest cases and 22 retained Node cases,
all three typecheck targets, build:pages, check:pages and whitespace checks. The
production bundle now includes the actual engine (71 modules; 529.08 kB JS,
162.44 kB gzip) and triggers Vite's advisory above 500 kB. No warning suppression
or arbitrary splitting is introduced; measured loading/interaction optimization
remains later performance work. Root Pages artifacts stay synchronized.
