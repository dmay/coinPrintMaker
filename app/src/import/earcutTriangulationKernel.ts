import { Earcut } from 'three/src/extras/Earcut.js';
import { gridPoint } from '../core/meshGrid';
import type { Triangle } from '../core/contracts';
import type { TriangulationKernel } from '../core/triangulationKernel';

/** Condition index selection with the existing canonical integer lattice. Core
 * checks and emitted coordinates retain the original XY values. */
export const earcutTriangulationKernel: TriangulationKernel = {
  triangulate(vertices,holeStarts) {
    const indices=Earcut.triangulate(vertices.flatMap(p=>gridPoint(p).map(Number)),[...holeStarts],2);
    if(indices.length%3) throw new Error('Incomplete triangle tuple.');
    const triangles: Triangle[]=[];
    for(let i=0;i<indices.length;i+=3) triangles.push([indices[i],indices[i+1],indices[i+2]]);
    return triangles;
  },
};
