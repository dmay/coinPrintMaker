import { useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Group, PerspectiveCamera } from 'three';
import type { Bounds3Mm, GeneratedPart, ValidGeneratedCoin } from '../core/contracts';
import { frameCoin } from './camera';
import type { CameraPreset } from './camera';
import { createPartView } from './partView';

export interface ViewCommand { readonly preset: CameraPreset; readonly sequence: number }
function PartView({ part, selected }: { readonly part: GeneratedPart; readonly selected: boolean }) {
  const parent = useRef<Group>(null);
  const resource = useRef<ReturnType<typeof createPartView> | null>(null);
  const invalidate = useThree(state => state.invalidate);
  // Allocate in the committed effect, including StrictMode replay cleanup.
  useLayoutEffect(() => {
    const view = createPartView(part);
    resource.current = view;
    const container = parent.current!;
    container.add(view.group);
    invalidate();
    return () => { container.remove(view.group); view.dispose(); resource.current = null; };
  }, [part.mesh, invalidate]);
  useLayoutEffect(() => {
    resource.current?.present(part.color, selected);
    invalidate();
  }, [part.mesh, part.color, selected, invalidate]);
  return <group ref={parent} dispose={null} />;
}

export function CoinScene({ result, selectedLayerId, command }: {
  readonly result: ValidGeneratedCoin | null;
  readonly selectedLayerId: string | null;
  readonly command: ViewCommand;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const bounds = result?.metrics.boundsMm;
  const lastBounds = useRef<Bounds3Mm | undefined>(undefined);
  const lastCommand = useRef(command);
  useLayoutEffect(() => {
    if (!bounds || !controls.current || !(camera instanceof PerspectiveCamera)) return;
    const changedBounds = lastBounds.current !== bounds;
    const changedCommand = lastCommand.current !== command;
    // A resize keeps the view direction while fitting the new aspect ratio.
    frameCoin(camera, controls.current, bounds, size.width / Math.max(1, size.height),
      changedCommand ? command.preset : changedBounds ? 'reset' : 'fit');
    lastBounds.current = bounds;
    lastCommand.current = command;
    invalidate();
  }, [bounds, camera, command, size.width, size.height, invalidate]);
  return <>
    <ambientLight intensity={1.4} />
    <directionalLight position={[30, -50, 80]} intensity={2} />
    <OrbitControls ref={controls} makeDefault enableDamping={false} screenSpacePanning />
    {result?.parts.map(part => <PartView key={part.layerId} part={part} selected={part.layerId === selectedLayerId} />)}
  </>;
}
