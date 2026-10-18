// M0 evidence adapter. Browser DOMParser is required; no UI or network access.
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import clipping from 'polygon-clipping';
const INK = 'http://www.inkscape.org/namespaces/inkscape';
const SVG = 'http://www.w3.org/2000/svg';
const fail = message => { throw new Error(message); };
const isLayer = n => n.localName === 'g' && n.getAttributeNS(INK, 'groupmode') === 'layer';
const units = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96, '': 25.4 / 96 };
function lengthMm(s) {
  if (s === null) return null;
  const m = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|px)?\s*$/i.exec(s);
  if (!m || !(Number(m[1]) > 0)) fail('Unsupported physical dimension');
  return Number(m[1]) * units[(m[2] || '').toLowerCase()];
}
export function viewport(root) {
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) fail('Positive viewBox required');
  let w = lengthMm(root.getAttribute('width')), h = lengthMm(root.getAttribute('height'));
  const inferred = w === null || h === null;
  if (inferred) { w = 40; h = w * vb[3] / vb[2]; }
  const par = (root.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
  if (!['none', 'xMidYMid', 'xMidYMid meet'].includes(par)) fail('Unsupported preserveAspectRatio');
  let sx = w / vb[2], sy = h / vb[3];
  if (par !== 'none') sx = sy = Math.min(sx, sy);
  return { widthMm: w, heightMm: h, inferred, map: p => [(p.x - vb[0]) * sx + (w - vb[2] * sx) / 2, h - ((p.y - vb[1]) * sy + (h - vb[3] * sy) / 2)], scale: Math.max(sx, sy) };
}
function flatten(path, scale, tolerance) {
  const out = [];
  const append = p => out.push([p.x, p.y]);
  function bezier(points, depth = 0) {
    const a = points[0], b = points.at(-1), dx = b.x-a.x, dy = b.y-a.y;
    const dist = p => Math.hypot(dx,dy) ? Math.abs(dx*(a.y-p.y)-(a.x-p.x)*dy)/Math.hypot(dx,dy) : p.distanceTo(a);
    // Convex hull distance to the chord segment (including longitudinal overshoot).
    const flat = points.every(p => dist(p)*scale <= tolerance && (p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y) <= tolerance*tolerance/(scale*scale));
    if (flat) { append(b); return; }
    if (depth >= 24) fail('Curve subdivision limit');
    const left = [a], right = [b]; let row = points;
    while (row.length > 1) { row = row.slice(1).map((p,i) => p.clone().add(row[i]).multiplyScalar(.5)); left.push(row[0]); right.unshift(row.at(-1)); }
    bezier(left,depth+1); bezier(right,depth+1);
  }
  for (const c of path.curves) {
    if (!out.length) append(c.getPoint(0));
    if (c.isLineCurve) append(c.getPoint(1));
    else if (c.isQuadraticBezierCurve) bezier([c.v0,c.v1,c.v2]);
    else if (c.isCubicBezierCurve) bezier([c.v0,c.v1,c.v2,c.v3]);
    else if (c.isEllipseCurve) {
      const n = Math.max(8, Math.ceil(2*Math.PI*Math.sqrt(Math.max(c.xRadius,c.yRadius)*scale/(8*tolerance))));
      if (n > 100000) fail('Curve point limit');
      for (let i=1;i<=n;i++) append(c.getPoint(i/n));
    } else fail('Unsupported curve');
  }
  if (out.length < 3) fail('Empty contour');
  return out;
}
export function extractSvg(xml, { toleranceMm = .01 } = {}) {
  if (!(toleranceMm > 0) || !Number.isFinite(toleranceMm)) fail('Invalid tolerance');
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml)) fail('Unsafe or excessive XML');
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
  if (doc.querySelector('parsererror')) fail('Malformed XML');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG) fail('SVG root required');
  const all = [...root.querySelectorAll('*')];
  if (all.length > 10000) fail('Element limit');
  const allowed = new Set(['svg','g','defs','title','desc','metadata','path','rect','circle','ellipse','polygon']);
  const ids = new Set();
  for (const n of [root,...all]) {
    if (n.id && ids.has(n.id)) fail('Duplicate source ID');
    if (n.id) ids.add(n.id);
    if (n.hasAttribute('class')) fail('CSS classes outside spike contract');
    const declarations = (n.getAttribute('style') || '').split(';').filter(x=>x.trim());
    for (const declaration of declarations) if (!['fill','fill-rule','stroke','stroke-width','stroke-linejoin','stroke-linecap','stroke-miterlimit'].includes(declaration.split(':')[0].trim())) fail('Unsupported inline style');
    if (n.namespaceURI === SVG && !allowed.has(n.localName)) fail(`Unsupported SVG element: ${n.localName}`);
    for (const a of n.attributes) if (/^on/i.test(a.name) || /href$/i.test(a.name) || /url\s*\(/i.test(a.value) || ['clip-path','mask','filter'].includes(a.name)) fail('Unsupported reference/effect');
    if (n.localName === 'path') {
      const commands = n.getAttribute('d')?.match(/[a-df-z]/ig) || [];
      if (!commands.length || !/[zZ]/.test(commands.at(-1)) || commands.some((c,i)=>/[mM]/.test(c) && i>0 && !/[zZ]/.test(commands[i-1]))) fail('Open path');
    }
  }
  const v = viewport(root);
  const nodes = all.filter(isLayer);
  if (!nodes.length || nodes.some(n => !n.getAttributeNS(INK,'label') || [...ancestors(n)].some(isLayer))) fail('Named, non-nested Inkscape layers required');
  const layers = nodes.map((n,i) => ({ id: n.id || `layer-${i}`, name:n.getAttributeNS(INK,'label'), order:i, sourceElementIds:[], footprintMm:[] }));
  const loader = new SVGLoader(); loader.defaultDPI = 96;
  const parsed = loader.parse(xml);
  for (const path of parsed.paths) {
    const node = path.userData?.node, style = path.userData?.style;
    if (!node || !style) fail('SVGLoader ancestry contract failed');
    const owner = [...ancestors(node)].find(isLayer);
    const index = owner ? [...owner.ownerDocument.querySelectorAll('*')].filter(isLayer).indexOf(owner) : -1;
    if (index < 0) fail('Artwork outside named layer');
    if (style.fill === 'none') fail('Stroke-only artwork');
    // Hidden/transparent artwork is outside this narrow spike contract, never silently included.
    for (const n of [node,...ancestors(node)]) if (/display\s*:\s*none|visibility\s*:\s*(hidden|collapse)|opacity\s*:/.test(n.getAttribute('style') || '') || ['display','visibility','opacity','fill-opacity'].some(k=>n.hasAttribute(k))) fail('Visibility/opacity needs production preflight');
    const polys = path.toShapes().map(shape => [shape,...shape.holes].map(ring => flatten(ring,v.scale,toleranceMm).map(([x,y]) => v.map({x,y}))));
    if (!polys.length) fail('No filled geometry');
    layers[index].sourceElementIds.push(node.id || `shape-${parsed.paths.indexOf(path)}`);
    layers[index].footprintMm = clipping.union(layers[index].footprintMm,...polys.map(p=>[p]));
  }
  for (const layer of layers) {
    const points = layer.footprintMm.flat(2);
    if (!points.length) fail('Empty printing layer');
    layer.boundsMm = [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    layer.regions = layer.footprintMm.length;
    layer.holes = layer.footprintMm.reduce((n,p)=>n+p.length-1,0);
    layer.areaMm2 = layer.footprintMm.reduce((sum,p)=>sum+p.reduce((a,r,i)=>a+(i ? -1 : 1)*Math.abs(r.reduce((s,q,j)=>s+q[0]*r[(j+1)%r.length][1]-r[(j+1)%r.length][0]*q[1],0)/2),0),0);
  }
  return { physicalPageMm:[v.widthMm,v.heightMm], baseCandidateId:layers[0].id, warnings:v.inferred ? ['Source size inferred: 40 mm target width'] : [], layers };
}
function* ancestors(node) { for (let n=node.parentElement;n;n=n.parentElement) yield n; }
