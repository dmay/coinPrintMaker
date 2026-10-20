import type { MeshMetrics, Point3Mm, TriangleMesh } from './contracts';
import { assertNoMeshIntersections } from './exactMeshPredicates';
import { inspectMeshTopology } from './meshTopology';
import { MESH_CONSTRUCTION_POLICY, MeshValidationBudget } from './meshConstructionPolicy';

/** Export rounding allowances only. Generation acceptance is unchanged. */
export const STL_PRECISION = { absoluteBoundsMm: 1e-6, relativeBounds: 2e-7, relativeVolume: 1e-6 } as const;
export const STL_HEADER = 'CoinPrint binary STL; coordinates in millimeters; geometry only';
function reject(): never { throw new Error('STL coordinates could not be validated.'); }
function normal(a: Point3Mm, b: Point3Mm, c: Point3Mm): Point3Mm {
  const u = b.map((v, i) => v - a[i]), v = c.map((x, i) => x - a[i]);
  const n: Point3Mm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (!n.every(Number.isFinite) || !n.some(x => x !== 0)) reject();
  return n;
}

/** DOM-free. Input is the detached checked unified domain mesh, never a scene.
 * Validate the exact float32 coordinates that will be emitted; never repair,
 * transform, reorder or silently drop geometry that rounds badly. */
export function serializeBinaryStl(mesh: TriangleMesh, metrics: MeshMetrics): ArrayBuffer {
  const count = mesh.triangles.length, size = 84 + 50 * count;
  if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.triangles)
    || !Number.isSafeInteger(count) || count < 1 || count > 0xffffffff
    || !Number.isSafeInteger(size) || count > MESH_CONSTRUCTION_POLICY.maxOutputTriangles
    || mesh.vertices.length > MESH_CONSTRUCTION_POLICY.maxOutputVertices) reject();
  if (!Array.isArray(metrics.boundsMm) || metrics.boundsMm.length !== 2
    || metrics.boundsMm.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
    || !Number.isFinite(metrics.volumeMm3) || metrics.volumeMm3 <= 0
    || !Number.isSafeInteger(metrics.shellCount) || metrics.shellCount < 1) reject();
  const vertices = mesh.vertices.map(p => {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) reject();
    const emitted = p.map(Math.fround) as unknown as Point3Mm;
    if (!emitted.every(Number.isFinite)) reject();
    return emitted;
  });
  // Compensated signed tetrahedra, translated for numerical stability only in
  // this measurement. Emitted coordinates retain their absolute domain values.
  let volume = 0, correction = 0;
  const origin = vertices[0];
  const normals = mesh.triangles.map(t => {
    if (!Array.isArray(t) || t.length !== 3 || t.some(i => !Number.isSafeInteger(i) || i < 0 || i >= vertices.length)) reject();
    const [a, b, c] = t.map(i => vertices[i]);
    const n = normal(a, b, c), source = normal(...t.map(i => mesh.vertices[i]) as [Point3Mm, Point3Mm, Point3Mm]);
    const alignment = n.reduce((sum, v, i) => sum + v * source[i], 0);
    if (!Number.isFinite(alignment) || alignment <= 0) reject();
    const local = [a, b, c].map(p => p.map((v, i) => v - origin[i]) as unknown as Point3Mm);
    const [, u, v] = local;
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const term = local[0].reduce((sum, v, i) => sum + v * cross[i], 0) / 6;
    const adjusted = term - correction, total = volume + adjusted;
    correction = (total - volume) - adjusted; volume = total;
    const length = Math.hypot(...n);
    const unit = n.map(v => Math.fround(v / length)) as unknown as Point3Mm;
    if (!unit.every(Number.isFinite) || !unit.some(v => v !== 0)) reject();
    return unit;
  });
  const budget = new MeshValidationBudget();
  const checked = inspectMeshTopology({ vertices, triangles: mesh.triangles }, {
    expectedShellCount: metrics.shellCount, expectedVolumeMm3: volume, budget,
  });
  if (checked.status !== 'stitched') reject();
  for (let end = 0; end < 2; end++) for (let axis = 0; axis < 3; axis++) {
    const source = metrics.boundsMm[end][axis], emitted = checked.metrics.boundsMm[end][axis];
    if (Math.abs(source - emitted) > STL_PRECISION.absoluteBoundsMm + Math.abs(source) * STL_PRECISION.relativeBounds) reject();
  }
  if (Math.abs(checked.metrics.volumeMm3 - metrics.volumeMm3) > metrics.volumeMm3 * STL_PRECISION.relativeVolume) reject();
  assertNoMeshIntersections(checked.mesh, budget, checked.components);
  const buffer = new ArrayBuffer(size), data = new DataView(buffer);
  for (let i = 0; i < STL_HEADER.length; i++) data.setUint8(i, STL_HEADER.charCodeAt(i));
  data.setUint32(80, count, true);
  for (let i = 0; i < count; i++) {
    let offset = 84 + i * 50;
    for (const tuple of [normals[i], ...mesh.triangles[i].map((index: number) => vertices[index])]) for (const value of tuple) {
      data.setFloat32(offset, value, true); offset += 4;
    }
    data.setUint16(offset, 0, true);
  }
  return buffer;
}
