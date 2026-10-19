import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { createDiagnostic } from '../core/diagnostics';
import type { Diagnostic, DiagnosticCode } from '../core/diagnostics';
import type { PreflightArtwork } from '../core/svgPreflight';
import type { ExtractedLayer, ExtractedShape, SvgCurve, SvgExtractionResult, SvgPoint } from '../core/svgExtraction';
import { findInkscapeLayers } from './findInkscapeLayers';
import { parseSvgDocument, SVG_NAMESPACE } from './parseSvgDocument';
import { preflightSvg } from './preflightSvg';
import { elementEntries, INKSCAPE_NAMESPACE, isInkscapeLayer, sourceIdentity } from './svgElements';
import { identity, multiply, parseTransform, transformCurve } from '../core/svgAffine';
import type { Affine } from '../core/svgAffine';
import { lengthUserUnits } from '../core/svgViewport';
import { validShapeData } from './validateShapeData';

const marker = 'data-coinprint-source-path';
const pathKey = (path: readonly number[]) => path.join('.');
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object') throw new Error('Missing loader record');
  return value as RecordValue;
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Nonfinite curve');
  return value;
}
function point(value: unknown): SvgPoint {
  const p = record(value);
  return [finite(p.x), finite(p.y)];
}
function curveDto(value: unknown): SvgCurve {
  const c = record(value);
  if (c.type === 'LineCurve') return { kind: 'line', from: point(c.v1), to: point(c.v2) };
  if (c.type === 'QuadraticBezierCurve') return { kind: 'quadratic', from: point(c.v0), control: point(c.v1), to: point(c.v2) };
  if (c.type === 'CubicBezierCurve') return { kind: 'cubic', from: point(c.v0), control1: point(c.v1), control2: point(c.v2), to: point(c.v3) };
  if (c.type === 'EllipseCurve' && typeof c.aClockwise === 'boolean') return {
    kind: 'ellipse', center: [finite(c.aX), finite(c.aY)],
    axisX: [finite(c.xRadius) * Math.cos(finite(c.aRotation)), finite(c.xRadius) * Math.sin(finite(c.aRotation))],
    axisY: [-finite(c.yRadius) * Math.sin(finite(c.aRotation)), finite(c.yRadius) * Math.cos(finite(c.aRotation))],
    startAngle: finite(c.aStartAngle), endAngle: finite(c.aEndAngle), clockwise: c.aClockwise,
  };
  throw new Error('Unsupported curve type');
}
function contoursDto(path: RecordValue): ExtractedShape['contours'] {
  if (!Array.isArray(path.subPaths) || !path.subPaths.length) throw new Error('Missing contours');
  return path.subPaths.map(value => {
    const contour = record(value);
    if (!Array.isArray(contour.curves) || !contour.curves.length || typeof contour.autoClose !== 'boolean') throw new Error('Empty contour');
    return { autoClose: contour.autoClose, curves: contour.curves.map(curveDto) };
  });
}

/** SVG rect radii default to one another, clamp independently, and a zero axis is square. */
function rectangleContours(node: Element): ExtractedShape['contours'] {
  const n = (name: string) => Number(node.getAttribute(name) ?? 0);
  const x=n('x'),y=n('y'),w=n('width'),h=n('height');
  const rx=Math.min(node.hasAttribute('rx')?n('rx'):n('ry'),w/2);
  const ry=Math.min(node.hasAttribute('ry')?n('ry'):n('rx'),h/2);
  const line=(from:SvgPoint,to:SvgPoint):SvgCurve=>({kind:'line',from,to});
  if (rx===0 || ry===0) return [{autoClose:true,curves:[line([x,y],[x+w,y]),line([x+w,y],[x+w,y+h]),line([x+w,y+h],[x,y+h]),line([x,y+h],[x,y])]}];
  const arc=(cx:number,cy:number,startAngle:number):SvgCurve=>({kind:'ellipse',center:[cx,cy],axisX:[rx,0],axisY:[0,ry],startAngle,endAngle:startAngle+Math.PI/2,clockwise:false});
  return [{autoClose:true,curves:[line([x+rx,y],[x+w-rx,y]),arc(x+w-rx,y+ry,-Math.PI/2),line([x+w,y+ry],[x+w,y+h-ry]),arc(x+w-rx,y+h-ry,0),line([x+w-rx,y+h],[x+rx,y+h]),arc(x+rx,y+h-ry,Math.PI/2),line([x,y+h-ry],[x,y+ry]),arc(x+rx,y+ry,Math.PI)]}];
}

/** Local, detached layer/shape extraction only; never returns a canonical coin. */
export function svgLoaderAdapter(svgText: string): SvgExtractionResult {
  const preflight = preflightSvg(svgText);
  if (preflight.status === 'rejected') return preflight;
  const parsed = parseSvgDocument(svgText);
  if ('diagnostics' in parsed) return { status: 'rejected', diagnostics: parsed.diagnostics };
  const root = parsed.document.documentElement, discovery = findInkscapeLayers(root);
  if (discovery.status === 'rejected') return { status: 'rejected', diagnostics: [...preflight.diagnostics, ...discovery.diagnostics] };
  const diagnostics: Diagnostic[] = [...preflight.diagnostics];
  const reject = (code: DiagnosticCode, shape?: PreflightArtwork, detail = ''): SvgExtractionResult => {
    const diagnostic = createDiagnostic(code, shape ? { scope: 'element', layerId: null, elementId: shape.elementId, elementPath: shape.elementPath } : { scope: 'document' });
    return { status: 'rejected', diagnostics: [...diagnostics, { ...diagnostic, message: diagnostic.message + (detail ? ` ${detail}` : '') }] };
  };
  const entries = elementEntries(root), byPath = new Map(entries.map(e => [pathKey(e.path), e.element]));
  const layerByPath = new Map(discovery.layers.map(layer => [pathKey(layer.elementPath), layer]));
  const elementPaths = new Map(entries.map(e => [e.element, pathKey(e.path)]));
  const eligible = new Map(preflight.artwork.map(shape => [pathKey(shape.elementPath), shape]));
  const sourceOrders = new Map(preflight.artwork.map((source, order) => [source, order]));
  const owners = new Map<string, ExtractedLayer>(), required = new Set<Element>([root]);
  const transforms = new Map<Element, Affine>();
  for (const [key, shape] of eligible) {
    const element = byPath.get(key)!;
    let owner: ExtractedLayer | undefined;
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      required.add(ancestor);
      if (!owner && isInkscapeLayer(ancestor)) owner = layerByPath.get(elementPaths.get(ancestor)!);
    }
    if (!owner) return reject('ARTWORK_OUTSIDE_LAYER', shape);
    if (!validShapeData(element)) return reject('SVG_SHAPE_INVALID', shape);
    owners.set(key, owner);
  }
  if (![...owners.values()].some(owner => owner.id === discovery.layers[0].id)) return reject('BASE_EMPTY');

  // SVGLoader's permissive transform parser and ellipse shortcuts are bypassed.
  // Validate required ancestor mappings and compose them once in source order.
  for (const { element, path } of entries) if (required.has(element)) {
    try {
      if (element === root && ['transform', 'x', 'y'].some(name => element.hasAttribute(name))) throw new Error('Root transform/x/y arrangements are unsupported. Move transforms into an ordinary group.');
      if (element !== root && element.localName === 'svg') throw new Error('Nested SVG viewports are unsupported.');
      transforms.set(element, multiply(element === root ? identity : transforms.get(element.parentElement!)!, parseTransform(element.getAttribute('transform'))));
    } catch (error) {
      const diagnostic = createDiagnostic('SVG_TRANSFORM_UNSUPPORTED', { scope: 'element', layerId: null, elementId: element.getAttribute('id'), elementPath: path });
      return { status: 'rejected', diagnostics: [...diagnostics, { ...diagnostic, message: diagnostic.message + ' ' + (error as Error).message }] };
    }
  }

  // Project only eligible nodes and ancestor groups. Normalize SVG namespace
  // prefixes and resolved painting styles to avoid SVGLoader's narrower CSS
  // cascade and lack of complete hidden/inert-content filtering. Original IDs,
  // structural paths and layer ancestry remain explicit; transforms stay outside the loader.
  const projected = parsed.document.implementation.createDocument(SVG_NAMESPACE, 'svg', null);
  const clones = new Map<Element, Element>([[root, projected.documentElement]]);
  for (const { element, path } of entries) {
    if (!required.has(element)) continue;
    const clone = element === root ? projected.documentElement : projected.createElementNS(SVG_NAMESPACE, element.localName);
    clone.setAttribute(marker, pathKey(path));
    for (const attribute of ['id', ...(
      eligible.has(pathKey(path)) ? ['d', 'points', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r'] : []
    )]) if (element.hasAttribute(attribute)) clone.setAttribute(attribute, element.getAttribute(attribute)!);
    // Numericize physical primitive units before the loader (including whitespace
    // normalization); unitless values and CSS px both denote local user units.
    if (eligible.has(pathKey(path)) && !['path', 'polygon'].includes(element.localName)) {
      try {
        for (const name of ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r']) if (element.hasAttribute(name)) clone.setAttribute(name, String(lengthUserUnits(element.getAttribute(name)!)));
      } catch { return reject('SVG_SHAPE_INVALID', eligible.get(pathKey(path))); }
    }
    if (isInkscapeLayer(element)) {
      clone.setAttributeNS(INKSCAPE_NAMESPACE, 'inkscape:groupmode', 'layer');
      clone.setAttributeNS(INKSCAPE_NAMESPACE, 'inkscape:label', element.getAttributeNS(INKSCAPE_NAMESPACE, 'label')!);
    }
    const shape = eligible.get(pathKey(path));
    if (shape) { clone.setAttribute('fill', shape.fill); clone.setAttribute('fill-rule', shape.fillRule); clone.setAttribute('stroke', 'none'); }
    if (element !== root) clones.get(element.parentElement!)!.appendChild(clone);
    clones.set(element, clone);
  }
  const loader = new SVGLoader();
  loader.defaultDPI = 96;
  loader.defaultUnit = 'px';
  let loaded: ReturnType<SVGLoader['parse']>;
  try { loaded = loader.parse(new XMLSerializer().serializeToString(projected)); }
  catch { return reject('SVG_SHAPE_INVALID'); }
  if (!Array.isArray(loaded.paths) || !loaded.xml || loaded.xml.namespaceURI !== SVG_NAMESPACE || loaded.xml.localName !== 'svg') return reject('SVG_LOADER_MAPPING_INVALID');
  const shapes = new Map<string, ExtractedShape>();
  for (const value of loaded.paths) {
    let key: string | null = null;
    try {
      const path = record(value), data = record(path.userData), node = data.node as Element | undefined;
      if (!node || typeof node.getAttribute !== 'function' || node.ownerDocument !== loaded.xml.ownerDocument || !loaded.xml.contains(node)) throw new Error('Missing source node');
      key = node.getAttribute(marker);
      const source = key === null ? undefined : eligible.get(key), owner = key === null ? undefined : owners.get(key);
      if (!source || !owner || shapes.has(key!) || node.localName !== byPath.get(key!)!.localName) throw new Error('Unknown or repeated source node');
      let layerNode = node.parentElement;
      while (layerNode && !isInkscapeLayer(layerNode)) layerNode = layerNode.parentElement;
      if (!layerNode || layerNode.getAttribute(marker) !== pathKey(owner.elementPath)) throw new Error('Incorrect layer ancestry');
      const style = record(data.style);
      if (style.fill !== source.fill || style.fillRule !== source.fillRule) throw new Error('Painting style contract changed');
      let contours: ExtractedShape['contours'];
      try { const interpreted = contoursDto(path); contours = (node.localName === 'rect' ? rectangleContours(node) : interpreted).map(contour => ({ ...contour, curves: contour.curves.map(curve => transformCurve(transforms.get(byPath.get(key!)!)!, curve)) })); } catch { return reject('SVG_SHAPE_INVALID', source); }
      shapes.set(key!, { ...source, id: sourceIdentity(byPath.get(key!)!, source.elementPath), layerId: owner.id, sourceOrder: sourceOrders.get(source)!, contours });
    } catch { return reject('SVG_LOADER_MAPPING_INVALID', key === null ? undefined : eligible.get(key)); }
  }
  for (const [key, source] of eligible) if (!shapes.has(key)) return reject('SVG_LOADER_MAPPING_INVALID', source, 'An eligible source element was not returned.');
  const grouped = new Map(discovery.layers.map(layer => [layer.id, [] as ExtractedShape[]]));
  for (const source of preflight.artwork) {
    const shape = shapes.get(pathKey(source.elementPath))!;
    grouped.get(shape.layerId)!.push(shape);
  }
  return {
    status: 'extracted', coordinateSpace: 'svg-user', baseCandidateId: discovery.layers[0].id,
    layers: discovery.layers.map(layer => ({ ...layer, shapes: grouped.get(layer.id)! })), diagnostics,
  };
}
