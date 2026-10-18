# Joint M0 STL / 3MF validation — DIG-8 and DIG-9

**Status: NOT RUN.** Complete this worksheet during the same OrcaSlicer session
for both formats. Coding ahead of DIG-8's last check was explicitly authorized;
the DIG-8 → DIG-9 → M1 acceptance dependency remains. Do not mark issues Done
or D-06/D-07 confirmed until observations and evidence are recorded.

## Session record

| Field | Recorded value |
|---|---|
| Operator / date | Pending |
| Repository commit / sample SHA-256 from 3MF report | Pending |
| Exact OrcaSlicer version / OS | Pending |
| Printer / nozzle / filament profiles | Pending |
| Process profile / nominal layer height | Pending; test 0.2 mm |
| First-layer height / variable layer settings | Pending |
| Exact open/import commands and responses to dialogs | Pending |
| Evidence paths (screenshots, saved project, slice results) | Pending |

Put captured evidence in `spikes/layered-3mf/evidence/` (create only when actual
evidence exists), and link the paths from the rows below and both Linear issues.
Retain the original generic packages; save OrcaSlicer projects to distinct paths.
The generated verification report deliberately stays automated-only. Record
manual results here so regeneration cannot erase them.

## Procedure to exercise and record

1. Record the environment above. Start from a clean plate for each sample/format;
   do not auto-arrange or independently move parts while checking placement.
2. Import `spikes/tiered-stl/samples/sun-medallion.stl`. Record the exact action
   and every prompt/warning. Verify **40 × 40 × 2.4 mm**, base at Z0 and no
   unexpected repair. Slice; inspect the base and transitions at 1.6 and 2.0 mm.
3. Open/import `spikes/layered-3mf/samples/sun-medallion.3mf` on a clean plate.
   This is a generic model, not a configured Orca project. Record the chosen
   command and response to any “geometry/project” or multipart prompts; do not
   assume a particular dialog exists in the installed version.
4. Inspect the object tree: seek **one coin object with separately selectable
   named Base / Gold field / Sun parts**. Record the actual tree. Verify overall
   **40 × 40 × 2.4 mm** and absolute tier intervals **[0,1.6], [1.6,2.0],
   [2.0,2.4] mm**. Check that upper parts were not dropped to the bed, recentered
   or independently arranged. Global placement of the complete coin is acceptable.
5. Record displayed colors **before** manual assignment. Configure the printer's
   available filaments and explicitly map each part to a slot. Record the exact
   UI steps and table below; appearance alone does not establish filament mapping.
6. Slice with the recorded profile. Inspect toolpaths, holes, supported islands,
   tier transitions, missing features, repair warnings and actual filament usage.
   Record observed layer numbers/heights; first-layer settings can affect them.
7. Save the imported 3MF as a new OrcaSlicer project. Close/reopen it and repeat
   name/part selection, dimensional/Z, filament mapping and sliced preview checks.
   Record any change or loss. Preserve the project and supporting screenshots.
8. Repeat paired STL/3MF checks for all rows below. For twin stars, specifically
   confirm that **both stars are one logical selectable layer part** containing
   two correctly positioned shells. For O cases, inspect the counter across
   relevant Z layers; the solid base underneath is intentional.
9. Summarize results, warnings, D-06/D-07 conclusions, remaining risks and any
   revised packaging. Attach links in DIG-8/DIG-9. A repair, lost part, failed
   slice, wrong scale or moved elevated layer requires investigation/retest or
   an explicit recorded replan before M1.

## Sample results

| Sample | Expected mm | STL scale / repair / slice | 3MF parts / Z / repair / slice | Reopen / mapping | Evidence |
|---|---|---|---|---|---|
| sun-medallion | 40 × 40 × 2.4 | Pending | Pending | Pending | Pending |
| monogram-o | 40 × 40 × 2.4 | Pending | Pending | Pending | Pending |
| twin-stars | 40 × 40 × 2.4 | Pending | Pending | Pending | Pending |
| letter-o-evenodd | 40 × 40 × 2.0 | Pending | Pending | Pending | Pending |
| edge-sharing | 40 × 40 × 2.0 | Pending | Pending | Pending | Pending |
| overlapping-shapes | 40 × 40 × 2.0 | Pending | Pending | Pending | Pending |

For three-tier samples Z intervals are [0,1.6], [1.6,2.0], [2.0,2.4] mm;
two-tier samples stop at 2.0. All start at Z0. Geometry identities and per-part
metrics: `fixtures/layered-3mf-verification.json` and
`fixtures/tiered-stl-verification.json`.

## Manual filament mapping (sun-medallion)

| Imported part | Requested display color | Observed import color | Assigned slot / material | Preserved after reopen? |
|---|---|---|---|---|
| Base | #242424 | Pending | Pending | Pending |
| Gold field | #D4AF37 | Pending | Pending | Pending |
| Sun | #F5F5F5 | Pending | Pending | Pending |

Record equivalent mappings for other tested samples with evidence. Automatic
mapping is not required; a reliable documented manual workflow is acceptable.

## Decisions and gate

| Item | Result |
|---|---|
| DIG-8 STL mm / no unexpected repair / successful slice | Pending |
| D-06 accepted packaging + exact import/re-save steps + multi-shell behavior | Pending |
| D-07 color preservation + exact manual filament mapping steps | Pending |
| Remaining risks / changes and retest needed | Pending |
| M0 end-to-end sample successfully sliced | Pending |
| Blockers resolved or explicit replan linked before M1 | Pending |

Physical-print acceptance remains a later gate; this session does not claim it.
