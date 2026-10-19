// Validate complete shape syntax before the permissive SVGLoader interpreter.
// Physical coordinate units/viewport interpretation remain the next stage.
const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
function validPath(data: string): boolean {
  let cursor = 0, first = true;
  const spaces = () => { while (/\s/.test(data[cursor] ?? '') && cursor < data.length) cursor++; };
  spaces();
  while (cursor < data.length) {
    const command = data[cursor++].toUpperCase();
    if (first && command !== 'M') return false;
    first = false;
    spaces();
    if (command === 'Z') continue;
    const count = arity[command];
    if (!count) return false;
    let values = 0;
    while (cursor < data.length && !/[a-df-z]/i.test(data[cursor])) {
      const flag = command === 'A' && [3, 4].includes(values % count);
      const match = flag ? /^[01]/.exec(data.slice(cursor)) : number.exec(data.slice(cursor));
      if (!match || !Number.isFinite(Number(match[0]))) return false;
      if (command === 'A' && [0, 1].includes(values % count) && Number(match[0]) < 0) return false;
      cursor += match[0].length;
      values++;
      spaces();
      if (data[cursor] === ',') {
        cursor++; spaces();
        if (cursor >= data.length || /[a-df-z]/i.test(data[cursor])) return false;
      }
    }
    if (!values || values % count) return false;
  }
  return !first;
}
export function validShapeData(element: Element): boolean {
  const name = element.localName;
  if (name === 'path') return validPath(element.getAttribute('d') ?? '');
  if (name === 'polygon') {
    const data = element.getAttribute('points') ?? '';
    const values = data.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/ig) ?? [];
    const residue = data.replace(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/ig, 'n');
    return values.length >= 6 && values.length % 2 === 0 && values.every(v => Number.isFinite(Number(v))) && /^\s*n(?:[\s,]*n)*\s*$/.test(residue) && !/,,|,\s*,/.test(residue);
  }
  const attributes = name === 'rect' ? ['x', 'y', 'width', 'height', 'rx', 'ry'] : name === 'circle' ? ['cx', 'cy', 'r'] : ['cx', 'cy', 'rx', 'ry'];
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute);
    if (value === null) continue;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px|mm|cm|in|pt|pc)?$/i.test(value.trim()) || !Number.isFinite(Number.parseFloat(value))) return false;
    if (['width', 'height', 'r', 'rx', 'ry'].includes(attribute) && Number.parseFloat(value) < 0) return false;
  }
  const required = name === 'rect' ? ['width', 'height'] : name === 'circle' ? ['r'] : ['rx', 'ry'];
  return required.every(attribute => Number.parseFloat(element.getAttribute(attribute) ?? '') > 0);
}
