import { createDiagnostic } from '../core/diagnostics';
import type { Diagnostic, DiagnosticCode } from '../core/diagnostics';
import type { PreflightArtwork, SvgPreflightResult } from '../core/svgPreflight';
import { parseSvgDocument, SVG_NAMESPACE } from './parseSvgDocument';
import { opacityValue, resolveSvgStyle, solidPaint, styleDefaults } from './svgStyle';
import type { SvgStyle } from './svgStyle';

const shapes = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon']);
const nonRendering = new Set(['defs', 'metadata', 'title', 'desc', 'symbol', 'linearGradient', 'radialGradient', 'pattern', 'mask', 'clipPath', 'filter', 'marker']);
const textElements = new Set(['text', 'tspan', 'textPath', 'flowRoot', 'flowPara', 'flowSpan']);
const resourceProperties = new Set(['fill', 'stroke', 'mask', 'clip-path', 'filter', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'color-profile']);
const ink = 'http://www.inkscape.org/namespaces/inkscape';
interface Entry {
  readonly element: Element;
  readonly path: readonly number[];
  readonly parentStyle: SvgStyle;
  readonly suppressed: boolean;
  readonly inert: boolean;
}

function referenceCode(property: string, value: string, document: Document): DiagnosticCode {
  const local = /^url\(\s*['"]?#([^\s'"()]+)['"]?\s*\)$/i.exec(value.trim());
  if (!local) return 'EXTERNAL_REFERENCE_UNSUPPORTED';
  if (property === 'mask') return 'MASK_UNSUPPORTED';
  if (property === 'clip-path') return 'CLIP_PATH_UNSUPPORTED';
  if (property === 'filter') return 'FILTER_UNSUPPORTED';
  const target = document.getElementById(local[1]);
  return target && ['linearGradient', 'radialGradient'].includes(target.localName) ? 'GRADIENT_UNSUPPORTED' : 'PAINT_UNSUPPORTED';
}

/** XML preflight only; not a sanitizer, path parser, geometry or export gate. */
export function preflightSvg(svgText: string): SvgPreflightResult {
  const parsed = parseSvgDocument(svgText);
  if ('diagnostics' in parsed) return { status: 'rejected', diagnostics: parsed.diagnostics };
  const document = parsed.document, root = document.documentElement;
  const diagnostics: Diagnostic[] = [], artwork: PreflightArtwork[] = [];
  let hasErrors = false, omittedDiagnostics = 0;
  const add = (code: DiagnosticCode, element: Element, path: readonly number[], detail = '') => {
    const diagnostic = createDiagnostic(code, { scope: 'element', layerId: null, elementId: element.getAttribute('id'), elementPath: path });
    hasErrors ||= diagnostic.severity === 'error';
    if (diagnostics.length >= 100) {
      omittedDiagnostics++;
      // Rejection must expose an error even when earlier warnings filled the cap.
      if (diagnostic.severity === 'error' && !diagnostics.some(item => item.severity === 'error')) diagnostics[99] = diagnostic;
      return;
    }
    diagnostics.push({ ...diagnostic, message: diagnostic.message + (detail ? ` ${detail}` : '') });
  };
  const stack: Entry[] = [{ element: root, path: [], parentStyle: { ...styleDefaults }, suppressed: false, inert: false }];
  while (stack.length) {
    const entry = stack.pop()!, { element, path } = entry, name = element.localName;
    // These checks apply to ALL nodes, including hidden artwork and definitions.
    // Descriptive metadata URLs (rdf:about/resource, editor paths, title text)
    // are not resource-loading attributes and are intentionally not scanned.
    if (name.toLowerCase() === 'script') add('SCRIPT_UNSUPPORTED', element, path);
    if (name.toLowerCase() === 'style') add('CSS_UNSUPPORTED', element, path, 'Stylesheets are unsupported.');
    if (['animate', 'animatemotion', 'animatetransform', 'set', 'discard'].includes(name.toLowerCase())) add('ANIMATION_UNSUPPORTED', element, path);
    for (const attribute of element.attributes) {
      const property = attribute.localName.toLowerCase(), value = attribute.value;
      if (/^on/i.test(property)) add('SCRIPT_UNSUPPORTED', element, path, 'Remove event-handler attributes.');
      if (['href', 'src', 'srcset', 'poster'].includes(property) ||
        (attribute.namespaceURI === 'http://www.w3.org/XML/1998/namespace' && property === 'base')) {
        add('EXTERNAL_REFERENCE_UNSUPPORTED', element, path);
      }
      if (property === 'style') {
        // Reject escaped/commented CSS instead of trying to normalize it. XML
        // character references have already been decoded by the XML parser.
        if (/[\\@]|\/\*/.test(value)) add('CSS_UNSUPPORTED', element, path, 'CSS escapes, comments and at-rules are unsupported.');
        for (const declaration of value.split(';')) {
          const colon = declaration.indexOf(':');
          if (colon < 0) continue;
          const key = declaration.slice(0, colon).trim().toLowerCase(), content = declaration.slice(colon + 1).trim().replace(/\s*!\s*important\s*$/i, '');
          if (/url\s*\(/i.test(content)) add(referenceCode(key, content, document), element, path);
        }
      } else if (resourceProperties.has(property) && attribute.namespaceURI === null) {
        if (/[\\]|\/\*/.test(value)) add('CSS_UNSUPPORTED', element, path, 'Escaped/commented paint is unsupported.');
        if (/url\s*\(/i.test(value)) add(referenceCode(property, value, document), element, path);
      }
    }
    const editorMetadata = (element.namespaceURI === 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd' && name === 'namedview') ||
      (element.namespaceURI === ink && ['namedview', 'grid', 'page'].includes(name));
    const inert = entry.inert || editorMetadata || (element.namespaceURI === SVG_NAMESPACE && nonRendering.has(name));
    let style = entry.parentStyle, suppressed = entry.suppressed;
    if (!inert) {
      const resolution = resolveSvgStyle(element, entry.parentStyle);
      style = resolution.style;
      const display = style.display.toLowerCase(), visibility = style.visibility.toLowerCase();
      const opacity = opacityValue(style.opacity), fillOpacity = opacityValue(style['fill-opacity']), strokeOpacity = opacityValue(style['stroke-opacity']);
      suppressed ||= display === 'none' || opacity === 0;
      const hidden = suppressed || ['hidden', 'collapse'].includes(visibility);
      const report = (code: DiagnosticCode, detail = '') => add(hidden ? 'ARTWORK_IGNORED' : code, element, path, detail);
      const isShape = element.namespaceURI === SVG_NAMESPACE && shapes.has(name);
      const container = element.namespaceURI === SVG_NAMESPACE && (name === 'g' || element === root);
      if (!['inline', 'block', 'none'].includes(display) || !['visible', 'hidden', 'collapse'].includes(visibility) ||
        opacity === null || fillOpacity === null || strokeOpacity === null) {
        // Unknown visibility is never used to classify content as ignorable.
        add('CSS_UNSUPPORTED', element, path, 'Use supported display, visibility and opacity values.');
      }
      for (const property of resolution.unsupported) {
        const code = property === 'mask' ? 'MASK_UNSUPPORTED' : property === 'clip-path' ? 'CLIP_PATH_UNSUPPORTED' : property === 'filter' ? 'FILTER_UNSUPPORTED' : 'CSS_UNSUPPORTED';
        // An unsupported declaration might change visibility/geometry: reject it
        // even on a container whose visibility is inherited by visible children.
        add(code, element, path, `Unsupported property: ${property}.`);
      }
      if (opacity !== null && opacity > 0 && opacity < 1 && !suppressed) add('OPACITY_UNSUPPORTED', element, path);
      if (!isShape && !container) {
        const code = textElements.has(name) ? 'LIVE_TEXT_UNSUPPORTED' : name === 'image' ? 'RASTER_IMAGE_UNSUPPORTED' :
          name === 'line' || name === 'polyline' ? 'OPEN_PATH_UNSUPPORTED' : 'SVG_UNSUPPORTED';
        report(code, `Element: ${name}.`);
      } else if (isShape) {
        const fill = solidPaint(style.fill, style.color), stroke = solidPaint(style.stroke, style.color);
        if (hidden) add('ARTWORK_IGNORED', element, path);
        else if (fill === null || stroke === null) add('PAINT_UNSUPPORTED', element, path);
        else {
          const width = style['stroke-width'];
          const widthNumber = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:px|mm|cm|in|pt|pc|%)?$/i.test(width) ? Number.parseFloat(width) : null;
          if (stroke !== 'none' && strokeOpacity !== 0 && (widthNumber === null || widthNumber > 0)) {
            add(fill === 'none' || fillOpacity === 0 ? 'STROKE_ONLY_UNSUPPORTED' : 'STROKE_UNSUPPORTED', element, path);
          }
          if (fill === 'none' || fillOpacity === 0) add('ARTWORK_IGNORED', element, path);
          else {
            if (fillOpacity !== null && fillOpacity < 1) add('OPACITY_UNSUPPORTED', element, path);
            if (!['nonzero', 'evenodd'].includes(style['fill-rule'].toLowerCase())) add('CSS_UNSUPPORTED', element, path, 'Use nonzero or evenodd fill-rule.');
            if (name === 'path' && (element.getAttribute('d') ?? '').trim()) {
              // Explicit closure is the existing P0 authoring contract, even
              // though SVG rendering can implicitly close an open filled path.
              const commands = element.getAttribute('d')!.match(/[a-df-z]/ig) ?? [];
              let closed = true;
              for (const command of commands) {
                if (command.toLowerCase() === 'm') { if (!closed) break; closed = false; }
                else if (command.toLowerCase() === 'z') closed = true;
                else if (closed) { closed = false; break; }
              }
              if (!closed) add('OPEN_PATH_UNSUPPORTED', element, path);
            }
            artwork.push({ elementId: element.getAttribute('id'), elementPath: path, fill, fillRule: style['fill-rule'].toLowerCase() === 'evenodd' ? 'evenodd' : 'nonzero' });
          }
        }
      }
    }
    const children = [...element.children];
    for (let i = children.length - 1; i >= 0; i--) stack.push({
      element: children[i], path: [...path, i], parentStyle: style,
      suppressed, inert,
    });
  }
  if (omittedDiagnostics) diagnostics.push({
    ...createDiagnostic('PREFLIGHT_DIAGNOSTICS_TRUNCATED', { scope: 'document' }),
    message: `${omittedDiagnostics} additional preflight diagnostics were omitted.`,
  });
  return hasErrors ? { status: 'rejected', diagnostics } : { status: 'accepted', artwork, diagnostics };
}
