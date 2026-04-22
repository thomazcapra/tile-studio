import type { AnyImage, BlendMode, Cel, Sprite } from '../model/types';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, tileFlags, readTilesetIndex } from '../model/types';

// Composite visible layers for a given frame. Supports per-layer opacity + blend mode.
export function compositeFrame(sprite: Sprite, frame: number): ImageData {
  const out = new ImageData(sprite.w, sprite.h);
  const dst = new Uint32Array(out.data.buffer);

  for (const layerId of sprite.layerOrder) {
    const layer = sprite.layers.find((l) => l.id === layerId);
    if (!layer || !layer.visible || layer.type === 'group') continue;

    const cel = sprite.cels.find((c) => c.layerId === layerId && c.frame === frame);
    if (!cel) continue;

    const mode = layer.blendMode ?? 'normal';
    const opacity = layer.opacity / 255;
    blitCel(dst, sprite.w, sprite.h, cel, sprite, mode, opacity);
  }
  return out;
}

function blitCel(dst: Uint32Array, dw: number, dh: number, cel: Cel, sprite: Sprite, mode: BlendMode, opacity: number) {
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
    blitTilemap(dst, dw, dh, cel, sprite, img);
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

function blitTilemap(dst: Uint32Array, dw: number, dh: number, cel: Cel, sprite: Sprite, img: AnyImage) {
  if (img.colorMode !== 'tilemap') return;
  const layer = sprite.layers.find((l) => l.id === cel.layerId);
  if (!layer || layer.type !== 'tilemap') return;
  const tileset = sprite.tilesets.find((t) => t.id === layer.tilesetId);
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
      const timg = tile.image;
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

// Render a single ImageRGBA (used by tile-edit mode) directly as ImageData.
export function imageRGBAToImageData(img: { w: number; h: number; data: Uint32Array }): ImageData {
  const out = new ImageData(img.w, img.h);
  new Uint32Array(out.data.buffer).set(img.data);
  return out;
}

export function drawCheckerboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell = 8) {
  ctx.save();
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#333333';
  for (let j = 0; j < h; j += cell) {
    for (let i = 0; i < w; i += cell) {
      if (((i / cell) + (j / cell)) % 2 === 0) {
        ctx.fillRect(x + i, y + j, Math.min(cell, w - i), Math.min(cell, h - j));
      }
    }
  }
  ctx.restore();
}
