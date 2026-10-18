// Explicit test-only boundaries for retained JavaScript prototypes.
declare module '*spikes/svg-import/extract.mjs' {
  export function extractSvg(xml: string): {
    physicalPageMm: [number, number];
    baseCandidateId: string;
    warnings: string[];
    layers: {
      id: string;
      name: string;
      order: number;
      sourceElementIds: string[];
      footprintMm: number[][][][];
    }[];
  };
}
declare module '*spikes/tiered-stl/mesh.mjs' {
  export function buildCoin(layers: { footprintMm: number[][][][]; thicknessMm: number; name: string }[]): {
    mesh: { vertices: [number, number, number][]; faces: [number, number, number][] };
    tiers: { bottomZMm: number; topZMm: number }[];
    metrics: { dimensionsMm: number[]; volumeMm3: number; components: number; edgeIncidence: number };
  };
}
