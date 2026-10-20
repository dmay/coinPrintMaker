import type { MeshMetrics, Point3Mm, Triangle, TriangleMesh } from './contracts';
import type { Diagnostic } from './diagnostics';
import { MESH_CONSTRUCTION_POLICY, MeshConstructionBudget, MeshConstructionFailure } from './meshConstructionPolicy';
import { constructionDiagnostic } from './triangulateRegion';

export type StitchResult =
  | {readonly status:'stitched';readonly mesh:TriangleMesh;readonly metrics:MeshMetrics}
  | {readonly status:'rejected';readonly diagnostics:readonly Diagnostic[];readonly mesh?:never;readonly metrics?:never};
export interface StitchOptions {readonly expectedVolumeMm3:number;readonly budget?:MeshConstructionBudget}

/** Consume already conforming constructed surfaces. Exact XYZ identity only;
 * caller must refine their contour edges BEFORE triangulation. This is bounded
 * unified-construction validation, not a general arbitrary-mesh/export validator. */
export function stitchTopology(surfaces:TriangleMesh,options:StitchOptions):StitchResult {
  const budget=options.budget??new MeshConstructionBudget();
  try{
    if(surfaces.vertices.length>MESH_CONSTRUCTION_POLICY.maxOutputVertices||surfaces.triangles.length>MESH_CONSTRUCTION_POLICY.maxOutputTriangles)throw new MeshConstructionFailure('Unstitched surface size limit exceeded.',true);
    const vertices:Point3Mm[]=[],triangles:Triangle[]=[],ids=new Map<string,number>();
    const remap=surfaces.vertices.map(p=>{
      budget.check();
      if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw new MeshConstructionFailure('Stitching requires finite XYZ tuples.');
      const xyz=p.map(v=>v||0) as unknown as Point3Mm,key=xyz.join(':');let id=ids.get(key);
      if(id===undefined){budget.output(1,0);id=vertices.length;vertices.push(xyz);ids.set(key,id);}return id;
    });
    const duplicates=new Set<string>(),edges=new Map<string,{uses:number[];balance:number}>();
    const links=vertices.map(()=>new Map<number,Set<number>>());
    const adjacency:Set<number>[]=[];
    const origin=vertices[0];let volume=0,compensation=0;
    for(const raw of surfaces.triangles){
      budget.check();budget.output(0,1);
      if(!Array.isArray(raw)||raw.length!==3||raw.some(i=>!Number.isInteger(i)||i<0||i>=remap.length))throw new MeshConstructionFailure('Stitching requires valid triangle indices.');
      const t=raw.map(i=>remap[i]) as unknown as Triangle,key=[...t].sort((a,b)=>a-b).join(':');
      if(duplicates.has(key))throw new MeshConstructionFailure('Duplicate or coincident constructed triangle.');duplicates.add(key);
      const [a,b,c]=t.map(i=>vertices[i].map((v,j)=>v-origin[j]));
      const u=b.map((v,j)=>v-a[j]),v=c.map((x,j)=>x-a[j]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if(!normal.every(Number.isFinite)||!normal.some(v=>v!==0))throw new MeshConstructionFailure('Emitted unified triangle is nonfinite or zero-area.');
      const term=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
      const adjusted=term-compensation,total=volume+adjusted;compensation=(total-volume)-adjusted;volume=total;
      const index=triangles.length;triangles.push(t);adjacency.push(new Set());
      for(let j=0;j<3;j++){
        budget.check();const x=t[j],y=t[(j+1)%3],z=t[(j+2)%3],edgeKey=x<y?`${x}:${y}`:`${y}:${x}`,edge=edges.get(edgeKey);
        if(edge){edge.uses.push(index);edge.balance+=x<y?1:-1;if(edge.uses.length>2)throw new MeshConstructionFailure('Unified edge has more than two incidences.');}
        else edges.set(edgeKey,{uses:[index],balance:x<y?1:-1});
        for(const [a,b] of [[y,z],[z,y]]){const link=links[x].get(a)??new Set<number>();link.add(b);links[x].set(a,link);}
      }
    }
    for(const edge of edges.values()){
      budget.check();if(edge.uses.length!==2||edge.balance!==0)throw new MeshConstructionFailure('Unified surface is not closed with opposite edge incidence.');
      adjacency[edge.uses[0]].add(edge.uses[1]);adjacency[edge.uses[1]].add(edge.uses[0]);
    }
    const visit=(start:number,neighbors:(n:number)=>Iterable<number>):Set<number>=>{
      const seen=new Set<number>(),queue=[start];while(queue.length){budget.check();const v=queue.pop()!;if(seen.has(v))continue;seen.add(v);for(const n of neighbors(v))queue.push(n);}return seen;
    };
    if(!triangles.length||visit(0,n=>adjacency[n]).size!==triangles.length)throw new MeshConstructionFailure('Coin boundary must be one connected shell; cavities and disconnected surfaces reject.');
    for(const link of links){
      budget.check();if(link.size<3||[...link.values()].some(n=>n.size!==2)||visit(link.keys().next().value!,n=>link.get(n)!).size!==link.size)throw new MeshConstructionFailure('Unified vertex link is not one cycle; pinches reject.');
    }
    const expected=options.expectedVolumeMm3;
    if(!Number.isFinite(expected)||!(expected>0)||!Number.isFinite(volume)||!(volume>0)||Math.abs(volume-expected)>expected*MESH_CONSTRUCTION_POLICY.relativeVolumeError)throw new MeshConstructionFailure('Unified volume differs from the supported tier area-height sum.');
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const p of vertices)for(let j=0;j<3;j++){budget.check();min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}
    return {status:'stitched',mesh:{vertices,triangles},metrics:{boundsMm:[min as unknown as Point3Mm,max as unknown as Point3Mm],volumeMm3:volume,shellCount:1}};
  }catch(error){return {status:'rejected',diagnostics:[constructionDiagnostic(error,null)]};}
}
