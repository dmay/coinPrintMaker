import { expect, test } from 'vitest';
import type { Point2Mm, RingMm } from '../../app/src/core/contracts';
import { assertSeparate, normalizeRing, PolygonBudget, POLYGON_POLICY, segmentDistance, signedRingArea } from '../../app/src/core/polygonGeometry';

const ring=(p:Point2Mm[])=>p as unknown as RingMm;
const orient=(a:Point2Mm,b:Point2Mm,c:Point2Mm)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
// Exhaustive independent oracle: no bounding-box filtering.
function touches(a:RingMm,b:RingMm) {
  return a.some((p,i)=>b.some((r,j)=>{
    const q=a[(i+1)%a.length],s=b[(j+1)%b.length];
    const x=orient(p,q,r),y=orient(p,q,s),z=orient(r,s,p),w=orient(r,s,q);
    return (x*y<0 && z*w<0) || Math.min(segmentDistance(p,r,s),segmentDistance(q,r,s),segmentDistance(r,p,q),segmentDistance(s,p,q))<=2*POLYGON_POLICY.snapMm;
  }));
}
test('sweep agrees with exhaustive contact tests including near-contact and vertical edges',()=>{
  let seed=42;
  const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32)*20;
  for(let k=0;k<300;k++) {
    const a=ring([[0,0],[10,0],[10,10],[0,10]]);
    const x=k<3 ? 10+(k-1)*POLYGON_POLICY.snapMm*2 : random();
    const y=k<3 ? 2 : random();
    const b=ring([[x,y],[x+3,y],[x+3,y+3],[x,y+3]]);
    const run=()=>assertSeparate(a,b,new PolygonBudget());
    if(touches(a,b)) expect(run).toThrow('Compound contours'); else expect(run).not.toThrow();
    const reversed=()=>assertSeparate(b,a,new PolygonBudget());
    if(touches(a,b)) expect(reversed).toThrow(); else expect(reversed).not.toThrow();
  }
});
test('a detailed simple ring stays within the unchanged work budget',()=>{
  const points=Array.from({length:4000},(_,i):Point2Mm=>[50+40*Math.cos(i*2*Math.PI/4000),50+40*Math.sin(i*2*Math.PI/4000)]);
  expect(normalizeRing(points,new PolygonBudget())).toHaveLength(4000);
});
test('dense X-overlap scans remain bounded even when Y bounds are disjoint',()=>{
  const a=ring(Array.from({length:2100},(_,i):Point2Mm=>[0,i]));
  const b=ring([[0,10000],[0,10001],[0,10002]]);
  expect(()=>assertSeparate(a,b,new PolygonBudget())).toThrow('Contour comparison limit exceeded');
});

test('short bridge keeps both endpoints without false near-contact in either winding',()=>{
  const points:Point2Mm[]=[[0,0],[10,0],[10,10],[0,10],[.000001,.000001]];
  for(const p of [points,[...points].reverse()]) {
    const result=normalizeRing(p,new PolygonBudget());
    expect(result).toHaveLength(5);
    expect(Math.abs(signedRingArea(result))).toBeCloseTo(100-.000005,10);
    expect(result).toContainEqual([.000001,.000001]);
    expect(result).toContainEqual([0,0]);
  }
});
test('short bridges do not exempt actual crossings or nonlocal near-contact',()=>{
  const crossing:Point2Mm[]=[[0,0],[10,0],[10,10],[0,10],[0.000001,-.000001]];
  expect(()=>normalizeRing(crossing,new PolygonBudget())).toThrow('self-intersects');
  const touching:Point2Mm[]=[[0,0],[10,0],[10,10],[0,10],[.000001,0]];
  expect(()=>normalizeRing(touching,new PolygonBudget())).toThrow();
  // Two long edges separated by a narrow channel still reject.
  const channel:Point2Mm[]=[[0,0],[10,0],[10,10],[5,10],[5,1],[4.999999,1],[4.999999,10],[0,10]];
  expect(()=>normalizeRing(channel,new PolygonBudget())).toThrow('self-intersects');
});
