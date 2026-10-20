import { Component, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ValidGeneratedCoin } from '../core/contracts';
import { CoinScene } from './CoinScene';
import type { ViewCommand } from './CoinScene';
import type { CameraPreset } from './camera';

class SceneBoundary extends Component<{ readonly children: ReactNode; readonly onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export function watchContextLoss(canvas: HTMLCanvasElement, fail: () => void) {
  const lost = (event: Event) => { event.preventDefault(); fail(); };
  canvas.addEventListener('webglcontextlost', lost);
  return () => canvas.removeEventListener('webglcontextlost', lost);
}
export function CoinPreview({ result, selectedLayerId }: { readonly result: ValidGeneratedCoin | null; readonly selectedLayerId: string | null }) {
  const [started, setStarted] = useState(result !== null);
  const [failure, setFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [command, setCommand] = useState<ViewCommand>({ preset: 'reset', sequence: 0 });
  const fail = useCallback(() => setFailure(true), []);
  useEffect(() => { if (result) setStarted(true); }, [result]);
  useEffect(() => canvas ? watchContextLoss(canvas, fail) : undefined, [canvas, fail]);
  function view(preset: CameraPreset) { setCommand(previous => ({ preset, sequence: previous.sequence + 1 })); }
  return <>
    <div className="view-controls" aria-label="3D view controls">
      <button disabled={!result || failure} onClick={() => view('fit')}>Fit coin</button>
      <button disabled={!result || failure} onClick={() => view('reset')}>Reset view</button>
      <button disabled={!result || failure} onClick={() => view('top')}>Top view</button>
      <button disabled={!result || failure} onClick={() => view('side')}>Side view</button>
    </div>
    {failure ? <div className="preview-fallback" role="status">
      <p>3D preview is unavailable. Current dimensions and diagnostics remain available below. You can keep opening artwork and editing layers.</p>
      <button onClick={() => { setFailure(false); setAttempt(value => value + 1); }}>Retry 3D preview</button>
    </div> : started && <div className="coin-canvas" aria-label="Interactive coin preview. Z points up from the XY artwork plane." data-current={result !== null}>
      <SceneBoundary key={attempt} onFailure={fail}>
        <Canvas ref={setCanvas} frameloop="demand" dpr={[1, 2]} gl={{ antialias: true }}
          camera={cameraOptions} fallback={<p>3D preview is unavailable. Use the current dimensions and diagnostics below.</p>}>
          <CoinScene result={result} selectedLayerId={selectedLayerId} command={command} />
        </Canvas>
      </SceneBoundary>
    </div>}
    {started && !failure && <p className="orbit-help">Drag to orbit · right-drag or two fingers to pan · scroll or pinch to zoom. Top: +X right, +Y up. Side: +X right, +Z up.</p>}
  </>;
}
// Stable options avoid reconfiguring the camera on React updates.
// Created per mounted preview by Canvas from these stable options.
const cameraOptions = { position: [60, -84, 72] as [number, number, number], up: [0, 0, 1] as [number, number, number], fov: 40 };

