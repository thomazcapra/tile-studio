import type { AnyImage, BlendMode, Cel, Sprite } from '../model/types';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, tileFlags, readTilesetIndex } from '../model/types';

// Composite visible layers for a given frame. Supports per-layer opacity + blend mode.
// A layer whose ancestor group is hidden contributes nothing.
// When `includeReference` is false (default: true), reference layers are skipped —
// use that path for exports.
export function compositeFrame(sprite: Sprite, frame: number, opts: { includeReference?: boolean; tileClockMs?: number } = {}): ImageData {
  const out = new ImageData(sprite.w, sprite.h);
  const dst = new Uint32Array(out.data.buffer);
  const includeReference = opts.includeReference ?? true;
  const tileClockMs = opts.tileClockMs ?? 0;

  // Index layers and cels once. The previous version called `sprite.layers.find`
  // and `sprite.cels.find` inside the layer loop and recursively for ancestor
  // visibility checks; on a 7-layer sprite with hundreds of cels this turned
  // O(L) layer iteration into O(L^2 + L*C).
  const layerById = new Map<string, typeof sprite.layers[number]>();
  for (const l of sprite.layers) layerById.set(l.id, l);
  const celByLayerFrame = new Map<string, Cel>();
  for (const c of sprite.cels) {
    if (c.frame === frame) celByLayerFrame.set(c.layerId, c);
  }
  const tilesetById = new Map<string, typeof sprite.tilesets[number]>();
  for (const t of sprite.tilesets) tilesetById.set(t.id, t);

  function ancestorHidden(layer: Sprite['layers'][number]): boolean {
    let pid = layer.parentId;
    while (pid) {
      const p = layerById.get(pid);
      if (!p) break;
      if (!p.visible) return true;
      pid = p.parentId;
    }
    return false;
  }

  for (const layerId of sprite.layerOrder) {
    const layer = layerById.get(layerId);
    if (!layer || !layer.visible || layer.type === 'group') continue;
    if (layer.type === 'reference' && !includeReference) continue;
    if (ancestorHidden(layer)) continue;

    const cel = celByLayerFrame.get(layerId);
    if (!cel) continue;

    const mode = layer.blendMode ?? 'normal';
    const opacity = layer.opacity / 255;
    blitCel(dst, sprite.w, sprite.h, cel, sprite, mode, opacity, tileClockMs, layerById, tilesetById);
  }
  return out;
}

function blitCel(
  dst: Uint32Array,
  dw: number,
  dh: number,
  cel: Cel,
  sprite: Sprite,
  mode: BlendMode,
  opacity: number,
  tileClockMs: number,
  layerById: Map<string, Sprite['layers'][number]>,
  tilesetById: Map<string, Sprite['tilesets'][number]>,
) {
  const img = cel.image;
  if (img.colorMode === 'rgba') {
    blitRGBABlended(dst, dw, dh, cel.x, cel.y, img.w, img.h, img.data, mode, opacity);
  } else if (img.colorMode === 'indexed') {
    const pal = sprite.palette.colors;
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const dx = cel.x + x, dy = cel.y + y;
        if (dx < 0 || dy < 0 || dx >= dw || dy >= dh) continue;
        const idx = img.data[y * img.w + x];
        const c = pal[idx] ?? 0;
        if ((c >>> 24) === 0) continue;
        const di = dy * dw + dx;
        dst[di] = blendPixel(dst[di], c, mode, opacity);
      }
    }
  } else if (img.colorMode === 'tilemap') {
    blitTilemap(dst, dw, dh, cel, img, tileClockMs, layerById, tilesetById);
  }
}

function blitRGBABlended(dst: Uint32Array, dw: number, dh: number, ox: number, oy: number, sw: number, sh: number, src: Uint32Array, mode: BlendMode, opacity: number) {
  // Fast path: opaque src + normal blend + opacity 1 = straight copy.
  const fastCopy = mode === 'normal' && opacity === 1;
  for (let y = 0; y < sh; y++) {
    const dy = oy + y;
    if (dy < 0 || dy >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const dx = ox + x;
      if (dx < 0 || dx >= dw) continue;
      const c = src[y * sw + x];
      if ((c >>> 24) === 0) continue;
      const di = dy * dw + dx;
      dst[di] = fastCopy ? c : blendPixel(dst[di], c, mode, opacity);
    }
  }
}

// Blend one source pixel (AABBGGRR) into a destination pixel with the given blend mode + overall opacity.
// All math is in 0..255 per-channel; alpha is handled as "normal over" after channel blending.
function blendPixel(dst: number, src: number, mode: BlendMode, opacity: number): number {
  const sa = ((src >>> 24) & 0xff) * opacity;
  if (sa <= 0) return dst;
  const da = (dst >>> 24) & 0xff;
  const sr = src & 0xff, sg = (src >>> 8) & 0xff, sb = (src >>> 16) & 0xff;
  const dr = dst & 0xff, dg = (dst >>> 8) & 0xff, db = (dst >>> 16) & 0xff;

  let br: number, bg: number, bb: number;
  switch (mode) {
    case 'multiply':
      br = (sr * dr) / 255; bg = (sg * dg) / 255; bb = (sb * db) / 255; break;
    case 'screen':
      br = 255 - ((255 - sr) * (255 - dr)) / 255;
      bg = 255 - ((255 - sg) * (255 - dg)) / 255;
      bb = 255 - ((255 - sb) * (255 - db)) / 255; break;
    case 'darken':
      br = Math.min(sr, dr); bg = Math.min(sg, dg); bb = Math.min(sb, db); break;
    case 'lighten':
      br = Math.max(sr, dr); bg = Math.max(sg, dg); bb = Math.max(sb, db); break;
    case 'add':
      br = Math.min(255, sr + dr); bg = Math.min(255, sg + dg); bb = Math.min(255, sb + db); break;
    case 'subtract':
      br = Math.max(0, dr - sr); bg = Math.max(0, dg - sg); bb = Math.max(0, db - sb); break;
    case 'difference':
      br = Math.abs(dr - sr); bg = Math.abs(dg - sg); bb = Math.abs(db - sb); break;
    case 'overlay':
      br = overlayCh(dr, sr); bg = overlayCh(dg, sg); bb = overlayCh(db, sb); break;
    default: // normal
      br = sr; bg = sg; bb = sb; break;
  }

  // "Normal-over" alpha compositing using the blended color as the source.
  const sa01 = sa / 255;
  const da01 = da / 255;
  const outA01 = sa01 + da01 * (1 - sa01);
  if (outA01 <= 0) return 0;
  const outR = (br * sa01 + dr * da01 * (1 - sa01)) / outA01;
  const outG = (bg * sa01 + dg * da01 * (1 - sa01)) / outA01;
  const outB = (bb * sa01 + db * da01 * (1 - sa01)) / outA01;
  const outA = Math.round(outA01 * 255);
  return ((outA << 24) | ((outB | 0) << 16) | ((outG | 0) << 8) | (outR | 0)) >>> 0;
}

function overlayCh(d: number, s: number): number {
  return d < 128 ? (2 * s * d) / 255 : 255 - (2 * (255 - s) * (255 - d)) / 255;
}

function blitTilemap(
  dst: Uint32Array,
  dw: number,
  dh: number,
  cel: Cel,
  img: AnyImage,
  tileClockMs: number,
  layerById: Map<string, Sprite['layers'][number]>,
  tilesetById: Map<string, Sprite['tilesets'][number]>,
) {
  if (img.colorMode !== 'tilemap') return;
  const layer = layerById.get(cel.layerId);
  if (!layer || layer.type !== 'tilemap') return;
  const tileset = tilesetById.get(layer.tilesetId);
  if (!tileset) return;
  const { tw, th } = tileset.grid;
  for (let ty = 0; ty < img.h; ty++) {
    for (let tx = 0; tx < img.w; tx++) {
      const word = img.data[ty * img.w + tx];
      if (word === 0) continue; // empty cell
      const idx = readTilesetIndex(word);
      const tile = idx >= 0 ? tileset.tiles[idx] : undefined;
      if (!tile) continue;
      const flags = tileFlags(word);
      const baseX = cel.x + tx * tw;
      const baseY = cel.y + ty * th;
      // Select the animated frame for this tile if one is attached.
      let timg: AnyImage = tile.image;
      if (tile.animation && tile.animation.frames.length > 0) {
        const { frames, frameMs } = tile.animation;
        const fi = Math.floor(tileClockMs / frameMs) % frames.length;
        timg = frames[fi] ?? tile.image;
      }
      if (timg.colorMode === 'rgba') {
        if (flags === 0) {
          blitRGBABlended(dst, dw, dh, baseX, baseY, timg.w, timg.h, timg.data, 'normal', 1);
        } else {
          blitRGBAFlipped(dst, dw, dh, baseX, baseY, timg.w, timg.h, timg.data, flags);
        }
      }
    }
  }
}

function blitRGBAFlipped(dst: Uint32Array, dw: number, dh: number, ox: number, oy: number, sw: number, sh: number, src: Uint32Array, flags: number) {
  const fx = (flags & TILE_FLIP_X) !== 0;
  const fy = (flags & TILE_FLIP_Y) !== 0;
  const fd = (flags & TILE_FLIP_D) !== 0;
  // Aseprite semantics: diagonal flip = transpose (swap x/y before H/V flips).
  const outW = fd ? sh : sw;
  const outH = fd ? sw : sh;
  for (let dy2 = 0; dy2 < outH; dy2++) {
    for (let dx2 = 0; dx2 < outW; dx2++) {
      // Map output (dx2, dy2) back to source coords.
      let sx = fx ? outW - 1 - dx2 : dx2;
      let sy = fy ? outH - 1 - dy2 : dy2;
      if (fd) { const t = sx; sx = sy; sy = t; }
      const c = src[sy * sw + sx];
      if ((c >>> 24) === 0) continue;
      const px = ox + dx2, py = oy + dy2;
      if (px < 0 || py < 0 || px >= dw || py >= dh) continue;
      dst[py * dw + px] = c;
    }
  }
}

// Partial recomposite: rebuild only the pixel rect `rect` directly into `ctx`,
// leaving the rest of the canvas untouched. Use this on tile-paint strokes so
// we don't redo a 70ms full-sprite composite for a single 16x16 tile change.
//
// The rect is in sprite-space pixel coordinates. Caller is responsible for
// using the same coordinate system for `ctx` (i.e. ctx must already be the
// offscreen canvas sized to `sprite.w × sprite.h`).
export function compositeRect(
  sprite: Sprite,
  frame: number,
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  opts: { includeReference?: boolean; tileClockMs?: number } = {},
): void {
  // Clamp rect to sprite bounds.
  const x0 = Math.max(0, Math.min(sprite.w, rect.x));
  const y0 = Math.max(0, Math.min(sprite.h, rect.y));
  const x1 = Math.max(0, Math.min(sprite.w, rect.x + rect.w));
  const y1 = Math.max(0, Math.min(sprite.h, rect.y + rect.h));
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return;

  const out = new ImageData(rw, rh);
  const dst = new Uint32Array(out.data.buffer);
  const includeReference = opts.includeReference ?? true;
  const tileClockMs = opts.tileClockMs ?? 0;

  const layerById = new Map<string, typeof sprite.layers[number]>();
  for (const l of sprite.layers) layerById.set(l.id, l);
  const celByLayerFrame = new Map<string, Cel>();
  for (const c of sprite.cels) {
    if (c.frame === frame) celByLayerFrame.set(c.layerId, c);
  }
  const tilesetById = new Map<string, typeof sprite.tilesets[number]>();
  for (const t of sprite.tilesets) tilesetById.set(t.id, t);

  function ancestorHidden(layer: Sprite['layers'][number]): boolean {
    let pid = layer.parentId;
    while (pid) {
      const p = layerById.get(pid);
      if (!p) break;
      if (!p.visible) return true;
      pid = p.parentId;
    }
    return false;
  }

  for (const layerId of sprite.layerOrder) {
    const layer = layerById.get(layerId);
    if (!layer || !layer.visible || layer.type === 'group') continue;
    if (layer.type === 'reference' && !includeReference) continue;
    if (ancestorHidden(layer)) continue;
    const cel = celByLayerFrame.get(layerId);
    if (!cel) continue;
    const mode = layer.blendMode ?? 'normal';
    const opacity = layer.opacity / 255;
    blitCelClipped(dst, rw, rh, x0, y0, cel, sprite, mode, opacity, tileClockMs, layerById, tilesetById);
    void sprite; // (kept for future indexed/blend paths)
  }
  ctx.putImageData(out, x0, y0);
}

// Like blitCel, but writes to a buffer that represents the sprite-space
// rectangle [(clipX, clipY), (clipX+dw, clipY+dh)). Skips contributions outside
// the rect cheaply — for tilemaps, iterate only the cells whose pixel bounds
// intersect the clip rect.
function blitCelClipped(
  dst: Uint32Array,
  dw: number,
  dh: number,
  clipX: number,
  clipY: number,
  cel: Cel,
  _sprite: Sprite,
  mode: BlendMode,
  opacity: number,
  tileClockMs: number,
  layerById: Map<string, Sprite['layers'][number]>,
  tilesetById: Map<string, Sprite['tilesets'][number]>,
) {
  const img = cel.image;
  if (img.colorMode === 'rgba') {
    blitRGBAClipped(dst, dw, dh, clipX, clipY, cel.x, cel.y, img.w, img.h, img.data, mode, opacity);
  } else if (img.colorMode === 'tilemap') {
    blitTilemapClipped(dst, dw, dh, clipX, clipY, cel, img, tileClockMs, layerById, tilesetById);
  }
  // indexed/reference paths are uncommon for the partial-update use case;
  // fall back to a no-op rather than mishandle them. Callers can do a full
  // recomposite when those layers change.
}

function blitRGBAClipped(
  dst: Uint32Array,
  dw: number,
  dh: number,
  clipX: number,
  clipY: number,
  ox: number,
  oy: number,
  sw: number,
  sh: number,
  src: Uint32Array,
  mode: BlendMode,
  opacity: number,
) {
  const fastCopy = mode === 'normal' && opacity === 1;
  // Compute intersection of [ox..ox+sw) × [oy..oy+sh) with [clipX..clipX+dw) × [clipY..clipY+dh).
  const xs = Math.max(ox, clipX);
  const ys = Math.max(oy, clipY);
  const xe = Math.min(ox + sw, clipX + dw);
  const ye = Math.min(oy + sh, clipY + dh);
  if (xe <= xs || ye <= ys) return;
  for (let yy = ys; yy < ye; yy++) {
    const srcRow = (yy - oy) * sw;
    const dstRow = (yy - clipY) * dw;
    for (let xx = xs; xx < xe; xx++) {
      const c = src[srcRow + (xx - ox)];
      if ((c >>> 24) === 0) continue;
      const di = dstRow + (xx - clipX);
      dst[di] = fastCopy ? c : blendPixel(dst[di], c, mode, opacity);
    }
  }
}

function blitTilemapClipped(
  dst: Uint32Array,
  dw: number,
  dh: number,
  clipX: number,
  clipY: number,
  cel: Cel,
  img: AnyImage,
  tileClockMs: number,
  layerById: Map<string, Sprite['layers'][number]>,
  tilesetById: Map<string, Sprite['tilesets'][number]>,
) {
  if (img.colorMode !== 'tilemap') return;
  const layer = layerById.get(cel.layerId);
  if (!layer || layer.type !== 'tilemap') return;
  const tileset = tilesetById.get(layer.tilesetId);
  if (!tileset) return;
  const { tw, th } = tileset.grid;
  // Convert clip rect to tile-space range, clamped to map bounds.
  const txStart = Math.max(0, Math.floor((clipX - cel.x) / tw));
  const tyStart = Math.max(0, Math.floor((clipY - cel.y) / th));
  const txEnd = Math.min(img.w, Math.ceil((clipX + dw - cel.x) / tw));
  const tyEnd = Math.min(img.h, Math.ceil((clipY + dh - cel.y) / th));
  for (let ty = tyStart; ty < tyEnd; ty++) {
    for (let tx = txStart; tx < txEnd; tx++) {
      const word = img.data[ty * img.w + tx];
      if (word === 0) continue;
      const idx = readTilesetIndex(word);
      const tile = idx >= 0 ? tileset.tiles[idx] : undefined;
      if (!tile) continue;
      const flags = tileFlags(word);
      const baseX = cel.x + tx * tw;
      const baseY = cel.y + ty * th;
      let timg: AnyImage = tile.image;
      if (tile.animation && tile.animation.frames.length > 0) {
        const { frames, frameMs } = tile.animation;
        const fi = Math.floor(tileClockMs / frameMs) % frames.length;
        timg = frames[fi] ?? tile.image;
      }
      if (timg.colorMode === 'rgba') {
        if (flags === 0) {
          blitRGBAClipped(dst, dw, dh, clipX, clipY, baseX, baseY, timg.w, timg.h, timg.data, 'normal', 1);
        } else {
          // Flipped tiles fall back to the existing path; expand the clip
          // window manually and call the unflipped clipped blitter on the
          // intermediate transformed pixels. Rare on BQ-style content.
          blitRGBAFlipped(dst, dw, dh, baseX - clipX, baseY - clipY, timg.w, timg.h, timg.data, flags);
        }
      }
    }
  }
}

// Render a single ImageRGBA (used by tile-edit mode) directly as ImageData.
export function imageRGBAToImageData(img: { w: number; h: number; data: Uint32Array }): ImageData {
  const out = new ImageData(img.w, img.h);
  new Uint32Array(out.data.buffer).set(img.data);
  return out;
}

// Reused checkerboard pattern, keyed by cell size. A pattern fill replaces
// O(area / cell^2) fillRect calls with a single fillRect — turning the 100k+
// fillRect loop on a 2752x5024 sprite into one paint command.
const checkerPatternCache = new Map<number, CanvasPattern>();
function checkerPattern(ctx: CanvasRenderingContext2D, cell: number): CanvasPattern | null {
  const cached = checkerPatternCache.get(cell);
  if (cached) return cached;
  const tile = document.createElement('canvas');
  tile.width = cell * 2;
  tile.height = cell * 2;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  tctx.fillStyle = '#2a2a2a';
  tctx.fillRect(0, 0, cell * 2, cell * 2);
  tctx.fillStyle = '#333333';
  tctx.fillRect(0, 0, cell, cell);
  tctx.fillRect(cell, cell, cell, cell);
  const pat = ctx.createPattern(tile, 'repeat');
  if (pat) checkerPatternCache.set(cell, pat);
  return pat;
}

export function drawCheckerboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell = 8) {
  const pat = checkerPattern(ctx, cell);
  ctx.save();
  if (pat) {
    // Translate the pattern origin so the checker is anchored to (x, y) — without
    // this, panning would slide the pattern relative to the sprite.
    ctx.translate(x, y);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}
