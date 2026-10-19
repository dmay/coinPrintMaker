import type { Point2Mm, PolygonMm, Triangle } from './contracts';
import type { Diagnostic } from './diagnostics';
import { createDiagnostic } from './diagnostics';
import { guardedCanonicalFootprint, PolygonFailure } from './polygonGeometry';
import { binaryPoint, gridArea2, gridCross, gridOnSegment, gridPoint } from './meshGrid';
import type { GridPoint } from './meshGrid';
import { MESH_CONSTRUCTION_POLICY, MeshConstructionBudget, MeshConstructionFailure } from './meshConstructionPolicy';
import type { TriangulationKernel } from './triangulationKernel';

export interface TriangulatedRegion {
  readonly vertices: readonly Point2Mm[];
  readonly triangles: readonly Triangle[];
  /** Ordered original ring indices: exterior CCW followed by holes CW. */
  readonly boundaries: readonly (readonly number[])[];
  readonly areaMm2: number;
}
export type TriangulationResult =
  | { readonly status: 'triangulated'; readonly region: TriangulatedRegion }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[]; readonly region?: never };
export interface ConstructionOptions {
  readonly layerId?: string;
  readonly budget?: MeshConstructionBudget;
}
export function constructionDiagnostic(error: unknown, layerId: string | null): Diagnostic {
  const known = error instanceof MeshConstructionFailure || error instanceof PolygonFailure;
  const diagnostic = createDiagnostic(known && error.limit ? 'MESH_LIMIT_EXCEEDED' : 'MESH_INVALID', {scope:'mesh',layerId});
  return {...diagnostic, message: diagnostic.message + ' ' + (known ? error.message : 'Triangulator compatibility failure. Simplify the artwork or report this file.')};
}
interface Edge { a: number; b: number; count: number; balance: number }
const edgeKey = (a: number,b: number) => a<b ? `${a}:${b}` : `${b}:${a}`;
function edgesOf(triangles: readonly Triangle[], budget: MeshConstructionBudget): Map<string,Edge> {
  const edges = new Map<string,Edge>();
  for (const t of triangles) for(let i=0;i<3;i++) {
    budget.check(); const a=t[i],b=t[(i+1)%3],key=edgeKey(a,b),edge=edges.get(key);
    if(edge) { edge.count++; edge.balance += a<b?1:-1; }
    else edges.set(key,{a,b,count:1,balance:a<b?1:-1});
  }
  for(const edge of edges.values()) if(edge.count>2 || (edge.count===2 && edge.balance!==0)) throw new MeshConstructionFailure('Cap edges overlap or have inconsistent winding.');
  return edges;
}
/** Exact positive oriented cap + exact oriented boundary equality proves filled
 * coverage (winding number one inside, zero outside/holes), not just equal area. */
export function triangulateRegion(polygon: PolygonMm, kernel: TriangulationKernel, options: ConstructionOptions = {}): TriangulationResult {
  const budget=options.budget ?? new MeshConstructionBudget();
  try {
    const rings=[polygon.outer,...polygon.holes], count=rings.reduce((n,r)=>n+r.length,0);
    if(count > MESH_CONSTRUCTION_POLICY.maxRegionVertices) throw new MeshConstructionFailure('Region vertex limit exceeded.',true);
    budget.input(count);
    // Validate topology under the unchanged polygon policy; retain the original
    // points/order, including collinear boundary subdivisions, for wall identity.
    guardedCanonicalFootprint([polygon],budget.polygonBudget);
    const vertices: Point2Mm[]=[], grid: GridPoint[]=[], binary: GridPoint[]=[], boundaries: number[][]=[];
    let area2=0n,binaryArea2=0n; const seen=new Set<string>();
    for(const [index,ring] of rings.entries()) {
      const indices=ring.map(p=>{
        budget.check(); const lattice=gridPoint(p),key=`${lattice[0]}:${lattice[1]}`;
        if(seen.has(key)) throw new MeshConstructionFailure('Canonical boundaries must have distinct open vertices.');
        seen.add(key); vertices.push([p[0],p[1]]); grid.push(lattice); binary.push(binaryPoint(p)); return vertices.length-1;
      });
      const signed=gridArea2(indices.map(i=>grid[i]));
      if(index===0 ? signed<=0n : signed>=0n) throw new MeshConstructionFailure('Canonical exterior/hole winding is required.');
      area2+=signed; binaryArea2+=gridArea2(indices.map(i=>binary[i])); boundaries.push(indices);
    }
    const raw=kernel.triangulate(vertices.map(p=>[p[0],p[1]]),boundaries.slice(1).map(r=>r[0]));
    if(!Array.isArray(raw) || !raw.length) throw new MeshConstructionFailure('Triangulator returned an invalid or empty cap.');
    if(raw.length>MESH_CONSTRUCTION_POLICY.maxRegionTriangles) throw new MeshConstructionFailure('Triangulator cap triangle limit exceeded.',true);
    let triangles: Triangle[]=raw.map(t=>{
      budget.check();
      if(!Array.isArray(t) || t.length!==3 || t.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length)) throw new MeshConstructionFailure('Triangulator returned an invalid index.');
      const [a,b,c]=t, turn=gridCross(grid[a],grid[b],grid[c]);
      if(turn===0n) throw new MeshConstructionFailure('Triangulator returned a zero-area triangle.');
      return turn>0n ? [a,b,c] : [a,c,b];
    });
    const edges=edgesOf(triangles,budget), next=new Map<number,number>();
    for(const ring of boundaries) for(let i=0;i<ring.length;i++) next.set(ring[i],ring[(i+1)%ring.length]);
    const splits=new Map<string,number[]>();
    for(const edge of edges.values()) if(edge.count===1) {
      const path=[edge.a]; let current=edge.a;
      while(current!==edge.b) {
        budget.check(); current=next.get(current)!;
        if(current===undefined || current===edge.a || !gridOnSegment(grid[current],grid[edge.a],grid[edge.b])) throw new MeshConstructionFailure('Exposed cap edge is not an ordered original boundary segment.');
        path.push(current);
      }
      if(path.length>2) splits.set(`${edge.a}:${edge.b}`,path);
    }
    // Restore only exposed ring-edge subdivisions. No all-vertex search, fuzzy
    // stitching, new point, changed contour or nonzero-area triangle deletion.
    const restored: Triangle[]=[];
    for(const triangle of triangles) {
      let pieces: Triangle[]=[triangle];
      for(let i=0;i<3;i++) {
        const a=triangle[i],b=triangle[(i+1)%3],path=splits.get(`${a}:${b}`);
        if(!path) continue;
        const replacement: Triangle[]=[];
        for(const piece of pieces) {
          budget.check(); const e=piece.findIndex((v,j)=>v===a && piece[(j+1)%3]===b);
          if(e<0) replacement.push(piece);
          else for(let j=0;j+1<path.length;j++) replacement.push([path[j],path[j+1],piece[(e+2)%3]]);
        }
        pieces=replacement;
      }
      restored.push(...pieces);
      if(restored.length>MESH_CONSTRUCTION_POLICY.maxRegionTriangles) throw new MeshConstructionFailure('Restored cap triangle limit exceeded.',true);
    }
    triangles=restored;
    let triangleArea2=0n,binaryTriangleArea2=0n;
    for(const [a,b,c] of triangles) {
      budget.check(); const turn=gridCross(grid[a],grid[b],grid[c]);
      if(turn<=0n) throw new MeshConstructionFailure('Restored cap is degenerate or reversed.');
      triangleArea2+=turn;
      const emittedTurn=gridCross(binary[a],binary[b],binary[c]);
      if(emittedTurn<=0n) throw new MeshConstructionFailure('Emitted binary XY would reverse or collapse a cap triangle.');
      binaryTriangleArea2+=emittedTurn;
    }
    const finalEdges=edgesOf(triangles,budget);
    for(const ring of boundaries) for(let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length],key=edgeKey(a,b),edge=finalEdges.get(key);
      if(!edge || edge.count!==1 || edge.a!==a || edge.b!==b) throw new MeshConstructionFailure('Cap does not preserve every oriented boundary edge.');
      finalEdges.delete(key);
    }
    if([...finalEdges.values()].some(e=>e.count!==2 || e.balance!==0) || triangleArea2!==area2 || area2<=0n || binaryTriangleArea2!==binaryArea2 || binaryArea2<=0n) throw new MeshConstructionFailure('Cap coverage differs from the complete filled polygon.');
    // Volume refers to emitted binary coordinates, not an ideal grid area.
    // Convert their exact dyadic area once to the returned finite number.
    const areaMm2=Number(binaryArea2)*2**-161;
    return {status:'triangulated',region:{vertices,triangles,boundaries,areaMm2}};
  } catch(error) { return {status:'rejected',diagnostics:[constructionDiagnostic(error,options.layerId ?? null)]}; }
}
