// Core data model — mirrors Aseprite's doc layer (src/doc/ in the reference impl).
// All pixel data is stored in typed arrays for performance and easy transfer to workers.

export type ColorMode = 'rgba' | 'indexed' | 'grayscale' | 'tilemap';

// RGBA packed as 0xAABBGGRR in a Uint32 view, matching canvas ImageData byte order on LE hosts.
export type RGBA = number;

export interface ImageRGBA {
  colorMode: 'rgba';
  w: number;
  h: number;
  data: Uint32Array; // length = w*h
}

export interface ImageIndexed {
  colorMode: 'indexed';
  w: number;
  h: number;
  data: Uint8Array; // palette index per pixel
}

export interface ImageGrayscale {
  colorMode: 'grayscale';
  w: number;
  h: number;
  data: Uint8Array; // 0..255
}

// Tilemap image = grid of tile-index words. Uses the Aseprite encoding:
// low 29 bits = tile index, high 3 bits = flip flags (X, Y, Diagonal).
export interface ImageTilemap {
  colorMode: 'tilemap';
  w: number; // in tiles
  h: number; // in tiles
  data: Uint32Array;
}

export type AnyImage = ImageRGBA | ImageIndexed | ImageGrayscale | ImageTilemap;

export const TILE_INDEX_MASK = 0x1fffffff;
export const TILE_FLIP_X = 1 << 29;
export const TILE_FLIP_Y = 1 << 30;
export const TILE_FLIP_D = 1 << 31;
export const EMPTY_TILE_WORD = 0;

// Tilemap word encoding (matches Aseprite):
//   word === 0            → empty cell (no tile)
//   word !== 0            → raw index bits 0..28, flip flags in high 3 bits
//   tileset index = (raw index) - 1  (so tileset[0] is stored as raw index 1)
// Always go through these helpers to avoid off-by-one bugs.

export function rawTileIndex(word: number): number {
  return word & TILE_INDEX_MASK;
}
export function tileFlags(word: number): number {
  return word & (TILE_FLIP_X | TILE_FLIP_Y | TILE_FLIP_D);
}
// Build a tilemap word from a 0-based tileset index (use -1 for empty).
export function makeTileWord(tilesetIndex: number, flags = 0): number {
  if (tilesetIndex < 0) return 0;
  return ((((tilesetIndex + 1) & TILE_INDEX_MASK) | flags) >>> 0);
}
// Decode a tilemap word to 0-based tileset index (-1 = empty).
export function readTilesetIndex(word: number): number {
  const raw = rawTileIndex(word);
  return raw === 0 ? -1 : raw - 1;
}

export interface Palette {
  colors: Uint32Array; // up to 256 RGBA entries
}

export interface Tile {
  image: ImageRGBA | ImageIndexed; // actual pixels
  userData?: Record<string, unknown>;
}

export interface Tileset {
  id: string;
  name: string;
  grid: { tw: number; th: number };
  tiles: Tile[];
  // Quick-lookup hash of pixel-data → tile index. Rebuilt from tiles[] when deserialized.
  hash: Map<string, number>;
}

export type LayerType = 'raster' | 'tilemap' | 'group';

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'darken' | 'lighten'
  | 'add' | 'subtract' | 'difference' | 'overlay';

export interface LayerCommon {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..255
  blendMode?: BlendMode; // default 'normal'
  parentId?: string; // group parent
}

export interface RasterLayer extends LayerCommon {
  type: 'raster';
}

export interface TilemapLayer extends LayerCommon {
  type: 'tilemap';
  tilesetId: string;
}

export interface GroupLayer extends LayerCommon {
  type: 'group';
  childIds: string[];
}

export type Layer = RasterLayer | TilemapLayer | GroupLayer;

export interface Cel {
  id: string;
  layerId: string;
  frame: number; // index into Sprite.frames
  x: number;
  y: number;
  opacity: number; // 0..255
  image: AnyImage;
}

export interface Frame {
  duration: number; // ms
}

export type TagDirection = 'forward' | 'reverse' | 'pingpong';

export interface Tag {
  id: string;
  name: string;
  from: number;       // frame index, inclusive
  to: number;         // frame index, inclusive
  direction: TagDirection;
  color: string;      // hex (#rrggbb) for the tag strip
}

export interface Sprite {
  id: string;
  name: string;
  w: number;
  h: number;
  colorMode: ColorMode;
  palette: Palette;
  frames: Frame[];
  layers: Layer[];
  layerOrder: string[]; // top-to-bottom rendering order (last = top)
  cels: Cel[];
  tilesets: Tileset[];
  tags?: Tag[];
}
