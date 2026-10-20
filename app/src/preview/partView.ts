import { BufferGeometry, Float32BufferAttribute, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial } from 'three';
import type { GeneratedPart } from '../core/contracts';

// All GPU resources are detached, lossy display copies. Never export these.
export function createPartView(part: GeneratedPart) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(part.mesh.vertices.flat(), 3));
  geometry.setIndex(part.mesh.triangles.flat());
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ color: part.color, roughness: .85, metalness: 0, flatShading: true, toneMapped: false });
  const mesh = new Mesh(geometry, material);
  mesh.name = part.layerId;
  const edges = new EdgesGeometry(geometry, 30);
  const highlight = new LineBasicMaterial({ color: '#007197', toneMapped: false, depthTest: true });
  const outline = new LineSegments(edges, highlight);
  outline.visible = false;
  const group = new Group();
  group.add(mesh, outline);
  return {
    group, geometry, material, edges, highlight,
    present(color: string, selected: boolean) {
      material.color.set(color);
      outline.visible = selected;
    },
    dispose() {
      group.clear();
      geometry.dispose(); material.dispose(); edges.dispose(); highlight.dispose();
    },
  };
}
