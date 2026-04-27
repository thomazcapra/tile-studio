// BrowserQuest map adapter. Imports a tilesheet PNG plus an optional
// world_client.json + world_server.json pair into a tile-studio Sprite, and
// exports a Sprite back to the same JSON pair.
//
// Conventions (the entire adapter rests on these — change them here):
//
// • Tileset construction: a BQ tilesheet is sliced into tw×th tiles in row-major
//   order WITHOUT pixel-data dedup, so tileset index N corresponds to BQ tile id
//   N+1. Each tile carries `userData.bq = { id }` to make this explicit.
//
// • Visual tilemap layers stack in `Sprite.layerOrder` (top of the stack = top
//   of the visual stack). The exporter walks layers from bottom to top to build
//   the per-cell `data[]` array, omitting trailing empties.
//
// • Special-purpose tilemap layers are recognized by `userData.bqRole`:
//     'collision' → BQ collisions[]. Cell is collidable iff non-empty.
//     'plateau'   → BQ plateau[].   Cell is plateau iff non-empty.
//   The actual tile painted in those cells is irrelevant to BQ; we use the
//   tilesheet's first tile as a visual marker.
//
// • Slices model rectangular gameplay metadata. `Slice.userData.bq` carries:
//     { kind: 'door',        p, tx, ty, tcx?, tcy?, to }     (1×1 expected)
//     { kind: 'checkpoint',  id }                            (rect)
//     { kind: 'music',       id }                            (rect)
//     { kind: 'roam',        type, nb }                      (rect)
//     { kind: 'chestArea',   items, tx, ty }                 (rect)
//     { kind: 'staticChest', items }                         (1×1 expected)
//     { kind: 'npc',         type }                          (1×1 expected)
//   Slice bounds are stored in pixels; the adapter converts to/from tile coords
//   using the tileset's grid size.
//
// • Tile-level metadata uses `Tile.userData.bq`:
//     { id }                    – the BQ tile id (set by the importer)
//     { high: true }            – render above entities (BQ high[] membership)
//
// • Animations: BQ animated definitions describe consecutive tiles in the
//   tilesheet. We mirror that into tile-studio by attaching a TileAnimation to
//   the base tile whose `frames` reference the next l-1 tiles' images. Round-
//   trip preserves frame count and frame duration.

import type {
  AnyImage,
  ImageRGBA,
  Slice,
  SliceKey,
  Sprite,
  Tile,
  TileAnimation,
  TilemapLayer,
  Tileset,
} from '../model/types';
import {
  EMPTY_TILE_WORD,
  makeTileWord,
  readTilesetIndex,
  tileFlags,
} from '../model/types';
import { newSprite, nextId } from '../model/factory';

// ---------- Public types ----------

export interface BQDoor {
  x: number;
  y: number;
  p: number;
  tx: number;
  ty: number;
  tcx?: number;
  tcy?: number;
  to: string;
}

export interface BQRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BQCheckpoint extends BQRect {
  id: number;
}

export interface BQMusicArea extends BQRect {
  id: string;
}

export interface BQRoamingArea {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  nb: number;
}

export interface BQChestArea {
  x: number;
  y: number;
  w: number;
  h: number;
  i: number[];
  tx: number;
  ty: number;
}

export interface BQStaticChest {
  x: number;
  y: number;
  i: number[];
}

/** Animated tile descriptor — `l` = frame count, `d` = optional frame ms */
export interface BQAnimatedDef {
  l: number;
  d?: number;
}

export interface BQClient {
  width: number;
  height: number;
  tilesize?: number;
  /** Per-cell tile stack, length = width*height. Each entry is a tile id (1-based) or an array of up to 5 ids (bottom to top). 0 = empty. */
  data: (number | number[])[];
  /** Tile indices (y*width+x) that block movement */
  collisions?: number[];
  /** Tile indices that also block; merged with collisions on import */
  blocking?: number[];
  /** Tile ids whose visual is rendered above entities */
  high?: number[];
  /** Tile ids that animate. Frames are consecutive in the tilesheet. */
  animated?: Record<string | number, BQAnimatedDef>;
  /** Tile indices belonging to the plateau (jump-from) set */
  plateau?: number[];
  doors?: BQDoor[];
  checkpoints?: BQCheckpoint[];
  musicAreas?: BQMusicArea[];
}

export interface BQServer {
  width: number;
  height: number;
  tilesize?: number;
  collisions?: number[];
  doors?: BQDoor[];
  checkpoints?: BQCheckpoint[];
  roamingAreas?: BQRoamingArea[];
  chestAreas?: BQChestArea[];
  staticChests?: BQStaticChest[];
  /** Map of tileIndex(y*width+x) → entity type string */
  staticEntities?: Record<string | number, string>;
}

// ---------- userData shapes ----------

type TileUserBQ = { id?: number; high?: boolean };
type SliceUserBQ =
  | { kind: 'door'; p: number; tx: number; ty: number; tcx?: number; tcy?: number; to: string }
  | { kind: 'checkpoint'; id: number }
  | { kind: 'music'; id: string }
  | { kind: 'roam'; type: string; nb: number }
  | { kind: 'chestArea'; items: number[]; tx: number; ty: number }
  | { kind: 'staticChest'; items: number[] }
  | { kind: 'npc'; type: string };

type BQRole = 'collision' | 'plateau';

interface LayerUserBQ {
  bqRole?: BQRole;
}

// ---------- Helpers ----------

function getTileBQ(tile: Tile): TileUserBQ {
  const u = tile.userData as { bq?: TileUserBQ } | undefined;
  return u?.bq ?? {};
}

function getSliceBQ(slice: Slice): SliceUserBQ | null {
  if (!slice.keys.length) return null;
  const u = slice.keys[0].userData as { bq?: SliceUserBQ } | undefined;
  return u?.bq ?? null;
}

function getLayerBQRole(layer: TilemapLayer): BQRole | undefined {
  const u = (layer as TilemapLayer & { userData?: LayerUserBQ }).userData;
  return u?.bqRole;
}

function setLayerBQRole(layer: TilemapLayer, role: BQRole): void {
  (layer as TilemapLayer & { userData?: LayerUserBQ }).userData = { bqRole: role };
}

/** Find the cel for a tilemap layer at frame 0. Returns null if missing or not tilemap. */
function celTilemap(sprite: Sprite, layerId: string): { w: number; h: number; data: Uint32Array } | null {
  const cel = sprite.cels.find((c) => c.layerId === layerId && c.frame === 0);
  if (!cel || cel.image.colorMode !== 'tilemap') return null;
  return cel.image;
}

// ---------- Tilesheet → Tileset ----------

export interface SliceTilesheetOptions {
  tw: number;
  th: number;
  /** Override the tile count; defaults to ceil(w/tw)*ceil(h/th). */
  tileCount?: number;
  /** Tileset name; defaults to "BrowserQuest". */
  name?: string;
}

/**
 * Slice a tilesheet PNG into a Tileset, preserving row-major order with NO
 * dedup. tileset.tiles[i].userData.bq.id = i+1 (the BrowserQuest tile id).
 */
export function tilesheetToTileset(img: ImageRGBA, opts: SliceTilesheetOptions): Tileset {
  const { tw, th } = opts;
  if (tw <= 0 || th <= 0) throw new Error('Tile size must be positive');
  const cols = Math.floor(img.w / tw);
  const rows = Math.floor(img.h / th);
  const total = opts.tileCount ?? cols * rows;
  const tiles: Tile[] = [];
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const data = new Uint32Array(tw * th);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const sx = col * tw + x;
        const sy = row * th + y;
        if (sx < img.w && sy < img.h) {
          data[y * tw + x] = img.data[sy * img.w + sx];
        }
      }
    }
    const tile: Tile = {
      image: { colorMode: 'rgba', w: tw, h: th, data },
      userData: { bq: { id: i + 1 } satisfies TileUserBQ },
    };
    tiles.push(tile);
  }
  return {
    id: nextId('tset'),
    name: opts.name ?? 'BrowserQuest',
    grid: { tw, th },
    tiles,
    hash: new Map(),
  };
}

// ---------- Importer (BQ JSON → Sprite) ----------

export interface ImportBQResult {
  sprite: Sprite;
  warnings: string[];
}

export interface ImportBQOptions {
  /** Sprite name; defaults to "world". */
  name?: string;
  /** Default frame duration (ms) when an animated def has no `d`. */
  defaultFrameMs?: number;
  /** Fill missing trailing data cells (e.g. 54006 → width*height). */
  padTrailingCells?: boolean;
  /**
   * Always create empty Collision and Plateau layers, even when the source has
   * none. Useful when importing a fresh tilesheet so the user can paint into
   * them immediately. Defaults to false (round-trip behavior).
   */
  ensureRoleLayers?: boolean;
}

export function importBQ(
  client: BQClient,
  server: BQServer | null,
  tilesheet: ImageRGBA,
  opts: ImportBQOptions = {},
): ImportBQResult {
  const warnings: string[] = [];
  const tilesize = client.tilesize ?? server?.tilesize ?? 16;
  const tileset = tilesheetToTileset(tilesheet, {
    tw: tilesize,
    th: tilesize,
    name: 'BrowserQuest',
  });
  const tileCount = tileset.tiles.length;

  const W = client.width;
  const H = client.height;
  const total = W * H;

  // Normalize data length.
  const data = client.data ?? [];
  if (data.length !== total) {
    if (opts.padTrailingCells === false) {
      warnings.push(`data.length=${data.length} but width*height=${total}; cells beyond data length will be empty`);
    } else {
      warnings.push(`data.length=${data.length} padded to ${total} (filled with 0)`);
    }
  }

  // Determine layer count needed for the visual stack.
  let visualLayerCount = 1;
  for (let i = 0; i < total; i++) {
    const e = data[i];
    if (Array.isArray(e) && e.length > visualLayerCount) visualLayerCount = e.length;
  }

  // Build the sprite skeleton (sized to the tilemap pixel bounds).
  const sprite = newSprite(W * tilesize, H * tilesize, opts.name ?? 'world');
  // Replace the default raster layer with our tilemap layers.
  sprite.layers = [];
  sprite.layerOrder = [];
  sprite.cels = [];
  sprite.tilesets = [tileset];
  sprite.slices = [];

  // Visual tilemap layers (Layer 0 .. Layer N-1). Order: index 0 = bottom.
  const visualLayerData: Uint32Array[] = [];
  for (let n = 0; n < visualLayerCount; n++) {
    const layerId = nextId('lay');
    const layer: TilemapLayer = {
      id: layerId,
      name: `Layer ${n}`,
      type: 'tilemap',
      visible: true,
      locked: false,
      opacity: 255,
      tilesetId: tileset.id,
    };
    sprite.layers.push(layer);
    sprite.layerOrder.push(layerId);
    const cellData = new Uint32Array(total);
    visualLayerData.push(cellData);
    sprite.cels.push({
      id: nextId('cel'),
      layerId,
      frame: 0,
      x: 0,
      y: 0,
      opacity: 255,
      image: { colorMode: 'tilemap', w: W, h: H, data: cellData },
    });
  }

  // Fill data into visual layers. `id` of 0 = empty cell.
  let warnedOutOfRange = 0;
  for (let i = 0; i < total; i++) {
    const e = data[i];
    if (e === undefined || e === 0) continue;
    if (Array.isArray(e)) {
      for (let n = 0; n < e.length && n < visualLayerCount; n++) {
        const id = e[n];
        if (id === 0) continue;
        if (id < 1 || id > tileCount) {
          if (warnedOutOfRange++ < 5) warnings.push(`tile id ${id} at index ${i} layer ${n} is out of range (1..${tileCount})`);
          continue;
        }
        visualLayerData[n][i] = makeTileWord(id - 1);
      }
    } else {
      const id = e as number;
      if (id < 1 || id > tileCount) {
        if (warnedOutOfRange++ < 5) warnings.push(`tile id ${id} at index ${i} is out of range (1..${tileCount})`);
        continue;
      }
      visualLayerData[0][i] = makeTileWord(id - 1);
    }
  }
  if (warnedOutOfRange > 5) warnings.push(`...and ${warnedOutOfRange - 5} more tile-id-out-of-range warnings suppressed`);

  // Special-role layers (collision, plateau). Painted with tile id 1 as a
  // visual marker — the actual cell value doesn't matter for BQ.
  const markerWord = makeTileWord(0);
  function addRoleLayer(role: BQRole, name: string, indices: number[] | undefined): void {
    const hasData = indices && indices.length > 0;
    if (!hasData && !opts.ensureRoleLayers) return;
    const id = nextId('lay');
    const layer: TilemapLayer = {
      id,
      name,
      type: 'tilemap',
      visible: true,
      locked: false,
      opacity: role === 'collision' ? 96 : 128,
      tilesetId: tileset.id,
    };
    setLayerBQRole(layer, role);
    sprite.layers.push(layer);
    sprite.layerOrder.push(id);
    const cellData = new Uint32Array(total);
    if (indices) {
      for (const idx of indices) {
        if (idx >= 0 && idx < total) cellData[idx] = markerWord;
      }
    }
    sprite.cels.push({
      id: nextId('cel'),
      layerId: id,
      frame: 0,
      x: 0,
      y: 0,
      opacity: 255,
      image: { colorMode: 'tilemap', w: W, h: H, data: cellData },
    });
  }

  // Merge client.collisions + client.blocking + server.collisions on import.
  const collisionSet = new Set<number>();
  for (const a of [client.collisions, client.blocking, server?.collisions]) {
    if (!a) continue;
    for (const i of a) collisionSet.add(i);
  }
  addRoleLayer('collision', 'Collision', collisionSet.size ? Array.from(collisionSet).sort((a, b) => a - b) : undefined);
  addRoleLayer('plateau', 'Plateau', client.plateau);

  // Tile-level metadata: high tiles.
  if (client.high) {
    for (const id of client.high) {
      if (id >= 1 && id <= tileCount) {
        const tile = tileset.tiles[id - 1];
        const u = (tile.userData ??= {}) as { bq?: TileUserBQ };
        u.bq = { ...(u.bq ?? {}), high: true };
      }
    }
  }

  // Tile animations: l consecutive tiles starting at (id).
  if (client.animated) {
    const defaultMs = opts.defaultFrameMs ?? 100;
    for (const [k, def] of Object.entries(client.animated)) {
      const baseId = Number(k);
      if (!Number.isFinite(baseId) || baseId < 1 || baseId > tileCount) {
        warnings.push(`animated key ${k} is out of range`);
        continue;
      }
      const l = Math.max(1, def.l | 0);
      const baseTile = tileset.tiles[baseId - 1];
      const frames: ImageRGBA[] = [];
      for (let n = 0; n < l; n++) {
        const t = tileset.tiles[baseId - 1 + n];
        if (!t || t.image.colorMode !== 'rgba') break;
        frames.push(t.image);
      }
      if (frames.length > 1) {
        const anim: TileAnimation = { frames, frameMs: def.d ?? defaultMs };
        baseTile.animation = anim;
      }
    }
  }

  // Slices for rectangle metadata.
  function pushSlice(name: string, color: string, rect: BQRect, bq: SliceUserBQ): void {
    const key: SliceKey = {
      frame: 0,
      bounds: {
        x: rect.x * tilesize,
        y: rect.y * tilesize,
        w: Math.max(1, rect.w) * tilesize,
        h: Math.max(1, rect.h) * tilesize,
      },
      userData: { bq },
    };
    sprite.slices!.push({
      id: nextId('slc'),
      name,
      color,
      keys: [key],
    });
  }

  if (client.doors) {
    for (let i = 0; i < client.doors.length; i++) {
      const d = client.doors[i];
      pushSlice(`door:${i}`, '#22d3ee', { x: d.x, y: d.y, w: 1, h: 1 }, {
        kind: 'door',
        p: d.p,
        tx: d.tx,
        ty: d.ty,
        tcx: d.tcx,
        tcy: d.tcy,
        to: d.to ?? '',
      });
    }
  }
  if (client.checkpoints) {
    for (const c of client.checkpoints) {
      pushSlice(`checkpoint:${c.id}`, '#a3e635', { x: c.x, y: c.y, w: c.w, h: c.h }, {
        kind: 'checkpoint',
        id: c.id,
      });
    }
  }
  if (client.musicAreas) {
    for (const m of client.musicAreas) {
      pushSlice(`music:${m.id}`, '#f97316', { x: m.x, y: m.y, w: m.w, h: m.h }, {
        kind: 'music',
        id: m.id,
      });
    }
  }
  if (server?.roamingAreas) {
    for (const r of server.roamingAreas) {
      pushSlice(`roam:${r.type}:${r.id}`, '#f43f5e',
        { x: r.x, y: r.y, w: r.width, h: r.height },
        { kind: 'roam', type: r.type, nb: r.nb },
      );
    }
  }
  if (server?.chestAreas) {
    for (let i = 0; i < server.chestAreas.length; i++) {
      const ch = server.chestAreas[i];
      pushSlice(`chestArea:${i}`, '#eab308',
        { x: ch.x, y: ch.y, w: ch.w, h: ch.h },
        { kind: 'chestArea', items: ch.i ?? [], tx: ch.tx, ty: ch.ty },
      );
    }
  }
  if (server?.staticChests) {
    for (let i = 0; i < server.staticChests.length; i++) {
      const ch = server.staticChests[i];
      pushSlice(`staticChest:${i}`, '#facc15',
        { x: ch.x, y: ch.y, w: 1, h: 1 },
        { kind: 'staticChest', items: ch.i ?? [] },
      );
    }
  }
  if (server?.staticEntities) {
    for (const [idxStr, type] of Object.entries(server.staticEntities)) {
      const idx = Number(idxStr);
      if (!Number.isFinite(idx)) continue;
      const x = idx % W;
      const y = Math.floor(idx / W);
      pushSlice(`npc:${type}@${x},${y}`, '#c084fc',
        { x, y, w: 1, h: 1 },
        { kind: 'npc', type },
      );
    }
  }

  return { sprite, warnings };
}

// ---------- Exporter (Sprite → BQ JSON) ----------

export interface ExportBQResult {
  client: BQClient;
  server: BQServer;
  warnings: string[];
}

export interface ExportBQOptions {
  /** Default frame duration (ms) — omitted from `animated[]` defs that match. */
  defaultFrameMs?: number;
}

export function exportBQ(sprite: Sprite, opts: ExportBQOptions = {}): ExportBQResult {
  const warnings: string[] = [];
  if (sprite.tilesets.length === 0) throw new Error('Sprite has no tilesets — load a tilesheet first');
  const tileset = sprite.tilesets[0];
  const tilesize = tileset.grid.tw;
  if (tileset.grid.tw !== tileset.grid.th) {
    warnings.push(`tile is ${tileset.grid.tw}×${tileset.grid.th} (non-square) — BQ assumes square`);
  }

  // Walk layers (layerOrder is bottom→top). Categorize.
  const visualCels: { layerId: string; image: AnyImage & { colorMode: 'tilemap' } }[] = [];
  let collisionCel: { w: number; h: number; data: Uint32Array } | null = null;
  let plateauCel: { w: number; h: number; data: Uint32Array } | null = null;

  let dimsW = 0, dimsH = 0;

  for (const id of sprite.layerOrder) {
    const layer = sprite.layers.find((l) => l.id === id);
    if (!layer || layer.type !== 'tilemap') continue;
    const tlayer = layer as TilemapLayer;
    if (tlayer.tilesetId !== tileset.id) {
      warnings.push(`layer "${tlayer.name}" references a different tileset — skipped`);
      continue;
    }
    const cel = celTilemap(sprite, tlayer.id);
    if (!cel) continue;
    if (dimsW === 0) { dimsW = cel.w; dimsH = cel.h; }
    else if (cel.w !== dimsW || cel.h !== dimsH) {
      warnings.push(`layer "${tlayer.name}" is ${cel.w}×${cel.h}, expected ${dimsW}×${dimsH} — skipped`);
      continue;
    }
    const role = getLayerBQRole(tlayer);
    if (role === 'collision') {
      collisionCel = cel;
    } else if (role === 'plateau') {
      plateauCel = cel;
    } else {
      visualCels.push({ layerId: tlayer.id, image: { colorMode: 'tilemap', w: cel.w, h: cel.h, data: cel.data } });
    }
  }

  if (dimsW === 0 || dimsH === 0) throw new Error('No tilemap layers found');
  const W = dimsW, H = dimsH;
  const total = W * H;

  // Build data[] by walking visual layers bottom→top, taking the index per cell.
  const dataOut: (number | number[])[] = new Array(total);
  let flipFlagWarned = false;
  for (let i = 0; i < total; i++) {
    const stack: number[] = [];
    for (const v of visualCels) {
      const word = v.image.data[i];
      if (word === EMPTY_TILE_WORD) {
        stack.push(0);
        continue;
      }
      if (!flipFlagWarned && tileFlags(word) !== 0) {
        warnings.push('tilemap cells with flip flags found — BQ format does not support flips, flags will be discarded');
        flipFlagWarned = true;
      }
      const idx = readTilesetIndex(word);
      // BQ tile id = tileset index + 1.
      stack.push(idx + 1);
    }
    // Trim trailing zeroes.
    while (stack.length > 0 && stack[stack.length - 1] === 0) stack.pop();
    if (stack.length === 0) dataOut[i] = 0;
    else if (stack.length === 1) dataOut[i] = stack[0];
    else dataOut[i] = stack;
  }

  // Collisions and plateau as sorted index arrays.
  function indicesOf(cel: { data: Uint32Array } | null): number[] {
    if (!cel) return [];
    const out: number[] = [];
    for (let i = 0; i < cel.data.length; i++) {
      if (cel.data[i] !== EMPTY_TILE_WORD) out.push(i);
    }
    return out;
  }
  const collisions = indicesOf(collisionCel);
  const plateau = indicesOf(plateauCel);

  // High and animated from tile userData.
  const highSet = new Set<number>();
  const animated: Record<number, BQAnimatedDef> = {};
  const defaultMs = opts.defaultFrameMs ?? 100;
  for (let i = 0; i < tileset.tiles.length; i++) {
    const tile = tileset.tiles[i];
    const bq = getTileBQ(tile);
    const bqId = bq.id ?? i + 1;
    if (bq.high) highSet.add(bqId);
    if (tile.animation && tile.animation.frames.length > 1) {
      const def: BQAnimatedDef = { l: tile.animation.frames.length };
      if (tile.animation.frameMs !== defaultMs) def.d = tile.animation.frameMs;
      animated[bqId] = def;
    }
  }
  const high = Array.from(highSet).sort((a, b) => a - b);

  // Slice-driven rectangle metadata.
  const doors: BQDoor[] = [];
  const checkpoints: BQCheckpoint[] = [];
  const musicAreas: BQMusicArea[] = [];
  const roamingAreas: BQRoamingArea[] = [];
  const chestAreas: BQChestArea[] = [];
  const staticChests: BQStaticChest[] = [];
  const staticEntities: Record<number, string> = {};
  let roamId = 0;

  for (const slice of sprite.slices ?? []) {
    const bq = getSliceBQ(slice);
    if (!bq) continue;
    const k = slice.keys[0];
    const b = k.bounds;
    if (b.x % tilesize !== 0 || b.y % tilesize !== 0 || b.w % tilesize !== 0 || b.h % tilesize !== 0) {
      warnings.push(`slice "${slice.name}" bounds not aligned to tile grid — rounded`);
    }
    const x = Math.round(b.x / tilesize);
    const y = Math.round(b.y / tilesize);
    const w = Math.max(1, Math.round(b.w / tilesize));
    const h = Math.max(1, Math.round(b.h / tilesize));
    switch (bq.kind) {
      case 'door':
        doors.push({ x, y, p: bq.p, tx: bq.tx, ty: bq.ty, tcx: bq.tcx, tcy: bq.tcy, to: bq.to });
        break;
      case 'checkpoint':
        checkpoints.push({ id: bq.id, x, y, w, h });
        break;
      case 'music':
        musicAreas.push({ id: bq.id, x, y, w, h });
        break;
      case 'roam':
        roamingAreas.push({ id: roamId++, type: bq.type, nb: bq.nb, x, y, width: w, height: h });
        break;
      case 'chestArea':
        chestAreas.push({ x, y, w, h, i: bq.items, tx: bq.tx, ty: bq.ty });
        break;
      case 'staticChest':
        staticChests.push({ x, y, i: bq.items });
        break;
      case 'npc':
        staticEntities[y * W + x] = bq.type;
        break;
    }
  }

  doors.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  checkpoints.sort((a, b) => a.id - b.id);

  const client: BQClient = {
    width: W,
    height: H,
    tilesize,
    data: dataOut,
    collisions,
    doors,
    checkpoints,
    high,
    animated: animated as BQClient['animated'],
    plateau,
    musicAreas,
  };
  // Drop empty arrays/objects to keep diffs minimal.
  if (!collisions.length) delete (client as Partial<BQClient>).collisions;
  if (!doors.length) delete (client as Partial<BQClient>).doors;
  if (!checkpoints.length) delete (client as Partial<BQClient>).checkpoints;
  if (!high.length) delete (client as Partial<BQClient>).high;
  if (Object.keys(animated).length === 0) delete (client as Partial<BQClient>).animated;
  if (!plateau.length) delete (client as Partial<BQClient>).plateau;
  if (!musicAreas.length) delete (client as Partial<BQClient>).musicAreas;

  const server: BQServer = {
    width: W,
    height: H,
    tilesize,
    collisions,
    doors,
    checkpoints,
    roamingAreas,
    chestAreas,
    staticChests,
    staticEntities,
  };
  if (!collisions.length) delete (server as Partial<BQServer>).collisions;
  if (!doors.length) delete (server as Partial<BQServer>).doors;
  if (!checkpoints.length) delete (server as Partial<BQServer>).checkpoints;
  if (!roamingAreas.length) delete (server as Partial<BQServer>).roamingAreas;
  if (!chestAreas.length) delete (server as Partial<BQServer>).chestAreas;
  if (!staticChests.length) delete (server as Partial<BQServer>).staticChests;
  if (Object.keys(staticEntities).length === 0) delete (server as Partial<BQServer>).staticEntities;

  return { client, server, warnings };
}
