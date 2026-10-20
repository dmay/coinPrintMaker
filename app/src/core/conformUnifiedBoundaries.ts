import type { FootprintMm, Point2Mm, RingMm } from './contracts';
import { binaryPoint, gridArea2, gridOnSegment, gridPoint } from './meshGrid';
import type { GridPoint } from './meshGrid';
import { MeshConstructionBudget, MeshConstructionFailure } from './meshConstructionPolicy';

const keyOf=(p:GridPoint)=>`${p[0]}:${p[1]}`;
const gcd=(a:bigint,b:bigint):bigint=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){const r=a%b;a=b;b=r;}return a;};
function lineOf(a:GridPoint,b:GridPoint):string {
  let dx=b[0]-a[0],dy=b[1]-a[1];const d=gcd(dx,dy);
  if(!d)throw new MeshConstructionFailure('A unified boundary edge collapsed.');
  dx/=d;dy/=d;if(dx<0n||(dx===0n&&dy<0n)){dx=-dx;dy=-dy;}
  return `${dx}:${dy}:${dx*a[1]-dy*a[0]}`;
}
interface Endpoint { readonly xy:Point2Mm; readonly grid:GridPoint; readonly binary:GridPoint }

/** Existing endpoints indexed by the exact supporting lines of the given
 * segments. Cross-hole Earcut bridges can omit collinear boundary endpoints;
 * after subdivision their opposite bridge segments cancel in the cap checker. */
export function boundaryEdgePaths(vertices:readonly Point2Mm[],edges:readonly (readonly [number,number])[],budget:MeshConstructionBudget):ReadonlyMap<string,readonly number[]> {
  const grid=vertices.map(gridPoint),binary=vertices.map(binaryPoint),lines=new Map<string,Set<number>>();
  for(const [a,b] of edges){budget.check();const key=lineOf(grid[a],grid[b]),bucket=lines.get(key)??new Set<number>();bucket.add(a);bucket.add(b);lines.set(key,bucket);}
  const ordered=new Map<string,readonly number[]>();
  for(const [key,values] of lines)ordered.set(key,[...values].sort((a,b)=>{budget.check();return grid[a][0]<grid[b][0]?-1:grid[a][0]>grid[b][0]?1:grid[a][1]<grid[b][1]?-1:grid[a][1]>grid[b][1]?1:0;}));
  const paths=new Map<string,readonly number[]>();
  for(const [a,b] of edges){
    const path:number[]=[];
    for(const id of ordered.get(lineOf(grid[a],grid[b]))!){
      budget.check();if(!gridOnSegment(grid[id],grid[a],grid[b]))continue;
      if(!gridOnSegment(binary[id],binary[a],binary[b]))throw new MeshConstructionFailure('Cap edge subdivision is not exactly representable in emitted XY.');
      budget.check();path.push(id);
    }
    if(grid[a][0]>grid[b][0]||(grid[a][0]===grid[b][0]&&grid[a][1]>grid[b][1]))path.reverse();
    if(path.length>2)paths.set(`${a}:${b}`,path);
  }
  return paths;
}

/** Indexed exact line buckets, never a proximity weld or global vertex/edge scan.
 * Only existing endpoints of collinear contours are candidates. Every candidate,
 * sort comparison and retained subdivision is charged to the shared budget. */
export function conformUnifiedBoundaries(footprints:readonly FootprintMm[],budget:MeshConstructionBudget):readonly FootprintMm[] {
  const points=new Map<string,Endpoint>(),lines=new Map<string,Set<Endpoint>>();
  let count=0;
  for(const f of footprints)for(const p of f)for(const ring of [p.outer,...p.holes])for(const xy of ring){
    budget.check();budget.input(1);count++;
    const grid=gridPoint(xy),key=keyOf(grid),prior=points.get(key);
    if(prior&&(prior.xy[0]!==xy[0]||prior.xy[1]!==xy[1]))throw new MeshConstructionFailure('Equal grid endpoints have unequal emitted XY; exact welding would move artwork.');
    if(!prior)points.set(key,{xy:[xy[0]||0,xy[1]||0],grid,binary:binaryPoint(xy)});
  }
  if(!count)throw new MeshConstructionFailure('Unified construction requires boundary vertices.');
  for(const f of footprints)for(const p of f)for(const ring of [p.outer,...p.holes])for(let i=0;i<ring.length;i++){
    budget.check();const a=points.get(keyOf(gridPoint(ring[i])))!,b=points.get(keyOf(gridPoint(ring[(i+1)%ring.length])))!,key=lineOf(a.grid,b.grid);
    const bucket=lines.get(key)??new Set<Endpoint>();bucket.add(a);bucket.add(b);lines.set(key,bucket);
  }
  const sorted=new Map<string,readonly Endpoint[]>();
  for(const [key,values] of lines)sorted.set(key,[...values].sort((a,b)=>{budget.check();return a.grid[0]<b.grid[0]?-1:a.grid[0]>b.grid[0]?1:a.grid[1]<b.grid[1]?-1:a.grid[1]>b.grid[1]?1:0;}));
  const refine=(ring:RingMm):RingMm=>{
    const result:Point2Mm[]=[];
    for(let i=0;i<ring.length;i++){
      const a=points.get(keyOf(gridPoint(ring[i])))!,b=points.get(keyOf(gridPoint(ring[(i+1)%ring.length])))!;
      const path:Endpoint[]=[];
      for(const candidate of sorted.get(lineOf(a.grid,b.grid))!){
        budget.check();if(!gridOnSegment(candidate.grid,a.grid,b.grid))continue;
        if(!gridOnSegment(candidate.binary,a.binary,b.binary))throw new MeshConstructionFailure('Boundary subdivision is not exactly representable in emitted XY. Simplify the shared edge in the artwork.');
        path.push(candidate);
      }
      if(a.grid[0]>b.grid[0]||(a.grid[0]===b.grid[0]&&a.grid[1]>b.grid[1]))path.reverse();
      for(const p of path.slice(0,-1)){budget.check();budget.input(1);result.push(p.xy);}
    }
    return result as unknown as RingMm;
  };
  return footprints.map(f=>f.map(p=>({outer:refine(p.outer),holes:p.holes.map(refine)})));
}

/** Exact oriented segment cancellation after common refinement. Checking both
 * representations prevents a snapped Boolean terrace from altering source XY. */
export function assertTerraceBoundary(lower:FootprintMm,upper:FootprintMm,terrace:FootprintMm,budget:MeshConstructionBudget):void {
  for(const lift of [gridPoint,binaryPoint]){
    const edges=new Map<string,number>();
    for(const [footprint,sign] of [[lower,1],[upper,-1],[terrace,-1]] as const)for(const p of footprint)for(const ring of [p.outer,...p.holes])for(let i=0;i<ring.length;i++){
      budget.check();const a=keyOf(lift(ring[i])),b=keyOf(lift(ring[(i+1)%ring.length]));
      const key=a<b?`${a}/${b}`:`${b}/${a}`,n=(edges.get(key)??0)+sign*(a<b?1:-1);
      if(n)edges.set(key,n);else edges.delete(key);
    }
    if(edges.size)throw new MeshConstructionFailure('Terrace boundary differs from exact lower-minus-upper geometry. No snapped replacement is emitted.');
  }
}
export function emittedFootprintArea(footprint:FootprintMm):number {
  let area2=0n;for(const p of footprint)for(const ring of [p.outer,...p.holes])area2+=gridArea2(ring.map(binaryPoint));
  return Number(area2)*2**-161;
}
