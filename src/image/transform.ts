import type { AnyImage, ImageRGBA, ImageTilemap, ImageIndexed, ImageGrayscale } from '../model/types';
import { makeTileWord, rawTileIndex, tileFlags, TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y } from '../model/types';

// --- RGBA ---

export function rotateRGBA90(img: ImageRGBA, ccw: boolean): ImageRGBA {
  const { w, h, data } = img;
  const out = new Uint32Array(w * h);
  if (!ccw) {
    // CW: (x,y) → (h-1-y, x) in rotated; so new[x*h + (h-1-y)] = old[y*w + x]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        out[x * h + (h - 1 - y)] = data[y * w + x];
      }
    }
  } else {
    // CCW: (x,y) → (y, w-1-x); new[(w-1-x)*h + y] = old[y*w + x]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        out[(w - 1 - x) * h + y] = data[y * w + x];
      }
    }
  }
  return { colorMode: 'rgba', w: h, h: w, data: out };
}

export function rotateRGBA180(img: ImageRGBA): ImageRGBA {
  const { w, h, data } = img;
  const out = new Uint32Array(w * h);
  for (let i = 0; i < data.length; i++) out[data.length - 1 - i] = data[i];
  return { colorMode: 'rgba', w, h, data: out };
}

export function flipRGBA(img: ImageRGBA, axis: 'h' | 'v'): ImageRGBA {
  const { w, h, data } = img;
  const out = new Uint32Array(w * h);
  if (axis === 'h') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) out[y * w + (w - 1 - x)] = data[y * w + x];
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) out[(h - 1 - y) * w + x] = data[y * w + x];
    }
  }
  return { colorMode: 'rgba', w, h, data: out };
}

export function cropRGBA(img: ImageRGBA, x: number, y: number, w: number, h: number): ImageRGBA {
  const out = new Uint32Array(w * h);
  for (let yy = 0; yy < h; yy++) {
    const sy = y + yy;
    if (sy < 0 || sy >= img.h) continue;
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      if (sx < 0 || sx >= img.w) continue;
      out[yy * w + xx] = img.data[sy * img.w + sx];
    }
  }
  return { colorMode: 'rgba', w, h, data: out };
}

// --- Tilemap (word-level; applies appropriate flip-flag toggles) ---

export function flipTilemap(img: ImageTilemap, axis: 'h' | 'v'): ImageTilemap {
  const { w, h, data } = img;
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = data[y * w + x];
      if (src === 0) {
        // empty stays empty after positional swap
        if (axis === 'h') out[y * w + (w - 1 - x)] = 0;
        else out[(h - 1 - y) * w + x] = 0;
        continue;
      }
      const idx = rawTileIndex(src);
      const fl = tileFlags(src);
      const toggled = axis === 'h' ? (fl ^ TILE_FLIP_X) : (fl ^ TILE_FLIP_Y);
      const newWord = (idx | toggled) >>> 0;
      if (axis === 'h') out[y * w + (w - 1 - x)] = newWord;
      else out[(h - 1 - y) * w + x] = newWord;
    }
  }
  return { colorMode: 'tilemap', w, h, data: out };
}

// 90° rotation of a tilemap. Requires tileW === tileH (not verified here) — see callers.
export function rotateTilemap90(img: ImageTilemap, ccw: boolean): ImageTilemap {
  const { w, h, data } = img;
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = data[y * w + x];
      if (src === 0) {
        if (!ccw) out[x * h + (h - 1 - y)] = 0;
        else out[(w - 1 - x) * h + y] = 0;
        continue;
      }
      const idx = rawTileIndex(src);
      const fl = tileFlags(src);
      // CW rotation of a tile = D-flip + X-flip; CCW = D-flip + Y-flip (per Aseprite semantics).
      const add = ccw ? (TILE_FLIP_D | TILE_FLIP_Y) : (TILE_FLIP_D | TILE_FLIP_X);
      const newFlags = (fl ^ add) >>> 0;
      const newWord = (idx | newFlags) >>> 0;
      if (!ccw) out[x * h + (h - 1 - y)] = newWord;
      else out[(w - 1 - x) * h + y] = newWord;
    }
  }
  return { colorMode: 'tilemap', w: h, h: w, data: out };
}

export function rotateTilemap180(img: ImageTilemap): ImageTilemap {
  const { w, h, data } = img;
  const out = new Uint32Array(w * h);
  for (let i = 0; i < data.length; i++) {
    const src = data[i];
    if (src === 0) { out[data.length - 1 - i] = 0; continue; }
    const idx = rawTileIndex(src);
    const fl = tileFlags(src);
    out[data.length - 1 - i] = ((fl ^ (TILE_FLIP_X | TILE_FLIP_Y)) | idx) >>> 0;
  }
  return { colorMode: 'tilemap', w, h, data: out };
}

// --- Unified helpers ---

export function rotate90(img: AnyImage, ccw: boolean): AnyImage {
  if (img.colorMode === 'rgba') return rotateRGBA90(img, ccw);
  if (img.colorMode === 'tilemap') return rotateTilemap90(img, ccw);
  // Indexed / grayscale: same as rgba shape logic but 8-bit.
  const w = img.w, h = img.h;
  const out = new Uint8Array(w * h);
  if (!ccw) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = (img as ImageIndexed | ImageGrayscale).data[y * w + x];
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(w - 1 - x) * h + y] = (img as ImageIndexed | ImageGrayscale).data[y * w + x];
  }
  return { ...img, w: h, h: w, data: out };
}

export function rotate180(img: AnyImage): AnyImage {
  if (img.colorMode === 'rgba') return rotateRGBA180(img);
  if (img.colorMode === 'tilemap') return rotateTilemap180(img);
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < img.data.length; i++) out[img.data.length - 1 - i] = (img.data as Uint8Array)[i];
  return { ...img, data: out };
}

export function flipAny(img: AnyImage, axis: 'h' | 'v'): AnyImage {
  if (img.colorMode === 'rgba') return flipRGBA(img, axis);
  if (img.colorMode === 'tilemap') return flipTilemap(img, axis);
  const { w, h } = img;
  const src = img.data as Uint8Array;
  const out = new Uint8Array(w * h);
  if (axis === 'h') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + (w - 1 - x)] = src[y * w + x];
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(h - 1 - y) * w + x] = src[y * w + x];
  }
  return { ...img, data: out };
}

// Nearest-neighbor integer scale of an RGBA image.
export function scaleRGBANearest(img: ImageRGBA, newW: number, newH: number): ImageRGBA {
  const out = new Uint32Array(newW * newH);
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(img.h - 1, Math.floor((y * img.h) / newH));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(img.w - 1, Math.floor((x * img.w) / newW));
      out[y * newW + x] = img.data[sy * img.w + sx];
    }
  }
  return { colorMode: 'rgba', w: newW, h: newH, data: out };
}

// Suppress warning from helper-only use of makeTileWord (kept for future callers).
void makeTileWord;
