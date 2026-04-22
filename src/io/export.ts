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

// Compose the current frame of the sprite (flattened) into a PNG.
export async function spriteFramePNG(sprite: Sprite, frame: number): Promise<Blob> {
  const imgData = compositeFrame(sprite, frame);
  const c = document.createElement('canvas');
  c.width = sprite.w;
  c.height = sprite.h;
  c.getContext('2d')!.putImageData(imgData, 0, 0);
  return canvasBlob(c);
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
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
