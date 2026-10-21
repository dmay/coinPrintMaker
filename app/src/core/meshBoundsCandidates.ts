import type { MeshConstructionBudget } from './meshConstructionPolicy';

export interface MeshBounds {
  readonly id: number;
  readonly min: readonly number[];
  readonly max: readonly number[];
}
interface Node { min: number[]; max: number[]; entries?: readonly MeshBounds[]; left?: Node; right?: Node }
const overlaps = (a: Pick<MeshBounds,'min'|'max'>, b: Pick<MeshBounds,'min'|'max'>) =>
  [0,1,2].every(axis => a.min[axis] <= b.max[axis] && b.min[axis] <= a.max[axis]);

/** Inclusive bounds hierarchy: every possible contact remains a candidate.
 * Charge construction, node visits and leaf comparisons to the caller's budget. */
export function* meshBoundsCandidates(boxes: readonly MeshBounds[], budget: MeshConstructionBudget): Generator<readonly [number,number]> {
  if (!boxes.length) return;
  const build = (entries: readonly MeshBounds[]): Node => {
    const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
    for (const box of entries) {budget.check();for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],box.min[axis]);max[axis]=Math.max(max[axis],box.max[axis]);}}
    if(entries.length<=8)return {min,max,entries};
    const spans=max.map((v,axis)=>v-min[axis]),axis=spans.indexOf(Math.max(...spans));
    const sorted=[...entries].sort((a,b)=>{budget.check();return (a.min[axis]/2+a.max[axis]/2)-(b.min[axis]/2+b.max[axis]/2)||a.id-b.id;});
    const middle=Math.floor(sorted.length/2);
    return {min,max,left:build(sorted.slice(0,middle)),right:build(sorted.slice(middle))};
  };
  const root=build(boxes);
  function* visit(a:Node,b:Node):Generator<readonly [number,number]>{
    budget.check();if(!overlaps(a,b))return;
    if(a===b){
      if(a.entries){for(let i=0;i<a.entries.length;i++)for(let j=i+1;j<a.entries.length;j++){budget.check();if(overlaps(a.entries[i],a.entries[j]))yield [a.entries[i].id,a.entries[j].id];}}
      else {yield* visit(a.left!,a.left!);yield* visit(a.left!,a.right!);yield* visit(a.right!,a.right!);}
    }else if(a.entries&&b.entries){
      for(const x of a.entries)for(const y of b.entries){budget.check();if(overlaps(x,y))yield [x.id,y.id];}
    }else if(!a.entries){yield* visit(a.left!,b);yield* visit(a.right!,b);}
    else {yield* visit(a,b.left!);yield* visit(a,b.right!);}
  }
  yield* visit(root,root);
}
