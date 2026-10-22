# Revision-safe editor state and generation

`state/editorStore.ts` creates one Zustand 5.0.15 vanilla store per editor mount.
React subscribes through `useStore`; rendering is never an input to the engine.
The store owns the complete import transaction, source revision, committed
CoinSettings, generation token/status/result, pending-only previous checked
snapshot, diagnostics and selected layer. No numeric text,
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
gate; they cannot retain an old valid result as current. Settings
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
objects remain unchanged.

Canonical imported footprints are the stable cached 2D work: thickness, order,
visibility and color do not parse/flatten/union SVG again. Each geometry edit
still runs the complete generateCoin, including fresh support, construction and
final independent validation. No raw Boolean or tessellation cache is introduced;
these retain their existing validation and bounded-work behavior. Reimport
replaces owned footprint identity and drops all prior generation candidates.
