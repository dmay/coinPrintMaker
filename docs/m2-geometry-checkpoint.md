# M2 geometry checkpoint: implementation evidence and operator-merge condition

At PR handoff, DIG-22 is the final M2 issue. Implemented/tested criteria are recorded here;
M2 is **not complete** before independent operator merge of the DIG-22 PR. No
M3 editor, preview, Worker or later exporter/serializer work starts here. The
agent does not merge. Final SHA/tree/CI live in the PR and Linear handoff rather
than a circular commit-SHA assertion inside its own tree.

## Workstream references

| M2 stage | Issue | Pull request |
| --- | --- | --- |
| Active stack/defaults | [DIG-17](https://linear.app/diggy-01/issue/DIG-17) | [#13](https://github.com/dmay/coinPrintMaker/pull/13), merged |
| Polygon/kernel service | [DIG-18](https://linear.app/diggy-01/issue/DIG-18) | [#14](https://github.com/dmay/coinPrintMaker/pull/14), merged |
| Immediate active support | [DIG-19](https://linear.app/diggy-01/issue/DIG-19) | [#15](https://github.com/dmay/coinPrintMaker/pull/15), merged |
| Positioned parts | [DIG-20](https://linear.app/diggy-01/issue/DIG-20) | [#16](https://github.com/dmay/coinPrintMaker/pull/16), merged |
| Unified exterior | [DIG-21](https://linear.app/diggy-01/issue/DIG-21) | [#17](https://github.com/dmay/coinPrintMaker/pull/17), merged |
| Checked headless generation | [DIG-22](https://linear.app/diggy-01/issue/DIG-22) | Current feature PR; link recorded after creation; operator merge pending |

Started from clean main/origin/main
`ffa26a1f2a40821e86f3c8cdd985b238e73a30d1`, tree
`3e9d221feb6ccef19e2cf4a03dbd90bb3518f0fe`. Preceding M2 issues were live Done;
DIG-22 had no comments and sole prerequisite DIG-21. Original Library baselines
are absent from synced sources; live issue/milestone and repository contracts
govern this bounded checkpoint.

## Exit criterion to tests and evidence

| Live M2 / DIG-22 criterion | Production evidence |
| --- | --- |
| Headless checked parts/exterior/metrics for representative fixtures | generate-coin.test.ts full importer-to-generateCoin tests all eleven accepted imports: nine valid, two unsupported reject. Nested circles sun-medallion, holed monogram-o, offset-nested-transforms and island twin-stars exercise actual production output. |
| Immediate active support, holes, base Z0 | validate-support.test.ts, resolve-stack.test.ts and final fresh-edit tests recompute enabled adjacency. Original base first/locked/Z0 and one region; no clipping/old support trust; supported raised islands. |
| Two opposite edge incidences, outward winding, components | Final suite independent edge/component oracle, existing part/unified independent cyclic vertex links and cap/wall coverage. Shared topology checks every vertex link and each component's positive local-origin volume. |
| No duplicate/internal faces, bad indices, nonfinite/degenerate geometry | Exact adjacency/coplanar crossing/no-contained-vertex, closed self-crossing, nested/overlapping/contacting shells, differently triangulated interfaces. Source-plane chain proof rejects same-metrics relocated holes / shifted layers and reversed/internal caps. |
| Bounds and signed volume match source | Freshly measured emitted footprint expectations, not cached metrics. Relative volume 1e-9; bounds 1e-9 mm + 1e-12 relative; exact semantic coverage additionally enforces source position. Independent ideal SVG curve oracles keep existing 0.003 volume / 0.011 mm coordinate tolerances. |
| Current revision snapshot and metadata | Detached parts/tiers/exterior/metrics/dimensions/emitted area-height volume/internal tier boundaries. Forged order/IDs/name/color/Z/key/footprints and error-bearing builders reject. Same-color interfaces remain; no filament mapping. |
| Failures gate exports and cannot export old valid result | Invalid generation strips every geometry/metrics field; freshness rejects old keys. Invalid key formation gets keyless finite JSON failure. Kernel/cap/builder and aggregate-work failures reject. Serializer coordinate validation remains later. |
| D-03-D-05 resolved before editor | D-17/D-19/D-20/D-21: checked exact shared sides/identical tiers, no shrink/repair, one connected base/unified boundary, supported raised part islands, through holes, rejection of pinches/cavities/internal boundaries. |

## Native bundled runtime evidence

A disposable Vite **production bundle** of 48 actual import/pure-pipeline modules
ran on 2026-10-19 local time in native in-app Chromium, reported Windows
`Chrome/155.0.0.0`. Native DOMParser/XMLSerializer, DataView and BigInt paths ran.
Local fixture data was bundled; no production UI integration was added. The
probe/harness/server were precisely removed afterward.

| Fixture | Result | Unified vertices / triangles | Signed volume mm³ | Aggregate final work | Observed ms |
| --- | --- | --- | --- | --- | --- |
| sun-medallion | valid | 972 / 1940 | 2377.131431516105 | 2,679,668 | 632.7 |
| monogram-o | valid | 422 / 840 | 2403.8852622350155 | 975,626 | 209.4 |
| twin-stars | valid | 816 / 1628 | 2471.7606779160037 | 2,067,596 | 419.2 |
| offset-nested-transforms | valid | 406 / 808 | 2024.685262235016 | 959,489 | 168.5 |
| outside-rim | invalid/no mesh | - | - | before final validation | 1.9 |
| over-lower-hole | invalid/no mesh | - | - | before final validation | 1.1 |

Each supported probe also checked revision-1 invalid thickness without exportable
payload, old-valid freshness rejection, and NaN-revision keyless rejection.
Processing fetches, page errors and console errors: zero. Source SVG markup was
never mounted. This is native headless-core evidence, not picker/editor UX,
cross-browser, serializer, slicer or physical-print acceptance.

The maximum observed 2.68m final work explains the separate 8m validation budget;
the prior 2m construction allowance stays unchanged. Single-run 168-633 ms
observations exceed/approach D-08 / DIG-27's 150-250 ms responsiveness concern.
M3 must profile real editor interaction and make its Worker decision. No Worker
or M3 work starts here, and responsiveness is not established. JS engine sorting
can change exact charged comparison counts. These observations preceded the final
cheap exact-normal assertion and warning-dedup pass; final CI covers final code.

## Verification boundary and limits

Local Node 24.14.0 verification and exact final-head CI are recorded in the
handoff. M0 spikes/fixtures/reports/six sample packages remain unchanged.
Main/root Pages hosting and guarded build/drift checks remain in force.

The supported L-lower plus corner-filling 3x3 upper leaves a point-touching planar
terrace and explicitly rejects; narrower 2x3 passes. Exact binary-incompatible
collinear splits, snap-altered boundaries, near-contact and finite work/ambiguous
containment reject. No silent policy expansion, universal robustness/performance,
new serializer/export, slicer or physical-print claims. See
[headless generation](headless-generation.md),
[unified surface](unified-coin-surface.md) and D-21 for full limits.

At PR handoff, DIG-22 stays In Progress and M2 unfinished pending operator merge.
Only after merged main is verified against the tested PR tree may DIG-22/M2 be
finalized in Linear and clean local main fast-forwarded. Stop at M2; no later
issue is automatically started. The linked Linear issue/milestone record the
final merge/completion state and SHA after independent verification.
