import type { ActiveTier, Point3Mm, TriangleMesh } from './contracts';
import { cross3, exactCoordinates, subtract } from './exactMeshPredicates';
import type { ExactPoint } from './exactMeshPredicates';
import { MeshConstructionBudget, MeshConstructionFailure } from './meshConstructionPolicy';

type Segment=readonly [ExactPoint,ExactPoint];
type SourceSegment=readonly [Point3Mm,Point3Mm];
function gcd(a:bigint,b:bigint,budget:MeshConstructionBudget):bigint{a=a<0n?-a:a;b=b<0n?-b:b;while(b){budget.check();[a,b]=[b,a%b];}return a;}
/** Primitive direction and exact moment identify an infinite supporting line. */
function line(a:ExactPoint,b:ExactPoint,budget:MeshConstructionBudget){
  const delta=subtract(b,a),factor=delta.reduce((x,y)=>gcd(x,y,budget),0n);
  if(!factor)throw new MeshConstructionFailure('Surface boundary has a zero-length segment.');
  const sign=delta.find(x=>x!==0n)!>0n?1n:-1n,d=delta.map(x=>x/factor*sign) as unknown as ExactPoint,m=cross3(a,d),axis=d.findIndex(x=>x!==0n);
  return {key:[...d,...m].join(':'),axis,sign};
}
function assertChain(actual:readonly Segment[],expected:readonly Segment[],budget:MeshConstructionBudget){
  const lines=new Map<string,Map<bigint,number>>();
  for(const [segments,weight] of [[actual,1],[expected,-1]] as const)for(const [a,b] of segments){
    budget.check();const l=line(a,b,budget),events=lines.get(l.key)??new Map<bigint,number>();lines.set(l.key,events);
    events.set(a[l.axis],(events.get(a[l.axis])??0)+weight);events.set(b[l.axis],(events.get(b[l.axis])??0)-weight);
  }
  // Endpoint events must all vanish: equivalent to zero signed multiplicity on
  // every interval, including mismatched subdivisions, overlaps and hole edges.
  for(const events of lines.values())for(const count of events.values()){budget.check();if(count!==0)throw new MeshConstructionFailure('Mesh surface boundary differs from the exact current tier surface.');}
}
/** Positive planar chains + exact source boundary equality prove full winding
 * coverage; centroid/area-only checks cannot establish this property. */
export function assertTierSurfaces(mesh:TriangleMesh,tiers:readonly ActiveTier[],kind:'part'|'unified',budget:MeshConstructionBudget):void{
  const source: {key:string;segments:SourceSegment[];sign?:number}[]=[],allPoints:Point3Mm[]=[...mesh.vertices];
  const cap=(z:number,index:number,sign:number,subtractUpper:boolean)=>{
    const segments:SourceSegment[]=[];
    const add=(tier:ActiveTier,direction:number)=>{for(const polygon of tier.footprintMm)for(const ring of [polygon.outer,...polygon.holes])for(let i=0;i<ring.length;i++){
      budget.check();const a:Point3Mm=[...ring[i],z],b:Point3Mm=[...ring[(i+1)%ring.length],z];segments.push(direction>0?[a,b]:[b,a]);
    }};
    add(tiers[index],sign);if(subtractUpper)add(tiers[index+1],-sign);source.push({key:`h:${z}`,segments,sign});
  };
  cap(tiers[0].bottomZMm,0,-1,false);
  for(let i=0;i<tiers.length;i++)cap(tiers[i].topZMm,i,1,kind==='unified'&&i+1<tiers.length);
  const walls:{tier:number;quad:readonly Point3Mm[]}[]=[];
  for(const [index,tier] of tiers.entries())for(const polygon of tier.footprintMm)for(const ring of [polygon.outer,...polygon.holes])for(let i=0;i<ring.length;i++){
    budget.check();const a=ring[i],b=ring[(i+1)%ring.length];walls.push({tier:index,quad:[[...a,tier.bottomZMm],[...b,tier.bottomZMm],[...b,tier.topZMm],[...a,tier.topZMm]]});
  }
  for(const item of source)for(const segment of item.segments)allPoints.push(...segment);
  for(const wall of walls)allPoints.push(...wall.quad);
  const exact=exactCoordinates(allPoints,budget),expected=new Map<string,Segment[]>(),actual=new Map<string,Segment[]>(),signs=new Map<string,number>();let offset=mesh.vertices.length;
  for(const item of source){
    const list:Segment[]=[];for(const segment of item.segments){void segment;list.push([exact[offset++],exact[offset++]]);}expected.set(item.key,list);signs.set(item.key,item.sign!);
  }
  const xy=(p:ExactPoint):ExactPoint=>[p[0],p[1],0n];
  for(const wall of walls){
    const quad=exact.slice(offset,offset+4);offset+=4;const l=line(xy(quad[0]),xy(quad[1]),budget),key=`w:${wall.tier}:${l.key}:${l.sign}`;
    const edges=expected.get(key)??[];for(let j=0;j<4;j++)edges.push([quad[j],quad[(j+1)%4]]);expected.set(key,edges);
  }
  for(const t of mesh.triangles){
    budget.check();const p=t.map(i=>exact[i]),raw=t.map(i=>mesh.vertices[i]),n=cross3(subtract(p[1],p[0]),subtract(p[2],p[0]));let key:string;
    if(raw.every(v=>v[2]===raw[0][2])){
      key=`h:${raw[0][2]}`;const sign=signs.get(key);if(sign===undefined||n[2]*BigInt(sign)<=0n)throw new MeshConstructionFailure('Unexpected or reversed horizontal cap, including an internal interface.');
    }else{
      if(n[2]!==0n)throw new MeshConstructionFailure('A tier wall must lie in an original vertical contour plane.');
      const tier=tiers.findIndex(tier=>raw.every(v=>v[2]>=tier.bottomZMm&&v[2]<=tier.topZMm));
      if(tier<0)throw new MeshConstructionFailure('A wall crosses a current tier Z interval.');
      const a=xy(p[0]),b=p.map(xy).find(v=>v[0]!==a[0]||v[1]!==a[1]);
      if(!b)throw new MeshConstructionFailure('A wall needs a nonzero contour interval.');
      const l=line(a,b,budget),direction:ExactPoint=[-n[1],n[0],0n];
      const sign=direction.find(x=>x!==0n)!>0n?1n:-1n;key=`w:${tier}:${l.key}:${sign}`;
    }
    if(!expected.has(key))throw new MeshConstructionFailure('Triangle lies outside the expected oriented tier surface.');
    const edges=actual.get(key)??[];for(let i=0;i<3;i++)edges.push([p[i],p[(i+1)%3]]);actual.set(key,edges);
  }
  for(const [key,edges] of expected)assertChain(actual.get(key)??[],edges,budget);
}
