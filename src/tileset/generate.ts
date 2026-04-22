import type { ImageRGBA, Tileset } from '../model/types';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, makeTileWord } from '../model/types';
import { newTileset } from '../model/factory';

// --- Flip helpers ---

// Apply flip flags, writing into a caller-provided buffer (avoids allocation in hot loops).
// `dst` must be large enough: for D-flipped non-square tiles `dst.length >= h*w`, otherwise `w*h`.
export function applyFlipInto(src: Uint32Array, w: number, h: number, flags: number, dst: Uint32Array): void {
  const fx = (flags & TILE_FLIP_X) !== 0;
  const fy = (flags & TILE_FLIP_Y) !== 0;
  const fd = (flags & TILE_FLIP_D) !== 0;
  if (!fx && !fy && !fd) { dst.set(src); return; }

  const outW = fd ? h : w;
  const outH = fd ? w : h;
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      let sx = fx ? outW - 1 - dx : dx;
      let sy = fy ? outH - 1 - dy : dy;
      if (fd) { const t = sx; sx = sy; sy = t; }
      dst[dy * outW + dx] = src[sy * w + sx];
    }
  }
}

// Legacy helper retained for API back-compat (allocs each call).
export function applyFlip(src: Uint32Array, w: number, h: number, flags: number): Uint32Array {
  const fd = (flags & TILE_FLIP_D) !== 0;
  const out = new Uint32Array(fd ? h * w : w * h);
  applyFlipInto(src, w, h, flags, out);
  return out;
}

// Cut a single tile's pixel data out of a larger image.
export function extractTile(img: ImageRGBA, sx: number, sy: number, tw: number, th: number): Uint32Array {
  const out = new Uint32Array(tw * th);
  extractTileInto(img, sx, sy, tw, th, out);
  return out;
}

// No-alloc variant.
export function extractTileInto(img: ImageRGBA, sx: number, sy: number, tw: number, th: number, out: Uint32Array): void {
  const { w: iw, h: ih, data } = img;
  for (let y = 0; y < th; y++) {
    const srcY = sy + y;
    const dstRow = y * tw;
    if (srcY < 0 || srcY >= ih) {
      for (let x = 0; x < tw; x++) out[dstRow + x] = 0;
      continue;
    }
    const srcRow = srcY * iw;
    for (let x = 0; x < tw; x++) {
      const srcX = sx + x;
      out[dstRow + x] = (srcX < 0 || srcX >= iw) ? 0 : data[srcRow + srcX];
    }
  }
}

// --- Hashing ---

// FNV-1a 32-bit over a Uint32Array slice, byte-wise. Operates on the first `len` words.
export function hashU32(data: Uint32Array, len = data.length): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < len; i++) {
    const v = data[i];
    h = Math.imul(h ^ (v & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
  }
  return h >>> 0;
}

// Compute FNV-1a of a conceptual-flipped view of `src` without materializing the flipped buffer.
// Iterates source indices in the order the flipped output would be emitted.
export function hashOriented(src: Uint32Array, w: number, h: number, flags: number): number {
  const fx = (flags & TILE_FLIP_X) !== 0;
  const fy = (flags & TILE_FLIP_Y) !== 0;
  const fd = (flags & TILE_FLIP_D) !== 0;
  if (!fx && !fy && !fd) return hashU32(src, w * h);

  const outW = fd ? h : w;
  const outH = fd ? w : h;
  let hh = 0x811c9dc5;
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      let sx = fx ? outW - 1 - dx : dx;
      let sy = fy ? outH - 1 - dy : dy;
      if (fd) { const t = sx; sx = sy; sy = t; }
      const v = src[sy * w + sx];
      hh = Math.imul(hh ^ (v & 0xff), 0x01000193);
      hh = Math.imul(hh ^ ((v >>> 8) & 0xff), 0x01000193);
      hh = Math.imul(hh ^ ((v >>> 16) & 0xff), 0x01000193);
      hh = Math.imul(hh ^ ((v >>> 24) & 0xff), 0x01000193);
    }
  }
  return hh >>> 0;
}

// Compare `other` (identity orientation, length w*h) with a conceptual-flipped view of `src` —
// no intermediate buffer allocation.
export function equalsOriented(other: Uint32Array, src: Uint32Array, w: number, h: number, flags: number): boolean {
  const fx = (flags & TILE_FLIP_X) !== 0;
  const fy = (flags & TILE_FLIP_Y) !== 0;
  const fd = (flags & TILE_FLIP_D) !== 0;
  if (!fx && !fy && !fd) {
    if (other.length !== w * h) return false;
    for (let i = 0; i < w * h; i++) if (other[i] !== src[i]) return false;
    return true;
  }
  const outW = fd ? h : w;
  const outH = fd ? w : h;
  if (other.length !== outW * outH) return false;
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      let sx = fx ? outW - 1 - dx : dx;
      let sy = fy ? outH - 1 - dy : dy;
      if (fd) { const t = sx; sx = sy; sy = t; }
      if (other[dy * outW + dx] !== src[sy * w + sx]) return false;
    }
  }
  return true;
}

// --- Core algorithm ---

export interface GenerateOptions {
  tileWidth: number;
  tileHeight: number;
  offsetX?: number;
  offsetY?: number;
  matchFlips?: boolean;
  name?: string;
  /** Optional progress callback: `fraction` in [0,1]. Called ~every 1% of cells. */
  onProgress?: (fraction: number) => void;
}

export interface GenerateResult {
  tileset: Tileset;
  tilemapData: Uint32Array;
  mapW: number;
  mapH: number;
  duplicatesFound: number;
  tilesCreated: number;
}

// Deduplicate tiles from an image into a tileset, optionally honoring H/V/D flips.
// Performance-oriented: single scratch buffer for extraction, no per-cell allocs, direct hashing.
export function generateTilesetFromImage(image: ImageRGBA, opts: GenerateOptions): GenerateResult {
  const { tileWidth: tw, tileHeight: th } = opts;
  const offX = opts.offsetX ?? 0;
  const offY = opts.offsetY ?? 0;
  const matchFlips = opts.matchFlips ?? true;
  const canDiagonal = tw === th;
  const tileLen = tw * th;

  const mapW = Math.max(0, Math.floor((image.w - offX) / tw));
  const mapH = Math.max(0, Math.floor((image.h - offY) / th));

  const tileset = newTileset(tw, th, opts.name ?? 'Generated');
  const tilemapData = new Uint32Array(mapW * mapH);

  // hashTable: FNV32 → list of tile indices sharing that identity hash.
  const hashTable = new Map<number, number[]>();

  // Orientations tried in order: identity first (cheapest, most common match).
  const flipOrientations = matchFlips
    ? [0, TILE_FLIP_X, TILE_FLIP_Y, TILE_FLIP_X | TILE_FLIP_Y]
    : [0];
  if (matchFlips && canDiagonal) {
    flipOrientations.push(
      TILE_FLIP_D,
      TILE_FLIP_D | TILE_FLIP_X,
      TILE_FLIP_D | TILE_FLIP_Y,
      TILE_FLIP_D | TILE_FLIP_X | TILE_FLIP_Y,
    );
  }

  // Reusable scratch for extraction. (One allocation per run, not per cell.)
  const pixels = new Uint32Array(tileLen);

  let duplicatesFound = 0;
  const totalCells = mapW * mapH;
  const progressStep = Math.max(1, Math.floor(totalCells / 100));

  for (let ty = 0; ty < mapH; ty++) {
    for (let tx = 0; tx < mapW; tx++) {
      extractTileInto(image, offX + tx * tw, offY + ty * th, tw, th, pixels);

      let foundIndex = -1;
      let foundFlags = 0;

      for (let oi = 0; oi < flipOrientations.length; oi++) {
        const flags = flipOrientations[oi];
        const h = hashOriented(pixels, tw, th, flags);
        const bucket = hashTable.get(h);
        if (!bucket) continue;
        for (let bi = 0; bi < bucket.length; bi++) {
          const idx = bucket[bi];
          const existing = tileset.tiles[idx].image;
          if (existing.colorMode !== 'rgba') continue;
          if (equalsOriented(existing.data, pixels, tw, th, flags)) {
            foundIndex = idx;
            foundFlags = flags;
            break;
          }
        }
        if (foundIndex >= 0) break;
      }

      if (foundIndex >= 0) {
        duplicatesFound++;
      } else {
        // Store a COPY of pixels (pixels is reused across cells).
        const copy = new Uint32Array(pixels);
        tileset.tiles.push({ image: { colorMode: 'rgba', w: tw, h: th, data: copy } });
        foundIndex = tileset.tiles.length - 1;
        const h = hashU32(copy);
        let bucket = hashTable.get(h);
        if (!bucket) { bucket = []; hashTable.set(h, bucket); }
        bucket.push(foundIndex);
      }

      tilemapData[ty * mapW + tx] = makeTileWord(foundIndex, foundFlags);

      if (opts.onProgress) {
        const done = ty * mapW + tx + 1;
        if (done === totalCells || done % progressStep === 0) {
          opts.onProgress(done / totalCells);
        }
      }
    }
  }

  return {
    tileset,
    tilemapData,
    mapW,
    mapH,
    duplicatesFound,
    tilesCreated: tileset.tiles.length,
  };
}
