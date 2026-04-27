// In-memory project state. The MCP server holds a single "current sprite"
// that tools mutate. Save/load round-trips through tile-studio's native
// .tstudio format so projects can be opened in the live editor.

import { promises as fs } from 'node:fs';
import { newSprite, newTileset, nextId } from '../../src/model/factory.js';
import {
  TILE_INDEX_MASK,
  TILE_FLIP_X,
  TILE_FLIP_Y,
  TILE_FLIP_D,
  makeTileWord,
  type Cel,
  type ImageRGBA,
  type ImageTilemap,
  type Layer,
  type RasterLayer,
  type TilemapLayer,
  type GroupLayer,
  type ReferenceLayer,
  type Sprite,
  type Tag,
  type Tileset,
} from '../../src/model/types.js';
import { serializeSprite, deserializeSprite } from '../../src/io/native.js';

export interface ProjectState {
  sprite: Sprite;
  filePath: string | null;
  dirty: boolean;
}

let current: ProjectState | null = null;

export function requireProject(): ProjectState {
  if (!current) throw new Error('No project loaded. Call create_project or load_project first.');
  return current;
}

export function setProject(sprite: Sprite, filePath: string | null = null): ProjectState {
  current = { sprite, filePath, dirty: filePath === null };
  return current;
}

export function getProject(): ProjectState | null {
  return current;
}

export function markDirty(): void {
  if (current) current.dirty = true;
}

// ---------- Project lifecycle ----------

export function createProject(opts: { name: string; width: number; height: number }): ProjectState {
  // newSprite signature is (w, h, name) — note the order.
  const s = newSprite(opts.width, opts.height, opts.name);
  return setProject(s);
}

export async function loadProjectFromFile(filePath: string): Promise<ProjectState> {
  const bytes = await fs.readFile(filePath);
  const sprite = deserializeSprite(new Uint8Array(bytes));
  return setProject(sprite, filePath);
}

export async function saveProjectToFile(filePath: string): Promise<{ bytes: number }> {
  const proj = requireProject();
  const zipped = serializeSprite(proj.sprite);
  await fs.mkdir(filePath.replace(/[^/\\]+$/, ''), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(zipped));
  proj.filePath = filePath;
  proj.dirty = false;
  return { bytes: zipped.byteLength };
}

// ---------- Layer / frame / tag mutators ----------

export function addRasterLayer(name: string): RasterLayer {
  const proj = requireProject();
  const id = nextId('layer');
  const layer: RasterLayer = {
    id,
    name,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
  };
  proj.sprite.layers.push(layer);
  proj.sprite.layerOrder.push(id);
  ensureCelsForLayer(proj.sprite, layer);
  markDirty();
  return layer;
}

export function addTilemapLayer(name: string, tilesetId: string): TilemapLayer {
  const proj = requireProject();
  const tileset = proj.sprite.tilesets.find((t) => t.id === tilesetId);
  if (!tileset) throw new Error(`Tileset not found: ${tilesetId}`);
  const id = nextId('layer');
  const layer: TilemapLayer = {
    id,
    name,
    type: 'tilemap',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    tilesetId,
  };
  proj.sprite.layers.push(layer);
  proj.sprite.layerOrder.push(id);
  ensureCelsForLayer(proj.sprite, layer);
  markDirty();
  return layer;
}

export function addGroupLayer(name: string): GroupLayer {
  const proj = requireProject();
  const id = nextId('layer');
  const layer: GroupLayer = {
    id,
    name,
    type: 'group',
    visible: true,
    locked: false,
    opacity: 255,
    childIds: [],
    expanded: true,
  };
  proj.sprite.layers.push(layer);
  proj.sprite.layerOrder.push(id);
  markDirty();
  return layer;
}

export function addReferenceLayer(name: string): ReferenceLayer {
  const proj = requireProject();
  const id = nextId('layer');
  const layer: ReferenceLayer = {
    id,
    name,
    type: 'reference',
    visible: true,
    locked: true,
    opacity: 128,
    blendMode: 'normal',
  };
  proj.sprite.layers.push(layer);
  proj.sprite.layerOrder.push(id);
  ensureCelsForLayer(proj.sprite, layer);
  markDirty();
  return layer;
}

export function setLayerVisibility(layerId: string, visible: boolean): void {
  const proj = requireProject();
  const layer = proj.sprite.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error(`Layer not found: ${layerId}`);
  layer.visible = visible;
  markDirty();
}

export function addFrame(durationMs = 100): { index: number } {
  const proj = requireProject();
  const idx = proj.sprite.frames.length;
  proj.sprite.frames.push({ duration: durationMs });
  // Add a cel for every paintable layer at the new frame.
  for (const layer of proj.sprite.layers) {
    if (layer.type === 'group') continue;
    proj.sprite.cels.push(makeCelForLayer(proj.sprite, layer, idx));
  }
  markDirty();
  return { index: idx };
}

export function setFrameDuration(frame: number, durationMs: number): void {
  const proj = requireProject();
  const f = proj.sprite.frames[frame];
  if (!f) throw new Error(`Frame out of range: ${frame}`);
  f.duration = durationMs;
  markDirty();
}

export function addTag(opts: {
  name: string;
  from: number;
  to: number;
  direction?: 'forward' | 'reverse' | 'pingpong';
  color?: string;
}): Tag {
  const proj = requireProject();
  const tag: Tag = {
    id: nextId('tag'),
    name: opts.name,
    from: opts.from,
    to: opts.to,
    direction: opts.direction ?? 'forward',
    color: opts.color ?? '#888888',
  };
  proj.sprite.tags = [...(proj.sprite.tags ?? []), tag];
  markDirty();
  return tag;
}

// ---------- Cel helpers ----------

export function getCel(layerId: string, frame: number): Cel | undefined {
  const proj = requireProject();
  return proj.sprite.cels.find((c) => c.layerId === layerId && c.frame === frame);
}

export function requireCel(layerId: string, frame: number): Cel {
  const c = getCel(layerId, frame);
  if (!c) throw new Error(`No cel for layer ${layerId} at frame ${frame}`);
  return c;
}

function ensureCelsForLayer(sprite: Sprite, layer: Layer): void {
  if (layer.type === 'group') return;
  for (let f = 0; f < sprite.frames.length; f++) {
    const exists = sprite.cels.some((c) => c.layerId === layer.id && c.frame === f);
    if (!exists) sprite.cels.push(makeCelForLayer(sprite, layer, f));
  }
}

function makeCelForLayer(sprite: Sprite, layer: Layer, frame: number): Cel {
  const id = nextId('cel');
  if (layer.type === 'tilemap') {
    const tilesetId = (layer as TilemapLayer).tilesetId;
    const ts = sprite.tilesets.find((t) => t.id === tilesetId)!;
    // Default tilemap cel size = sprite size in tiles.
    const w = Math.max(1, Math.floor(sprite.w / ts.grid.tw));
    const h = Math.max(1, Math.floor(sprite.h / ts.grid.th));
    const image: ImageTilemap = {
      colorMode: 'tilemap',
      w,
      h,
      data: new Uint32Array(w * h),
    };
    return { id, layerId: layer.id, frame, x: 0, y: 0, opacity: 255, image };
  }
  // raster + reference share the same buffer shape
  const image: ImageRGBA = {
    colorMode: 'rgba',
    w: sprite.w,
    h: sprite.h,
    data: new Uint32Array(sprite.w * sprite.h),
  };
  return { id, layerId: layer.id, frame, x: 0, y: 0, opacity: 255, image };
}

// ---------- Pixel painting (raster) ----------

export function paintPixel(layerId: string, frame: number, x: number, y: number, rgba: number): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode !== 'rgba') throw new Error('paintPixel requires a raster layer');
  const { w, h, data } = cel.image;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  data[y * w + x] = rgba >>> 0;
  markDirty();
}

export function paintRect(
  layerId: string,
  frame: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: number,
  filled = true
): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode !== 'rgba') throw new Error('paintRect requires a raster layer');
  const img = cel.image;
  const c = rgba >>> 0;
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(img.w, x + w);
  const y2 = Math.min(img.h, y + h);
  if (filled) {
    for (let py = y1; py < y2; py++) {
      const row = py * img.w;
      for (let px = x1; px < x2; px++) img.data[row + px] = c;
    }
  } else {
    for (let px = x1; px < x2; px++) {
      img.data[y1 * img.w + px] = c;
      img.data[(y2 - 1) * img.w + px] = c;
    }
    for (let py = y1; py < y2; py++) {
      img.data[py * img.w + x1] = c;
      img.data[py * img.w + (x2 - 1)] = c;
    }
  }
  markDirty();
}

export function paintLine(
  layerId: string,
  frame: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: number
): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode !== 'rgba') throw new Error('paintLine requires a raster layer');
  const img = cel.image;
  const c = rgba >>> 0;
  // Bresenham
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.data[y * img.w + x] = c;
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  markDirty();
}

export function floodFill(layerId: string, frame: number, x: number, y: number, rgba: number): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode !== 'rgba') throw new Error('floodFill requires a raster layer');
  const img = cel.image;
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const target = img.data[y * img.w + x];
  const fill = rgba >>> 0;
  if (target === fill) return;
  const stack: number[] = [x, y];
  while (stack.length) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (px < 0 || py < 0 || px >= img.w || py >= img.h) continue;
    const i = py * img.w + px;
    if (img.data[i] !== target) continue;
    img.data[i] = fill;
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  markDirty();
}

export function clearCel(layerId: string, frame: number): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode === 'rgba') cel.image.data.fill(0);
  else if (cel.image.colorMode === 'tilemap') cel.image.data.fill(0);
  markDirty();
}

export function setRasterCelFromRGBA(
  layerId: string,
  frame: number,
  width: number,
  height: number,
  data: Uint32Array
): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode !== 'rgba') throw new Error('setRasterCel requires a raster layer');
  if (width !== cel.image.w || height !== cel.image.h) {
    throw new Error(`Image size mismatch: cel is ${cel.image.w}x${cel.image.h}, got ${width}x${height}`);
  }
  cel.image.data.set(data);
  markDirty();
}

// ---------- Tilemap painting ----------

export function paintTilemapCell(
  layerId: string,
  frame: number,
  tileX: number,
  tileY: number,
  tilesetIndex: number,
  flags: { flipX?: boolean; flipY?: boolean; flipD?: boolean } = {}
): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode !== 'tilemap') throw new Error('paintTilemapCell requires a tilemap layer');
  const img = cel.image;
  if (tileX < 0 || tileY < 0 || tileX >= img.w || tileY >= img.h) return;
  let f = 0;
  if (flags.flipX) f |= TILE_FLIP_X;
  if (flags.flipY) f |= TILE_FLIP_Y;
  if (flags.flipD) f |= TILE_FLIP_D;
  img.data[tileY * img.w + tileX] = makeTileWord(tilesetIndex, f);
  markDirty();
}

export function resizeTilemapCel(
  layerId: string,
  frame: number,
  tilesW: number,
  tilesH: number
): void {
  const cel = requireCel(layerId, frame);
  if (cel.image.colorMode !== 'tilemap') throw new Error('resizeTilemapCel requires a tilemap layer');
  const fresh = new Uint32Array(tilesW * tilesH);
  // Copy preserved region.
  const cw = Math.min(cel.image.w, tilesW);
  const ch = Math.min(cel.image.h, tilesH);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) fresh[y * tilesW + x] = cel.image.data[y * cel.image.w + x];
  }
  cel.image.w = tilesW;
  cel.image.h = tilesH;
  cel.image.data = fresh;
  markDirty();
}

export function decodeTileWord(word: number): {
  tilesetIndex: number;
  flipX: boolean;
  flipY: boolean;
  flipD: boolean;
} {
  const idx = word & TILE_INDEX_MASK;
  return {
    tilesetIndex: idx === 0 ? -1 : idx - 1,
    flipX: !!(word & TILE_FLIP_X),
    flipY: !!(word & TILE_FLIP_Y),
    flipD: !!(word & TILE_FLIP_D),
  };
}

// ---------- Tileset registration ----------

export function addTileset(name: string, tw: number, th: number): Tileset {
  const proj = requireProject();
  // newTileset signature is (tw, th, name).
  const ts = newTileset(tw, th, name);
  proj.sprite.tilesets.push(ts);
  markDirty();
  return ts;
}
