/** Portable deterministic filename, not a statement about source trust. */
export function stlFileName(sourceName: string): string {
  let stem = sourceName.normalize('NFC').replace(/\.[^.]*$/, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '_')
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '_').trim().replace(/^[. ]+|[. ]+$/g, '');
  let limited = '', byteLength = 0, characters = 0;
  for (const character of stem) {
    const bytes = new TextEncoder().encode(character).length;
    if (++characters > 100 || byteLength + bytes > 180) break;
    limited += character; byteLength += bytes;
  }
  stem = limited.replace(/[. ]+$/g, '');
  if (!stem) stem = 'coin';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem = '_' + stem;
  return stem + '.stl';
}

export type ExportFormat = 'stl' | '3mf';
export function exportFileName(name: string, format: ExportFormat): string {
  // Source filenames keep their full stem, including dots and earlier suffixes.
  if (/\.svg$/i.test(name)) return stlFileName(name).slice(0, -4) + '.' + format;
  // Remove repeated export suffixes, then apply the established portable stem rules.
  return stlFileName(name.trim().replace(/(?:\.(?:svg|stl|3mf))+$/i, '') + '.svg').slice(0, -4) + '.' + format;
}

export function createFileDownload(bytes: ArrayBuffer, name: string, format: ExportFormat): void {
  download(bytes, exportFileName(name, format), format === 'stl' ? 'model/stl' : 'model/3mf');
}

/** Local browser boundary. A returned action is not proof of an OS save. */
export function createDownload(bytes: ArrayBuffer, sourceName: string): void {
  download(bytes, stlFileName(sourceName), 'model/stl');
}

function download(bytes: ArrayBuffer, fileName: string, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | null = null, scheduled = false, revoked = false;
  const revoke = () => { if (!revoked) { revoked = true; URL.revokeObjectURL(url); } };
  try {
    anchor = document.createElement('a');
    anchor.href = url; anchor.download = fileName; anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    // Independent of component lifetime; allow the browser to consume the URL.
    setTimeout(revoke, 0); scheduled = true;
  } finally {
    try { anchor?.remove(); } finally { if (!scheduled) revoke(); }
  }
}
