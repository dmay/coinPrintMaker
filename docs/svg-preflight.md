# SVG preflight (DIG-13)

`preflightSvg(svgText)` parses bounded detached XML and returns a serializable
accepted/rejected result with structured diagnostics. Accepted results identify
eligible source shapes by root-relative element-child paths and report resolved
solid fill/fill-rule. They contain no DOM, Three.js object, polygon or mesh.
`readLocalSvg` runs this check before committing SourceDocument replacement;
errors preserve the exact previous source and accepted warnings survive the
transaction. The UI renders diagnostic text through React, never imported XML.

Preflight acceptance is **not** a complete import, sanitized SVG for embedding, or
permission to export. DIG-14..16 still need layer/shape extraction, complete path
syntax, units/transforms and validated canonical polygons. Later extraction must
honor these eligible paths/styles; it must not reintroduce hidden shapes, traverse
unused definitions as artwork or trust SVGLoader's default visibility behavior.
An empty eligible list remains possible; later nonempty base/layer checks apply.

## Active content and resources

Security checks apply to every element, including definitions, metadata and hidden
subtrees. Reject scripts, event attributes (including namespaced/case variants),
SVG animation, stylesheets, href/src/srcset/poster and xml:base. Both local and
external resource references are unsupported: no use expansion, paint-server
resolution or resource fetching occurs. XML character references are decoded by
the XML parser before attribute checks. Reject CSS escapes, comments and at-rules
rather than trying to normalize obfuscated CSS. Recognized url() references return
specific mask/clip/filter/gradient/paint errors or an external-reference error.

DTD, ENTITY declarations and xml-stylesheet processing instructions are rejected
before DOMParser. The conservative text guard also rejects these strings inside
comments/CDATA. Built-in/numeric XML character references are allowed; undefined
entities and malformed XML fail parsing. Parser-error documents from both
Mozilla/jsdom and Chrome are recognized; authored parsererror elements in inert
metadata are not confused with parser failures.

The shared parser enforces the documented [loading budgets](local-svg-loading.md)
on direct preflight calls too: 2 MiB UTF-8 text, 10,000 XML elements, depth 64 and
500,000 aggregate path-data characters. Traversal is iterative and source order is
stable. Diagnostics shown to callers are capped at 100 plus an omission warning;
all elements are still checked, rejection tracks every error independently, and
at least one actionable error is retained when earlier warnings filled the cap.
These limits are provisional, not measured responsiveness guarantees.

## Artwork versus inert content

Unused defs, symbols, paint servers, masks/clips/filters/markers, title/desc,
metadata and recognized Inkscape/Sodipodi namedview data contribute no artwork.
Their security checks still run. Descriptive metadata text and RDF about/resource
URLs are harmless data; they are not scanned as if they were loading references.
Using an inert definition through a href or url() remains an error.

Visible unsupported text, images, foreign objects, nested SVG viewports, use,
conditional containers and unknown elements fail with guidance. Text should be
converted to paths; images should be traced; masks/clips/filters should become
explicit filled outlines. Only paths, rectangles, circles, ellipses and polygons
are eligible under ordinary g/root containers. Conditional rendering attributes
and transform-origin/transform-box are rejected rather than ignored.

A visible nonzero stroke is an error even when the shape also has a fill: dropping
it would change material. Convert the stroke to a path and union it with the fill,
or remove it. Stroke-only artwork gets its own diagnostic. Zero stroke width or
stroke opacity contributes no stroke. The existing D-01 contract requires each
path subpath to end in Z/z; open paths and polylines need author correction.
SVG itself can implicitly close an open filled contour; this explicit-closure
restriction is a deliberate P0 authoring boundary, not a claim that it has no SVG
fill. This check is command-level closure preflight, not a full path parser.

## Supported style and visibility

The bounded subset resolves presentation attributes, then inline declarations,
with inline !important and last declaration at equal priority. Local values
precede inherited values. Support inherit/initial/unset for the listed properties;
classes alone are inert because stylesheets are rejected. The supported values are:

- Fill/stroke/color: opaque CSS named colors, #RGB, #RRGGBB, comma-separated rgb()
  with numeric or percentage channels, currentColor, and none/transparent as
  nonpainting values. Color does not split print layers or assign filament.
- Fill-rule: nonzero/evenodd. Fill, fill-rule, color, stroke/width and fill/stroke
  opacity inherit. currentColor on color itself inherits the parent color.
- Display: inline/block/none; visibility: visible/hidden/collapse. Descendants may
  restore inherited visibility. Display:none suppresses the entire subtree.
- Object/group opacity: 0 or 1 (also percentages); zero suppresses the subtree and
  cannot be restored by child opacity. Fill opacity zero excludes only that fill
  and may be overridden by a child. Partial opacity and alpha paints are errors.
- Neutral mask/clip-path/filter/marker-start/mid/end none, blend normal, isolation
  auto, vector-effect none, paint-order normal, clip auto and overflow visible are
  accepted. Stroke cap/join/miterlimit style is inert when there is no active stroke.

Unknown/malformed inline CSS, unsupported visibility values and effects are
errors, including on groups. Complex CSS, CSS geometry/transforms, variables and
escaped/commented declarations need flattening in the authoring file. Hidden or
nonpainting supported shapes and hidden unsupported text/images/open elements
produce ARTWORK_IGNORED warnings and are excluded; unsafe references and unsupported
CSS cannot use hidden status to bypass rejection. Inert unused definitions need
no warning. Partial group opacity is conservatively rejected even on empty groups.

## Verification and boundaries

Vitest covers adversarial resources/scripts/events/entities, metadata/defs,
escaped/commented CSS, presentation/inline/inherited precedence and importance,
visibility restoration, group suppression, stroke/fill/opacity distinctions,
closed compounds, diagnostic error/warning limits, direct API budgets and failed
replacement. All eleven previously accepted authored corpus inputs still pass.
Rendered React tests verify warning wording, failure/race handling and that source
markup/filenames cannot become live SVG/script/image content.

A separate headless Chrome 153.0.8010.48 check on 2026-10-18 ran Vite-bundled
production preflight/loading against native File/DOMParser APIs. Unicode source,
style importance/currentColor, visibility restoration, display/opacity suppression,
malformed XML, DTD rejection, hidden scripts/images and atomic failed replacement
passed. No imported SVG appeared in the page, the script sentinel was not run,
and the local resource probe received zero requests. This bounded API smoke does
not establish full picker automation, cross-browser compatibility or performance.
The Library baseline files were unavailable; the live issue and repository
D-01/D-10/D-11 supply this bounded policy.

Primary references: [SVG rendering/visibility](https://www.w3.org/TR/SVG2/render.html#VisibilityControl),
[SVG fill and implicit closure](https://www.w3.org/TR/SVG2/painting.html#FillProperty),
[DOMParser XML/error behavior](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString).
