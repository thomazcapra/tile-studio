import type { ImageRGBA } from '../model/types';
import { Octree } from './octree';

export interface QuantizeOptions {
  maxColors: number;        // 2..256
  dither: boolean;          // Floyd-Steinberg
  alphaThreshold?: number;  // pixels with alpha below this are treated as transparent (default 1)
  onProgress?: (f: number) => void;
}

export interface QuantizeResult {
  palette: Uint32Array;     // N entries, RGBA packed AABBGGRR
  indexedData: Uint8Array;  // per-pixel palette index; 0 for transparent pixels
  remappedRGBA: Uint32Array; // RGBA output (post-quantize, with preserved alpha)
  colorsFound: number;
}

// Iteratively merge the two closest RGB entries until `count <= max`. O(N²·K) in worst case.
function mergePaletteDown(palette: Uint32Array, max: number): Uint32Array {
  const entries: { r: number; g: number; b: number; n: number }[] = [];
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    entries.push({ r: c & 0xff, g: (c >>> 8) & 0xff, b: (c >>> 16) & 0xff, n: 1 });
  }
  while (entries.length > max) {
    let bestI = 0, bestJ = 1, bestDist = Infinity;
    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) { bestDist = d; bestI = i; bestJ = j; }
      }
    }
    const a = entries[bestI], b = entries[bestJ];
    const total = a.n + b.n;
    entries[bestI] = {
      r: Math.round((a.r * a.n + b.r * b.n) / total),
      g: Math.round((a.g * a.n + b.g * b.n) / total),
      b: Math.round((a.b * a.n + b.b * b.n) / total),
      n: total,
    };
    entries.splice(bestJ, 1);
  }
  const out = new Uint32Array(entries.length);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    out[i] = ((0xff << 24) | (e.b << 16) | (e.g << 8) | e.r) >>> 0;
  }
  return out;
}

// Nearest-color lookup using brute-force over the (usually tiny) palette. Accurate.
function nearestPaletteIndex(palette: Uint32Array, r: number, g: number, b: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const pr = c & 0xff;
    const pg = (c >>> 8) & 0xff;
    const pb = (c >>> 16) & 0xff;
    const dr = r - pr, dg = g - pg, db = b - pb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function quantize(image: ImageRGBA, opts: QuantizeOptions): QuantizeResult {
  const { w, h, data } = image;
  const max = Math.max(2, Math.min(256, opts.maxColors | 0));
  const alphaT = opts.alphaThreshold ?? 1;
  const total = w * h;
  const tree = new Octree();

  // Pass 1: accumulate opaque colors.
  for (let i = 0; i < total; i++) {
    const c = data[i];
    const a = (c >>> 24) & 0xff;
    if (a < alphaT) continue;
    tree.addColor(c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff);
    if (opts.onProgress && (i & 0xffff) === 0) opts.onProgress((i / total) * 0.4);
  }

  tree.reduceTo(max);
  let palette = tree.buildPalette();
  // Octree can't always merge below the target on sparse inputs (disjoint branches).
  // Fallback: greedily merge the closest pair in RGB space until we hit `max`.
  if (palette.length > max) palette = mergePaletteDown(palette, max);
  opts.onProgress?.(0.5);

  // Pass 2: remap (optionally with dither).
  const indexedData = new Uint8Array(total);
  const remappedRGBA = new Uint32Array(total);

  if (!opts.dither) {
    for (let i = 0; i < total; i++) {
      const c = data[i];
      const a = (c >>> 24) & 0xff;
      if (a < alphaT) {
        indexedData[i] = 0;
        remappedRGBA[i] = 0;
      } else {
        const idx = nearestPaletteIndex(palette, c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff);
        indexedData[i] = idx;
        const p = palette[idx];
        remappedRGBA[i] = (((a << 24) >>> 0) | (p & 0x00ffffff)) >>> 0;
      }
      if (opts.onProgress && (i & 0xffff) === 0) opts.onProgress(0.5 + (i / total) * 0.5);
    }
  } else {
    ditherFloydSteinberg(image, palette, indexedData, remappedRGBA, alphaT, opts.onProgress);
  }

  opts.onProgress?.(1);
  return { palette, indexedData, remappedRGBA, colorsFound: palette.length };
}

// Floyd-Steinberg error diffusion. Uses float error buffers for the 3 color channels.
function ditherFloydSteinberg(
  image: ImageRGBA,
  palette: Uint32Array,
  indexedOut: Uint8Array,
  rgbaOut: Uint32Array,
  alphaT: number,
  onProgress?: (f: number) => void,
) {
  const { w, h, data } = image;
  // Current row + next row error buffers (to avoid mutating source).
  const rowLen = w + 2; // +2 for x-1 and x+1 sentinels
  const curR = new Float32Array(rowLen);
  const curG = new Float32Array(rowLen);
  const curB = new Float32Array(rowLen);
  const nextR = new Float32Array(rowLen);
  const nextG = new Float32Array(rowLen);
  const nextB = new Float32Array(rowLen);

  // Seed row 0 from source.
  for (let x = 0; x < w; x++) {
    const c = data[x];
    curR[x + 1] = c & 0xff;
    curG[x + 1] = (c >>> 8) & 0xff;
    curB[x + 1] = (c >>> 16) & 0xff;
  }

  for (let y = 0; y < h; y++) {
    // Reset next-row errors.
    nextR.fill(0); nextG.fill(0); nextB.fill(0);

    // Seed next row from source.
    if (y + 1 < h) {
      for (let x = 0; x < w; x++) {
        const c = data[(y + 1) * w + x];
        nextR[x + 1] = c & 0xff;
        nextG[x + 1] = (c >>> 8) & 0xff;
        nextB[x + 1] = (c >>> 16) & 0xff;
      }
    }

    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const srcC = data[i];
      const a = (srcC >>> 24) & 0xff;
      if (a < alphaT) { indexedOut[i] = 0; rgbaOut[i] = 0; continue; }

      const r = Math.max(0, Math.min(255, curR[x + 1]));
      const g = Math.max(0, Math.min(255, curG[x + 1]));
      const b = Math.max(0, Math.min(255, curB[x + 1]));
      const pi = nearestPaletteIndex(palette, r, g, b);
      indexedOut[i] = pi;
      const pal = palette[pi];
      const pr = pal & 0xff, pg = (pal >>> 8) & 0xff, pb = (pal >>> 16) & 0xff;
      rgbaOut[i] = (((a << 24) >>> 0) | (pb << 16) | (pg << 8) | pr) >>> 0;

      const er = r - pr;
      const eg = g - pg;
      const eb = b - pb;
      // 7/16 right.
      curR[x + 2] += er * (7 / 16);
      curG[x + 2] += eg * (7 / 16);
      curB[x + 2] += eb * (7 / 16);
      // 3/16 down-left.
      nextR[x] += er * (3 / 16);
      nextG[x] += eg * (3 / 16);
      nextB[x] += eb * (3 / 16);
      // 5/16 down.
      nextR[x + 1] += er * (5 / 16);
      nextG[x + 1] += eg * (5 / 16);
      nextB[x + 1] += eb * (5 / 16);
      // 1/16 down-right.
      nextR[x + 2] += er * (1 / 16);
      nextG[x + 2] += eg * (1 / 16);
      nextB[x + 2] += eb * (1 / 16);
    }

    // Swap rows.
    curR.set(nextR); curG.set(nextG); curB.set(nextB);
    if (onProgress && (y & 0x1f) === 0) onProgress(0.5 + (y / h) * 0.5);
  }
}
