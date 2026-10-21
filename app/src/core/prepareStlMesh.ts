import type { Point3Mm, Triangle, TriangleMesh } from './contracts';
import { MESH_CONSTRUCTION_POLICY } from './meshConstructionPolicy';

/** Maximum Euclidean displacement of any source vertex, in millimeters.
 * This is an export cleanup allowance, independent of nozzle size. */
export const STL_CLEANUP_MM = 0.001;

export function stlNormal(a: Point3Mm, b: Point3Mm, c: Point3Mm): Point3Mm {
  const u = b.map((v, i) => v - a[i]), v = c.map((x, i) => x - a[i]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

export function inspectStlSource(mesh: TriangleMesh): number {
  if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.triangles)
    || mesh.vertices.length > MESH_CONSTRUCTION_POLICY.maxOutputVertices
    || mesh.triangles.length < 1 || mesh.triangles.length > MESH_CONSTRUCTION_POLICY.maxOutputTriangles) throw Error('Invalid STL source.');
  for (const p of mesh.vertices) if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw Error('Invalid STL vertex.');
  let area = 0;
  for (const t of mesh.triangles) {
    if (!Array.isArray(t) || t.length !== 3 || t.some(i => !Number.isSafeInteger(i) || i < 0 || i >= mesh.vertices.length)) throw Error('Invalid STL triangle.');
    const n = stlNormal(...t.map(i => mesh.vertices[i]) as [Point3Mm, Point3Mm, Point3Mm]);
    const length = Math.hypot(...n);
    if (!Number.isFinite(length) || length === 0) throw Error('Invalid STL source normal.');
    area += length / 2;
  }
  if (!Number.isFinite(area)) throw Error('Invalid STL surface area.');
  return area;
}

/** Weld identical emitted positions and remove only facets with zero emitted
 * area. A second attempt may snap to a one-micron grid before float32 encoding.
 * Every candidate must subsequently pass full topology/intersection validation. */
export function prepareStlMesh(source: TriangleMesh, snap: boolean): {mesh: TriangleMesh; displacementMm: number} {
  let displacementMm = 0;
  const rounded = source.vertices.map(p => {
    const q = p.map(v => Math.fround(snap ? Math.round(v / STL_CLEANUP_MM) * STL_CLEANUP_MM : v)) as unknown as Point3Mm;
    const distance = Math.hypot(...q.map((v, i) => v - p[i]));
    if (!q.every(Number.isFinite) || distance > STL_CLEANUP_MM) throw Error('STL cleanup displacement exceeded.');
    displacementMm = Math.max(displacementMm, distance);
    return q;
  });
  const vertices: Point3Mm[] = [], triangles: Triangle[] = [], ids = new Map<string, number>();
  for (const t of source.triangles) {
    const points = t.map(i => rounded[i]) as [Point3Mm, Point3Mm, Point3Mm];
    const n = stlNormal(...points);
    if (!n.some(v => v !== 0)) continue;
    const original = stlNormal(...t.map(i => source.vertices[i]) as [Point3Mm, Point3Mm, Point3Mm]);
    if (!n.every(Number.isFinite) || n.reduce((sum, v, i) => sum + v * original[i], 0) <= 0) throw Error('STL facet reversed.');
    triangles.push(points.map(p => {
      const key = p.map(v => v || 0).join(':');
      let id = ids.get(key);
      if (id === undefined) { id = vertices.length; ids.set(key, id); vertices.push(p); }
      return id;
    }) as unknown as Triangle);
  }
  return {mesh: {vertices, triangles}, displacementMm};
}
