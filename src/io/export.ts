import type { Sprite, TilemapLayer, Tileset } from '../model/types';
import { rawTileIndex, TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, tileFlags } from '../model/types';
import { compositeFrame, imageRGBAToImageData } from '../render/composite';
import { zipSync } from 'fflate';

// ---------- PNG generators ----------

// Compose a tileset into a single PNG atlas. `columns` controls the grid width.
export async function tilesetAtlasPNG(tileset: Tileset, columns: number): Promise<{ blob: Blob; width: number; height: number }> {
  const tileCount = tileset.tiles.length;
  const cols = Math.max(1, columns);
  const rows = Math.ceil(tileCount / cols);
  const { tw, th } = tileset.grid;
  const W = cols * tw, H = Math.max(rows, 1) * th;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < tileCount; i++) {
    const tile = tileset.tiles[i];
    if (tile.image.colorMode !== 'rgba') continue;
    const x = (i % cols) * tw;
    const y = Math.floor(i / cols) * th;
    ctx.putImageData(imageRGBAToImageData(tile.image), x, y);
  }
  const blob = await canvasBlob(canvas);
  return { blob, width: W, height: H };
}

export type ImageFormat = 'png' | 'webp' | 'jpeg';

const MIME_FOR_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

export function extFor(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

// Compose the current frame of the sprite (flattened) into a PNG/WebP/JPEG.
// JPEG can't hold transparency — pixels with alpha < 255 are alpha-composited
// onto `background` (default white) before encoding.
export async function spriteFrameImage(
  sprite: Sprite,
  frame: number,
  format: ImageFormat = 'png',
  quality?: number,
  background: number = 0xffffffff,
  tileClockMs: number = 0,
): Promise<Blob> {
  const imgData = compositeFrame(sprite, frame, { includeReference: false, tileClockMs });
  const c = document.createElement('canvas');
  c.width = sprite.w;
  c.height = sprite.h;
  const ctx = c.getContext('2d')!;
  if (format === 'jpeg') {
    // Flatten onto background — JPEG can't store alpha.
    const br = background & 0xff, bg = (background >>> 8) & 0xff, bb = (background >>> 16) & 0xff;
    ctx.fillStyle = `rgb(${br},${bg},${bb})`;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.putImageData(imgData, 0, 0);
  return canvasBlob(c, format, quality);
}

// Backwards compat: many call sites still want a PNG.
export function spriteFramePNG(sprite: Sprite, frame: number): Promise<Blob> {
  return spriteFrameImage(sprite, frame, 'png');
}

function canvasBlob(c: HTMLCanvasElement, format: ImageFormat = 'png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`toBlob(${format}) failed`))),
      MIME_FOR_FORMAT[format],
      quality,
    );
  });
}

// ---------- Sequence exports ----------

export interface SequenceOptions {
  format: ImageFormat;
  filenameBase: string;
  digits?: number; // e.g. 3 → 000, 001
  quality?: number;
  background?: number;
}

// Render every frame of the sprite as its own image file.
export async function spriteFrameSequence(sprite: Sprite, opts: SequenceOptions): Promise<GeneratedFile[]> {
  const digits = Math.max(1, opts.digits ?? String(sprite.frames.length - 1).length);
  const out: GeneratedFile[] = [];
  for (let i = 0; i < sprite.frames.length; i++) {
    const blob = await spriteFrameImage(sprite, i, opts.format, opts.quality, opts.background);
    const suffix = String(i).padStart(digits, '0');
    out.push({ name: `${opts.filenameBase}_${suffix}.${extFor(opts.format)}`, blob });
  }
  return out;
}

// Pack every frame into a horizontal sprite-sheet strip (or grid).
export async function spriteSheetStrip(
  sprite: Sprite,
  cols: number,
  opts: { format?: ImageFormat; quality?: number; background?: number } = {}
): Promise<{ blob: Blob; width: number; height: number; cols: number; rows: number }> {
  const fmt = opts.format ?? 'png';
  const n = sprite.frames.length;
  const c = Math.max(1, Math.min(cols, n));
  const rows = Math.ceil(n / c);
  const W = c * sprite.w;
  const H = rows * sprite.h;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  if (fmt === 'jpeg') {
    const bg = opts.background ?? 0xffffffff;
    const br = bg & 0xff, bgn = (bg >>> 8) & 0xff, bb = (bg >>> 16) & 0xff;
    ctx.fillStyle = `rgb(${br},${bgn},${bb})`;
    ctx.fillRect(0, 0, W, H);
  }
  for (let i = 0; i < n; i++) {
    const imgData = compositeFrame(sprite, i, { includeReference: false });
    const x = (i % c) * sprite.w;
    const y = Math.floor(i / c) * sprite.h;
    ctx.putImageData(imgData, x, y);
  }
  const blob = await canvasBlob(canvas, fmt, opts.quality);
  return { blob, width: W, height: H, cols: c, rows };
}

// Sprite-sheet + JSON metadata ("Aseprite JSON Hash" flavor for engines like
// Phaser / PixiJS).
export async function spriteSheetWithMeta(
  sprite: Sprite,
  cols: number,
  opts: { format?: ImageFormat; filenameBase: string; layout?: 'array' | 'hash'; quality?: number; background?: number }
): Promise<GeneratedFile[]> {
  const sheet = await spriteSheetStrip(sprite, cols, {
    format: opts.format,
    quality: opts.quality,
    background: opts.background,
  });
  const imgFile = `${opts.filenameBase}.${extFor(opts.format ?? 'png')}`;
  const frames = sprite.frames.map((f, i) => ({
    filename: `${opts.filenameBase}_${i}`,
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
    app: 'https://tilestudio.local',
    version: '0.1.0',
    image: imgFile,
    format: 'RGBA8888',
    size: { w: sheet.width, h: sheet.height },
    scale: '1',
    frameTags: (sprite.tags ?? []).map((t) => ({ name: t.name, from: t.from, to: t.to, direction: t.direction })),
    layers: sprite.layers.map((l) => ({ name: l.name, opacity: l.opacity, blendMode: (l as { blendMode?: string }).blendMode ?? 'normal' })),
  };
  const json = opts.layout === 'hash'
    ? { frames: Object.fromEntries(frames.map((f) => [f.filename, f])), meta }
    : { frames, meta };
  return [
    { name: imgFile, blob: sheet.blob },
    { name: `${opts.filenameBase}.json`, blob: jsonBlob(json) },
  ];
}

// ---------- JSON emitters ----------

export type JsonFormat = 'raw' | 'tiled' | 'aseprite-array';

interface TilemapLayerExport {
  layer: TilemapLayer;
  mapW: number;
  mapH: number;
  words: Uint32Array;
}

// Collect all tilemap layers that reference a specific tileset.
export function collectTilemapLayers(sprite: Sprite, tilesetId: string, frame: number): TilemapLayerExport[] {
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

// Tile word → Tiled GID (swap X and D bits to match Tiled's {H=31, V=30, D=29}).
function toTiledGid(word: number): number {
  if (word === 0) return 0;
  const idx = rawTileIndex(word);
  const fl = tileFlags(word);
  let out = idx >>> 0;
  if (fl & TILE_FLIP_X) out |= 0x80000000 >>> 0; // Tiled H
  if (fl & TILE_FLIP_Y) out |= 0x40000000 >>> 0; // Tiled V (same bit)
  if (fl & TILE_FLIP_D) out |= 0x20000000 >>> 0; // Tiled D
  return out >>> 0;
}

export interface ExportOptions {
  tilesetId: string;
  format: JsonFormat;
  columns: number;
  filenameBase: string; // no extension
  frame?: number;
}

export interface GeneratedFile {
  name: string;
  blob: Blob;
}

export async function buildExport(sprite: Sprite, opts: ExportOptions): Promise<GeneratedFile[]> {
  const tileset = sprite.tilesets.find((t) => t.id === opts.tilesetId);
  if (!tileset) throw new Error('Tileset not found');

  const frame = opts.frame ?? 0;
  const atlas = await tilesetAtlasPNG(tileset, opts.columns);
  const layers = collectTilemapLayers(sprite, opts.tilesetId, frame);

  const files: GeneratedFile[] = [
    { name: `${opts.filenameBase}.png`, blob: atlas.blob },
  ];

  switch (opts.format) {
    case 'raw': {
      const json = {
        tileset: {
          name: tileset.name,
          tilewidth: tileset.grid.tw,
          tileheight: tileset.grid.th,
          tilecount: tileset.tiles.length,
          columns: opts.columns,
          image: `${opts.filenameBase}.png`,
          imagewidth: atlas.width,
          imageheight: atlas.height,
        },
        layers: layers.map((l) => ({
          name: l.layer.name,
          width: l.mapW,
          height: l.mapH,
          visible: l.layer.visible,
          opacity: l.layer.opacity / 255,
          // indices: 0 = empty, otherwise 1-based into tileset.tiles
          data: Array.from(l.words).map((w) => rawTileIndex(w)),
          flips: Array.from(l.words).map((w) => {
            const f = tileFlags(w);
            return ((f & TILE_FLIP_X) ? 1 : 0) | ((f & TILE_FLIP_Y) ? 2 : 0) | ((f & TILE_FLIP_D) ? 4 : 0);
          }),
        })),
      };
      files.push({ name: `${opts.filenameBase}.json`, blob: jsonBlob(json) });
      break;
    }

    case 'tiled': {
      const tilesetJson = {
        columns: opts.columns,
        image: `${opts.filenameBase}.png`,
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
        tilesets: [{ firstgid: 1, source: `${opts.filenameBase}.tsj` }],
        tilewidth: tileset.grid.tw,
        type: 'map',
        version: '1.10',
      };
      files.push({ name: `${opts.filenameBase}.tsj`, blob: jsonBlob(tilesetJson) });
      files.push({ name: `${opts.filenameBase}.tmj`, blob: jsonBlob(mapJson) });
      break;
    }

    case 'aseprite-array': {
      // Treat each tile as a frame for traditional sprite-sheet consumers.
      const frames = tileset.tiles.map((_, i) => ({
        filename: `${opts.filenameBase}_${i}`,
        frame: {
          x: (i % opts.columns) * tileset.grid.tw,
          y: Math.floor(i / opts.columns) * tileset.grid.th,
          w: tileset.grid.tw,
          h: tileset.grid.th,
        },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: tileset.grid.tw, h: tileset.grid.th },
        sourceSize: { w: tileset.grid.tw, h: tileset.grid.th },
        duration: 100,
      }));
      const json = {
        frames,
        meta: {
          app: 'https://tilestudio.local',
          version: '0.1.0',
          image: `${opts.filenameBase}.png`,
          format: 'RGBA8888',
          size: { w: atlas.width, h: atlas.height },
          scale: '1',
        },
      };
      files.push({ name: `${opts.filenameBase}.json`, blob: jsonBlob(json) });
      break;
    }
  }

  return files;
}

function jsonBlob(obj: unknown): Blob {
  return new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
}

// ---------- ZIP ----------

export async function zipFiles(files: GeneratedFile[], filename: string): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    const buf = new Uint8Array(await f.blob.arrayBuffer());
    entries[f.name] = buf;
  }
  const zipped = zipSync(entries, { level: 6 });
  void filename; // caller handles naming on download
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}
