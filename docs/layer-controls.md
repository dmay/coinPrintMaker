# Accessible layer controls (DIG-25)

`LayerPanel` reads the existing Zustand editor store; `LayerRow` receives the
committed setting for its stable source ID. Order, enabled state, opaque display
color, thickness and selection use only the store's public actions. No second
settings model, SVG import, renderer, Worker or exporter is introduced. Rows are
keyed by import identity plus layer ID: reorder preserves drafts/controls while a
successful replacement resets them atomically. Rejected replacements retain them.

The list is the current printing order, bottom to top. The base remains first,
always enabled, with no hide or movement control. Its color and thickness remain
editable. Raised tiers have a Show tier checkbox, pointer drag handle, and native
Move toward base / Move toward top buttons. Focus within a row selects its stable
ID; the selection button exposes aria-pressed. Reorder focuses that row's retained
selection button (including when the movement button becomes disabled) and
announces its name and new raised position. Labels and focus remain independent
of source indices. All interactive targets have at least 44 px effective height;
controls have visible focus outlines. Imported measurements remain available in
a labeled disclosure and never become current generation measurements.

## Numeric edit protocol

Thickness uses a local text draft and decimal keyboard hint, rather than a number
input that erases incomplete browser input. Every change updates text only.
The complete trimmed token must match positive decimal syntax (optional leading
plus, decimal point and complete scientific exponent), convert to a finite number,
and be greater than zero. Blanks, partial signs/exponents, hexadecimal, trailing
junk, zero, negatives and overflow do not commit. No parseFloat prefix acceptance.

- Enter commits a valid number once without moving focus. Blur commits the same
  way; an unchanged subsequent blur is a store no-op.
- Invalid Enter or blur retains the exact text and previous committed setting.
  aria-invalid and associated guidance identify the correction and committed mm
  value. It never silently substitutes, clamps or commits a malformed prefix.
- Escape restores the latest committed thickness text and clears the local edit.
- Successful source replacement remounts rows with new defaults. Editing pauses
  during a pending replacement; no draft enters the generation request.

Color uses the native opaque type=color picker. A defensive #RRGGBB check precedes
setColor. The existing store proves geometry equivalence and reuses checked
meshes for color-only edits; controls add no geometry path or filament policy.

## Drag and current geometry

Pointer capture supports mouse, pen and touch on the handle; touch-action:none
is limited to the handle, leaving the rest of the page scrollable. Moving shows
a drop-position indicator. Releasing commits one permutation of raised IDs;
Escape, pointer cancellation or lost capture abandons it. A frame loop scrolls
near viewport edges and refreshes row bounds, so long stacks can be reordered on
narrow screens. Move buttons provide both keyboard and single-pointer alternatives.
The base never enters the sortable permutation. There is no added drag dependency.

The production store still runs complete generateCoin for order, visibility and
thickness. Current enabled adjacency/support and cumulative Z are recomputed from
committed settings; hidden tiers contribute no height. Height and row Z intervals
are displayed only from selectCurrentGeneration. Pending edits show unavailable
current intervals, and rejected geometry exposes diagnostics without old checked
values. Pending replacement also pauses controls and removes current measurements.
No export button is enabled by these controls; serializers remain M4.

## Verification and limits

Sixteen component integration cases exercise complete decimal validation,
Enter/blur/Escape, atomic revisions, source identity, retained malformed drafts,
selection/focus/settings through reorder, pending replacement/reimport, opaque
color mesh reuse with no extra engine execution, captured mouse/touch event
release/cancellation, and real-engine support/Z transitions. A nested stack is
valid, becomes invalid after putting the wider tier above the narrower one,
recovers when the narrower obstructing tier is hidden, and fails again on show.
The recovered intervals are base [0,1.6] and middle [1.6,2.35] mm after a .75 mm
edit; source is not reimported. Pointer events in component tests are synthetic;
they establish handler behavior, not native device or picker acceptance.

Typecheck, 736 Vitest cases plus 22 retained Node tests, build:pages and check:pages
pass. Root index.html and generated assets stay synchronized; main/root Pages
hosting is preserved. The production JavaScript is 535.27 kB (164.47 kB gzip) and
retains the existing >500 kB build advisory. Profiling remains DIG-27. Browser acceptance was confirmed by the user in this chat after the production
test handoff at http://127.0.0.1:4174/coinPrintMaker/. This is operator-reported
evidence, not agent-observed native-browser evidence; no detailed hardware,
picker, touch-device or cross-browser observations are inferred from it.
Final-head CI is recorded in the issue/PR handoff. This work
makes no cross-browser, physical touch hardware, scene, slicer or print claim.
Unavailable original Library baselines are not represented as inspected.

DIG-26 native integration amendment: the browser's fill + Enter path exposed a
stale draft-closure read in the existing thickness control (Tab/blur committed).
Enter and blur now parse event.currentTarget.value using the same complete-token
validator and store action. Two targeted cases cover element-value delivery before
a draft render, actual regenerated height, one revision and no duplicate blur
commit. The change adds no setting or geometry policy.
