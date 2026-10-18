#!/usr/bin/env python3
"""Verify fixture integrity with XML and independent Inkscape bounds/raster area.
Does not implement or claim to validate CoinPrint import, support, or meshing.
Requires Inkscape and Pillow. Run from any working directory.
"""
import json
import math
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
INK = '{http://www.inkscape.org/namespaces/inkscape}'
DPI = 762  # 30 pixels/mm
AREA_REL_TOL = 0.003
AREA_ABS_TOL = 0.15
BOUNDS_TOL = 0.001  # mm; Inkscape query output rounds decimal CSS pixels


def run(*args):
    return subprocess.check_output(['inkscape', *map(str,args)],text=True,stderr=subprocess.PIPE)


def main():
    metrics = []
    samples = []
    expected_files = sorted((ROOT/'fixtures/expected').glob('*.json'))
    svg_paths = {p.name for p in (ROOT/'fixtures/svg').glob('*.svg')}
    assert svg_paths == {p.stem+'.svg' for p in expected_files}, 'Missing/orphaned expectations'
    with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
        for ep in expected_files:
            expected = json.loads(ep.read_text())
            source = ROOT / expected['source']
            if ep.stem == 'malformed-xml':
                try:
                    ET.parse(source)
                except ET.ParseError:
                    continue
                raise AssertionError('Malformed fixture unexpectedly parses')
            root = ET.parse(source).getroot()
            nodes = [n for n in root.iter() if n.get(INK+'groupmode') == 'layer']
            assert len({n.get('id') for n in root.iter() if n.get('id')}) == sum(1 for n in root.iter() if n.get('id'))
            if expected['importOutcome'] == 'reject':
                assert [(n.get('id'), n.get(INK+'label')) for n in nodes] == [('base','Base'),('art','Unsupported artwork')]
                assert expected['expectedDiagnostics'] and not expected['exportAllowedAfterGeometryValidation']
                # Never render hostile or external-reference fixtures.
                continue
            assert [(n.get('id'),n.get(INK+'label')) for n in nodes] == [(m['id'],m['name']) for m in expected['layers']]
            # Explicit physical root dimensions must equal the 40 × 40 mm oracle.
            def mm(value):
                return float(value[:-2]) * (25.4/96 if value.endswith('px') else 1)
            assert all(math.isclose(mm(root.get(k)),40,abs_tol=1e-9) for k in ('width','height'))
            queried = {}
            for row in run(source,'--query-all').splitlines():
                fields = row.split(',')
                if len(fields) == 5:
                    queried[fields[0]] = [float(x)*25.4/96 for x in fields[1:]]
            z = 0
            for layer in expected['layers']:
                x,y,w,h = queried[layer['id']]
                bounds = [x,y,x+w,y+h]
                assert all(abs(a-b)<=BOUNDS_TOL for a,b in zip(bounds,layer['boundsMm'])), (source.name,layer['id'],bounds)
                assert layer['bottomZMm'] == z
                z += layer['thicknessMm']
                assert layer['topZMm'] == z
                out = Path(tmp)/'layer.png'
                run(source,f'--export-id={layer["id"]}','--export-id-only',f'--export-dpi={DPI}',f'--export-filename={out}')
                with Image.open(out) as im:
                    alpha = im.convert('RGBA').getchannel('A')
                    hist = alpha.histogram()
                    area = sum(i*n for i,n in enumerate(hist))/255/(DPI/25.4)**2
                error = abs(area-layer['areaMm2'])
                assert error <= max(AREA_ABS_TOL,AREA_REL_TOL*layer['areaMm2']), (source.name,layer['id'],area,layer['areaMm2'])
                metrics.append(dict(fixture=source.name,layer=layer['id'],rasterAreaMm2=round(area,6),
                                    expectedAreaMm2=layer['areaMm2'],boundsMm=[round(v,6) for v in bounds]))
            valid = all(m['supportedByPrevious'] is not False for m in expected['layers'])
            assert expected['exportAllowedAfterGeometryValidation'] == valid
            if valid:
                assert math.isclose(expected['analyticalVolumeMm3'],sum(m['areaMm2']*m['thicknessMm'] for m in expected['layers']))
            if expected['realisticSample']:
                preview = ROOT/'fixtures/previews'/f'{ep.stem}.png'
                run(source,'--export-area-page','--export-width=600',f'--export-filename={preview}')
                samples.append((ep.stem,preview))
    sheet = Image.new('RGB',(960,370),'#f3f1ea')
    draw = ImageDraw.Draw(sheet)
    for i,(name,path) in enumerate(samples):
        with Image.open(path) as im:
            im = im.convert('RGBA').resize((280,280),Image.Resampling.LANCZOS)
            sheet.paste(im,(i*320+20,20),im)
        draw.text((i*320+25,320),name,fill='black')
        draw.text((i*320+25,340),'40 mm / 2.4 mm total height',fill='black')
    sheet.save(ROOT/'fixtures/previews/sample-coins.png')
    report = dict(command='python3 scripts/check-fixtures.py',inkscapeVersion=run('--version').strip(),
        fixtures=len(expected_files),
        positiveImports=sum(json.loads(p.read_text())['importOutcome']=='accept' for p in expected_files),
        rejectedImports=sum(json.loads(p.read_text())['importOutcome']=='reject' for p in expected_files),
        measuredLayers=len(metrics),
        boundsToleranceMm=BOUNDS_TOL,rasterAreaRelativeTolerance=AREA_REL_TOL,rasterAreaAbsoluteToleranceMm2=AREA_ABS_TOL,
        result='pass',measurements=metrics,
        limitations='Independent Inkscape XML/bounds/raster-area checks only. Support/topology/volume are analytical oracles for later engine tests. No CoinPrint import, mesh, slicer or physical-print acceptance performed.')
    (ROOT/'fixtures/verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'PASS: {len(expected_files)} fixtures; {len(metrics)} independent layer bounds/area measurements; 3 sample previews')


if __name__ == '__main__':
    main()
