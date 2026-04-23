import { unzipSync, zipSync } from 'fflate';
import type { AnyImage, Cel, ImageRGBA, Layer, Slice, Sprite, Tag, TileAnimation, Tileset } from '../model/types';

// A ".tstudio" file is a zip containing:
//   manifest.json  — sprite metadata (dims, frames, tags, layers, layerOrder, cels pointing to blobs)
//   blobs/<id>.bin — raw Uint32/Uint8 pixel buffers, referenced by id
// The format is version-tagged; newer readers can reject older versions if needed.

interface BlobRef {
  blob: string;
  colorMode: AnyImage['colorMode'];
  w: number;
  h: number;
}

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
    slices?: Slice[];
  };
  layers: Layer[];
  tilesets: Array<Omit<Tileset, 'tiles' | 'hash'> & {
    tiles: Array<BlobRef & {
      userData?: unknown;
      // Present when the tile has an attached animation. frames[0] is the base tile.
      animation?: { frames: BlobRef[]; frameMs: number };
    }>;
  }>;
  cels: Array<Omit<Cel, 'image'> & {
    image: BlobRef;
    linkedGroupId?: string;
  }>;
}

// v1 = original format. v2 adds slices, linkedGroupId, tile animations.
const CURRENT_VERSION = 2;

export function serializeSprite(sprite: Sprite): Uint8Array {
  const blobs: Record<string, Uint8Array> = {};
  let blobCounter = 0;
  const makeBlobId = (kind: string) => `blobs/${kind}-${++blobCounter}.bin`;
  // De-dup: linked cels share the same underlying buffer; emit one blob per unique buffer.
  const bufferBlobs = new WeakMap<object, BlobRef>();

  function storeImage(img: AnyImage): BlobRef {
    const existing = bufferBlobs.get(img.data);
    if (existing) return existing;
    const id = makeBlobId(img.colorMode);
    if (img.colorMode === 'rgba' || img.colorMode === 'tilemap') {
      blobs[id] = new Uint8Array(img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength));
    } else {
      blobs[id] = new Uint8Array(img.data);
    }
    const ref = { blob: id, colorMode: img.colorMode, w: img.w, h: img.h };
    bufferBlobs.set(img.data, ref);
    return ref;
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
      slices: sprite.slices,
    },
    layers: sprite.layers,
    tilesets: sprite.tilesets.map((t) => ({
      id: t.id,
      name: t.name,
      grid: t.grid,
      tiles: t.tiles.map((tile) => {
        const meta = storeImage(tile.image);
        const out: BlobRef & { userData?: unknown; animation?: { frames: BlobRef[]; frameMs: number } } = {
          ...meta,
          userData: tile.userData,
        };
        if (tile.animation) {
          out.animation = {
            frames: tile.animation.frames.map((f) => storeImage(f)),
            frameMs: tile.animation.frameMs,
          };
        }
        return out;
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
      linkedGroupId: c.linkedGroupId,
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

  // Cache image rehydration so blobs referenced by multiple places (linked cels,
  // animation frame 0 = tile base) share a single buffer in memory.
  const imageCache = new Map<string, AnyImage>();
  function loadImage(ref: BlobRef): AnyImage {
    const cached = imageCache.get(ref.blob);
    if (cached) return cached;
    const raw = entries[ref.blob];
    if (!raw) throw new Error(`missing blob ${ref.blob}`);
    let img: AnyImage;
    if (ref.colorMode === 'rgba' || ref.colorMode === 'tilemap') {
      // Force a new ArrayBuffer so downstream mutation doesn't clobber the zip buffer.
      const buf = new Uint8Array(raw).buffer;
      img = { colorMode: ref.colorMode, w: ref.w, h: ref.h, data: new Uint32Array(buf) } as AnyImage;
    } else {
      img = { colorMode: ref.colorMode, w: ref.w, h: ref.h, data: new Uint8Array(raw) } as AnyImage;
    }
    imageCache.set(ref.blob, img);
    return img;
  }

  const tilesets: Tileset[] = manifest.tilesets.map((t) => ({
    id: t.id,
    name: t.name,
    grid: t.grid,
    tiles: t.tiles.map((tile) => {
      const baseImage = loadImage(tile) as AnyImage & { colorMode: 'rgba' | 'indexed' };
      let animation: TileAnimation | undefined;
      if (tile.animation && tile.animation.frames.length > 0) {
        animation = {
          frames: tile.animation.frames.map((f) => loadImage(f) as ImageRGBA),
          frameMs: tile.animation.frameMs,
        };
      }
      return {
        image: baseImage,
        userData: tile.userData as Record<string, unknown> | undefined,
        ...(animation ? { animation } : {}),
      };
    }),
    hash: new Map(),
  }));

  // Linked-cel sharing: cels that share a linkedGroupId must point at the SAME
  // image object in memory so edits propagate. We already de-duplicate by blob
  // id above; if the blob id matches the cache returns the same image.
  const cels: Cel[] = manifest.cels.map((c) => ({
    id: c.id,
    layerId: c.layerId,
    frame: c.frame,
    x: c.x,
    y: c.y,
    opacity: c.opacity,
    image: loadImage(c.image),
    ...(c.linkedGroupId ? { linkedGroupId: c.linkedGroupId } : {}),
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
    ...(manifest.sprite.slices ? { slices: manifest.sprite.slices } : {}),
  };
  return sprite;
}
