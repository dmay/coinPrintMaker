import { useId, useState } from 'react';
import type { ImportedLayer, LayerSettings, ActiveTier } from '../core/contracts';

function format(value: number): string { return value.toLocaleString(undefined, { maximumFractionDigits: 4 }); }
// Number() alone accepts blanks and hexadecimal. Require a complete decimal token.
function thicknessValue(text: string): number | null {
  if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim())) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function LayerRow({ layer, settings, selected, disabled, tier, selectRef, onSelect, onThickness, onColor, onEnabled, children }: {
  readonly layer: ImportedLayer;
  readonly settings: LayerSettings;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly tier?: ActiveTier;
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
    <h3><button ref={selectRef} className="layer-select" type="button" aria-pressed={selected} onClick={onSelect}>{layer.name}<span>{settings.role === 'base' ? 'Base · locked · always visible' : settings.enabled ? 'Raised tier · visible' : 'Raised tier · hidden'}</span></button></h3>
    <div className="layer-fields">
      <label htmlFor={`${id}-color`}>Display color
        <input id={`${id}-color`} type="color" value={settings.color} disabled={disabled} aria-label={`Display color for ${layer.name}`} aria-describedby={`${id}-color-note`} onChange={event => {
          const color = event.currentTarget.value;
          if (/^#[0-9a-f]{6}$/i.test(color)) { setColorError(false); onColor(color); } else setColorError(true);
        }} />
      </label>
      <label htmlFor={`${id}-thickness`}>Thickness (mm)
        <input id={`${id}-thickness`} type="text" inputMode="decimal" value={text} disabled={disabled} aria-label={`Thickness for ${layer.name} (mm)`} aria-invalid={invalid} aria-describedby={`${id}-thickness-note`} onChange={event => { setDraft(event.currentTarget.value); setEditing(true); }} onBlur={event => commit(event.currentTarget.value)} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value); }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(String(settings.thicknessMm)); setEditing(false); }
        }} />
      </label>
    </div>
    <p className="field-note" id={`${id}-color-note`}>{colorError ? 'Choose an opaque six-digit color.' : `Opaque color ${settings.color}. Display only.`}</p>
    <p className={`field-note${invalid ? ' field-error' : ''}`} id={`${id}-thickness-note`}>{invalid
      ? `Enter a complete number greater than zero, such as 0.4. Committed thickness is ${settings.thicknessMm} mm. Enter or leave the field to apply; Escape restores it.`
      : 'Enter or leave the field to apply. Escape restores the committed thickness.'}</p>
    {settings.role !== 'base' && <label className="visibility-control"><input type="checkbox" checked={settings.enabled} disabled={disabled} aria-label={`Show ${layer.name}`} onChange={event => onEnabled(event.currentTarget.checked)} /> Show tier</label>}
    {children}
    <p className="tier-interval">{!settings.enabled ? 'Hidden · contributes no height.' : tier ? `Current Z: ${format(tier.bottomZMm)}–${format(tier.topZMm)} mm.` : 'Current Z unavailable until geometry passes validation.'}</p>
    <details><summary>Imported measurements</summary><dl>
      <div><dt>Width × height (mm)</dt><dd>{format(layer.boundsMm[2] - layer.boundsMm[0])} × {format(layer.boundsMm[3] - layer.boundsMm[1])}</dd></div>
      <div><dt>XY bounds (mm)</dt><dd>{layer.boundsMm.map(format).join(', ')}</dd></div>
      <div><dt>Area (mm²)</dt><dd>{format(layer.areaMm2)}</dd></div>
      <div><dt>Regions / holes</dt><dd>{layer.footprintMm.length} / {layer.footprintMm.reduce((sum, p) => sum + p.holes.length, 0)}</dd></div>
    </dl></details>
  </div>;
}
