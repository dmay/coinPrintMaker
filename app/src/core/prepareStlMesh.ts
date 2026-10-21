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
 * area; locally retriangulate horizontal caps when rounding reverses a facet.
 * A second attempt may snap to a one-micron grid before float32 encoding.
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
  const vertices: Point3Mm[] = [], ids = new Map<string, number>();
  const remap=rounded.map(p=>{
    const key=p.map(v=>v||0).join(':');let id=ids.get(key);
    if(id===undefined){id=vertices.length;ids.set(key,id);vertices.push(p);}return id;
  });
  const faces:{triangle:Triangle;capSign:number}[]=[];
  for(const t of source.triangles){
    const triangle=t.map(i=>remap[i]) as unknown as Triangle;
    if(new Set(triangle).size<3)continue;
    const original=stlNormal(...t.map(i=>source.vertices[i]) as [Point3Mm,Point3Mm,Point3Mm]);
    const n=stlNormal(...triangle.map(i=>vertices[i]) as [Point3Mm,Point3Mm,Point3Mm]);
    const capSign=t.every(i=>source.vertices[i][2]===source.vertices[t[0]][2])?Math.sign(original[2]):0;
    if(!n.every(Number.isFinite))throw Error('Invalid STL normal.');
    if(!capSign){
      if(!n.some(v=>v!==0))continue;
      if(n.reduce((sum,v,i)=>sum+v*original[i],0)<=0)throw Error('STL facet reversed.');
    }
    faces.push({triangle,capSign});
  }
  // Rounding can reverse a very thin cap triangle even though the contour is
  // still simple. Flip only an internal diagonal between coplanar cap faces.
  // Both replacement triangles must have the original outward orientation;
  // positions and the patch's directed boundary remain exactly unchanged.
  const edges=new Map<string,Set<number>>();
  const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const update=(id:number,add:boolean)=>{
    const t=faces[id].triangle;
    for(let i=0;i<3;i++){
      const key=edgeKey(t[i],t[(i+1)%3]);
      if(add){const uses=edges.get(key)??new Set<number>();uses.add(id);edges.set(key,uses);}
      else {const uses=edges.get(key)!;uses.delete(id);if(!uses.size)edges.delete(key);}
    }
  };
  const oriented=(t:Triangle,sign:number)=>stlNormal(...t.map(i=>vertices[i]) as [Point3Mm,Point3Mm,Point3Mm])[2]*sign>0;
  for(let id=0;id<faces.length;id++)update(id,true);
  for(let id=0;id<faces.length;id++){
    const face=faces[id];if(!face.capSign||oriented(face.triangle,face.capSign))continue;
    let repaired=false;
    for(let i=0;i<3&&!repaired;i++){
      const [a,b,c]=[face.triangle[i],face.triangle[(i+1)%3],face.triangle[(i+2)%3]];
      const uses=edges.get(edgeKey(a,b));if(uses?.size!==2)continue;
      const otherId=[...uses].find(index=>index!==id)!,other=faces[otherId];
      if(other.capSign!==face.capSign||vertices[other.triangle[0]][2]!==vertices[a][2])continue;
      const index=other.triangle.findIndex((v,j)=>v===b&&other.triangle[(j+1)%3]===a);
      if(index<0)continue;
      const d=other.triangle[(index+2)%3];if(d===c)continue;
      const first:Triangle=[c,a,d],second:Triangle=[c,d,b];
      if(!oriented(first,face.capSign)||!oriented(second,face.capSign))continue;
      update(id,false);update(otherId,false);face.triangle=first;other.triangle=second;update(id,true);update(otherId,true);repaired=true;
    }
    if(!repaired)throw Error('STL cap could not be retriangulated.');
  }
  // Omitted facets may leave unused positions. Do not count them as isolated
  // topology vertices or include them in measured output bounds.
  const compact:Point3Mm[]=[],used=new Map<number,number>();
  const triangles=faces.map(({triangle})=>triangle.map(i=>{
    let id=used.get(i);if(id===undefined){id=compact.length;used.set(i,id);compact.push(vertices[i]);}return id;
  }) as unknown as Triangle);
  return {mesh:{vertices:compact,triangles},displacementMm};
}
