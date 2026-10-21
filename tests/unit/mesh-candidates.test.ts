import {expect,test} from 'vitest';
import type {Point3Mm} from '../../app/src/core/contracts';
import {meshBoundsCandidates} from '../../app/src/core/meshBoundsCandidates';
import {MeshConstructionBudget} from '../../app/src/core/meshConstructionPolicy';
import {assertTrianglePair,cross3,exactCoordinates,projectedContactIsShared,subtract} from '../../app/src/core/exactMeshPredicates';

let state=79;
const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
test('bounds hierarchy agrees with inclusive exhaustive pairs on random and touching boxes',()=>{
 const boxes=Array.from({length:250},(_,id)=>{
  const min=[0,1,2].map(()=>Math.floor(random()*20)),max=min.map(x=>x+Math.floor(random()*5));return {id,min,max};
 });
 const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
 const actual=[...meshBoundsCandidates(boxes,new MeshConstructionBudget())].map(([a,b])=>key(a,b));
 const expected:string[]=[];
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if([0,1,2].every(k=>boxes[i].min[k]<=boxes[j].max[k]&&boxes[j].min[k]<=boxes[i].max[k]))expected.push(key(i,j));
 expect(actual.sort()).toEqual(expected.sort());expect(new Set(actual).size).toBe(actual.length);
});
test('bounds hierarchy charges work even when boxes do not overlap',()=>{
 const budget=new MeshConstructionBudget();budget.check(1_999_999);
 expect(()=>[...meshBoundsCandidates([{id:0,min:[0,0,0],max:[1,1,1]},{id:1,min:[10,10,10],max:[11,11,11]}],budget)]).toThrow();
});
test('projected contact proof agrees with exhaustive exact predicates on 600 triangle pairs',()=>{
 let compared=0,proved=0;
 while(compared<600){
  const coordinates=Array.from({length:6},()=>[0,1,2].map(()=>Math.floor(random()*11)-5) as unknown as Point3Mm);
  if(compared%2===0)for(let i=0;i<6;i++)coordinates[i]=[coordinates[i][0],coordinates[i][1],0];
  const sharedCount=compared%3;
  for(let i=0;i<sharedCount;i++)coordinates[i+3]=coordinates[i];
  const points=exactCoordinates(coordinates),a=points.slice(0,3),b=points.slice(3),shared=a.slice(0,sharedCount);
  if([a,b].some(t=>!cross3(subtract(t[1],t[0]),subtract(t[2],t[0])).some(x=>x!==0n)))continue;
  let rejected=false;try{assertTrianglePair(a,b,shared);}catch{rejected=true;}
  const proof=projectedContactIsShared(a,b,shared);
  if(proof){proved++;expect(rejected).toBe(false);}
  compared++;
 }
 expect(proved).toBeGreaterThan(50);
});
