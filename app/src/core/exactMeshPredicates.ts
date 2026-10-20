import type { Point3Mm, TriangleMesh } from './contracts';
import { MeshConstructionBudget, MeshConstructionFailure } from './meshConstructionPolicy';

export type ExactPoint = readonly [bigint,bigint,bigint];
type RationalPoint = {n:ExactPoint;d:bigint};
const bits=new DataView(new ArrayBuffer(8));
function dyadic(value:number):{m:bigint;e:number}{
  bits.setFloat64(0,value);const raw=bits.getBigUint64(0),fraction=raw&((1n<<52n)-1n),exponent=Number((raw>>52n)&2047n);
  return {m:((raw>>63n)?-1n:1n)*(exponent?fraction+(1n<<52n):fraction),e:exponent?exponent-1075:-1074};
}
/** One exact common dyadic lattice, including subnormal Z. At most 2098 bits per
 * coordinate for finite doubles. No rounding, snapping or emitted transform. */
export function exactCoordinates(points:readonly Point3Mm[],budget?:MeshConstructionBudget):ExactPoint[]{
  let exponent=0;
  for(const point of points)for(const value of point){budget?.check();if(!Number.isFinite(value))throw new MeshConstructionFailure('Exact predicates require finite coordinates.');const v=dyadic(value);if(v.m)exponent=Math.min(exponent,v.e);}
  return points.map(p=>p.map(value=>{budget?.check();const v=dyadic(value);return v.m===0n?0n:v.m<<BigInt(v.e-exponent);}) as unknown as ExactPoint);
}
export const subtract=(a:ExactPoint,b:ExactPoint):ExactPoint=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const cross3=(a:ExactPoint,b:ExactPoint):ExactPoint=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const dot3=(a:ExactPoint,b:ExactPoint):bigint=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const normal=(t:readonly ExactPoint[])=>cross3(subtract(t[1],t[0]),subtract(t[2],t[0]));
const project=(n:ExactPoint):readonly [number,number]=>n[2]!==0n?[0,1]:n[1]!==0n?[0,2]:[1,2];
const orient=(a:ExactPoint,b:ExactPoint,p:RationalPoint,axes:readonly number[])=>
  (b[axes[0]]-a[axes[0]])*(p.n[axes[1]]-a[axes[1]]*p.d)-(b[axes[1]]-a[axes[1]])*(p.n[axes[0]]-a[axes[0]]*p.d);
const rational=(n:ExactPoint,d=1n):RationalPoint=>d<0n?{n:n.map(x=>-x) as unknown as ExactPoint,d:-d}:{n,d};
const interpolate=(a:ExactPoint,b:ExactPoint,n:bigint,d:bigint)=>rational(a.map((v,i)=>v*d+(b[i]-v)*n) as unknown as ExactPoint,d);
const inTriangle=(p:RationalPoint,t:readonly ExactPoint[],axes:readonly number[])=>{
  const signs=t.map((a,i)=>orient(a,t[(i+1)%3],p,axes));return signs.every(x=>x>=0n)||signs.every(x=>x<=0n);
};
function onSegment(p:RationalPoint,a:ExactPoint,b:ExactPoint):boolean{
  const delta=p.n.map((x,i)=>x-a[i]*p.d) as unknown as ExactPoint;
  return cross3(subtract(b,a),delta).every(x=>x===0n)&&a.every((x,i)=>(p.n[i]-x*p.d)*(p.n[i]-b[i]*p.d)<=0n);
}
function segmentCandidates(a:ExactPoint,b:ExactPoint,c:ExactPoint,d:ExactPoint,axes:readonly number[],emit:(p:RationalPoint)=>void){
  for(const [p,x,y] of [[a,c,d],[b,c,d],[c,a,b],[d,a,b]])if(onSegment(rational(p),x,y))emit(rational(p));
  const ac=orient(a,b,rational(c),axes),ad=orient(a,b,rational(d),axes),ca=orient(c,d,rational(a),axes),cb=orient(c,d,rational(b),axes);
  if(ac*ad<0n&&ca*cb<0n)emit(interpolate(a,b,ca,ca-cb));
}
/** Reject any intersection except the exact common indexed vertex or edge.
 * Includes adjacent coplanar pairs; shared adjacency does not excuse overlaps. */
export function assertTrianglePair(a:readonly ExactPoint[],b:readonly ExactPoint[],shared:readonly ExactPoint[]):void{
  const allowed=(p:RationalPoint)=>shared.length===1?p.n.every((v,i)=>v===shared[0][i]*p.d):shared.length===2&&onSegment(p,shared[0],shared[1]);
  const emit=(p:RationalPoint)=>{if(!allowed(p))throw new MeshConstructionFailure('Triangles intersect, overlap or contact beyond their exact shared simplex.');};
  const na=normal(a),nb=normal(b);
  if(!na.some(x=>x!==0n)||!nb.some(x=>x!==0n))throw new MeshConstructionFailure('Exact dyadic triangle normal is zero.');
  const axesA=project(na),axesB=project(nb);
  const distances=a.map(p=>dot3(nb,subtract(p,b[0])));
  if(distances.every(x=>x===0n)){
    for(const p of a)if(inTriangle(rational(p),b,axesB))emit(rational(p));
    for(const p of b)if(inTriangle(rational(p),a,axesA))emit(rational(p));
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)segmentCandidates(a[i],a[(i+1)%3],b[j],b[(j+1)%3],axesB,emit);
    return;
  }
  const edgesAgainst=(t:readonly ExactPoint[],other:readonly ExactPoint[],n:ExactPoint,axes:readonly number[])=>{
    for(let i=0;i<3;i++){
      const x=t[i],y=t[(i+1)%3],dx=dot3(n,subtract(x,other[0])),dy=dot3(n,subtract(y,other[0]));
      if(dx*dy>0n)continue;
      if(dx===0n&&dy===0n){
        for(const p of [x,y])if(inTriangle(rational(p),other,axes))emit(rational(p));
        for(let j=0;j<3;j++)segmentCandidates(x,y,other[j],other[(j+1)%3],axes,emit);
      }else{const p=interpolate(x,y,dx,dx-dy);if(inTriangle(p,other,axes))emit(p);}
    }
  };
  edgesAgainst(a,b,nb,axesB);edgesAgainst(b,a,na,axesA);
}
export function assertNoMeshIntersections(mesh:TriangleMesh,budget:MeshConstructionBudget,components:readonly (readonly number[])[]):void{
  const points=exactCoordinates(mesh.vertices,budget),boxes=mesh.triangles.map((t,id)=>{
    budget.check(4);if(!normal(t.map(i=>points[i])).some(x=>x!==0n))throw new MeshConstructionFailure('Exact dyadic triangle normal is zero.');const p=t.map(i=>mesh.vertices[i]);return {id,min:[0,1,2].map(j=>Math.min(...p.map(x=>x[j]))),max:[0,1,2].map(j=>Math.max(...p.map(x=>x[j])))};
  });
  // Longest spatial axis bounds sweep candidates; every scan and pair is charged.
  const span=[0,1,2].map(j=>{let lo=Infinity,hi=-Infinity;for(const p of mesh.vertices){budget.check();lo=Math.min(lo,p[j]);hi=Math.max(hi,p[j]);}return hi-lo;}),axis=span.indexOf(Math.max(...span));
  boxes.sort((a,b)=>{budget.check();return a.min[axis]-b.min[axis]||a.id-b.id;});
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    budget.check();const a=boxes[i],b=boxes[j];if(b.min[axis]>a.max[axis])break;
    if([0,1,2].some(k=>a.max[k]<b.min[k]||b.max[k]<a.min[k]))continue;
    budget.check(32);const ta=mesh.triangles[a.id],tb=mesh.triangles[b.id];
    assertTrianglePair(ta.map(k=>points[k]),tb.map(k=>points[k]),ta.filter(k=>tb.includes(k)).map(k=>points[k]));
  }

  // Closed disjoint components may still enclose one another. Such a boundary
  // contains internal faces, not separated outward material shells.
  for(let i=0;i<components.length;i++)for(let j=0;j<components.length;j++)if(i!==j){
    budget.check();const point=points[mesh.triangles[components[i][0]][0]],target=components[j];
    const targetPoints=target.flatMap(face=>mesh.triangles[face].map(index=>points[index]));
    const bounds=[0,1,2].map(axis=>{let min=targetPoints[0][axis],max=min;for(const p of targetPoints){budget.check();if(p[axis]<min)min=p[axis];if(p[axis]>max)max=p[axis];}return [min,max];});
    if(bounds.some(([min,max],axis)=>point[axis]<min||point[axis]>max))continue;
    let classified=false;
    for(let attempt=1;attempt<=64&&!classified;attempt++){
      const k=BigInt(attempt),direction:ExactPoint=[1n,k,k*k];let hits=0,ambiguous=false;
      for(const face of target){
        budget.check(16);const t=mesh.triangles[face].map(index=>points[index]),n=normal(t),den=dot3(n,direction),num=dot3(n,subtract(t[0],point));
        if(den===0n){if(num===0n){ambiguous=true;break;}continue;}
        if(num*den<=0n)continue;
        const p=rational(point.map((v,axis)=>v*den+direction[axis]*num) as unknown as ExactPoint,den),axes=project(n);
        if(!inTriangle(p,t,axes))continue;
        if(t.some((a,index)=>orient(a,t[(index+1)%3],p,axes)===0n)){ambiguous=true;break;}
        hits++;
      }
      if(ambiguous)continue;classified=true;
      if(hits%2)throw new MeshConstructionFailure('Nested components create internal faces.');
    }
    if(!classified)throw new MeshConstructionFailure('Component containment could not be classified within the exact ray budget.',true);
  }
}
