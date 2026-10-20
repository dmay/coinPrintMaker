// @vitest-environment jsdom
import { createElement, Fragment } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { create, act } from '@react-three/test-renderer';
import { readFile } from 'node:fs/promises';
import type { OrbitControls } from 'three-stdlib';
type Renderer = Awaited<ReturnType<typeof create>>;
import { useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three';
import { CoinScene } from '../../app/src/preview/CoinScene';
import type { ViewCommand } from '../../app/src/preview/CoinScene';
import { frameCoin } from '../../app/src/preview/camera';
import { createPartView } from '../../app/src/preview/partView';
import { importCoinSvg } from '../../app/src/import/importCoinSvg';
import { generateCoin } from '../../app/src/core/generateCoin';
import { createDefaultCoinSettings } from '../../app/src/core/resolveStack';
import type { CoinSettings, ImportedCoin, ValidGeneratedCoin } from '../../app/src/core/contracts';
import { polygonClippingKernel } from '../../app/src/import/polygonClippingKernel';
import { earcutTriangulationKernel } from '../../app/src/import/earcutTriangulationKernel';


(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let coin: ImportedCoin, settings: CoinSettings, result: ValidGeneratedCoin;
function generate(next = settings) {
  const generated = generateCoin(coin, next, polygonClippingKernel, earcutTriangulationKernel);
  if (generated.status !== 'valid') throw new Error(JSON.stringify(generated));
  return generated;
}
beforeAll(async () => {
  const svg = await readFile('fixtures/svg/offset-nested-transforms.svg', 'utf8');
  const imported = importCoinSvg({ importId: 'scene-fixture', fileName: 'off-center.svg', byteLength: svg.length, svgText: svg });
  if (imported.status !== 'imported') throw new Error('Fixture rejected');
  coin = imported.coin;
  const defaults = createDefaultCoinSettings(coin);
  if (defaults.status !== 'created') throw new Error('Settings rejected');
  settings = { ...defaults.settings, layers: defaults.settings.layers.map((layer, i) => ({ ...layer, color: i ? '#ff0000' : '#0055ff' })) as unknown as CoinSettings['layers'] };
  result = generate();
});
let renderer: Renderer | null = null;
let state: RootState;
function Probe() { state = useThree(); return null; }
function scene(current: ValidGeneratedCoin | null, command: ViewCommand = { preset: 'reset', sequence: 0 }, selectedLayerId: string | null = null) {
  return createElement(Fragment, null, createElement(Probe), createElement(CoinScene, { result: current, selectedLayerId, command }));
}
afterEach(async () => { await renderer?.unmount(); renderer = null; vi.restoreAllMocks(); });
function meshes() {
  const found: Mesh[] = [];
  state.scene.traverse(object => { if (object instanceof Mesh) found.push(object); });
  return found;
}
function project(p: readonly number[]) { return new Vector3(...p as [number, number, number]).project(state.camera); }
function assertFramed() {
  state.camera.updateMatrixWorld(true);
  for (const part of result.parts) for (const point of part.mesh.vertices) {
    const p = project(point);
    expect(Math.abs(p.x)).toBeLessThan(.95);
    expect(Math.abs(p.y)).toBeLessThan(.95);
    expect(Math.abs(p.z)).toBeLessThan(1);
  }
}
test('actual generated asymmetric off-center part stays XY/+Z and top/side frame and orient it', async () => {
  const snapshot = JSON.stringify(result);
  renderer = await create(scene(result), { width: 900, height: 420, camera: { position: [60, -84, 72], up: [0, 0, 1], fov: 40 } });
  expect(meshes()).toHaveLength(result.parts.length);
  const artwork = meshes().find(mesh => mesh.name === result.parts[1].layerId)!;
  artwork.geometry.computeBoundingBox();
  expect(artwork.geometry.boundingBox!.min.toArray()).toEqual([4, 24, Math.fround(1.6)]);
  expect(artwork.geometry.boundingBox!.max.toArray()).toEqual([10, 30, 2]);
  expect(artwork.position.toArray()).toEqual([0, 0, 0]);
  expect(artwork.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  await renderer.update(scene(result, { preset: 'top', sequence: 1 }));
  state.camera.updateMatrixWorld(true);
  const center = project([20, 20, 1]), right = project([21, 20, 1]), up = project([20, 21, 1]);
  expect(right.x).toBeGreaterThan(center.x);
  expect(up.y).toBeGreaterThan(center.y);
  expect(project([7, 27, 2]).x).toBeLessThan(center.x);
  expect(project([7, 27, 2]).y).toBeGreaterThan(center.y);
  assertFramed();
  await renderer.update(scene(result, { preset: 'side', sequence: 2 }));
  state.camera.updateMatrixWorld(true);
  expect(project([21, 20, 1]).x).toBeGreaterThan(project([20, 20, 1]).x);
  expect(project([20, 20, 2]).y).toBeGreaterThan(project([20, 20, 0]).y);
  expect(new Vector3(7, 24, 2).applyMatrix4(state.camera.matrixWorldInverse).y).toBeCloseTo(new Vector3(7, 30, 2).applyMatrix4(state.camera.matrixWorldInverse).y, 8);
  assertFramed();
  expect(JSON.stringify(result)).toBe(snapshot);
});
test('resize refits current bounds while preserving side direction and renderer/controls', async () => {
  const command = { preset: 'side', sequence: 1 } as const;
  renderer = await create(scene(result), { width: 900, height: 420 });
  await renderer.update(scene(result, command));
  const gl = state.gl, controls = state.controls, camera = state.camera;
  const oldDistance = camera.position.distanceTo((controls as unknown as { target: Vector3 }).target);
  await act(async () => state.setSize(280, 300));
  expect(state.gl).toBe(gl); expect(state.controls).toBe(controls);
  expect(camera).toBe(state.camera);
  expect((camera as PerspectiveCamera).aspect).toBeCloseTo(280 / 300);
  expect(camera.position.distanceTo((controls as unknown as { target: Vector3 }).target)).toBeGreaterThan(oldDistance);
  assertFramed();
  expect(camera.position.x).toBeCloseTo(20, 2);
  expect(camera.position.z).toBeCloseTo(1);
});
test('color and selection reuse resources; geometry replacement and pending remove and dispose every custom allocation', async () => {
  renderer = await create(scene(result), { width: 900, height: 420 });
  const gl = state.gl, controls = state.controls;
  const controlsDispose = vi.spyOn(controls as unknown as OrbitControls, 'dispose');
  const mesh = meshes()[1], material = mesh.material as MeshStandardMaterial;
  const colorResult = { ...result, input: { ...result.input, settingsRevision: 1 }, parts: result.parts.map(p => ({ ...p, color: '#12ab34' })) };
  const snapshot = JSON.stringify(colorResult);
  await renderer.update(scene(colorResult, undefined, result.parts[1].layerId));
  expect(meshes()[1]).toBe(mesh);
  expect(material.color.getHexString(SRGBColorSpace)).toBe('12ab34');
  const outlines: LineSegments[] = [];
  state.scene.traverse(o => { if (o instanceof LineSegments) outlines.push(o); });
  expect(outlines.map(o => o.visible)).toEqual([false, true]);
  expect(JSON.stringify(colorResult)).toBe(snapshot);
  const oldResources = meshes().flatMap(m => [m.geometry, m.material as MeshStandardMaterial]).concat(outlines.flatMap(o => [o.geometry, o.material as MeshStandardMaterial]));
  const spies = oldResources.map(r => vi.spyOn(r, 'dispose'));
  const taller = generate({ ...settings, revision: 2, layers: settings.layers.map((layer, i) => i ? { ...layer, thicknessMm: 2 } : layer) as unknown as CoinSettings['layers'] });
  await renderer.update(scene(taller));
  expect(spies.every(spy => spy.mock.calls.length === 1)).toBe(true);
  expect(meshes()[1]).not.toBe(mesh);
  expect(state.gl).toBe(gl); expect(state.controls).toBe(controls);
  expect(controlsDispose).not.toHaveBeenCalled();
  const remaining = meshes().map(m => vi.spyOn(m.geometry, 'dispose'));
  await renderer.update(scene(null));
  expect(meshes()).toHaveLength(0);
  expect(remaining.every(spy => spy.mock.calls.length === 1)).toBe(true);
  expect(state.gl).toBe(gl); expect(state.controls).toBe(controls);
  await renderer.unmount(); renderer = null;
  expect(controlsDispose).toHaveBeenCalledOnce();
});
test('fit recenters a panned camera without changing view direction; reset is deterministic', () => {
  const camera = new PerspectiveCamera(40, 1, .01, 1000);
  camera.position.set(100, -70, 55);
  const controls = { target: new Vector3(30, 12, 8), minDistance: 0, maxDistance: 0, update: vi.fn() };
  const direction = camera.position.clone().sub(controls.target).normalize();
  frameCoin(camera, controls, result.metrics.boundsMm, .4, 'fit');
  expect(camera.position.clone().sub(controls.target).normalize().distanceTo(direction)).toBeLessThan(1e-10);
  expect(controls.target.x).toBeCloseTo((result.metrics.boundsMm[0][0] + result.metrics.boundsMm[1][0]) / 2);
  frameCoin(camera, controls, result.metrics.boundsMm, .4, 'reset');
  const reset = camera.position.clone();
  camera.position.addScalar(999);
  frameCoin(camera, controls, result.metrics.boundsMm, .4, 'reset');
  expect(camera.position.equals(reset)).toBe(true);
});
test('detached buffers never mutate domain points and resource presentation never changes part colors', () => {
  const part = result.parts[1], snapshot = JSON.stringify(part);
  const view = createPartView(part);
  view.geometry.getAttribute('position').setX(0, -999);
  view.present('#abcdef', true);
  expect(JSON.stringify(part)).toBe(snapshot);
  view.dispose();
});

test('actual Drei event handlers orbit, pan and zoom without touching engine output; fit restores target', async () => {
  const snapshot = JSON.stringify(result);
  renderer = await create(scene(result), { width: 900, height: 420 });
  const controls = state.controls as unknown as import('three-stdlib').OrbitControls;
  const canvas = state.gl.domElement;
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 420 });
  canvas.setPointerCapture = vi.fn(); canvas.releasePointerCapture = vi.fn();
  function pointer(type: string, button: number, x: number, y: number) {
    const event = new MouseEvent(type, { button, clientX: x, clientY: y, bubbles: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
    return event;
  }
  const initial = state.camera.position.clone();
  await act(async () => {
    canvas.dispatchEvent(pointer('pointerdown', 0, 300, 200));
    document.dispatchEvent(pointer('pointermove', 0, 370, 230));
    document.dispatchEvent(pointer('pointerup', 0, 370, 230));
  });
  expect(state.camera.position.distanceTo(initial)).toBeGreaterThan(1);
  const beforePan = controls.target.clone();
  await act(async () => {
    canvas.dispatchEvent(pointer('pointerdown', 2, 300, 200));
    document.dispatchEvent(pointer('pointermove', 2, 330, 230));
    document.dispatchEvent(pointer('pointerup', 2, 330, 230));
  });
  expect(controls.target.distanceTo(beforePan)).toBeGreaterThan(1);
  const distance = state.camera.position.distanceTo(controls.target);
  await act(async () => { canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true })); });
  expect(state.camera.position.distanceTo(controls.target)).toBeLessThan(distance);
  await renderer.update(scene(result, { preset: 'fit', sequence: 1 }));
  expect(controls.target.distanceTo(beforePan)).toBeLessThan(1e-9);
  expect(JSON.stringify(result)).toBe(snapshot);
});
