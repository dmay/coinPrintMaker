import {expect,test} from 'vitest';
import type {Point2Mm} from '../../app/src/core/contracts';
import {assertNoNearObjectContact,PolygonBudget} from '../../app/src/core/polygonGeometry';

const e=1e-6;
const bevel:Point2Mm[]=[[0,0],[1-e,0],[1,e],[1,1],[0,1]];
test('cross-operand neighbours preserve the same short bevel bridge in either winding',()=>{
 expect(()=>assertNoNearObjectContact(bevel,bevel,new PolygonBudget())).not.toThrow();
 expect(()=>assertNoNearObjectContact(bevel,[...bevel].reverse(),new PolygonBudget())).not.toThrow();
});
test('a nearby operand without the same exact bridge keeps the clearance guard',()=>{
 const shifted=bevel.map(([x,y])=>[x+e/4,y+e/4] as Point2Mm);
 expect(()=>assertNoNearObjectContact(bevel,shifted,new PolygonBudget())).toThrow();
});
test('a shared short hairpin does not excuse near-contact',()=>{
 const hairpin:Point2Mm[]=[[0,0],[1,0],[1,e],[0,e],[0,1]];
 expect(()=>assertNoNearObjectContact(hairpin,hairpin,new PolygonBudget())).toThrow();
});
