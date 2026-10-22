import { useEffect, useRef } from 'react';

export function SvgInstructions({ onClose }: { readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current!, opener = document.activeElement;
    element.showModal(); closeButton.current?.focus();
    return () => { element.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className="svg-instructions" aria-labelledby="svg-instructions-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="instructions-heading"><h2 id="svg-instructions-title">Prepare your SVG</h2>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Close SVG instructions">Close</button></div>
    <ol>
      <li><strong>Use named Inkscape layers.</strong> Put the coin base in the bottom layer and each raised design in its own layer above it. Keep layers at the top level; ordinary groups can sit inside them.</li>
      <li><strong>Use closed, solid shapes.</strong> Paths, rectangles, circles, ellipses and polygons work. Close every path. Convert text and strokes to paths; trace bitmap images and remove the originals.</li>
      <li><strong>Keep artwork explicit.</strong> Use opaque fills. Turn clones, gradients, clipping, masks and other effects into plain filled paths. Remove linked or embedded images and other references.</li>
      <li><strong>Set the size.</strong> Set the SVG page dimensions in millimeters. The file must be no larger than 2 MiB.</li>
      <li><strong>Review the coin.</strong> Check layer order, thickness and colors before exporting. Hidden artwork is excluded. Export buttons become available after geometry checks pass.</li>
    </ol>
    <p>Files are processed locally in your browser.</p>
    <p><strong>3MF</strong> preserves layer parts and display colors; assign filaments in your slicer. <strong>STL</strong> contains geometry only; open it in millimeters.</p>
  </dialog>;
}
