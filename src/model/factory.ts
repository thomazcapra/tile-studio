import type { Cel, Frame, ImageRGBA, Layer, Palette, RasterLayer, Sprite, Tileset } from './types';

let _id = 0;
export const nextId = (prefix = 'id') => `${prefix}_${++_id}_${Date.now().toString(36)}`;

export function emptyImageRGBA(w: number, h: number): ImageRGBA {
  return { colorMode: 'rgba', w, h, data: new Uint32Array(w * h) };
}

export function defaultPalette(): Palette {
  // 16-color DB16-inspired starter palette, opaque.
  const hex = [
    0x000000, 0x222034, 0x45283c, 0x663931, 0x8f563b, 0xdf7126, 0xd9a066, 0xeec39a,
    0xfbf236, 0x99e550, 0x6abe30, 0x37946e, 0x4b692f, 0x524b24, 0x323c39, 0x3f3f74,
  ];
  const colors = new Uint32Array(hex.length);
  for (let i = 0; i < hex.length; i++) {
    const c = hex[i];
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
    // Pack as 0xAABBGGRR to match canvas ImageData on little-endian.
    colors[i] = ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return { colors };
}

export function newSprite(w = 64, h = 64, name = 'Untitled'): Sprite {
  const layer: RasterLayer = {
    id: nextId('lay'),
    name: 'Layer 1',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 255,
  };
  const frame: Frame = { duration: 100 };
  const cel: Cel = {
    id: nextId('cel'),
    layerId: layer.id,
    frame: 0,
    x: 0,
    y: 0,
    opacity: 255,
    image: emptyImageRGBA(w, h),
  };
  const layers: Layer[] = [layer];
  return {
    id: nextId('spr'),
    name,
    w,
    h,
    colorMode: 'rgba',
    palette: defaultPalette(),
    frames: [frame],
    layers,
    layerOrder: [layer.id],
    cels: [cel],
    tilesets: [],
    tags: [],
  };
}

export function newTileset(tw: number, th: number, name = 'Tileset'): Tileset {
  return {
    id: nextId('tset'),
    name,
    grid: { tw, th },
    tiles: [],
    hash: new Map(),
  };
}

export function newTilesetWithTiles(tw: number, th: number, count: number, name = 'Tileset'): Tileset {
  const t = newTileset(tw, th, name);
  for (let i = 0; i < count; i++) {
    t.tiles.push({ image: emptyImageRGBA(tw, th) });
  }
  return t;
}

export function newEmptyTile(tw: number, th: number) {
  return { image: emptyImageRGBA(tw, th) };
}
