import type { CoinSettings, GeneratedCoin, ImportedCoin, TriangleMesh, ValidGeneratedCoin } from '../core/contracts';

export interface GenerationRequest {
  readonly token: number;
  readonly sourceRevision: number;
  readonly coin: ImportedCoin;
  readonly settings: CoinSettings;
}
export interface RequestKey {
  readonly version: 1;
  readonly token: number;
  readonly sourceRevision: number;
  readonly importId: string;
  readonly settingsRevision: number;
}
export type GenerationPhase = 'starting' | 'generating' | 'receiving';
export interface GenerationTransport {
  execute(request: GenerationRequest, progress?: (phase: GenerationPhase) => void): Promise<GeneratedCoin>;
  cancel(): void;
  dispose(): void;
}
export interface PackedMesh { readonly positions: Float64Array; readonly indices: Uint32Array }
export type PackedGeneration = Exclude<GeneratedCoin, ValidGeneratedCoin> | (
  Omit<ValidGeneratedCoin, 'unifiedMesh' | 'parts'> & {
    readonly unifiedMesh: PackedMesh;
    readonly parts: readonly (Omit<ValidGeneratedCoin['parts'][number], 'mesh'> & { readonly mesh: PackedMesh })[];
  });
export type WorkerRequest = RequestKey & { readonly type: 'generate'; readonly coin: ImportedCoin; readonly settings: CoinSettings };
export type WorkerResponse = RequestKey & (
  { readonly type: 'progress'; readonly phase: 'generating' | 'receiving' }
  | { readonly type: 'result'; readonly result: PackedGeneration }
  | { readonly type: 'error'; readonly reason: 'generation-failed' }
);
export function requestKey(request: GenerationRequest): RequestKey {
  return { version: 1, token: request.token, sourceRevision: request.sourceRevision,
    importId: request.settings.importId, settingsRevision: request.settings.revision };
}
export function matchesKey(value: unknown, key: RequestKey): value is RequestKey {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<RequestKey>;
  return candidate.version === 1 && candidate.token === key.token && candidate.sourceRevision === key.sourceRevision
    && candidate.importId === key.importId && candidate.settingsRevision === key.settingsRevision;
}
export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (value === null || typeof value !== 'object') return false;
  const request = value as WorkerRequest;
  return request.type === 'generate' && request.version === 1
    && Number.isSafeInteger(request.token) && request.token > 0
    && Number.isSafeInteger(request.sourceRevision) && request.sourceRevision > 0
    && typeof request.importId === 'string' && request.importId.trim().length > 0
    && Number.isSafeInteger(request.settingsRevision) && request.settingsRevision >= 0
    && request.coin?.source?.importId === request.importId
    && request.settings?.importId === request.importId && request.settings?.revision === request.settingsRevision;
}

// Transport views are new allocations owned by the worker. Domain tuples and
// renderer Float32 views never become transferable ownership sources.
export function packGeneration(result: GeneratedCoin): { result: PackedGeneration; transfers: ArrayBuffer[] } {
  const transfers: ArrayBuffer[] = [];
  function pack(mesh: TriangleMesh): PackedMesh {
    const positions = new Float64Array(mesh.vertices.length * 3);
    const indices = new Uint32Array(mesh.triangles.length * 3);
    mesh.vertices.forEach((point, i) => positions.set(point, i * 3));
    mesh.triangles.forEach((triangle, i) => indices.set(triangle, i * 3));
    transfers.push(positions.buffer, indices.buffer);
    return { positions, indices };
  }
  return { result: result.status === 'invalid' ? result : { ...result,
    unifiedMesh: pack(result.unifiedMesh), parts: result.parts.map(part => ({ ...part, mesh: pack(part.mesh) })) }, transfers };
}
export function unpackGeneration(result: PackedGeneration): GeneratedCoin {
  if (!result || result.schemaVersion !== 1 || !Array.isArray(result.diagnostics)) throw new Error('Invalid result envelope.');
  if (result.status === 'invalid') {
    if (['parts', 'unifiedMesh', 'activeTiers', 'metrics', 'dimensionsMm', 'analyticalVolumeMm3', 'colorBoundaryHeightsMm'].some(key => key in result)) throw new Error('Invalid result carries geometry.');
    return result;
  }
  if (result.status !== 'valid' || !Array.isArray(result.parts) || !Array.isArray(result.activeTiers)
    || !Array.isArray(result.dimensionsMm) || result.dimensionsMm.length !== 3
    || !result.dimensionsMm.every(Number.isFinite) || !result.metrics || !result.input) throw new Error('Invalid result metadata.');
  function unpack(mesh: PackedMesh): TriangleMesh {
    if (!mesh || !(mesh.positions instanceof Float64Array) || !(mesh.indices instanceof Uint32Array)
      || mesh.positions.length === 0 || mesh.positions.length % 3 || mesh.indices.length === 0 || mesh.indices.length % 3
      || mesh.positions.length > 300_000 || mesh.indices.length > 600_000
      || !mesh.positions.every(Number.isFinite) || !mesh.indices.every(index => index < mesh.positions.length / 3)) throw new Error('Invalid mesh transport.');
    const vertices: [number, number, number][] = [], triangles: [number, number, number][] = [];
    for (let i = 0; i < mesh.positions.length; i += 3) vertices.push([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
    for (let i = 0; i < mesh.indices.length; i += 3) triangles.push([mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]]);
    return { vertices, triangles };
  }
  return { ...result, unifiedMesh: unpack(result.unifiedMesh), parts: result.parts.map(part => ({ ...part, mesh: unpack(part.mesh) })) };
}
