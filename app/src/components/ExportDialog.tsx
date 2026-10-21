import { useEffect, useRef, useState } from 'react';
import { exportFileName } from '../export/createDownload';
import type { ExportFormat } from '../export/createDownload';
import type { ExportChoices } from '../state/exportCoin';

export function ExportDialog({ initialFormat, initialName, canExport, exportNote, onExport, onClose }: {
  readonly initialFormat: ExportFormat; readonly initialName: string; readonly canExport: boolean;
  readonly exportNote: string; readonly onExport: (choices: ExportChoices) => string | null; readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), nameInput = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState(initialFormat), [fileName, setFileName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current!, opener = document.activeElement;
    element.showModal(); nameInput.current?.focus(); nameInput.current?.select();
    return () => { element.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title" aria-describedby="export-description"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={event => {
      event.preventDefault();
      if (!canExport) return;
      const failure = onExport({ format, fileName }); setError(failure); if (!failure) onClose();
    }}>
      <h2 id="export-title">Export coin</h2>
      <p id="export-description">Export the latest checked visible tiers. Files are prepared locally in your browser.</p>
      <label htmlFor="export-format">Format</label>
      <select id="export-format" value={format} onChange={event => { setFormat(event.target.value as ExportFormat); setError(null); }}>
        <option value="stl">STL — single surface</option><option value="3mf">3MF — layered model with color intent</option>
      </select>
      <label htmlFor="export-filename">Filename</label>
      <input ref={nameInput} id="export-filename" value={fileName} onChange={event => { setFileName(event.target.value); setError(null); }} aria-describedby="export-final-name" />
      <p id="export-final-name">Download name: {exportFileName(fileName, format)}</p>
      {format === 'stl' ? <p>STL contains geometry only, with no colors or layers. Its format has no units; coordinates use millimeters. Choose millimeters when opening it.</p>
        : <p>3MF is a generic model in millimeters with named layer parts and best-effort display-color intent. It is not an OrcaSlicer project. Your slicer controls displayed names/colors, filament or extruder assignment and printer setup; these are outside CoinPrint export acceptance.</p>}
      <p role="status">{exportNote}</p>
      {error && <p role="alert">{error}</p>}
      <div className="button-row"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!canExport}>Download {format.toUpperCase()}</button></div>
    </form>
  </dialog>;
}
