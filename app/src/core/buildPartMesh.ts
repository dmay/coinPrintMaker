import type { ActiveTier, GeneratedPart, Point3Mm, Triangle } from './contracts';
import type { Diagnostic } from './diagnostics';
import { guardedCanonicalFootprint } from './polygonGeometry';
import { MESH_CONSTRUCTION_POLICY, MeshConstructionBudget, MeshConstructionFailure } from './meshConstructionPolicy';
import { constructionDiagnostic, triangulateRegion } from './triangulateRegion';
import type { ConstructionOptions } from './triangulateRegion';
import type { TriangulationKernel } from './triangulationKernel';

export type PartMeshResult =
  | { readonly status: 'built'; readonly part: GeneratedPart }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[]; readonly part?: never };

/** Independent closed tier, including its intentional coincident interface caps.
 * Construction evidence only; not full generated-coin or serialized validity. */
export function buildPartMesh(tier: ActiveTier, kernel: TriangulationKernel, options: ConstructionOptions = {}): PartMeshResult {
  const budget=options.budget ?? new MeshConstructionBudget();
  try {
    if(!tier.layerId || typeof tier.name!=='string' || !/^#[0-9a-f]{6}$/i.test(tier.color) ||
        ![tier.bottomZMm,tier.topZMm,tier.thicknessMm].every(Number.isFinite) || tier.bottomZMm<0 ||
        tier.thicknessMm<=0 || tier.topZMm<=tier.bottomZMm || tier.bottomZMm+tier.thicknessMm!==tier.topZMm || !tier.footprintMm.length) {
      throw new MeshConstructionFailure('A named tier with finite positive exact Z interval and opaque color is required.');
    }
    guardedCanonicalFootprint(tier.footprintMm,budget.polygonBudget);
    const vertices: Point3Mm[]=[],triangles: Triangle[]=[];
    let areaMm2=0;
    for(const polygon of tier.footprintMm) {
      const result=triangulateRegion(polygon,kernel,{layerId:tier.layerId,budget});
      if(result.status==='rejected') return result;
      const cap=result.region,offset=vertices.length,n=cap.vertices.length;
      const newTriangleCount=2*cap.triangles.length+2*n;
      budget.output(2*n,newTriangleCount);
      for(const z of [tier.bottomZMm,tier.topZMm]) for(const [x,y] of cap.vertices) vertices.push([x,y,z]);
      for(const [a,b,c] of cap.triangles) {
        triangles.push([offset+a,offset+c,offset+b],[offset+n+a,offset+n+b,offset+n+c]);
      }
      for(const ring of cap.boundaries) for(let i=0;i<ring.length;i++) {
        const a=offset+ring[i],b=offset+ring[(i+1)%ring.length];
        // Filled material is left of every canonical outer/hole edge.
        triangles.push([a,b,b+n],[a,b+n,a+n]);
      }
      areaMm2+=cap.areaMm2;
    }
    const edges=new Map<string,{count:number;balance:number}>();
    const origin=vertices[0]; let volume=0, compensation=0;
    for(const triangle of triangles) {
      budget.check();
      const [a,b,c]=triangle.map(i=>vertices[i].map((v,j)=>v-origin[j]));
      const u=b.map((v,j)=>v-a[j]),v=c.map((x,j)=>x-a[j]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if(!normal.every(Number.isFinite) || !normal.some(x=>x!==0)) throw new MeshConstructionFailure('Emitted triangle has nonfinite or zero-area coordinates.');
      const term=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
      const adjusted=term-compensation,total=volume+adjusted; compensation=(total-volume)-adjusted; volume=total;
      for(let j=0;j<3;j++) {
        budget.check(); const p=triangle[j],q=triangle[(j+1)%3],key=p<q?`${p}:${q}`:`${q}:${p}`,e=edges.get(key);
        if(e) { e.count++; e.balance+=p<q?1:-1; } else edges.set(key,{count:1,balance:p<q?1:-1});
      }
    }
    if([...edges.values()].some(e=>e.count!==2 || e.balance!==0)) throw new MeshConstructionFailure('Constructed part is not closed with opposite edge incidence.');
    const expected=areaMm2*(tier.topZMm-tier.bottomZMm);
    if(!Number.isFinite(volume) || !(volume>0) || !Number.isFinite(expected) || Math.abs(volume-expected)>expected*MESH_CONSTRUCTION_POLICY.relativeVolumeError) throw new MeshConstructionFailure('Constructed part volume differs from filled area times exact height.');
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of vertices) { minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y); }
    return {status:'built',part:{layerId:tier.layerId,name:tier.name,color:tier.color,mesh:{vertices,triangles},metrics:{
      boundsMm:[[minX,minY,tier.bottomZMm],[maxX,maxY,tier.topZMm]],volumeMm3:volume,shellCount:tier.footprintMm.length,
    }}};
  } catch(error) { return {status:'rejected',diagnostics:[constructionDiagnostic(error,tier.layerId)]}; }
}
