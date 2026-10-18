# Joint M0 STL / 3MF validation — DIG-8 and DIG-9

**Status: ACCEPTED for the M0 prototype contract, 2026-10-18.** Operator dmay
tested all six paired samples and confirmed in follow-up that “ok” means no
defects to report and all requested verifications passed, subject to the explicit
name/color observations and untested operations below. This is operator-reported
manual evidence, not an agent-observed slicer session.

## Session record

| Field | Recorded value |
|---|---|
| Operator / date | dmay, 2026-10-18 |
| Repository commit | `e2428abec221898380a0ec2430b05c58da8c63aa` (merged prototype) |
| sun-medallion 3MF SHA-256 | `08f4d6105f4994e1155659c6d9586c715064edd830b4df0f051c964c8632b7fc` (local sample matches automated report) |
| Exact OrcaSlicer version | **2.4.2 build 8500fcdc**, confirmed by operator; supersedes the earlier installation-package version inference |
| OS | Windows release 25H2, build 26200.9457 (recorded environment inspection) |
| Saved configuration context | Creality SPARKX i7 0.4 nozzle; Generic PLA; 0.20mm Standard process. Plate overrides, first-layer/variable-layer settings and exact UI commands were not separately recorded. |
| Retained manual evidence | Operator's results in this worksheet and explicit follow-up confirmation, recorded in DIG-8/DIG-9. No screenshots, slicer projects or slice-result files retained. |

## Acceptance scope and operator decision

On 2026-10-18 the operator clarified: “We are not interested with what the slicer
does with the files after it loaded them correctly. Our business is limited to
creating a correct 3MF only.” This explicitly supersedes the original M0
requirements for slicer re-save/reopen, filament/extruder assignment and
preservation of display names/colors in the slicer. These are outside the export
acceptance contract, not deferred prerequisites or passed tests. Exact import
click paths and retained screenshots/projects are not required for this closure;
the written operator observations are the manual record.

CoinPrint must still generate a structurally correct generic 3MF with millimeter
units, closed named layer meshes, correct geometry/absolute Z, one assembly build
item, and valid display-color resources/references. Initial loading must preserve
scale, alignment, separately selectable layers, holes and islands without
unexpected repair. Slicer UI labels/colors and subsequent project or printer
configuration are consumer behavior. No vendor-specific project metadata is
required by this decision. Slice success was actually reported for these samples;
no untested post-import operation is inferred from it.

## Sample results

“Passed” below expands the operator's “ok”: intended dimensions, Z0, cumulative
tier placement, no unexpected repair, successful slicing and no missing or
defective features. For 3MF it also confirms separately selectable aligned layer
parts and no upper-tier drop/recentering. For twin-stars, both correctly placed
stars remain one logical selectable artwork layer. For both O samples, the upper
counter remains open above the intentional solid base.

| Sample | Expected mm | STL scale / repair / slice | 3MF geometry / parts / Z / repair / slice |
|---|---|---|---|
| sun-medallion | 40 × 40 × 2.4 | Passed | Passed |
| monogram-o | 40 × 40 × 2.4 | Passed | Passed |
| twin-stars | 40 × 40 × 2.4 | Passed | Passed; both stars form one selectable artwork part |
| letter-o-evenodd | 40 × 40 × 2.0 | Passed | Passed |
| edge-sharing | 40 × 40 × 2.0 | Passed | Passed |
| overlapping-shapes | 40 × 40 × 2.0 | Passed | Passed |

All samples start at Z0. Three-tier intervals are [0,1.6], [1.6,2.0],
[2.0,2.4] mm; two-tier samples stop at 2.0 mm. Geometry metrics and package
identities are retained in `fixtures/layered-3mf-verification.json` and
`fixtures/tiered-stl-verification.json`.

**Observed consumer limits:** For all 3MF samples, the operator reported that
sub-objects did not show special names and no colors were shown. No multi-filament
configuration was present. This establishes the observed appearance, not its
cause. Filament assignment, re-save and reopen were not tested and are outside
the revised scope. No color or name preservation in OrcaSlicer is claimed.

The packages retain layer names and display-color intent. Source/package checks
and the independent ThreeMFLoader round trip establish that metadata separately
from OrcaSlicer's UI behavior. See D-06/D-07 in
[design-decisions.md](design-decisions.md). Automated reports remain unchanged:
their historical “slicer pending/not run” fields describe the generator's
automated-only record; this worksheet is authoritative for manual acceptance.

## Decisions and gate

| Item | Result |
|---|---|
| DIG-8 STL mm / no unexpected repair / successful slice | Passed for all six samples in OrcaSlicer 2.4.2 build 8500fcdc. |
| D-06 accepted packaging / correct initial loading / multi-shell behavior | Accepted: one assembly, closed per-layer meshes at absolute Z; selectable aligned parts and twin-stars behavior passed. Re-save/reopen excluded by operator decision. |
| D-07 exported color intent / consumer behavior | Accepted: retain valid generic name/color metadata. OrcaSlicer did not show special names/colors; UI preservation and filament mapping excluded by operator decision. |
| Remaining risks / changes and retest needed | No prototype packaging change required by observed results. Production precision, complexity, normalization, self-intersection robustness and cross-version compatibility remain bounded risks; production exports are checked again in M4. Full XSD/OPC conformance certification is not claimed. |
| M0 end-to-end sample successfully sliced | Passed for all six paired STL/3MF samples, operator reported. |
| Blockers resolved or explicit replan linked before M1 | M0 acceptance satisfied under the explicit scope revision recorded here and in DIG-9. DIG-8/DIG-9 can close; no remaining M0 blocker to M1. |

Physical-print acceptance remains a separate later gate; no physical print is
claimed. This closure does not mark production export or later QA tasks complete.
