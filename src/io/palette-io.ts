// Palette import/export for GIMP (.gpl) and JASC (.pal) formats.
//
// Engine colors are packed AABBGGRR in a Uint32 view. GPL/PAL are both plain
// text and don't carry alpha (they index opaque RGB), so we always round-trip
// with alpha=255.

function r(u32: number) { return u32 & 0xff; }
function g(u32: number) { return (u32 >>> 8) & 0xff; }
function b(u32: number) { return (u32 >>> 16) & 0xff; }

// --------- serializers ---------

export function paletteToGPL(colors: Uint32Array, name = 'Tile Studio Palette'): string {
  const lines = [
    'GIMP Palette',
    `Name: ${name}`,
    'Columns: 16',
    '#',
  ];
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    lines.push(`${pad3(r(c))} ${pad3(g(c))} ${pad3(b(c))}\tIndex ${i}`);
  }
  return lines.join('\n') + '\n';
}

// JASC-PAL (Paint Shop Pro) — tiny plain-text format used by many retro tools.
export function paletteToPAL(colors: Uint32Array): string {
  const lines = ['JASC-PAL', '0100', String(colors.length)];
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    lines.push(`${r(c)} ${g(c)} ${b(c)}`);
  }
  return lines.join('\r\n') + '\r\n';
}

// HEX palette (one #RRGGBB per line, comments with `;`). Common in lospec.com exports.
export function paletteToHex(colors: Uint32Array): string {
  const lines: string[] = [];
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    lines.push(hex2(r(c)) + hex2(g(c)) + hex2(b(c)));
  }
  return lines.join('\n') + '\n';
}

function pad3(n: number) { return String(n).padStart(3, ' '); }
function hex2(n: number) { return n.toString(16).padStart(2, '0').toUpperCase(); }

// --------- parsers ---------

// Returns packed AABBGGRR (alpha always 255).
function pack(rv: number, gv: number, bv: number): number {
  return ((0xff << 24) | ((bv & 0xff) << 16) | ((gv & 0xff) << 8) | (rv & 0xff)) >>> 0;
}

// Parse a GIMP .gpl file. Accepts leading "GIMP Palette" or the looser
// "three-numbers-per-line" format many exporters emit.
export function parseGPL(text: string): Uint32Array {
  const out: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('GIMP') || /^(Name|Columns):/i.test(line)) continue;
    const m = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (!m) continue;
    out.push(pack(+m[1], +m[2], +m[3]));
  }
  if (!out.length) throw new Error('No colors found in GPL');
  return new Uint32Array(out);
}

// Parse a JASC .pal file. Format:
//   JASC-PAL
//   0100
//   <count>
//   r g b   (one per line)
export function parsePAL(text: string): Uint32Array {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Empty file');
  const first = lines[0].toUpperCase();
  let start = 0;
  if (first.startsWith('JASC-PAL')) {
    // next line is version, next is count — skip both if present.
    start = lines.length >= 3 && /^\d+$/.test(lines[2]) ? 3 : 1;
  }
  const out: number[] = [];
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (m) out.push(pack(+m[1], +m[2], +m[3]));
  }
  if (!out.length) throw new Error('No colors found in PAL');
  return new Uint32Array(out);
}

// Parse a HEX-per-line palette (`#rrggbb`, `rrggbb`, or comment lines).
export function parseHex(text: string): Uint32Array {
  const out: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('//')) continue;
    const m = line.match(/^#?([0-9a-f]{6})\b/i);
    if (!m) continue;
    const v = parseInt(m[1], 16);
    out.push(pack((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff));
  }
  if (!out.length) throw new Error('No colors found in HEX file');
  return new Uint32Array(out);
}

// Detect and dispatch based on filename / contents.
export function parsePaletteFile(filename: string, text: string): Uint32Array {
  const f = filename.toLowerCase();
  if (f.endsWith('.gpl')) return parseGPL(text);
  if (f.endsWith('.pal')) return parsePAL(text);
  if (f.endsWith('.hex') || f.endsWith('.txt')) return parseHex(text);
  // Sniff the first non-blank line.
  const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  if (/GIMP/i.test(first)) return parseGPL(text);
  if (/JASC-PAL/i.test(first)) return parsePAL(text);
  if (/^#?[0-9a-f]{6}/i.test(first)) return parseHex(text);
  // Fallback: try GPL (it has the loosest shape).
  return parseGPL(text);
}
