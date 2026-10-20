export function ImportControl({ onSelect }: { readonly onSelect: (file: File) => void }) {
  return <div className="import-control">
    <label htmlFor="svg-file">Open SVG <span>(up to 2 MiB)</span></label>
    <input id="svg-file" type="file" accept=".svg,image/svg+xml" aria-describedby="local-file-note"
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        // Permit same-file retry, while picker cancellation remains a no-op.
        event.currentTarget.value = '';
        if (file) onSelect(file);
      }} />
    <p id="local-file-note">Inkscape artwork · Files stay in this browser.</p>
  </div>;
}
