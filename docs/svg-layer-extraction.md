# Named layers and shape extraction (DIG-14)

`findInkscapeLayers` discovers actual SVG `g` elements with Inkscape-namespace
`groupmode="layer"` and a nonblank Inkscape label. Labels remain unchanged Unicode
display text. Layers retain bottom-to-top document order, source IDs and original
root-relative element-child paths. Ordinary groups preserve ancestry without
creating tiers. Nested actual Inkscape layers fail under D-01. Inert definitions,
metadata and editor data cannot create printing tiers. Duplicate nonempty source
IDs anywhere in the document fail, including IDs in unused definitions.

Every identity has a disjoint namespace: `source:<original ID>` when present,
otherwise `path:<dot-separated structural indices>`. A source ID that resembles a
generated ID therefore cannot collide with it. Identities are deterministic for
an unchanged document, independent of display labels and loader path-array order;
stability across edited documents is not promised.

`svgLoaderAdapter(svgText)` runs security/artwork preflight, discovers layers and
extracts a serializable intermediate result. Every preflight-eligible shape must
have an actual layer ancestor. The first named layer remains the base candidate;
no eligible shape there is `BASE_EMPTY`, even when later layers contain artwork.
Empty nonbase layers keep their identities at this stage; canonical import must
apply its eventual empty-footprint policy rather than silently promote a base.

## Detached projection and pinned loader boundary

The adapter constructs a detached SVG containing only eligible shape nodes and
their ancestor groups. Each projected node has an explicit original structural
path marker. Geometry attributes, original IDs, layer metadata and SVG `transform`
attributes remain; SVG namespace prefixes are normalized for the pinned loader.
Original source text and source paths remain unchanged. Preflight-resolved solid
fill and fill-rule are written explicitly per shape. Other painting declarations
are absent: preflight already rejected material strokes and effects and classified
zero-width/zero-alpha strokes, nonpainting fills, hidden and inert artwork.

This projection is necessary because SVGLoader's supported CSS and visibility
behavior differs from preflight's contract. In particular, inline importance,
currentColor, inherit/initial/unset, group suppression and descendant visibility
restoration must follow preflight rather than be reinterpreted by SVGLoader.
Nothing is inserted into the page, executed, loaded as an image or uploaded.

Pinned `three@0.186.1` primary source (`examples/jsm/loaders/SVGLoader.js`) attaches
`userData.node` and the inherited style after transforming each ShapePath. Its
returned `xml` is the parsed SVG root Element. The adapter checks each source node
belongs to that detached root, resolves the original source-path marker, walks
actual Inkscape ancestors to verify ownership, verifies resolved fill/fill-rule,
and requires exactly one returned path per eligible source shape. Missing,
repeated, unknown or misowned mappings reject the entire result. Return array
order never selects a layer or determines source order.

Full supported path-command parameter syntax and primitive data are checked
before the permissive loader, so malformed trailing data or missing parameters
cannot silently become partial artwork. Arc flags and finite numbers are checked;
unsupported, empty and nonfinite loader curves fail. This does not prove simple,
nondegenerate, self-intersection-free or printable geometry. Those checks belong
to canonical polygon and later geometry validation.

## Intermediate coordinates and remaining pipeline

The result contains named layers, source-ordered shapes and plain line, quadratic,
cubic and ellipse curve records. Compound subpaths remain separate contours with
their fill rule. It contains no Three.js object, DOM, flattened polygon, physical
bounds or area, ImportedCoin, mesh, settings or export permission.

`coordinateSpace: 'svg-loader'` means element/ancestor SVG transforms have already
been applied by SVGLoader. The loader is explicitly configured for 96 DPI and px
output units. Root viewport/viewBox offset, physical mm conversion, Y inversion,
transform correctness/restrictions and physical curve tolerance remain DIG-15.
That stage must not apply those element transforms a second time. DIG-16 still
owns canonical polygon normalization, holes/union and a complete import result.
Do not treat these curves as millimeters or bypass those gates. The staged local
SourceDocument loader and its atomic replacement behavior are unchanged; this
adapter is a separate production pipeline stage until complete import is wired.

## Verification

43 new Vitest cases cover all eleven accepted authored fixtures, duplicate labels,
ordinary/nested layers, unnamed/missing layers, duplicate IDs, ID namespace
collisions, empty base, preserved empty upper tier, Unicode and namespace aliases.
They check inherited style precedence/importance and hidden/inert exclusions,
compound contours/all curve kinds, one-time element transforms, complete shape
syntax, and injected missing/reordered/duplicated/bad-node/style/curve mappings.
Existing fixture reports and M0 samples are read-only oracles and remain unchanged.

A native headless Chrome 153.0.8010.48 smoke check on 2026-10-18 ran the Vite-bundled
adapter against native DOMParser/XMLSerializer APIs: all eleven accepted fixture
files, Unicode labels, resolved important/currentColor and restored visibility,
zero-width strokes, malformed shape rejection, hidden script/resource rejection
and detached-only processing passed. Source markup was never mounted, the script
sentinel did not run and the resource probe was not requested. This bounded API
check does not establish full picker automation, cross-browser acceptance,
performance, physical units, polygon validity or export acceptance.
