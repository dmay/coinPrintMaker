// A deliberately small, deterministic inline/presentation-style subset. This is
// not a browser CSS cascade: stylesheets, escapes and unsupported declarations
// are rejected by preflight rather than guessed or silently discarded.
export const styleDefaults = {
  fill: 'black', 'fill-rule': 'nonzero', stroke: 'none', 'stroke-width': '1',
  color: 'black', display: 'inline', visibility: 'visible', opacity: '1',
  'fill-opacity': '1', 'stroke-opacity': '1',
} as const;
export type StyleProperty = keyof typeof styleDefaults;
export type SvgStyle = Record<StyleProperty, string>;
export const inheritedProperties = new Set<StyleProperty>([
  'fill', 'fill-rule', 'stroke', 'stroke-width', 'color', 'visibility', 'fill-opacity', 'stroke-opacity',
]);
const unsupportedAttributes = new Set(['transform-origin', 'transform-box', 'requiredFeatures', 'requiredExtensions', 'systemLanguage']);
const inertStyleProperties = new Set(['stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit']);
const neutralEffects: Record<string, string> = {
  mask: 'none', 'clip-path': 'none', filter: 'none', 'marker-start': 'none', 'marker-mid': 'none',
  'marker-end': 'none', 'mix-blend-mode': 'normal', isolation: 'auto', 'vector-effect': 'none',
  'paint-order': 'normal', clip: 'auto', overflow: 'visible',
};
export interface StyleResolution { readonly style: SvgStyle; readonly unsupported: readonly string[] }
export function resolveSvgStyle(element: Element, parent: SvgStyle): StyleResolution {
  const values = new Map<string, string>();
  const unsupported: string[] = [];
  for (const attribute of element.attributes) {
    if (attribute.namespaceURI !== null) continue;
    const property = attribute.localName;
    if (unsupportedAttributes.has(property)) unsupported.push(property);
    if (Object.hasOwn(styleDefaults, property) || Object.hasOwn(neutralEffects, property)) values.set(property, attribute.value.trim());
  }
  // Inline declarations always outrank presentation attributes. Within inline
  // declarations, the last declaration of equal importance wins.
  const important = new Set<string>();
  for (const declaration of (element.getAttribute('style') ?? '').split(';')) {
    if (!declaration.trim()) continue;
    const match = /^\s*([a-z-]+)\s*:\s*(.*?)\s*(!\s*important)?\s*$/i.exec(declaration);
    if (!match || !match[2]) { unsupported.push('invalid inline declaration'); continue; }
    const property = match[1].toLowerCase(), value = match[2].trim(), priority = !!match[3];
    if (!Object.hasOwn(styleDefaults, property) && !Object.hasOwn(neutralEffects, property) && !inertStyleProperties.has(property)) {
      unsupported.push(property); continue;
    }
    if (!important.has(property) || priority) values.set(property, value);
    if (priority) important.add(property);
  }
  const style = { ...styleDefaults } as SvgStyle;
  for (const property of Object.keys(styleDefaults) as StyleProperty[]) {
    const value = values.get(property);
    if (value === undefined) style[property] = inheritedProperties.has(property) ? parent[property] : styleDefaults[property];
    else if (property === 'color' && value.toLowerCase() === 'currentcolor') style[property] = parent[property];
    else if (value.toLowerCase() === 'inherit') style[property] = parent[property];
    else if (value.toLowerCase() === 'initial') style[property] = styleDefaults[property];
    else if (value.toLowerCase() === 'unset') style[property] = inheritedProperties.has(property) ? parent[property] : styleDefaults[property];
    else style[property] = value;
  }
  for (const [property, neutral] of Object.entries(neutralEffects)) {
    const value = values.get(property);
    if (value !== undefined && value.toLowerCase() !== neutral) unsupported.push(property);
  }
  return { style, unsupported };
}

const colorNames = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
// Return null for unsupported paint; 'none' for explicitly nonpainting fill.
export function solidPaint(value: string, color: string): string | null {
  const paint = value.toLowerCase();
  if (paint === 'currentcolor') return ['none', 'currentcolor'].includes(color.toLowerCase()) ? null : solidPaint(color, 'black');
  if (paint === 'none' || paint === 'transparent') return 'none';
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(paint) || colorNames.has(paint)) return paint;
  const rgb = /^rgb\(\s*([^()]+)\s*\)$/.exec(paint);
  if (rgb) {
    const channels = rgb[1].split(',').map(x => x.trim());
    if (channels.length === 3 && channels.every(x => /^(?:\d*\.)?\d+%?$/.test(x)) &&
      channels.every(x => Number.parseFloat(x) <= (x.endsWith('%') ? 100 : 255)) &&
      channels.every(x => x.endsWith('%') === channels[0].endsWith('%'))) return paint;
  }
  return null;
}
export function opacityValue(value: string): number | null {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(value)) return null;
  const number = Number.parseFloat(value) / (value.endsWith('%') ? 100 : 1);
  return number >= 0 && number <= 1 ? number : null;
}
