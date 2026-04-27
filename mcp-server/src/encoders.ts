// Node-native replacements for tile-studio's canvas-based PNG / sprite-sheet
// encoders. The pure compositor (`compositeFrame`) returns ImageData with
// AABBGGRR-packed pixels in `data` (Uint8ClampedArray of length w*h*4).
// pngjs wants RGBA byte order, which is the same byte order on little-endian
// hosts when read through Uint8ClampedArray, so we can pass the buffer through.

import { PNG } from 'pngjs';
import { zipSync } from 'fflate';
import { compositeFrame, imageRGBAToImageData } from '../../src/render/composite.js';
import {
  rawTileIndex,
  TILE_FLIP_D,
  TILE_FLIP_X,
  TILE_FLIP_Y,
  tileFlags,
  type Sprite,
  type TilemapLayer,
  type Tileset,
} from '../../src/model/types.js';

export interface GeneratedFile {
  name: string;
  bytes: Uint8Array;
}

export type JsonFormat = 'raw' | 'tiled' | 'aseprite-array';

// Encode an ImageData-shaped buffer as a PNG.
function encodePNG(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const png = new PNG({ width, height });
  // PNG.data is a Buffer in RGBA byte order. Our composite buffer is the same
  // byte sequence on little-endian hosts (R,G,B,A,R,G,B,A,...), so direct copy.
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  return new Uint8Array(PNG.sync.write(png, { colorType: 6 }));
}

// ---------- Frame / sprite-sheet encoders ----------

export function spriteFramePNG(sprite: Sprite, frame: number, tileClockMs = 0): Uint8Array {
  const img = compositeFrame(sprite, frame, { includeReference: false, tileClockMs });
  return encodePNG(img.width, img.height, img.data);
}

export function spriteSheetStripPNG(
  sprite: Sprite,
  cols: number
): { bytes: Uint8Array; width: number; height: number; cols: number; rows: number } {
  const n = sprite.frames.length;
  const c = Math.max(1, Math.min(cols, n));
  const rows = Math.ceil(n / c);
  const W = c * sprite.w;
  const H = rows * sprite.h;
  const sheet = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < n; i++) {
    const fr = compositeFrame(sprite, i, { includeReference: false });
    const x0 = (i % c) * sprite.w;
    const y0 = Math.floor(i / c) * sprite.h;
    for (let y = 0; y < sprite.h; y++) {
      const srcRow = y * sprite.w * 4;
      const dstRow = ((y0 + y) * W + x0) * 4;
      sheet.set(fr.data.subarray(srcRow, srcRow + sprite.w * 4), dstRow);
    }
  }
  return { bytes: encodePNG(W, H, sheet), width: W, height: H, cols: c, rows };
}

export function tilesetAtlasPNG(
  tileset: Tileset,
  columns: number
): { bytes: Uint8Array; width: number; height: number } {
  const n = tileset.tiles.length;
  const cols = Math.max(1, columns);
  const rows = Math.ceil(n / cols);
  const { tw, th } = tileset.grid;
  const W = cols * tw;
  const H = Math.max(rows, 1) * th;
  const atlas = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < n; i++) {
    const tile = tileset.tiles[i];
    if (tile.image.colorMode !== 'rgba') continue;
    const id = imageRGBAToImageData(tile.image);
    const x0 = (i % cols) * tw;
    const y0 = Math.floor(i / cols) * th;
    for (let y = 0; y < th; y++) {
      const srcRow = y * tw * 4;
      const dstRow = ((y0 + y) * W + x0) * 4;
      atlas.set(id.data.subarray(srcRow, srcRow + tw * 4), dstRow);
    }
  }
  return { bytes: encodePNG(W, H, atlas), width: W, height: H };
}

// ---------- Sprite-sheet metadata (Phaser/PixiJS-style hash or array) ----------

export function spriteSheetWithMeta(
  sprite: Sprite,
  cols: number,
  filenameBase: string,
  layout: 'array' | 'hash' = 'hash'
): GeneratedFile[] {
  const sheet = spriteSheetStripPNG(sprite, cols);
  const imgFile = `${filenameBase}.png`;
  const frames = sprite.frames.map((f, i) => ({
    filename: `${filenameBase}_${i}`,
    frame: {
      x: (i % sheet.cols) * sprite.w,
      y: Math.floor(i / sheet.cols) * sprite.h,
      w: sprite.w,
      h: sprite.h,
    },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: sprite.w, h: sprite.h },
    sourceSize: { w: sprite.w, h: sprite.h },
    duration: f.duration,
  }));
  const meta = {
    app: 'tile-studio-mcp',
    version: '0.1.0',
    image: imgFile,
    format: 'RGBA8888',
    size: { w: sheet.width, h: sheet.height },
    scale: '1',
    frameTags: (sprite.tags ?? []).map((t) => ({
      name: t.name,
      from: t.from,
      to: t.to,
      direction: t.direction,
    })),
    layers: sprite.layers.map((l) => ({
      name: l.name,
      opacity: l.opacity,
      blendMode: (l as { blendMode?: string }).blendMode ?? 'normal',
    })),
  };
  const json =
    layout === 'hash'
      ? { frames: Object.fromEntries(frames.map((f) => [f.filename, f])), meta }
      : { frames, meta };
  return [
    { name: imgFile, bytes: sheet.bytes },
    { name: `${filenameBase}.json`, bytes: jsonBytes(json) },
  ];
}

// ---------- Tilemap exports (Tiled / raw / Aseprite-array) ----------

interface TilemapLayerExport {
  layer: TilemapLayer;
  mapW: number;
  mapH: number;
  words: Uint32Array;
}

function collectTilemapLayers(
  sprite: Sprite,
  tilesetId: string,
  frame: number
): TilemapLayerExport[] {
  const out: TilemapLayerExport[] = [];
  for (const layer of sprite.layers) {
    if (layer.type !== 'tilemap') continue;
    if (layer.tilesetId !== tilesetId) continue;
    const cel = sprite.cels.find((c) => c.layerId === layer.id && c.frame === frame);
    if (!cel || cel.image.colorMode !== 'tilemap') continue;
    out.push({ layer, mapW: cel.image.w, mapH: cel.image.h, words: cel.image.data });
  }
  return out;
}

function toTiledGid(word: number): number {
  if (word === 0) return 0;
  const idx = rawTileIndex(word);
  const fl = tileFlags(word);
  let out = idx >>> 0;
  if (fl & TILE_FLIP_X) out |= 0x80000000 >>> 0;
  if (fl & TILE_FLIP_Y) out |= 0x40000000 >>> 0;
  if (fl & TILE_FLIP_D) out |= 0x20000000 >>> 0;
  return out >>> 0;
}

export function buildTilemapExport(
  sprite: Sprite,
  tilesetId: string,
  format: JsonFormat,
  columns: number,
  filenameBase: string,
  frame = 0
): GeneratedFile[] {
  const tileset = sprite.tilesets.find((t) => t.id === tilesetId);
  if (!tileset) throw new Error(`Tileset not found: ${tilesetId}`);
  const atlas = tilesetAtlasPNG(tileset, columns);
  const layers = collectTilemapLayers(sprite, tilesetId, frame);
  const files: GeneratedFile[] = [{ name: `${filenameBase}.png`, bytes: atlas.bytes }];

  switch (format) {
    case 'raw': {
      files.push({
        name: `${filenameBase}.json`,
        bytes: jsonBytes({
          tileset: {
            name: tileset.name,
            tilewidth: tileset.grid.tw,
            tileheight: tileset.grid.th,
            tilecount: tileset.tiles.length,
            columns,
            image: `${filenameBase}.png`,
            imagewidth: atlas.width,
            imageheight: atlas.height,
          },
          layers: layers.map((l) => ({
            name: l.layer.name,
            width: l.mapW,
            height: l.mapH,
            visible: l.layer.visible,
            opacity: l.layer.opacity / 255,
            data: Array.from(l.words).map((w) => rawTileIndex(w)),
            flips: Array.from(l.words).map((w) => {
              const f = tileFlags(w);
              return (
                ((f & TILE_FLIP_X) ? 1 : 0) |
                ((f & TILE_FLIP_Y) ? 2 : 0) |
                ((f & TILE_FLIP_D) ? 4 : 0)
              );
            }),
          })),
        }),
      });
      break;
    }
    case 'tiled': {
      const tilesetJson = {
        columns,
        image: `${filenameBase}.png`,
        imageheight: atlas.height,
        imagewidth: atlas.width,
        margin: 0,
        name: tileset.name,
        spacing: 0,
        tilecount: tileset.tiles.length,
        tiledversion: '1.10.2',
        tileheight: tileset.grid.th,
        tilewidth: tileset.grid.tw,
        type: 'tileset',
        version: '1.10',
      };
      const mapJson = {
        compressionlevel: -1,
        height: layers[0]?.mapH ?? 0,
        width: layers[0]?.mapW ?? 0,
        infinite: false,
        layers: layers.map((l, i) => ({
          data: Array.from(l.words).map(toTiledGid),
          height: l.mapH,
          id: i + 1,
          name: l.layer.name,
          opacity: l.layer.opacity / 255,
          type: 'tilelayer',
          visible: l.layer.visible,
          width: l.mapW,
          x: 0,
          y: 0,
        })),
        nextlayerid: layers.length + 1,
        nextobjectid: 1,
        orientation: 'orthogonal',
        renderorder: 'right-down',
        tiledversion: '1.10.2',
        tileheight: tileset.grid.th,
        tilesets: [{ firstgid: 1, source: `${filenameBase}.tsj` }],
        tilewidth: tileset.grid.tw,
        type: 'map',
        version: '1.10',
      };
      files.push({ name: `${filenameBase}.tsj`, bytes: jsonBytes(tilesetJson) });
      files.push({ name: `${filenameBase}.tmj`, bytes: jsonBytes(mapJson) });
      break;
    }
    case 'aseprite-array': {
      const frames = tileset.tiles.map((_, i) => ({
        filename: `${filenameBase}_${i}`,
        frame: {
          x: (i % columns) * tileset.grid.tw,
          y: Math.floor(i / columns) * tileset.grid.th,
          w: tileset.grid.tw,
          h: tileset.grid.th,
        },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: tileset.grid.tw, h: tileset.grid.th },
        sourceSize: { w: tileset.grid.tw, h: tileset.grid.th },
        duration: 100,
      }));
      files.push({
        name: `${filenameBase}.json`,
        bytes: jsonBytes({
          frames,
          meta: {
            app: 'tile-studio-mcp',
            version: '0.1.0',
            image: `${filenameBase}.png`,
            format: 'RGBA8888',
            size: { w: atlas.width, h: atlas.height },
            scale: '1',
          },
        }),
      });
      break;
    }
  }
  return files;
}

// ---------- ZIP helper ----------

export function zipFiles(files: GeneratedFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = f.bytes;
  return zipSync(entries, { level: 6 });
}

function jsonBytes(obj: unknown): Uint8Array {
  return new Uint8Array(Buffer.from(JSON.stringify(obj, null, 2), 'utf-8'));
}

// ---------- PNG decode (for image imports / Gemini round-trip) ----------

export interface DecodedPNG {
  width: number;
  height: number;
  data: Uint32Array; // AABBGGRR-packed, matches tile-studio's ImageRGBA.data
}

export function decodePNG(bytes: Uint8Array | Buffer): DecodedPNG {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const png = PNG.sync.read(buf);
  const px = new Uint32Array(png.width * png.height);
  // pngjs gives us RGBA bytes; pack into AABBGGRR words to match the engine.
  for (let i = 0; i < px.length; i++) {
    const o = i * 4;
    const r = png.data[o];
    const g = png.data[o + 1];
    const b = png.data[o + 2];
    const a = png.data[o + 3];
    px[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return { width: png.width, height: png.height, data: px };
}
