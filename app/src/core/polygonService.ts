import type { Bounds2Mm, FootprintMm } from './contracts';
import { createDiagnostic } from './diagnostics';
import type { Diagnostic, DiagnosticLocation } from './diagnostics';
import type { PolygonKernel } from './polygonKernel';
import { assertNoNearObjectContact, footprintMetrics, guardedCanonicalFootprint, PolygonBudget, PolygonFailure, POLYGON_POLICY } from './polygonGeometry';

export type PolygonResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] };
export interface PolygonOptions {
  readonly location?: DiagnosticLocation;
  /** Import shares one budget across flattening, all layers and Booleans. */
  readonly budget?: PolygonBudget;
}
/** Pure, failure-atomic geometry service. Empty results are valid set results;
 * callers own printing-layer/base policy. No containment orchestration here. */
export function createPolygonService(kernel: PolygonKernel) {
  function checked<T>(operation: string, options: PolygonOptions, work: (budget: PolygonBudget)=>T): PolygonResult<T> {
    try { return {status:'ok',value:work(options.budget ?? new PolygonBudget())}; }
    catch(error) {
      const diagnostic=createDiagnostic(error instanceof PolygonFailure && error.limit?'IMPORT_LIMIT_EXCEEDED':'POLYGON_INVALID',options.location ?? {scope:'document'});
      const reason=error instanceof PolygonFailure ? error.message : 'Kernel compatibility failure. Simplify the artwork or report this file.';
      return {status:'rejected',diagnostics:[{...diagnostic,message:diagnostic.message+' '+operation+': '+reason}]};
    }
  }
  function boolean(operation: 'union'|'difference'|'intersection', inputs: readonly FootprintMm[], options: PolygonOptions): PolygonResult<FootprintMm> {
    return checked(operation,options,budget=>{
      const count=inputs.reduce((sum,f)=>sum+f.reduce((n,p)=>n+p.outer.length+p.holes.reduce((m,h)=>m+h.length,0),0),0);
      if(count>POLYGON_POLICY.maxKernelInputVertices) throw new PolygonFailure('Boolean input vertex limit exceeded.',true);
      // Inspect unsnapped cross-operand boundaries before any snap can hide a gap.
      const rings=inputs.map(f=>f.flatMap(p=>[p.outer,...p.holes]));
      for(let i=0;i<rings.length;i++) for(let j=i+1;j<rings.length;j++)
        for(const a of rings[i]) for(const b of rings[j]) assertNoNearObjectContact(a,b,budget);
      // Validate raw and snapped representability, but give the kernel the raw
      // geometry: snapping operands first could erase a nonempty difference.
      const operands=inputs.map(f=>guardedCanonicalFootprint(f,budget,false));
      const raw=operation==='union' ? kernel.union(operands) : kernel[operation](operands[0],operands[1]);
      if(operation==='union' && operands.some(f=>f.length) && !raw.length) throw new PolygonFailure('Kernel returned an empty union of nonempty inputs.');
      return guardedCanonicalFootprint(raw,budget);
    });
  }
  return {
    union: (inputs: readonly FootprintMm[],options: PolygonOptions={})=>boolean('union',inputs,options),
    difference: (subject: FootprintMm,clip: FootprintMm,options: PolygonOptions={})=>boolean('difference',[subject,clip],options),
    intersection: (subject: FootprintMm,clip: FootprintMm,options: PolygonOptions={})=>boolean('intersection',[subject,clip],options),
    area: (input: FootprintMm,options: PolygonOptions={})=>checked('area',options,budget=>{
      const footprint=guardedCanonicalFootprint(input,budget);
      return footprint.length ? footprintMetrics(footprint).areaMm2 : 0;
    }),
    bounds: (input: FootprintMm,options: PolygonOptions={}): PolygonResult<Bounds2Mm|null>=>checked('bounds',options,budget=>{
      const footprint=guardedCanonicalFootprint(input,budget);
      return footprint.length ? footprintMetrics(footprint).boundsMm : null;
    }),
    isEmpty: (input: FootprintMm,options: PolygonOptions={})=>checked('isEmpty',options,budget=>guardedCanonicalFootprint(input,budget).length===0),
  };
}
