// M0.4 fixture-scale prototype. Pure mm geometry in, generic 3MF bytes out.
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { buildCoin, area, validateMesh } from '../tiered-stl/mesh.mjs';

const CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
const encode = text => new TextEncoder().encode(text);
function xml(value) {
  if (typeof value !== 'string' || !value.trim() ||
      [...value].some(c => { const n=c.codePointAt(0); return !(n===9 || n===10 || n===13 || n>=32 && n<=0xD7FF || n>=0xE000 && n<=0xFFFD || n>=0x10000 && n<=0x10FFFF); })) {
    throw Error('Invalid XML name');
  }
  return value.replace(/[&<>"'\t\n\r]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','\t':'&#9;','\n':'&#10;','\r':'&#13;'}[c]));
}

export function buildLayeredCoin(layers) {
  // Rebuild from this snapshot; never accept unchecked/stale preview meshes.
  layers.forEach(l => {
    xml(l.name);
    if (typeof l.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(l.color)) throw Error('Invalid display color');
  });
  const unified = buildCoin(layers); // includes immediate support + single-coin checks
  const parts = unified.tiers.map((tier, i) => {
    const mesh = {vertices:[], faces:[]}, shells=[];
    // A raised layer can have multiple closed shells, all in ONE named mesh object.
    // Validate each connected region with the existing single-shell validator.
    for (const polygon of tier.footprintMm) {
      const local = buildCoin([{footprintMm:[polygon], thicknessMm:layers[i].thicknessMm}]);
      const shell = {vertices:local.mesh.vertices.map(([x,y,z]) => [x,y,z+tier.bottomZMm]), faces:local.mesh.faces};
      const metrics = validateMesh(shell, area([polygon])*layers[i].thicknessMm);
      const offset=mesh.vertices.length;
      mesh.vertices.push(...shell.vertices);
      mesh.faces.push(...shell.faces.map(f => f.map(id => id+offset)));
      shells.push(metrics);
    }
    return {name:layers[i].name, color:layers[i].color.toUpperCase(),
      bottomZMm:tier.bottomZMm, topZMm:tier.topZMm, mesh, shells};
  });
  const volume=parts.reduce((s,p) => s+p.shells.reduce((v,m) => v+m.volumeMm3,0),0);
  if (Math.abs(volume-unified.metrics.volumeMm3)>Math.max(1e-6,volume*1e-7)) throw Error('Part/unified volume mismatch');
  return {parts, unifiedMetrics:unified.metrics};
}

export function write3mf(layers, {name='CoinPrint coin'}={}) {
  const escapedName=xml(name), {parts}=buildLayeredCoin(layers);
  // All IDs share a namespace: materials=1, layer meshes=2..N+1, assembly=N+2.
  const assemblyId=parts.length+2;
  const materials = `<basematerials id="1">${parts.map((p,i) =>
    `<base name="${i+1}: ${xml(p.name)}" displaycolor="${p.color}FF"/>`).join('')}</basematerials>`;
  const objects = parts.map((p,i) => `<object id="${i+2}" type="model" name="${xml(p.name)}" pid="1" pindex="${i}"><mesh><vertices>`+
    p.mesh.vertices.map(([x,y,z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('')+
    '</vertices><triangles>'+p.mesh.faces.map(([v1,v2,v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join('')+
    '</triangles></mesh></object>').join('');
  const assembly = `<object id="${assemblyId}" type="model" name="${escapedName}"><components>`+
    parts.map((_,i) => `<component objectid="${i+2}"/>`).join('')+'</components></object>';
  const model = xmlHeader+`<model unit="millimeter" xml:lang="en-US" xmlns="${CORE}">`+
    '<metadata name="Application">CoinPrint M0.4</metadata>'+
    `<resources>${materials}${objects}${assembly}</resources><build><item objectid="${assemblyId}"/></build></model>\n`;
  const types = xmlHeader+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n';
  const rels = xmlHeader+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n';
  // Reuse pinned Three.js's bundled fflate. Fixed DOS timestamp, STORE compression,
  // fixed entry order: reproducible without introducing another dependency.
  return zipSync({'[Content_Types].xml':encode(types), '_rels/.rels':encode(rels), '3D/3dmodel.model':encode(model)},
    {level:0, mtime:new Date(1980,0,1)});
}
