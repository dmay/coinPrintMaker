// Minimal declaration for the pinned dependency. Runtime structure is checked by
// the adapter; Three.js types never enter core or the serializable DTO boundary.
declare module 'three/addons/loaders/SVGLoader.js' {
  export class SVGLoader {
    defaultDPI: number;
    defaultUnit: string;
    parse(text: string): { paths: unknown[]; xml: Element };
  }
}
