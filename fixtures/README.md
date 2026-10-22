# CoinPrint SVG fixtures

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
serialization. Temporary files are created inside this repository and removed on completion.

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
  it is null for invalid/rejected inputs. This is a mesh-volume oracle.
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

## Regression fixtures

`regressions/gumi-coin-dig41.svg` is the unmodified Gumi upload. Whole-file
and isolated `path10` import tests cover its tiny closing edge.

## Current multilayer fixtures

`regressions/gumi-coin.svg` and `regressions/teto-coin.svg` are the unmodified
original uploaded SVGs.
Each contains three Inkscape printing layers with distinct source colors. The
previous single-layer uploads remain in `gumi-coin-dig41.svg` and
`teto-coin-dig42.svg`; their tests still use those original bytes.

`regressions/cases.json` records SHA-256 provenance, layer names/colors/element IDs,
imported region/hole counts, source page size, default generated bounds/volume,
shell counts and required stage outcomes. All four stages (import, generation,
STL and layered 3MF export) must succeed. Run `npm run test:real-coins` for the current
end-to-end tests. They reparse STL bytes and the 3MF ZIP/model without constructing
a large XML DOM, check closed STL topology and compare exact 3MF part meshes.
These automated checks do not establish slicer or physical-print acceptance.
