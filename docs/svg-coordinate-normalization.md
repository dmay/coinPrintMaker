# SVG coordinates and physical size (DIG-15)

`import/normalizeSvg.ts` composes detached layer/shape extraction with the pure
`core/svgViewport.ts` and `core/svgNormalization.ts` stages. Success is an
intermediate `status: 'normalized', coordinateSpace: 'canonical-mm'` result:
physical page size, explicit/inferred size origin, original layer/shape identity
and metadata, exact curve records, analytical shape/layer/document XY bounds and
diagnostics. XY is page-relative millimeters, +X right and +Y up. Empty nonbase
layers retain identity and null bounds. Curves and bounds are plain JSON DTOs.

This result is not an ImportedCoin, polygon, mesh or export permission. DIG-16
still owns physical chord-error flattening, contour winding/holes, same-layer
union, polygon validation and atomic complete-import/UI integration. The current
file loader still stages a preflighted SourceDocument; it does not silently accept
this intermediate geometry as a complete canonical coin.

## Page sizing and mapping

Retain D-02's finite positive four-number viewBox requirement, including nonzero
and negative origins. Root width/height support lower-case mm/cm/in/pt/px and
unitless CSS px: 25.4 mm/in, 72 pt/in and 96 px/in. Both declared dimensions must
be finite and positive. Percentages, relative/font units, picas at the root,
malformed/empty dimensions and unsupported units reject as PHYSICAL_SIZE_INVALID.

If either dimension is absent, validate any dimension that is present, then
discard that lone dimension and infer **both** axes: width 40 mm and height
40 mm × viewBox-height / viewBox-width. Do not combine one declared axis with an
inferred axis. Preserve the viewBox aspect ratio and emit SOURCE_SIZE_INFERRED
with the explicit 40 mm policy in the warning. Missing/invalid viewBox never uses
an artwork-bounds guess. Invalid declared dimensions never trigger fallback.

Omitted preserveAspectRatio, `xMidYMid` and `xMidYMid meet` use uniform centered
meet; `none` uses independent axes. Surrounding/repeated whitespace is normalized.
Other alignments, slice, defer and malformed/empty values reject with a corrective
message. There is no implicit crop, layer recentering or fit-to-artwork operation.
The page dimensions do not imply the artwork occupies or fits inside the page.

For viewBox (x, y, w, h), page (W, H), scale (sx, sy):

    tx = (W - w*sx)/2 - x*sx
    ty = (H - h*sy)/2 - y*sy
    canonical(X,Y) = (sx*X + tx, H - (sy*Y + ty))

For meet, sx = sy = min(W/w,H/h). For none, sx = W/w and sy = H/h,
so the centering terms are zero. Apply the page transform once after element
transforms; invert SVG Y exactly once about physical page height. Positions
outside the viewport remain outside; polygon/support decisions belong downstream.

## Strict transforms and affine ellipses

DIG-15 supersedes D-13's loader-applied-transform assumption. The detached loader
projection now contains **no transform or viewport attributes**. SVGLoader remains
the pinned path interpreter and source-node/ancestry mapping boundary, with
preflight-resolved painting authoritative. The adapter validates the complete SVG
transform grammar subset and applies composed transforms to the resulting DTOs,
exactly once. `coordinateSpace: 'svg-user'` now denotes those transformed root user
coordinates; it replaces `'svg-loader'` in the extraction result.

Supported matrix/translate/scale/rotate (including center)/skewX/skewY lists use
SVG column-vector composition: list matrices multiply left-to-right; parent × child
maps child coordinates into root user space. Every required element/ancestor list
is checked for exact arity, finite numbers, finite composed values and a nonzero
finite determinant. Singular transforms, overflow, malformed/trailing data, unknown
operations and degenerate 90° skews reject with an element-located
SVG_TRANSFORM_UNSUPPORTED diagnostic. Complex root transform/x/y arrangements and
active nested SVG viewports remain unsupported; move root transforms into a group.
Transforms on excluded nonprinting/inert artwork do not affect eligible geometry.

Primitive length attributes are normalized before the loader: unitless and px
denote local user units; mm/cm/in/pt/pc convert to local CSS user units at 96 px/in,
then element and viewport transforms act on those values. For example, `1mm` in a
primitive attribute becomes 96/25.4 local user units, not an unconditional 1 mm in
the final page. Outer whitespace is accepted. Percent/relative/unsupported units
reject rather than being partially parsed. Path/polygon coordinates stay unitless.

An ellipse is represented parametrically as:

    point(theta) = center + axisX*cos(theta) + axisY*sin(theta)

Apply affine translation to the center and the linear part to both axis vectors.
Keep start/end angles and clockwise traversal unchanged: reflections and Y
inversion already live in the axes. This represents nonuniformly scaled, rotated,
reflected and sheared partial/full arcs without principal-axis decomposition or
lossy cubic conversion. The downstream flattening error bound must use both axis
vectors (for example, their norm sum bounds the second derivative), rather than
assuming perpendicular axes or positive radii. Parameter sweep follows the pinned
EllipseCurve rule, including full revolutions and wrapped/clockwise intervals.

This change is necessary because the pinned loader's transform parser silently
ignores unknown operations/extra arguments, and its no-skew ellipse shortcut scales
radii without accounting for an existing arc rotation. Its generic full-ellipse
shortcut also preserves old angles after changing principal axes. Bypassing that
transform machinery gives direct analytical/pointwise evidence for the supported
mapping instead of silently distorting source curves.

Analytical curve bounds include endpoints plus interior Bézier derivative roots
and ellipse axis extrema within the actual parameter interval. Bounds measure the
interpreted curves, without flattening/union or a polygon validity claim.
The pinned path interpreter's existing rounded-rectangle Bézier approximation is
retained; exact rounded-corner conversion and its physical error allowance must
be considered with DIG-16's tolerance policy. This task does not claim arbitrary
SVG path interpretation, contour simplicity or printable geometry.

## Evidence and limits

`tests/unit/svg-normalization.test.ts` covers all required root units, 96 DPI,
primitive units including picas, non-square meet/none, viewBox offsets, complete
and partial-dimension fallback, deterministic page origin, transform-list and
parent/child ordering, centered rotation, reflection, skew, malformed/singular/
nonfinite mapping and rejection without partial geometry. Pointwise affine arc
checks include independent path endpoints and 101 parameter samples across five
transform cases. Full sheared/reflected ellipse and Bézier extrema have analytical
oracles. All eleven authored accepted fixtures retain their physical page,
source-layer identity/order and Y-up bounds within the existing 0.011 mm fixture
bound; M0 fixtures, reports and sample artifacts remain unchanged.

A native Chrome 153.0.8010.48 smoke on 2026-10-18 ran a production Vite bundle
against native DOMParser/XMLSerializer: eleven accepted fixtures, six root-unit
cases, fallback warning, meet/none, an affine ellipse, five rejection probes and
three independent native SVG transform-consolidation oracles passed. No imported
source was mounted/executed, no processing network request occurred and no page
error occurred. This establishes bounded native API behavior, not picker/UI,
cross-browser, production performance, polygon, export, slicer or print acceptance.

The synced Library baseline directory remains empty. Implementation follows the
live DIG-15 criteria, available repository contracts and D-01/D-02/D-13; it does
not invent decisions from unavailable baseline sections.

Primary references: [SVG coordinate systems, transforms, viewBox and units](https://www.w3.org/TR/SVG11/coords.html), [CSS absolute lengths](https://www.w3.org/TR/css-values-4/#absolute-lengths), and the pinned installed
`three@0.186.1` SVGLoader/EllipseCurve source. CSS physical unit ratios are fixed;
CoinPrint deliberately uses 96 px/in independently of monitor pixel density.
