# Export options — DIG-31

Both toolbar buttons open a native modal with STL/3MF format choice, editable
filename and the final safe download-name preview. The selected format controls
the suffix, stripping repeated SVG/STL/3MF suffixes before applying the existing
portable filename policy (NFC, forbidden characters, controls, reserved Windows
names and bounded UTF-8 length). Empty names become `coin`. Cancel or Escape
closes the dialog; focus returns to the initiating control if it is still connected.
The filename receives initial focus. The modal scrolls at narrow/short sizes.

STL is a single checked external surface without colors or layer identities.
STL has no units; CoinPrint coordinates use millimeters. 3MF is a generic Core
model in millimeters containing named closed layer parts and best-effort opaque
sRGB display-color intent. It is not an OrcaSlicer project. Consumer UI names and
displayed colors, filament/extruder assignment, printer configuration and slicer
re-save/reopen behavior remain outside CoinPrint export acceptance. No vendor
project metadata or tested filament mapping workflow is introduced.

## State and serialization boundary

The dialog retains choices only, never a mesh or generated snapshot. Every submit
calls `exportCurrentCoin`, which resolves `selectExportableGeometry` and source
identity at that moment. It passes the exact checked unified mesh/metrics to the
existing STL serializer or the exact checked `ValidGeneratedCoin` to `serialize3mf`.
After serialization it rechecks snapshot reference, source revision and source
reference before invoking any download side effect. Reentrant geometry edits,
color revisions, import starts, source replacement or source-revision changes
discard the captured bytes. Unsupported runtime formats fail before a serializer.
Importing, pending, stale, invalid and `previousValid` results cannot export.

Availability/status remain live while the modal is open. A later checked revision
is resolved on submit; prior geometry is never retained by opening the modal.
Errors are bounded, keep choices for retry and do not alter the domain store.
The earlier `exportCurrentStl` API retains its behavior and regression coverage.

DIG-30 already owns valid Core base-material resources, ordinal names, opaque
display colors, `pid`/`pindex` and stable part IDs. DIG-31 uses that writer unchanged.
The store's existing proven color-only projection advances the exact current
settings revision and tier/part colors while retaining checked meshes/metrics;
no clipping, tessellation or geometry job is required. Renderer buffers are never
export inputs. Serializer validation still runs at the export boundary.

## Browser download boundary

`createFileDownload` uses `model/stl` or `model/3mf` Blob MIME hints plus the safe
format suffix. MIME/suffix cannot guarantee OS associations, a saved file or
consumer compatibility. The established `createDownload` STL wrapper delegates
to the same browser lifecycle. A hidden connected anchor is removed after the
click; its Object URL is revoked once on the next task, independently of component
lifetime. Setup/click/scheduler failures revoke immediately. Retrying uses a fresh
URL. A successful action means bytes were offered to the browser, not an OS save.

## Evidence and limits

Full local unit suite: 915 passing tests (34 added), including both-format stale
and reentrant checks, runtime format rejection, filename/MIME/URL failures,
real store-to-3MF XML colors/references and unchanged geometry job count, current
visibility/thickness, open-dialog current color/replacement-source export,
format/name controls, availability, modal cancellation/focus and bounded retry.
The jsdom suite shims fflate input typed-array realm only: Node TextEncoder and
jsdom otherwise differ. Production serialization is unchanged; browser evidence
below independently exercises the actual bundled writer.

`npm run typecheck`, `npm run build:pages`, `npm run check:pages` and
authored-source `git diff --check` pass. The generated Three.js shader strings
retain vendor trailing/indent whitespace; generated assets are kept byte-identical
to the guarded build. Local Windows legacy suite: 18 pass, 3 fail, 1 skipped.
Two unchanged build tests encounter sandbox temporary-directory EPERM renames;
the historical M0 3MF fixture audit sees CRLF bytes versus expected LF; creating
symlinks is unavailable. Historical fixtures, Git configuration and build tests
were not changed. Linux PR CI is the full-suite acceptance check.

[Retained browser report](evidence/dig31-export-options.json): 2026-10-21 UTC
(2026-10-20 Pacific), Windows IAB Chromium 155.0.0.0, 1280×720, DPR 1.5.
The actual generated root app was served under `/coinPrintMaker/`; the report
records JS/CSS/worker hashes both before and after. Final runtime files are
`index-B0t3Sm13.js`, `index-Ykw3pbRH.css`, `generation.worker-TshlSad9.js`.
The local developer observer delayed worker assets 150 ms to expose pending state.

The 53-check workflow uses synthetic fixture File/events and intercepts actual
anchor actions. It audits exact current STL float32 coordinates, 3MF XML current
part count/names/IDs/colors/references and coordinates, safe filenames/MIME,
color-only mesh/token reuse, hidden tiers, format changes, browser-failure retry,
open-dialog stale-submit gating, rejected replacement and invalid geometry.
Six more checks load the same generated app in a 320×720 iframe, verify native
modal/focus/guidance and no horizontal document overflow (scroll width 305;
dialog bounds X19–285.667). The first narrow check exposed a toolbar flex width
that forced overflow; allowing export controls to shrink resolved it. A separate
direct browser filechooser automation loaded `twin-stars.svg`, opened the real
3MF modal and verified Escape restores focus to Export 3MF.

Reproduce with `node scripts/verify-export-options.mjs`, open its printed local
prefix URL, and run the two developer check buttons. Reports go to ignored
`.profiling-results/`. The observer is injected only by this local server; it is
not bundled into the published app. Browser action evidence does not establish
native OS picker/touch, assistive-technology acceptance, native save, slicer or
physical-print behavior. IAB WebGL preview was unavailable; no rendering or
performance claim is made. Production target-slicer initial loading remains
deferred by the operator's DIG-30 scope decision, not reported as passed.
