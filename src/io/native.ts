import { unzipSync, zipSync } from 'fflate';
import type { AnyImage, Cel, Layer, Sprite, Tag, Tileset } from '../model/types';

// A ".tstudio" file is a zip containing:
//   manifest.json  — sprite metadata (dims, frames, tags, layers, layerOrder, cels pointing to blobs)
//   blobs/<id>.bin — raw Uint32/Uint8 pixel buffers, referenced by id
// The format is version-tagged; newer readers can reject older versions if needed.

interface Manifest {
  magic: 'TSTUDIO';
  version: number;
  sprite: {
    id: string;
    name: string;
    w: number;
    h: number;
    colorMode: Sprite['colorMode'];
    palette: number[]; // plain array of Uint32 values
    frames: { duration: number }[];
    layerOrder: string[];
    tags?: Tag[];
  };
  layers: Layer[];
  tilesets: Array<Omit<Tileset, 'tiles' | 'hash'> & { tiles: { blob: string; w: number; h: number; colorMode: AnyImage['colorMode']; userData?: unknown }[] }>;
  cels: Array<Omit<Cel, 'image'> & { image: { blob: string; colorMode: AnyImage['colorMode']; w: number; h: number } }>;
}

const CURRENT_VERSION = 1;

export function serializeSprite(sprite: Sprite): Uint8Array {
  const blobs: Record<string, Uint8Array> = {};
  let blobCounter = 0;
  const makeBlobId = (kind: string) => `blobs/${kind}-${++blobCounter}.bin`;

  function storeImage(img: AnyImage): { blob: string; colorMode: AnyImage['colorMode']; w: number; h: number } {
    const id = makeBlobId(img.colorMode);
    if (img.colorMode === 'rgba' || img.colorMode === 'tilemap') {
      blobs[id] = new Uint8Array(img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength));
    } else {
      blobs[id] = new Uint8Array(img.data);
    }
    return { blob: id, colorMode: img.colorMode, w: img.w, h: img.h };
  }

  const manifest: Manifest = {
    magic: 'TSTUDIO',
    version: CURRENT_VERSION,
    sprite: {
      id: sprite.id,
      name: sprite.name,
      w: sprite.w,
      h: sprite.h,
      colorMode: sprite.colorMode,
      palette: Array.from(sprite.palette.colors),
      frames: sprite.frames.map((f) => ({ duration: f.duration })),
      layerOrder: sprite.layerOrder,
      tags: sprite.tags,
    },
    layers: sprite.layers,
    tilesets: sprite.tilesets.map((t) => ({
      id: t.id,
      name: t.name,
      grid: t.grid,
      tiles: t.tiles.map((tile) => {
        const meta = storeImage(tile.image);
        return { ...meta, userData: tile.userData };
      }),
    })),
    cels: sprite.cels.map((c) => ({
      id: c.id,
      layerId: c.layerId,
      frame: c.frame,
      x: c.x,
      y: c.y,
      opacity: c.opacity,
      image: storeImage(c.image),
    })),
  };

  const entries: Record<string, Uint8Array> = {
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
    ...blobs,
  };
  return zipSync(entries, { level: 6 });
}

export function deserializeSprite(bytes: Uint8Array): Sprite {
  const entries = unzipSync(bytes);
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new Error('missing manifest.json');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
  if (manifest.magic !== 'TSTUDIO') throw new Error('not a Tile Studio project');
  if (manifest.version > CURRENT_VERSION) throw new Error(`project version ${manifest.version} is newer than this build`);

  function loadImage(ref: { blob: string; colorMode: AnyImage['colorMode']; w: number; h: number }): AnyImage {
    const raw = entries[ref.blob];
    if (!raw) throw new Error(`missing blob ${ref.blob}`);
    if (ref.colorMode === 'rgba' || ref.colorMode === 'tilemap') {
      // Force a new ArrayBuffer so downstream mutation doesn't clobber the zip buffer.
      const buf = new Uint8Array(raw).buffer;
      return { colorMode: ref.colorMode, w: ref.w, h: ref.h, data: new Uint32Array(buf) } as AnyImage;
    }
    return { colorMode: ref.colorMode, w: ref.w, h: ref.h, data: new Uint8Array(raw) } as AnyImage;
  }

  const tilesets: Tileset[] = manifest.tilesets.map((t) => ({
    id: t.id,
    name: t.name,
    grid: t.grid,
    tiles: t.tiles.map((tile) => ({
      image: loadImage(tile) as AnyImage & { colorMode: 'rgba' | 'indexed' },
      userData: tile.userData as Record<string, unknown> | undefined,
    })),
    hash: new Map(),
  }));

  const cels: Cel[] = manifest.cels.map((c) => ({
    id: c.id,
    layerId: c.layerId,
    frame: c.frame,
    x: c.x,
    y: c.y,
    opacity: c.opacity,
    image: loadImage(c.image),
  }));

  const sprite: Sprite = {
    id: manifest.sprite.id,
    name: manifest.sprite.name,
    w: manifest.sprite.w,
    h: manifest.sprite.h,
    colorMode: manifest.sprite.colorMode,
    palette: { colors: new Uint32Array(manifest.sprite.palette) },
    frames: manifest.sprite.frames,
    layers: manifest.layers,
    layerOrder: manifest.sprite.layerOrder,
    cels,
    tilesets,
    tags: manifest.sprite.tags ?? [],
  };
  return sprite;
}
