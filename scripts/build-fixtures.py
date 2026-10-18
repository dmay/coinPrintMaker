#!/usr/bin/env python3
"""Author deterministic SVG seeds, save positives with Inkscape, write analytical oracles.
No CoinPrint importer or geometry library is used to derive expected results.
"""
import json
import math
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / 'fixtures/svg'
EXPECTED = ROOT / 'fixtures/expected'
# Inkscape namespace uses this historical URL.
INK = 'http://www.inkscape.org/namespaces/inkscape'


def layer(id, name, content, color):
    return f'<g id="{id}" inkscape:groupmode="layer" inkscape:label="{name}" fill="{color}">{content}</g>'


def document(body, size='width="40mm" height="40mm" viewBox="0 0 40 40"', defs=''):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="{INK}" {size}>
<title>CoinPrint original fixture artwork</title><defs>{defs}</defs>{body}</svg>'''


def disk(r, cx=20, cy=20):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}"/>'


def rect(x, y, w, h):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>'


def metric(id, name, area, bounds, regions=1, holes=0, support=True):
    return dict(id=id, name=name, areaMm2=area, boundsMm=bounds,
                regions=regions, holes=holes, supportedByPrevious=support,
                thicknessMm=1.6 if id == 'base' else 0.4)


def base():
    return layer('base', 'Base', disk(20), '#242424')


def bm():
    return metric('base', 'Base', 400*math.pi, [0, 0, 40, 40], support=None)


cases = []


def add(name, body, metrics, *, size=None, defs='', note='', sample=False, print_candidate=False,
        import_outcome='accept', diagnostics=None, inkscape=True):
    total = 0
    for i, m in enumerate(metrics):
        m['order'] = i
        m['bottomZMm'] = total
        total += m['thicknessMm']
        m['topZMm'] = total
    valid = import_outcome == 'accept' and all(m['supportedByPrevious'] is not False for m in metrics)
    cases.append((name, document(body, **({'size': size} if size else {}), defs=defs), dict(
        schemaVersion=1, source=f'fixtures/svg/{name}.svg', physicalPageMm=[40, 40],
        intendedLayerOrder=[m['name'] for m in metrics] if metrics else ([] if name == 'malformed-xml' else ['Base', 'Unsupported artwork']),
        coordinateConvention='SVG page-relative mm, +X right, +Y down; bounds=[minX,minY,maxX,maxY]',
        layers=metrics, importOutcome=import_outcome, expectedDiagnostics=diagnostics or [],
        geometryOutcome='valid' if valid else 'blocked', exportAllowedAfterGeometryValidation=valid,
        analyticalVolumeMm3=sum(m['areaMm2']*m['thicknessMm'] for m in metrics) if valid else None,
        totalHeightMm=total if import_outcome == 'accept' else None,
        realisticSample=sample, physicalPrintCandidate=print_candidate, notes=note,
        provenance='Original procedural artwork authored for DIG-6; opened and saved by Inkscape CLI.' if inkscape else
        'Handcrafted negative mutation for parser/preflight tests; intentionally not normalized by Inkscape.',
        manualAcceptance={'slicer': 'not run', 'physicalPrint': 'not run'}), inkscape))

# Three original, printable coin designs. Layer order is DOM order, bottom to top.
add('sun-medallion', base()+layer('field', 'Gold field', disk(16), '#d8a32b')+
    layer('sun', 'Sun', disk(6), '#fff0b0'), [bm(), metric('field','Gold field',256*math.pi,[4,4,36,36]),
    metric('sun','Sun',36*math.pi,[14,14,26,26])], sample=True, print_candidate=True,
    note='Three nested disks. First print candidate: 40 mm diameter, 2.4 mm high; 1.6/0.4/0.4 mm tiers aligned to 0.2 mm print layers. Minimum radial terrace is 4 mm. Hide field: sun remains supported by base; total height becomes 2.0 mm.')
# Opposite winding for the inner rectangular O counter; evenodd variant below.
o_path = 'M 11,9 H 29 V 31 H 11 Z M 15,13 V 27 H 25 V 13 Z'
add('monogram-o', base()+layer('plaque','Plaque',rect(7,6,26,28),'#347983')+
    layer('letter','Letter O',f'<path fill-rule="nonzero" d="{o_path}"/>','#f2dfb6'),
    [bm(),metric('plaque','Plaque',728,[7,6,33,34]),metric('letter','Letter O',256,[11,9,29,31],holes=1)],
    sample=True, note='Outlined block-letter O, not live text. Counter is 10 × 14 mm; outer body is 18 × 22 mm. Opposite subpath winding under nonzero. Three tiers.')
star1 = '10,12 12,17 17,17 13,20 15,26 10,22 5,26 7,20 3,17 8,17'
star2 = '27,12 29,17 34,17 30,20 32,26 27,22 22,26 24,20 20,17 25,17'
# Shoelace area of each ten-vertex star is 68 mm².
add('twin-stars', base()+layer('field','Blue field',disk(18),'#234e85')+
    layer('stars','Twin stars',f'<polygon points="{star1}"/><polygon points="{star2}"/>','#eeeecc'),
    [bm(),metric('field','Blue field',324*math.pi,[2,2,38,38]),metric('stars','Twin stars',136,[3,12,34,26],regions=2)],
    sample=True,note='Two disconnected polygon stars in one tier; each has analytical area 68 mm². Both fit inside the 18 mm radius field.')
add('overlapping-shapes',base()+layer('art','Overlapping bars',rect(8,12,16,12)+rect(16,16,16,12),'#ad6633'),
    [bm(),metric('art','Overlapping bars',320,[8,12,32,28])],
    note='Union area = 192 + 192 - 64 = 320 mm². Summing object areas is wrong; union is one region.')
add('letter-o-evenodd',base()+layer('letter','Letter O',
    '<path fill-rule="evenodd" d="M11,9 H29 V31 H11 Z M15,13 H25 V27 H15 Z"/>','#ddaa44'),
    [bm(),metric('letter','Letter O',256,[11,9,29,31],holes=1)],note='Same-winding contours with evenodd must preserve the counter.')
# Root: viewBox is twice physical size and has nonzero origin. Nested transform order matters.
add('offset-nested-transforms',
    layer('base','Base','<circle cx="60" cy="70" r="40"/>','#242424')+
    layer('art','Transformed tile','<g transform="translate(40 50)"><g transform="rotate(90)"><g transform="scale(2 3)">'+rect(0,0,6,4)+'</g></g></g>','#44aa88'),
    [bm(),metric('art','Transformed tile',36,[4,10,10,16])],
    size='width="40mm" height="40mm" viewBox="20 30 80 80"',
    note='Subtract root viewBox origin, then scale 0.5 mm/user-unit. Tile: local [0,0,6,4] → scale(2,3) → rotate90 → translate(40,50) → page mm [4,10,10,16]. Nested groups are not printing layers.')
add('pixel-units',layer('base','Base',rect(0,0,96,96),'#242424')+
    layer('art','Inset',rect(24,24,48,48),'#d8a32b'),
    [metric('base','Base',1600,[0,0,40,40],support=None),metric('art','Inset',400,[10,10,30,30])],
    size='width="151.18110236220474px" height="151.18110236220474px" viewBox="0 0 96 96"',
    note='96 CSS px/in and 25.4 mm/in make this a 40 mm page. Root user-unit scale is 40/96 mm; do not treat viewBox units as CSS pixels.')
add('edge-sharing',layer('base','Base',rect(0,0,40,40),'#242424')+
    layer('art','Shared edge',rect(0,10,20,20),'#d8a32b'),
    [metric('base','Base',1600,[0,0,40,40],support=None),metric('art','Shared edge',400,[0,10,20,30])],
    note='Upper and lower share x=0 boundary. Exact support passes; later mesher must stitch shared surfaces and prove manifoldness.')
add('outside-rim',base()+layer('art','Outside rim',rect(34,18,8,4),'#cc2222'),
    [bm(),metric('art','Outside rim',32,[34,18,42,22],support=False)],
    diagnostics=['SUPPORT_OUTSIDE_LOWER'],note='Smaller area does not imply support; artwork extends beyond rim/page.')
add('over-lower-hole',base()+layer('ring','Ring',
    '<path fill-rule="evenodd" d="M6,6 H34 V34 H6 Z M14,14 H26 V26 H14 Z"/>','#aa7733')+
    layer('art','Unsupported center',rect(17,17,6,6),'#cc2222'),
    [bm(),metric('ring','Ring',640,[6,6,34,34],holes=1),metric('art','Unsupported center',36,[17,17,23,23],support=False)],
    diagnostics=['SUPPORT_OUTSIDE_LOWER'],note='Center lies above ring hole: fails immediate-lower support despite support from base. Hide ring: center passes against base, compressed total height 2.0 mm.')
add('bezier-ellipse',base()+layer('art','Ellipse and curve',
    '<ellipse cx="12" cy="20" rx="4" ry="6"/><path d="M22,14 Q34,20 22,26 Z"/>','#aa55bb'),
    [bm(),metric('art','Ellipse and curve',24*math.pi+48,[8,14,28,26],regions=2)],
    note='Ellipse area 24π; quadratic segment area 48. Q control reaches x34 but actual curve maximum is x28; control-point bounds are wrong.')

negatives = {
    'live-text': ('<text x="10" y="22">Coin</text>', '', 'LIVE_TEXT_UNSUPPORTED'),
    'stroke-only': ('<path d="M10,10 L30,30" fill="none" stroke="black" stroke-width="2"/>','','STROKE_ONLY_UNSUPPORTED'),
    'open-path': ('<path d="M10,10 L30,10 L20,30"/>','','OPEN_PATH_UNSUPPORTED'),
    'mask': ('<rect x="8" y="8" width="24" height="24" mask="url(#m)"/>','<mask id="m"><rect width="40" height="40" fill="white"/></mask>','MASK_UNSUPPORTED'),
    'clip-path': ('<rect x="8" y="8" width="24" height="24" clip-path="url(#c)"/>','<clipPath id="c"><circle cx="20" cy="20" r="5"/></clipPath>','CLIP_PATH_UNSUPPORTED'),
    'gradient': ('<rect x="8" y="8" width="24" height="24" fill="url(#g)"/>','<linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>','GRADIENT_UNSUPPORTED'),
    'embedded-image': ('<image x="10" y="10" width="20" height="20" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1kAAAAASUVORK5CYII="/>','','RASTER_IMAGE_UNSUPPORTED'),
    'external-reference': ('<use href="https://example.invalid/never-fetch.svg#shape"/>','','EXTERNAL_REFERENCE_UNSUPPORTED'),
    'script': ('<script>/* inert fixture: reject scripts without executing */</script>'+rect(10,10,20,20),'','SCRIPT_UNSUPPORTED'),
}
for name, (body, defs, diagnostic) in negatives.items():
    add('unsupported-'+name,base()+layer('art','Unsupported artwork',body,'#cc2222'),[],
        defs=defs,import_outcome='reject',diagnostics=[diagnostic],inkscape=False,
        note='Reject at preflight; do not return partial printable geometry. Diagnostic names describe expected categories, not a frozen application API. Intended layers: Base then Unsupported artwork. No geometry oracle for rejected content.')
add('malformed-xml','',[],import_outcome='reject',diagnostics=['MALFORMED_XML'],inkscape=False,
    note='Truncated XML; parser must fail before layer discovery.')


def main():
    version = subprocess.check_output(['inkscape','--version'], text=True).strip()
    for name, source, expected, saved in cases:
        target = SVG / f'{name}.svg'
        if name == 'malformed-xml':
            source = '<svg xmlns="http://www.w3.org/2000/svg"><g><path d="M0,0'
        if saved:
            with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
                seed = Path(tmp)/'seed.svg'
                seed.write_text(source)
                subprocess.run(['inkscape',str(seed),f'--export-filename={target}',
                                '--export-type=svg','--export-overwrite'],check=True,capture_output=True)
            expected['inkscapeVersion'] = version
        else:
            target.write_text(source+'\n')
        (EXPECTED/f'{name}.json').write_text(json.dumps(expected,indent=2)+'\n')
    print(f'Wrote {len(cases)} SVGs and analytical expectation files; {version}')


if __name__ == '__main__':
    main()
