# M0.4 layered 3MF spike (DIG-9)

**M0 prototype accepted, 2026-10-18.** dmay confirmed all six paired STL/3MF
samples loaded correctly and sliced without reported defects in OrcaSlicer
2.4.2 build 8500fcdc. D-06/D-07 are accepted under the operator's scope decision:
CoinPrint produces a correct generic 3MF and validates initial loading; subsequent
slicer project handling, UI names/colors and filament assignment are outside
export acceptance. No untested operation is claimed passed.

Run `npm ci --ignore-scripts`, `npm run spike:3mf`, then `npm test` (Node 24.19.0;
Python 3 is used only by an independent ZIP/XML test). Generation retains six
`samples/*.3mf` packages and `fixtures/layered-3mf-verification.json` in this repo.
`node scripts/check-layered-3mf.mjs --check` verifies retained bytes and metrics
without rewriting them. No new dependencies or published-page build changes.

## Package candidate to test

| ZIP entry | Purpose |
|---|---|
| `[Content_Types].xml` | OPC content types for relationships and model |
| `_rels/.rels` | StartPart relationship to `/3D/3dmodel.model` |
| `3D/3dmodel.model` | Core namespace, explicit millimeters, materials, named meshes, assembly and build |

Resource 1 is a base-material group. Resources 2..N+1 are named layer meshes;
resource N+2 is a components-only coin assembly. The build has exactly one item,
referencing that assembly. Components reference layer meshes, never separate
build items. All vertices have absolute page-relative XY and cumulative Z;
there are no positioning transforms or per-part recentering. Upper parts start
at 1.6 or 2.0 mm, not Z0. Coin min Z is zero.

Every layer is capped independently, with touching interface faces between tiers
and no volumetric overlap. This differs intentionally from the unified exterior
STL. Multi-island artwork stays in one named mesh containing multiple closed
shells; each shell is validated before export. The complete stack also passes
DIG-8's support and unified-coin checks. Hole walls, exact shared boundaries and
overlap union use the existing pinned geometry implementation.

`write3mf(layers, {name})` rebuilds/validates the supplied layer snapshot, then
returns bytes. It reads no DOM, renderer, filesystem or network. Names are XML
escaped; invalid XML characters/colors and unsupported stacks throw before bytes
are returned. Production revision/token gating remains a later application task.

The harness explicitly configures a three-color palette: #242424, #D4AF37,
#F5F5F5. This overrides SVG paint for the spike (a layer called “Blue field” can
therefore be gold). It tests configurable display intent, not SVG color extraction.
The writer emits opaque sRGB `displaycolor` and object `pid`/`pindex` references.
These are generic model properties, **not printer filament assignments**. There
are no OrcaSlicer presets, machine settings or vendor project metadata.

Packaging uses the fflate already bundled in pinned `three@0.186.1`, with ZIP
STORE and fixed 1980 timestamps for reproducible bytes. This is a fixture-scale
choice, not a production compression/performance decision.

## Evidence and limits

Tests cover ZIP/XML structure and namespaces, resource references, XML escaping
and Unicode, millimeter units, absolute Z intervals, closed shells, positive
volume and summed part volume against reparsed STL facets. All six retained
packages load as one assembly in pinned Three.js `ThreeMFLoader`; a synthetic
case also checks decoded names and display color. Python's independent `zipfile`
and XML parser check ZIP records, CRCs and XML for all six packages. Regeneration
must reproduce retained bytes and metrics. Outside-rim and over-lower-hole stacks
are rejected. None of these checks establish OrcaSlicer interoperability or
constitute full XSD/OPC conformance certification.

| Sample pair | Size mm | Layers | Special case |
|---|---|---:|---|
| sun-medallion | 40 × 40 × 2.4 | 3 | First slice candidate; nested disks |
| monogram-o | 40 × 40 × 2.4 | 3 | Counter hole in upper O |
| twin-stars | 40 × 40 × 2.4 | 3 | Two shells in one named artwork part |
| letter-o-evenodd | 40 × 40 × 2.0 | 2 | Same-winding evenodd hole |
| edge-sharing | 40 × 40 × 2.0 | 2 | Exact shared rim segment |
| overlapping-shapes | 40 × 40 × 2.0 | 2 | Same-layer union |

Corresponding STL files are in `../tiered-stl/samples/`. See the joint
[OrcaSlicer worksheet](../../docs/m0-slicer-validation.md) and
[decision log](../../docs/design-decisions.md). The operator confirmed generic
assembly import, separately selectable aligned layers, multi-shell artwork,
elevated-part preservation, intact holes/features, correct mm scale, no unexpected
repair and successful slices. OrcaSlicer showed no special part names or colors;
no multi-filament configuration was present. The cause is not established. Names
and display-color intent remain in the package and are independently checked.
Manual mapping and re-save/reopen were not tested and are outside the revised
acceptance scope. Written operator observations are retained; screenshots/projects
are not. Automated report status fields remain historical generator output; use
the worksheet for the completed manual acceptance. Production exports are checked
again in M4, and physical-print acceptance remains a separate later gate.

Primary format reference: [3MF Core specification](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md),
chapters 2, 4 and 5. D-06/D-07 record the observed
OrcaSlicer limits and accepted package/initial-import boundary. This does not
claim full XSD/OPC conformance certification or universal consumer compatibility.
