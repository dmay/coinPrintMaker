import { useState } from 'react';

export function ImportControl({ onSelect }: { readonly onSelect: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="import-control" data-dragging={dragging}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => {
      event.preventDefault(); setDragging(false);
      const files = event.dataTransfer.files;
      if (files.length !== 1) { setError('Drop one SVG file at a time.'); return; }
      setError(null); onSelect(files[0]);
    }}>
    <label htmlFor="svg-file">Click to open file <span>or drag it here</span></label>
    <input id="svg-file" type="file" accept=".svg,image/svg+xml" aria-describedby="local-file-note"
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        // Permit same-file retry, while picker cancellation remains a no-op.
        event.currentTarget.value = '';
        if (file) { setError(null); onSelect(file); }
      }} />
    <span id="local-file-note" className="sr-only">Open one SVG, up to 2 MiB. Files stay in this browser.</span>
    {error && <p className="drop-error" role="alert">{error}</p>}
  </div>;
}
