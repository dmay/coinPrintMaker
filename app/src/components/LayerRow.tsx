import { useId, useState } from 'react';
import type { ImportedLayer, LayerSettings } from '../core/contracts';

// Number() alone accepts blanks and hexadecimal. Require a complete decimal token.
function thicknessValue(text: string): number | null {
  if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim())) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function LayerRow({ layer, settings, selected, disabled, selectRef, onSelect, onThickness, onColor, onEnabled, children }: {
  readonly layer: ImportedLayer;
  readonly settings: LayerSettings;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly selectRef: (node: HTMLButtonElement | null) => void;
  readonly onSelect: () => void;
  readonly onThickness: (value: number) => void;
  readonly onColor: (value: string) => void;
  readonly onEnabled: (enabled: boolean) => void;
  readonly children?: import('react').ReactNode;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(settings.thicknessMm));
  const [editing, setEditing] = useState(false);
  const [colorError, setColorError] = useState(false);
  const text = editing ? draft : String(settings.thicknessMm);
  const invalid = thicknessValue(text) === null;
  function commit(rawText: string) {
    const value = thicknessValue(rawText);
    if (value === null) return;
    onThickness(value);
    setDraft(String(value));
    setEditing(false);
  }
  return <div className="layer-row" data-selected={selected} onFocus={onSelect}>
    <div className="layer-row-heading">{children}
    <h3><button ref={selectRef} className="layer-select" type="button" aria-pressed={selected} onClick={onSelect}>{layer.name}<span className="sr-only">{settings.role === 'base' ? 'Base, locked, always visible' : settings.enabled ? 'Raised tier, visible' : 'Raised tier, hidden'}</span></button></h3></div>
    <div className="layer-fields">
      <label htmlFor={`${id}-color`}>Color
        <input id={`${id}-color`} type="color" value={settings.color} disabled={disabled} aria-label={`Display color for ${layer.name}`} aria-describedby={colorError ? `${id}-color-note` : undefined} onChange={event => {
          const color = event.currentTarget.value;
          if (/^#[0-9a-f]{6}$/i.test(color)) { setColorError(false); onColor(color); } else setColorError(true);
        }} />
      </label>
      <label htmlFor={`${id}-thickness`}>Thickness (mm)
        <input id={`${id}-thickness`} type="text" inputMode="decimal" value={text} disabled={disabled} aria-label={`Thickness for ${layer.name} (mm)`} aria-invalid={invalid} aria-describedby={invalid ? `${id}-thickness-note` : undefined} title="Enter or leave the field to apply. Escape restores the committed thickness." onChange={event => { setDraft(event.currentTarget.value); setEditing(true); }} onBlur={event => commit(event.currentTarget.value)} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value); }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(String(settings.thicknessMm)); setEditing(false); }
        }} />
      </label>
    </div>
    {colorError && <p className="field-note field-error" id={`${id}-color-note`}>Choose an opaque six-digit color.</p>}
    {invalid && <p className="field-note field-error" id={`${id}-thickness-note`}>Enter a complete number greater than zero. Committed thickness is {settings.thicknessMm} mm. Escape restores it.</p>}
    {settings.role !== 'base' && <label className="visibility-control"><input type="checkbox" checked={settings.enabled} disabled={disabled} aria-label={`Show ${layer.name}`} onChange={event => onEnabled(event.currentTarget.checked)} /> Show tier</label>}

  </div>;
}
