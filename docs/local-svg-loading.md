# Local SVG loading (DIG-12)

The page selects a local file with a browser file input. The File API reads bytes
on the device; there is no upload, backend, remote processing or runtime CDN.
The filename and MIME type are picker hints, not content validation. A valid SVG
with another extension/MIME can load; a non-SVG called .svg is rejected.

## Loading boundary and replacement

app/src/import/readLocalSvg.ts returns either a loaded SourceDocument or rejected
document diagnostics. The source is plain JSON data: a new UUID import identity,
filename, actual byte length and UTF-8 XML text. A UTF-8 BOM is consumed by the
decoder. Source text is never mounted, used as an image or evaluated. The detached
XML DOM is discarded after format/budget checks.

This is a loading stage, not an ImportedCoin or authorization to generate/export.
Security and unsupported-artwork preflight (DIG-13), Inkscape layer extraction
(DIG-14), units/transforms (DIG-15) and polygon normalization (DIG-16) must succeed
before a future complete import transaction can replace a canonical coin. No
dummy layers, physical dimensions or geometry are created here. The minimal UI
explicitly describes this boundary.

The pure core/localImport.ts transition preserves the previous source object
while reading and on failure. Each selection gets a monotonically increasing
request identity. Only the newest selection may commit its result or diagnostics;
older success/failure completions are ignored, including after the newest failure.
A successful replacement atomically swaps the whole source and clears errors.
Closing the file picker is a no-op. Resetting its value after selection permits
retry/reload of the same file. Each successful read has a fresh source UUID.

## Provisional loading budgets

All limits are inclusive and failures identify the exceeded limit.

| Budget | Provisional maximum | Rationale |
| --- | --- | --- |
| Original source bytes | 2 MiB (2,097,152 bytes) | Bounds allocation and XML parser input before decoding/parsing; checked before reading and against actual returned bytes. |
| XML elements | 10,000, including SVG root | Bounds later traversal/object work; includes foreign/metadata elements. |
| Element depth | 64, root at depth 1 | Discourages pathological nesting and bounds downstream ancestry work. |
| Aggregate SVG path d attribute length | 500,000 UTF-16 code units | Bounds text passed to later path parsing; summed across paths so splitting paths cannot evade it. |

These are cautious initial loading budgets, not measured responsiveness guarantees
or final polygon/mesh limits. The source-byte limit applies before parsing;
element/depth/path limits apply to the detached parsed XML, using an iterative
walk. The current authored corpus has maxima of 1,568 bytes, 11 elements, depth 6
and 48 path-data characters, so it does not establish realistic upper performance
bounds. Revisit budgets using representative artwork and browser timing/memory
measurements during later production import/UI work. Later path command,
flattened-point, polygon and mesh budgets remain necessary.

Supported text encoding is strict UTF-8, optionally BOM-prefixed or declared
UTF-8/UTF8. Invalid UTF-8 bytes (including UTF-16 BOM input) and non-UTF-8 XML
encoding declarations receive SOURCE_ENCODING_INVALID with save-as-UTF-8 guidance.
Empty/whitespace, local read failure, wrong root/namespace, malformed XML and
over-budget content have actionable diagnostics. DTD/DOCTYPE input is rejected
before XML parsing to avoid entity/external subset processing; the conservative
text check also rejects a DOCTYPE string inside a comment. Save a plain SVG
without a DTD/custom entities to resolve it. This narrow parsing guard is not a
claim of complete SVG security preflight.

## Verification

Vitest checks successful Unicode/UTF-8/BOM reading, content over filename/MIME,
fresh identities/JSON data, actionable input errors, all inclusive cap boundaries,
pre-read over-cap rejection, aggregated paths and malformed/DTD input. Pure
transition and rendered React control tests cover failed/successful replacement,
stale success/failure races, newest failure followed by stale success, cancellation,
same-file retry and escaped filenames. Active source content stays detached data;
it is not mounted/executed/fetched. These Node/jsdom tests exercise browser API
contracts and rendered control behavior; they are not real-browser performance,
cross-browser or complete security acceptance.

A separate headless Chrome 153.0.8010.48 smoke check on 2026-10-18 exercised the
actual bundled loader with browser File objects: Unicode SVG loaded, mismatched
XML returned MALFORMED_XML, and non-SVG XML returned SOURCE_NOT_SVG. Chrome emits
an XHTML parser-error document, while jsdom uses Mozilla's parser-error namespace;
the loader and a regression test cover both without misclassifying authored
parsererror elements inside valid SVG XML. This is a bounded native parsing/API
smoke check, not full picker automation or cross-browser acceptance.
