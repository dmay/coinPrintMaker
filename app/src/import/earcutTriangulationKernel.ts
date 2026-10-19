import { Earcut } from 'three/src/extras/Earcut.js';
import type { Triangle } from '../core/contracts';
import type { TriangulationKernel } from '../core/triangulationKernel';

/** Pure pinned Earcut only; no Shape/ExtrudeGeometry, renderer or scene state. */
export const earcutTriangulationKernel: TriangulationKernel = {
  triangulate(vertices,holeStarts) {
    const indices=Earcut.triangulate(vertices.flatMap(p=>[p[0],p[1]]),[...holeStarts],2);
    if(indices.length%3) throw new Error('Incomplete triangle tuple.');
    const triangles: Triangle[]=[];
    for(let i=0;i<indices.length;i+=3) triangles.push([indices[i],indices[i+1],indices[i+2]]);
    return triangles;
  },
};
