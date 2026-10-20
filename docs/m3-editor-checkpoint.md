# M3 editor checkpoint (DIG-28, pre-merge)

This is a recoverable implementation/review checkpoint, not M3 completion.
DIG-28 stays In Progress until the operator reviews/merges its PR and the merged
main build/deployment is verified. No M4/DIG-29 work or exporter was started.
The PR/Linear handoff records final commit/tree/CI and merge-parent evidence
outside this tree to avoid a circular self-referencing commit ID.

## Current implementation

M3 now has a responsive single-page shell and atomic local file replacement,
immutable revision-safe editor ownership, stable editable layers with numeric
commits/color/visibility/reorder and button alternatives, checked Z-up scene with
fallback, measured native Worker generation with cancellation/failure/retry, and
current-only diagnostics/measurements/export eligibility text. Rendering never
authorizes geometry or export; rejected/keyless/stale outcomes have no checked
metrics. Source SVG remains local data and is never mounted/executed.

The existing main/root GitHub Pages publication arrangement remains. Root entry
and generated assets are synchronized by the guarded builder. Pure source,
settings, import, support/geometry/validation and later serialization remain
separate from UI/GPU state. No coordinate/tolerance/work-budget change is made.

## Exit-workflow evidence available before operator merge

The [DIG-28 contract and reproduction](current-diagnostics.md) and
[recorded native-browser summaries](evidence/dig28-editor.json) describe actual
generated-app execution below `/coinPrintMaker/`. Desktop and 390×844 observers
each passed all 14 checks. Repeated order/show/hide commits superseded older
native Worker jobs; final keys/order/enabled state matched the last edit.
Unsupported art above a holed Ring identified both stable layers and a remedy;
hiding Ring compressed checked Z and recovered valid 2 mm geometry. Separate
current warnings never became errors. Failed import candidates retained and
identified the previous checked coin. Pending/stale/invalid states exposed no
current measurements; current state showed checked mm/mm³ values and per-layer Z.
Both exporters stayed explicitly unavailable and disabled in every state.

The observer uses synthetic UI events and deliberately delayed Worker asset
responses. Separate native chooser, checkbox and move-button actions are recorded
as such. Diagnostic selection is navigation only, proved not to revise settings
or token. Component/selector tests add race order, keyless invalid, stale keys,
warning/error classification, complete bounded diagnostic paging, source escaping
and Worker failure/retry. Existing native Worker protocol and color-only
no-generation tests remain in the full passing suite.

## Explicit remaining boundaries

The IAB showed preview-unavailable fallback, with textual measurements/diagnostics
and editing fully usable. No new native GPU/orbit/frame-rate claim follows.
Narrow native click verifies the 44 px move-button alternative; physical touch
was not available. Raw CDP touch emulation was declined and not retried. Existing
synthetic pointer and mocked scene tests do not replace hardware acceptance.
No cross-browser, slicer, serializer output or physical-print result is inferred.
Original Library baseline files remain unavailable, as accurately reported in
the implementation document. Prior M0/M2 manual evidence keeps its own scope.

Before calling M3 complete: operator merge DIG-28, verify the final merged main
head/tree, successful current-base CI and published root/subpath assets, then
record post-merge acceptance and update Linear. Export implementation and actual
serialized-coordinate validation remain subsequent M4 work.
