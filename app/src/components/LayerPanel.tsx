import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { EditorStore } from '../state/editorStore';
import { LayerRow } from './LayerRow';

interface Drag { readonly layerId: string; readonly pointerId: number; readonly targetIndex: number; readonly clientY: number }
export function LayerPanel({ store }: { readonly store: EditorStore }) {
  const state = useStore(store);
  const coin = state.importState.coin, settings = state.settings;
  const disabled = state.importState.pendingFileName !== null;
  const list = useRef<HTMLOListElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterMove = useRef<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useLayoutEffect(() => {
    if (focusAfterMove.current) { buttons.current.get(focusAfterMove.current)?.focus(); focusAfterMove.current = null; }
  }, [settings?.layers]);
  useLayoutEffect(() => { drag.current = null; setDropIndex(null); }, [coin, disabled]);
  // Keep long stacks draggable on a narrow screen without disabling page scrolling
  // elsewhere. Re-evaluate row bounds while the page moves beneath the pointer.
  const dragging = dropIndex !== null;
  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    function tick() {
      const active = drag.current;
      if (!active || !list.current) return;
      const edge = 64;
      const delta = active.clientY < edge ? -12 : active.clientY > window.innerHeight - edge ? 12 : 0;
      if (delta) window.scrollBy(0, delta);
      const targetIndex = targetIndexAt(active.clientY, active.layerId);
      if (active.targetIndex !== targetIndex) { drag.current = { ...active, targetIndex }; setDropIndex(targetIndex); }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);
  const artwork = settings?.layers.slice(1) ?? [];
  const displayLayers = settings ? [...settings.layers.slice(1).reverse(), settings.layers[0]] : [];
  function targetIndexAt(clientY: number, layerId: string) {
    if (!list.current) return 0;
    const others = [...list.current.children].slice(0, artwork.length)
      .filter(row => row.getAttribute('data-layer-id') !== layerId);
    const visualIndex = others.filter(row => clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2).length;
    return artwork.length - 1 - visualIndex;
  }
  function move(layerId: string, targetIndex: number) {
    if (!coin || disabled) return;
    const ids = artwork.map(layer => layer.layerId), oldIndex = ids.indexOf(layerId);
    if (oldIndex < 0 || targetIndex === oldIndex) return;
    ids.splice(oldIndex, 1); ids.splice(targetIndex, 0, layerId);
    focusAfterMove.current = layerId;
    state.reorderArtwork(ids);
    setAnnouncement(`${coin.layers.find(layer => layer.id === layerId)!.name} moved to raised position ${targetIndex + 1} of ${ids.length}, bottom to top.`);
  }
  function cancelDrag() { drag.current = null; setDropIndex(null); }
  return <aside className="layer-panel inspector" aria-labelledby="layers-heading">
    <div className="panel-heading"><h2 id="layers-heading">Layers</h2><span>{coin ? coin.layers.length : 0}</span></div>
    {coin && settings ? <>
      <p className="sr-only" id="reorder-help">Drag a raised tier to reorder. Escape cancels. The base stays at the bottom.</p>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <ol className="layer-list" ref={list}>{displayLayers.map(setting => {
        const layer = coin.layers.find(item => item.id === setting.layerId)!;
        const raisedIndex = artwork.findIndex(item => item.layerId === setting.layerId);
        const isBase = setting.role === 'base';
        return <li key={`${coin.source.importId}:${layer.id}`} data-layer-id={layer.id} data-drop-target={dropIndex === raisedIndex && !isBase}>
          <LayerRow layer={layer} settings={setting} selected={state.selectedLayerId === layer.id} disabled={disabled}
            selectRef={node => { if (node) buttons.current.set(layer.id, node); else buttons.current.delete(layer.id); }}
            onSelect={() => state.selectLayer(layer.id)} onThickness={value => state.setThickness(layer.id, value)}
            onColor={value => state.setColor(layer.id, value)} onEnabled={enabled => state.setEnabled(layer.id, enabled)}>
            {!isBase && <div className="reorder-controls">
              <button type="button" className="drag-handle" disabled={disabled || artwork.length < 2} aria-label={`Drag ${layer.name} to reorder`} aria-describedby="reorder-help"
                onPointerDown={event => {
                  if (event.button !== 0 || !event.isPrimary) return;
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  state.selectLayer(layer.id);
                  drag.current = { layerId: layer.id, pointerId: event.pointerId, targetIndex: raisedIndex, clientY: event.clientY };
                  setDropIndex(raisedIndex);
                }}
                onPointerMove={event => {
                  const active = drag.current;
                  if (!active || active.pointerId !== event.pointerId) return;
                  const targetIndex = targetIndexAt(event.clientY, active.layerId);
                  drag.current = { ...active, targetIndex, clientY: event.clientY }; setDropIndex(targetIndex);
                }}
                onPointerUp={event => {
                  const active = drag.current;
                  if (!active || active.pointerId !== event.pointerId) return;
                  cancelDrag(); move(active.layerId, active.targetIndex);
                }} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
                onKeyDown={event => { if (event.key === 'Escape') { cancelDrag(); setAnnouncement(`Move canceled for ${layer.name}.`); } }} title={`Drag ${layer.name} to reorder`}><span aria-hidden="true">=</span></button>
              <button type="button" disabled={disabled || raisedIndex === artwork.length - 1} aria-label={`Move ${layer.name} toward top`} onClick={() => move(layer.id, raisedIndex + 1)} title={`Move ${layer.name} toward top`}><span aria-hidden="true">&#x21C8;</span></button>
              <button type="button" disabled={disabled || raisedIndex === 0} aria-label={`Move ${layer.name} toward base`} onClick={() => move(layer.id, raisedIndex - 1)} title={`Move ${layer.name} toward base`}><span aria-hidden="true">&#x21CA;</span></button>
            </div>}
          </LayerRow>
        </li>;
      })}</ol>
    </> : <div className="empty-layers">No layers yet</div>}
  </aside>;
}
