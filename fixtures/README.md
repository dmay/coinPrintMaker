# CoinPrint SVG fixtures (DIG-6 / M0.1)

These are inputs and independent expected results for future import/geometry work.
They do not constitute a CoinPrint importer or a completed M0 spike.

## Provenance and reproduction

Original artwork was authored procedurally in `scripts/build-fixtures.py` for this
repository; no third-party images, fonts, or downloaded designs are used. The 11
positive-import documents were opened and saved as Inkscape SVG using **Inkscape
1.2.2 (b0a8486541, 2022-12-01)**, preserving named Inkscape layers and nested groups.
These are CLI-authored/saved documents, not claimed to be hand-drawn GUI sessions.
The 10 parser/preflight negatives are explicit synthetic mutations and are not
resaved, since normalizing them could repair or remove the condition under test.

```sh
python3 scripts/build-fixtures.py
python3 scripts/check-fixtures.py
```

Rebuilding needs Python 3 and Inkscape on PATH. Verification additionally needs
Pillow (`python3 -m pip install Pillow` in your development environment). Use the
recorded Inkscape version for byte-stable regeneration; other versions can change
serialization. No application build or package manager has been introduced.
Temporary files are created inside this repository and removed on completion.
All retained SVGs, expectations, previews, tooling and verification evidence live
here. Root `index.html` and the existing Pages arrangement are unchanged.

## Coverage and intended stack order

DOM layer order is the explicit bottom-to-top **test convention**, not a claim
about Inkscape's visual stacking UI. Names/IDs are preserved in each JSON oracle.
Nested ordinary groups never add printing layers.

| SVG stem | Layer names in physical order | Expected result |
| --- | --- | --- |
| sun-medallion | Base → Gold field → Sun | Valid; three nested circular terraces |
| monogram-o | Base → Plaque → Letter O | Valid; outlined O with nonzero counter |
| twin-stars | Base → Blue field → Twin stars | Valid; two disconnected polygons in one tier |
| overlapping-shapes | Base → Overlapping bars | Valid; union area 320, not summed area 384 mm² |
| letter-o-evenodd | Base → Letter O | Valid; same-winding contours with evenodd hole |
| offset-nested-transforms | Base → Transformed tile | Valid; offset viewBox, nonuniform scale, rotation, translation |
| pixel-units | Base → Inset | Valid; CSS px root dimensions vs independent viewBox units |
| edge-sharing | Base → Shared edge | Support passes; later mesher must prove shared-edge manifoldness |
| outside-rim | Base → Outside rim | Parses; support fails, even though upper area is smaller |
| over-lower-hole | Base → Ring → Unsupported center | Parses; fails immediate-lower support despite base underneath |
| bezier-ellipse | Base → Ellipse and curve | Valid; ellipse and quadratic Bézier with actual extrema |
| unsupported-live-text | Base → Unsupported artwork | Reject live text |
| unsupported-stroke-only | Base → Unsupported artwork | Reject stroke-only geometry |
| unsupported-open-path | Base → Unsupported artwork | Reject open filled contour (even though SVG renders implicit closure) |
| unsupported-mask | Base → Unsupported artwork | Reject mask |
| unsupported-clip-path | Base → Unsupported artwork | Reject clipping |
| unsupported-gradient | Base → Unsupported artwork | Reject gradient as material artwork |
| unsupported-embedded-image | Base → Unsupported artwork | Reject embedded raster |
| unsupported-external-reference | Base → Unsupported artwork | Reject external reference; never fetch it |
| unsupported-script | Base → Unsupported artwork | Reject script without executing it (fixture script is inert) |
| malformed-xml | No recoverable stack | Reject truncated XML |

## Reading expected results

`expected/<stem>.json` is the machine-readable oracle for `svg/<stem>.svg`.
Numbers are analytical geometry, not snapshots from the proposed app pipeline.

- All pages are **40 × 40 mm**. `boundsMm` is `[minX,minY,maxX,maxY]` in
  page-relative SVG axes (+Y down). A later Y-up/centered canonical model must
  transform these explicitly; do not compare unlike coordinate systems.
- Layer `order` is zero-based; base is 1.6 mm and artwork tiers are 0.4 mm.
  Z starts at zero and accumulates through active tiers.
- `areaMm2` is unioned filled area after holes, in physical mm². `regions` and
  `holes` describe intended normalized planar topology, not raw object counts.
- `supportedByPrevious` checks the immediately lower tier: null on base,
  true when fully contained (boundary included), false when unsupported.
- `analyticalVolumeMm3` sums footprint area × tier thickness for valid stacks;
  it is null for invalid/rejected inputs. This is a future mesh-volume oracle,
  not evidence of mesh generation or manifoldness.
- `expectedDiagnostics` names describe failure categories. Only
  `SUPPORT_OUTSIDE_LOWER` is already specified by the design; other spellings
  are fixture labels, not decisions freezing the application's diagnostic API.
- Rejected inputs have no geometry metrics: omitted material must not silently
  become a partial export. `intendedLayerOrder` still records source labels.
- `exportAllowedAfterGeometryValidation` describes intended eligibility, subject
  to successful later mesh checks. It never proves the current app can export.

Area derivations include circles (`πr²`), rectangles, rectangle union subtraction,
outlined O (`18×22 − 10×14 = 256`), ring (`28² − 12² = 640`), star shoelace
area (`68` each), and quadratic segment (`48`) plus ellipse (`24π`). Layer bounds
and support reasoning are also documented in each oracle's notes.

`sun-medallion` is the first **physical-print candidate**: 40 mm diameter,
2.4 mm total height, broad terraces, no fine text, 1.6/0.4/0.4 mm tiers, intended
for a 0.2 mm layer-height trial. `monogram-o` and `twin-stars` are the other two
realistic sample designs. Their previews are in `previews/`; the overview is
`previews/sample-coins.png`. Colors communicate tier intent only.

## Verification and deferred acceptance

`verification.json` records the latest successful check and all 26 per-layer
measurements. The verifier checks XML well-formedness (and intended failure),
unique IDs, layer IDs/names/order, physical page size, cumulative Z arithmetic,
oracle consistency, and independent Inkscape bounds and antialiased raster areas.
Bounds tolerance is 0.001 mm; raster-area tolerance is max(0.15 mm², 0.3%).
Raster area is approximate and does not replace analytical oracles.

Unsupported/hostile inputs are inspected as XML only and never rendered. The
verifier does not implement SVG preflight rejection, containment, polygon topology,
meshing, or exports. Expected support/topology remain analytical test targets for
DIG-7 and later geometry tasks. Hiding the middle tier in the hole case should
make the center supported by the base; the sample medallion remains supported
when its middle tier is hidden. Both compressed stacks are 2.0 mm high.

**At fixture creation (DIG-6), downstream acceptance was not run.** Subsequent
DIG-8/DIG-9 work generated and checked paired STL/3MF samples. On 2026-10-18 dmay
confirmed all six pairs imported correctly and sliced without defects in
OrcaSlicer 2.4.2 build 8500fcdc; see the
[M0 worksheet](../docs/m0-slicer-validation.md) for the written evidence and
explicit export-only scope decision. This satisfies M0, not later production or
physical-print acceptance. Original generated verification data is unchanged.

Source baselines: `coinprint-requirements-tech-assessment-mvp-plan.md` §3/§6 and
`coinprint-technical-design-p0.md` §9, both dated 2026-10-17. No architecture
proposal was changed by this fixture-only task.
