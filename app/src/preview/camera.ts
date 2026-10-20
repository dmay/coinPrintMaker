import { PerspectiveCamera, Vector3 } from 'three';
import type { Bounds3Mm } from '../core/contracts';

export type CameraPreset = 'reset' | 'top' | 'side' | 'fit';
export interface CameraControls {
  readonly target: Vector3;
  minDistance: number;
  maxDistance: number;
  update(): void;
}
// Presentation only. No model transform or domain coordinate leaves this module.
export function frameCoin(camera: PerspectiveCamera, controls: CameraControls, bounds: Bounds3Mm, aspect: number, preset: CameraPreset) {
  const min = new Vector3(...bounds[0]), max = new Vector3(...bounds[1]);
  const target = min.clone().add(max).multiplyScalar(.5);
  const radius = max.clone().sub(min).length() / 2;
  camera.aspect = Math.max(aspect, .001);
  const halfVertical = camera.fov * Math.PI / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
  const distance = radius * 1.15 / Math.sin(Math.min(halfVertical, halfHorizontal));
  const direction = preset === 'top' ? new Vector3(0, -1e-6, 1).normalize()
    : preset === 'side' ? new Vector3(0, -1, 0)
    : preset === 'fit' ? camera.position.clone().sub(controls.target).normalize()
    : new Vector3(1, -1.4, 1.2).normalize();
  if (direction.lengthSq() === 0) direction.set(1, -1.4, 1.2).normalize();
  // OrbitControls uses a fixed Z-up orbit axis. Top is an almost-polar view
  // (the control clamps the pole by 1e-6 radians), so +Y remains screen-up.
  camera.up.set(0, 0, 1);
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.near = Math.max(radius * .001, Number.MIN_VALUE);
  camera.far = distance * 20 + radius * 2;
  controls.minDistance = radius * 1.05;
  controls.maxDistance = distance * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  controls.update();
}

