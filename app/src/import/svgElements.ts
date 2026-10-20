import type { DiagnosticLocation } from '../core/diagnostics';
import { SVG_NAMESPACE } from './parseSvgDocument';
export const INKSCAPE_NAMESPACE = 'http://www.inkscape.org/namespaces/inkscape';
const nonRendering = new Set(['defs', 'metadata', 'title', 'desc', 'symbol', 'linearGradient', 'radialGradient', 'pattern', 'mask', 'clipPath', 'filter', 'marker']);
export function isInertSvgElement(element: Element): boolean {
  return (element.namespaceURI === SVG_NAMESPACE && nonRendering.has(element.localName)) ||
    (element.namespaceURI === 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd' && element.localName === 'namedview') ||
    (element.namespaceURI === INKSCAPE_NAMESPACE && ['namedview', 'grid', 'page'].includes(element.localName));
}
export function isInkscapeLayer(element: Element): boolean {
  return element.namespaceURI === SVG_NAMESPACE && element.localName === 'g' && element.getAttributeNS(INKSCAPE_NAMESPACE, 'groupmode') === 'layer';
}
export function sourceIdentity(element: Element, path: readonly number[]): string {
  const id = element.getAttribute('id');
  return id ? `source:${id}` : `path:${path.join('.')}`;
}
export function elementEntries(root: Element): { element: Element; path: readonly number[]; inert: boolean }[] {
  const entries: { element: Element; path: readonly number[]; inert: boolean }[] = [];
  const pending = [{ element: root, path: [] as readonly number[], inert: false }];
  while (pending.length) {
    const entry = pending.pop()!;
    entry.inert ||= isInertSvgElement(entry.element);
    entries.push(entry);
    const children = [...entry.element.children];
    for (let i = children.length - 1; i >= 0; i--) pending.push({ element: children[i], path: [...entry.path, i], inert: entry.inert });
  }
  return entries;
}

// Labels are presentation metadata, never source identity or a lookup key.
export function elementLabel(element: Element): string | undefined {
  return element.getAttributeNS(INKSCAPE_NAMESPACE, 'label')?.trim() || undefined;
}
export function elementLocation(element: Element, path: readonly number[]): DiagnosticLocation {
  let owner: Element | null = element;
  while (owner && !isInkscapeLayer(owner)) owner = owner.parentElement;
  const ownerPath = [...path];
  for (let node: Element | null = element; node && node !== owner; node = node.parentElement) ownerPath.pop();
  return { scope: 'element', elementId: element.getAttribute('id'), elementPath: path,
    ...(elementLabel(element) ? { elementLabel: elementLabel(element) } : {}),
    layerId: owner ? sourceIdentity(owner, ownerPath) : null,
    ...(owner && elementLabel(owner) ? { layerName: elementLabel(owner) } : {}) };
}
