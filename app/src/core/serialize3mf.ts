import { strToU8, zipSync } from 'three/addons/libs/fflate.module.js';
import type { Bounds3Mm, GeneratedPart, MeshMetrics, Point3Mm, TriangleMesh, ValidGeneratedCoin } from './contracts';
import { emittedFootprintArea } from './conformUnifiedBoundaries';
import { MeshValidationBudget, MESH_CONSTRUCTION_POLICY } from './meshConstructionPolicy';
import { assertTierSurfaces } from './meshSurfaceSemantics';
import { validateMesh, MESH_VALIDATION_POLICY } from './validateMesh';

const CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
function reject(): never { throw new Error('3MF snapshot could not be validated.'); }
function xml(value: string): string {
  if (typeof value !== 'string' || !value.trim() || [...value].some(c => {
    const n = c.codePointAt(0)!;
    return !(n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0xD7FF
      || n >= 0xE000 && n <= 0xFFFD || n >= 0x10000 && n <= 0x10FFFF);
  })) reject();
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\t': '&#9;', '\n': '&#10;', '\r': '&#13;' };
  return value.replace(/[&<>"'\t\n\r]/g, c => entities[c]);
}
/** Locale-independent ST_Number (Core permits decimal exponents). */
function coordinate(value: number): string {
  if (!Number.isFinite(value)) reject();
  const text = String(value);
  if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(text) || Number(text) !== value) reject();
  return text;
}
function metricsValid(metrics: MeshMetrics): void {
  if (!metrics || !Array.isArray(metrics.boundsMm) || metrics.boundsMm.length !== 2
    || metrics.boundsMm.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
    || !Number.isFinite(metrics.volumeMm3) || metrics.volumeMm3 <= 0
    || !Number.isSafeInteger(metrics.shellCount) || metrics.shellCount < 1) reject();
}
function compareBounds(actual: Bounds3Mm, expected: Bounds3Mm): void {
  for (let end = 0; end < 2; end++) for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(actual[end][axis] - expected[end][axis]) > MESH_VALIDATION_POLICY.absoluteBoundsErrorMm
      + Math.abs(expected[end][axis]) * MESH_VALIDATION_POLICY.relativeBoundsError) reject();
  }
}
function compareVolume(actual: number, expected: number): void {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected <= 0
    || Math.abs(actual - expected) > expected * MESH_CONSTRUCTION_POLICY.relativeVolumeError) reject();
}

/** Pure checked-domain snapshot -> generic Core 3MF. No scene, geometry builder,
 * UI or download dependency. This cannot prove editor freshness: the caller must
 * select the exact current snapshot and guard again before delivering bytes.
 * Replacing this writer does not change generation or render contracts. */
export function serialize3mf(snapshot: ValidGeneratedCoin): Uint8Array {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.status !== 'valid'
    || !snapshot.input || typeof snapshot.input.importId !== 'string' || !snapshot.input.importId.trim()
    || !Number.isSafeInteger(snapshot.input.settingsRevision) || snapshot.input.settingsRevision < 0
    || !Array.isArray(snapshot.diagnostics) || snapshot.diagnostics.some(d => !d || d.severity === 'error')
    || !Array.isArray(snapshot.parts) || !snapshot.parts.length
    || !Array.isArray(snapshot.activeTiers) || snapshot.parts.length !== snapshot.activeTiers.length
    || snapshot.parts.length + 2 >= 2147483648) reject();
  metricsValid(snapshot.metrics);
  if (!Array.isArray(snapshot.dimensionsMm) || snapshot.dimensionsMm.length !== 3
    || snapshot.dimensionsMm.some(v => !Number.isFinite(v) || v <= 0)) reject();

  const budget = new MeshValidationBudget(), ids = new Set<string>();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let bottom = 0, volume = 0, compensation = 0;
  const parts = snapshot.parts.map((part: GeneratedPart, i: number) => {
    const tier = snapshot.activeTiers[i];
    if (!part || !tier || part.layerId !== tier.layerId || part.name !== tier.name || part.color !== tier.color
      || ids.has(part.layerId) || !Number.isFinite(tier.bottomZMm) || !Number.isFinite(tier.topZMm)
      || tier.bottomZMm !== bottom || tier.topZMm <= bottom
      || !Number.isFinite(tier.thicknessMm) || tier.thicknessMm <= 0
      || tier.bottomZMm + tier.thicknessMm !== tier.topZMm
      || !Array.isArray(tier.footprintMm) || !tier.footprintMm.length
      || typeof part.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(part.color)) reject();
    const layerId = xml(part.layerId), name = xml(part.name);
    ids.add(part.layerId); bottom = tier.topZMm;
    metricsValid(part.metrics);
    if (!part.mesh || !Array.isArray(part.mesh.vertices) || !Array.isArray(part.mesh.triangles)
      || part.mesh.vertices.length > MESH_CONSTRUCTION_POLICY.maxOutputVertices
      || part.mesh.triangles.length > MESH_CONSTRUCTION_POLICY.maxOutputTriangles) reject();

    // Validate the actual numeric text to be emitted, parsed back to doubles.
    // Do not round, repair, weld, recenter or serialize validator replacements.
    const text = part.mesh.vertices.map((p: Point3Mm) => {
      if (!Array.isArray(p) || p.length !== 3) reject();
      return p.map(coordinate);
    });
    const emitted: TriangleMesh = { vertices: text.map(p => p.map(Number) as unknown as Point3Mm), triangles: part.mesh.triangles };
    const checked = validateMesh(emitted, { expectedShellCount: part.metrics.shellCount,
      expectedBoundsMm: part.metrics.boundsMm, expectedVolumeMm3: part.metrics.volumeMm3, budget });
    if (checked.status !== 'checked' || checked.metrics.shellCount !== tier.footprintMm.length) reject();
    assertTierSurfaces(emitted, [tier], 'part', budget);
    if (checked.metrics.boundsMm[0][2] !== tier.bottomZMm || checked.metrics.boundsMm[1][2] !== tier.topZMm) reject();
    compareVolume(checked.metrics.volumeMm3, emittedFootprintArea(tier.footprintMm) * (tier.topZMm - tier.bottomZMm));
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], checked.metrics.boundsMm[0][axis]);
      max[axis] = Math.max(max[axis], checked.metrics.boundsMm[1][axis]);
    }
    const adjusted = checked.metrics.volumeMm3 - compensation, total = volume + adjusted;
    compensation = (total - volume) - adjusted; volume = total;
    return { name, layerId, color: part.color.toUpperCase(), text, mesh: emitted };
  });
  // Each closed part is confined to a successive interval: their open volumes
  // cannot overlap. Shared caps are retained so every selectable part is closed.
  compareBounds([min as unknown as Point3Mm, max as unknown as Point3Mm], snapshot.metrics.boundsMm);
  compareVolume(volume, snapshot.metrics.volumeMm3);
  compareVolume(volume, snapshot.analyticalVolumeMm3);
  for (let axis = 0; axis < 3; axis++) if (snapshot.dimensionsMm[axis] !== snapshot.metrics.boundsMm[1][axis] - snapshot.metrics.boundsMm[0][axis]) reject();

  // One resource ID namespace; material=1, meshes=2..N+1, assembly=N+2.
  const assemblyId = parts.length + 2;
  const materials = '<basematerials id="1">' + parts.map((p, i) =>
    `<base name="${i + 1}: ${p.name}" displaycolor="${p.color}FF"/>`).join('') + '</basematerials>';
  const objects = parts.map((p, i) => `<object id="${i + 2}" type="model" name="${p.name}" partnumber="${p.layerId}" pid="1" pindex="${i}"><mesh><vertices>`
    + p.text.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('')
    + '</vertices><triangles>' + p.mesh.triangles.map(([v1, v2, v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join('')
    + '</triangles></mesh></object>').join('');
  const assembly = `<object id="${assemblyId}" type="model" name="CoinPrint coin"><components>`
    + parts.map((_, i) => `<component objectid="${i + 2}"/>`).join('') + '</components></object>';
  const model = HEADER + `<model unit="millimeter" xml:lang="en-US" xmlns="${CORE}">`
    + '<metadata name="Application">CoinPrint</metadata>'
    + `<resources>${materials}${objects}${assembly}</resources><build><item objectid="${assemblyId}"/></build></model>\n`;
  const types = HEADER + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n';
  const rels = HEADER + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n';
  // Deflate is supported by Core/OPC. Fixed entry order/date makes regeneration
  // reproducible; no performance or universal-consumer claim follows from this.
  return zipSync({ '[Content_Types].xml': strToU8(types), '_rels/.rels': strToU8(rels), '3D/3dmodel.model': strToU8(model) },
    { level: 6, mtime: new Date(1980, 0, 1) });
}
