import { create } from 'zustand';
import type { AnyImage, BlendMode, Cel, ImageRGBA, Layer, RasterLayer, Sprite, Tag, TagDirection, TilemapLayer, Tileset } from '../model/types';
import { newSprite, newTilesetWithTiles, newEmptyTile, nextId } from '../model/factory';
import { applyRedo, applyUndo, MAX_HISTORY, type Patch } from './history';
import { generateTilesetFromImage, type GenerateOptions, type GenerateResult } from '../tileset/generate';
import { flipAny, rotate180, rotate90, scaleRGBANearest } from '../image/transform';

function maskToSelection(mask: Uint8Array, w: number, h: number): SelectionState | null {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { mask, w, h, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

function fullSelection(w: number, h: number): SelectionState {
  const mask = new Uint8Array(w * h);
  mask.fill(1);
  return { mask, w, h, bounds: { x: 0, y: 0, w, h } };
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function mergeMasks(existing: SelectionState | null, next: Uint8Array, w: number, h: number, mode: SelectionMode): SelectionState | null {
  if (!existing || mode === 'replace') return maskToSelection(next, w, h);
  const out = new Uint8Array(w * h);
  const src = existing.mask;
  if (mode === 'add') {
    for (let i = 0; i < out.length; i++) out[i] = (src[i] | next[i]) & 1;
  } else if (mode === 'subtract') {
    for (let i = 0; i < out.length; i++) out[i] = (src[i] & ~next[i]) & 1;
  } else { // intersect
    for (let i = 0; i < out.length; i++) out[i] = (src[i] & next[i]) & 1;
  }
  return maskToSelection(out, w, h);
}

function cloneImage(img: AnyImage): AnyImage {
  if (img.colorMode === 'rgba') return { colorMode: 'rgba', w: img.w, h: img.h, data: new Uint32Array(img.data) };
  if (img.colorMode === 'tilemap') return { colorMode: 'tilemap', w: img.w, h: img.h, data: new Uint32Array(img.data) };
  return { colorMode: img.colorMode, w: img.w, h: img.h, data: new Uint8Array(img.data) };
}

// Inline blend for mergeLayerDown — mirrors compositor semantics.
function mergeBlend(dst: number, src: number, mode: BlendMode, opacity: number): number {
  const sa = ((src >>> 24) & 0xff) * opacity;
  if (sa <= 0) return dst;
  const da = (dst >>> 24) & 0xff;
  const sr = src & 0xff, sg = (src >>> 8) & 0xff, sb = (src >>> 16) & 0xff;
  const dr = dst & 0xff, dg = (dst >>> 8) & 0xff, db = (dst >>> 16) & 0xff;
  let br: number, bg: number, bb: number;
  switch (mode) {
    case 'multiply': br = (sr * dr) / 255; bg = (sg * dg) / 255; bb = (sb * db) / 255; break;
    case 'screen':
      br = 255 - ((255 - sr) * (255 - dr)) / 255;
      bg = 255 - ((255 - sg) * (255 - dg)) / 255;
      bb = 255 - ((255 - sb) * (255 - db)) / 255; break;
    case 'darken': br = Math.min(sr, dr); bg = Math.min(sg, dg); bb = Math.min(sb, db); break;
    case 'lighten': br = Math.max(sr, dr); bg = Math.max(sg, dg); bb = Math.max(sb, db); break;
    case 'add': br = Math.min(255, sr + dr); bg = Math.min(255, sg + dg); bb = Math.min(255, sb + db); break;
    case 'subtract': br = Math.max(0, dr - sr); bg = Math.max(0, dg - sg); bb = Math.max(0, db - sb); break;
    case 'difference': br = Math.abs(dr - sr); bg = Math.abs(dg - sg); bb = Math.abs(db - sb); break;
    case 'overlay':
      br = dr < 128 ? (2 * sr * dr) / 255 : 255 - (2 * (255 - sr) * (255 - dr)) / 255;
      bg = dg < 128 ? (2 * sg * dg) / 255 : 255 - (2 * (255 - sg) * (255 - dg)) / 255;
      bb = db < 128 ? (2 * sb * db) / 255 : 255 - (2 * (255 - sb) * (255 - db)) / 255; break;
    default: br = sr; bg = sg; bb = sb; break;
  }
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

export type EditorMode = 'tilemap' | 'tile' | 'raster';
export type ToolId = 'pencil' | 'eraser' | 'bucket' | 'eyedropper' | 'line' | 'rect' | 'rectfill' | 'pan' | 'select-rect' | 'select-ellipse' | 'select-lasso' | 'select-wand';
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';

export interface SelectionState {
  mask: Uint8Array;  // length = w*h (matches sprite dimensions at time of selection)
  w: number;
  h: number;
  bounds: { x: number; y: number; w: number; h: number };
}

export interface ClipboardBuffer {
  w: number;
  h: number;
  data: Uint32Array;   // RGBA pixels extracted from the source
  mask: Uint8Array;    // 1 = opaque in the clipboard (matches the original selection shape)
}
export type TiledMode = 'none' | 'x' | 'y' | 'both';
export type Anchor = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se';

function anchorOffset(anchor: Anchor, oldW: number, oldH: number, newW: number, newH: number): { ox: number; oy: number } {
  const dx = newW - oldW, dy = newH - oldH;
  let ox = 0, oy = 0;
  if (anchor.includes('e')) ox = dx;
  else if (!anchor.includes('w')) ox = Math.floor(dx / 2);
  if (anchor.includes('s')) oy = dy;
  else if (!anchor.includes('n')) oy = Math.floor(dy / 2);
  return { ox, oy };
}

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CursorState {
  px: number; py: number;
  inside: boolean;
}

export interface TileSelection {
  tilesetId: string;
  index: number;
}

export interface EditorState {
  sprite: Sprite;
  currentFrame: number;
  currentLayerId: string | null;
  mode: EditorMode;
  viewport: ViewportState;

  selectedTile: TileSelection | null;
  brushFlipFlags: number; // bitfield: TILE_FLIP_X | TILE_FLIP_Y | TILE_FLIP_D

  tiledMode: TiledMode;
  showTileNumbers: boolean;

  // Playback state.
  isPlaying: boolean;
  playbackSpeed: number; // 1 = realtime
  loopPlayback: boolean;

  // Onion skin.
  onionSkinEnabled: boolean;
  onionSkinPrev: number;
  onionSkinNext: number;
  onionSkinOpacity: number;

  // Pingpong runtime direction (+1 forward, -1 reverse) — swept by playback.
  pingpongDir: 1 | -1;

  // Selection state (null = no selection / whole sprite is the implicit target).
  selection: SelectionState | null;
  clipboard: ClipboardBuffer | null;

  tool: ToolId;
  previousTool: ToolId;
  primary: number;
  secondary: number;
  cursor: CursorState;

  brushSize: number;        // 1..16 — square brush radius for pencil/eraser
  pixelPerfect: boolean;    // suppress double-pixels on diagonals
  symmetryMode: 'none' | 'h' | 'v' | 'both';
  snapToGrid: boolean;

  undoStack: Patch[];
  redoStack: Patch[];
  dirtyTick: number;

  setZoom: (zoom: number, cx?: number, cy?: number) => void;
  setPan: (x: number, y: number) => void;
  zoomBy: (delta: number, cx: number, cy: number) => void;
  setMode: (mode: EditorMode) => void;
  resetView: (viewportW: number, viewportH: number) => void;
  replaceSprite: (sprite: Sprite) => void;

  setTool: (t: ToolId) => void;
  setPrimary: (c: number) => void;
  setSecondary: (c: number) => void;
  swapColors: () => void;
  setCursor: (c: CursorState) => void;
  setBrushSize: (n: number) => void;
  togglePixelPerfect: () => void;
  setSymmetryMode: (m: 'none' | 'h' | 'v' | 'both') => void;
  toggleSnapToGrid: () => void;

  activeCel: () => Cel | null;
  activeImage: () => ImageRGBA | null;
  editTargetDims: () => { w: number; h: number };

  // Tileset ops.
  createTileset: (tw: number, th: number, initialTiles: number, name?: string) => string;
  addTile: (tilesetId: string) => void;
  deleteTile: (tilesetId: string, index: number) => void;
  duplicateTile: (tilesetId: string, index: number) => void;
  selectTile: (tilesetId: string | null, index?: number) => void;
  renameTileset: (tilesetId: string, name: string) => void;

  // Tilemap layer ops.
  addTilemapLayer: (tilesetId: string, tilesW: number, tilesH: number, name?: string) => string;
  setCurrentLayer: (layerId: string) => void;
  toggleBrushFlip: (flag: 'x' | 'y' | 'd') => void;
  clearBrushFlip: () => void;

  setTiledMode: (m: TiledMode) => void;
  toggleShowTileNumbers: () => void;

  // Frame operations.
  setCurrentFrame: (index: number) => void;
  addFrame: (afterIndex?: number, duplicateCels?: boolean) => number;
  deleteFrame: (index: number) => void;
  duplicateFrame: (index: number) => void;
  moveFrame: (from: number, to: number) => void;
  setFrameDuration: (index: number, ms: number) => void;

  // Playback.
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setPlaybackSpeed: (s: number) => void;
  setLoopPlayback: (loop: boolean) => void;
  nextFrame: () => void;
  prevFrame: () => void;

  // Onion skin.
  toggleOnionSkin: () => void;
  setOnionSkin: (opts: { prev?: number; next?: number; opacity?: number }) => void;

  // Tags.
  addTag: (from: number, to: number, name?: string) => string;
  deleteTag: (tagId: string) => void;
  updateTag: (tagId: string, patch: Partial<Omit<Tag, 'id'>>) => void;

  // Canvas/sprite transforms.
  rotateCanvas: (direction: 'cw' | 'ccw' | '180') => void;
  flipCanvas: (axis: 'h' | 'v') => void;
  resizeCanvas: (w: number, h: number, anchor: Anchor) => void;
  autocrop: () => boolean;
  scaleSprite: (newW: number, newH: number) => boolean;

  // Selection operations.
  selectRect: (x: number, y: number, w: number, h: number, mode?: SelectionMode) => void;
  selectEllipse: (x: number, y: number, w: number, h: number, mode?: SelectionMode) => void;
  selectPolygon: (points: [number, number][], mode?: SelectionMode) => void;
  selectAll: () => void;
  deselect: () => void;
  invertSelection: () => void;
  selectByColor: (x: number, y: number, tolerance: number, mode?: SelectionMode) => void;
  deleteSelectionContent: () => boolean;
  copySelection: () => boolean;
  cutSelection: () => boolean;
  pasteSelection: () => boolean;
  // Selection-content transforms.
  nudgeSelection: (dx: number, dy: number) => boolean;
  flipSelectionContent: (axis: 'h' | 'v') => boolean;
  rotateSelection180: () => boolean;

  // Layer + tileset editing.
  renameLayer: (layerId: string, name: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  setLayerBlendMode: (layerId: string, mode: BlendMode) => void;
  setTilemapLayerTileset: (layerId: string, tilesetId: string) => void;
  deleteLayer: (layerId: string) => void;
  addRasterLayer: (name?: string) => string;
  duplicateLayer: (layerId: string) => string | null;
  moveLayer: (layerId: string, to: number) => void;
  moveLayerUp: (layerId: string) => void;
  moveLayerDown: (layerId: string) => void;
  mergeLayerDown: (layerId: string) => boolean;
  setTilesetProps: (tilesetId: string, props: { name?: string }) => void;
  convertRasterToTilemap: (layerId: string, tilesetId: string, tileW: number, tileH: number) => boolean;
  convertTilemapToRaster: (layerId: string) => boolean;

  // Palette ops.
  setPalette: (colors: Uint32Array) => void;
  addPaletteColor: (color: number, at?: number) => void;
  removePaletteColor: (index: number) => void;
  setPaletteColor: (index: number, color: number) => void;
  reorderPaletteColor: (from: number, to: number) => void;

  // Auto-generation — sync form (for tests/small images).
  generateTilesetFromLayer: (layerId: string, opts: GenerateOptions, hideSource: boolean) => { tilesetId: string; tilemapLayerId: string; tilesCreated: number; duplicates: number } | null;
  // Apply a precomputed result (from the Web Worker path).
  applyGeneratedTileset: (layerId: string, result: GenerateResult, hideSource: boolean) => { tilesetId: string; tilemapLayerId: string } | null;

  // Replace a layer's raster image with a quantized version and set sprite palette.
  applyQuantizedLayer: (layerId: string, palette: Uint32Array, remappedRGBA: Uint32Array) => boolean;

  // Overwrite a raster layer's pixels in place (used by pixelate/preprocess flows).
  overwriteRasterLayer: (layerId: string, rgba: Uint32Array) => boolean;

  pushPatch: (p: Patch) => void;
  undo: () => void;
  redo: () => void;
  markDirty: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 64;

export const useEditorStore = create<EditorState>((set, get) => {
  const sprite = newSprite(64, 64);
  return {
    sprite,
    currentFrame: 0,
    currentLayerId: sprite.layerOrder[0],
    mode: 'raster',
    viewport: { zoom: 8, panX: 0, panY: 0 },

    selectedTile: null,
    brushFlipFlags: 0,

    tiledMode: 'none',
    showTileNumbers: false,

    isPlaying: false,
    playbackSpeed: 1,
    loopPlayback: true,

    onionSkinEnabled: false,
    onionSkinPrev: 1,
    onionSkinNext: 1,
    onionSkinOpacity: 0.35,

    pingpongDir: 1 as 1 | -1,

    selection: null,
    clipboard: null,

    tool: 'pencil',
    previousTool: 'pencil',
    primary: 0xff000000 | 0xffffff,
    secondary: 0xff000000,
    cursor: { px: 0, py: 0, inside: false },
    brushSize: 1,
    pixelPerfect: false,
    symmetryMode: 'none',
    snapToGrid: false,

    undoStack: [],
    redoStack: [],
    dirtyTick: 0,

    setZoom: (zoom, cx, cy) => set((s) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
      if (cx == null || cy == null) return { viewport: { ...s.viewport, zoom: next } };
      const { zoom: z0, panX, panY } = s.viewport;
      const spriteX = (cx - panX) / z0;
      const spriteY = (cy - panY) / z0;
      return { viewport: { zoom: next, panX: cx - spriteX * next, panY: cy - spriteY * next } };
    }),

    setPan: (x, y) => set((s) => ({ viewport: { ...s.viewport, panX: x, panY: y } })),

    zoomBy: (delta, cx, cy) => {
      const z = get().viewport.zoom;
      const factor = delta < 0 ? 1.25 : 0.8;
      get().setZoom(Math.round(z * factor * 100) / 100, cx, cy);
    },

    setMode: (mode) => {
      set({ mode });
      // Entering tile mode without a selection: auto-pick first tile of first tileset if present.
      const s = get();
      if (mode === 'tile' && !s.selectedTile) {
        const ts = s.sprite.tilesets[0];
        if (ts && ts.tiles.length > 0) {
          set({ selectedTile: { tilesetId: ts.id, index: 0 } });
        }
      }
      // Force viewport to recenter on the new edit target.
      setTimeout(() => {
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) get().resetView(vp.clientWidth, vp.clientHeight);
      }, 0);
    },

    resetView: (vw, vh) => set(() => {
      const { w, h } = get().editTargetDims();
      const zoom = Math.max(1, Math.floor(Math.min(vw / w, vh / h) * 0.8));
      return {
        viewport: {
          zoom,
          panX: Math.round((vw - w * zoom) / 2),
          panY: Math.round((vh - h * zoom) / 2),
        },
      };
    }),

    replaceSprite: (sprite) => set({
      sprite,
      currentFrame: 0,
      currentLayerId: sprite.layerOrder[0] ?? null,
      selectedTile: null,
      mode: 'raster',
      undoStack: [],
      redoStack: [],
      dirtyTick: get().dirtyTick + 1,
    }),

    setTool: (t) => set((s) => ({ tool: t, previousTool: s.tool === t ? s.previousTool : s.tool })),
    setPrimary: (c) => set({ primary: c >>> 0 }),
    setSecondary: (c) => set({ secondary: c >>> 0 }),
    swapColors: () => set((s) => ({ primary: s.secondary, secondary: s.primary })),
    setCursor: (c) => set({ cursor: c }),
    setBrushSize: (n) => set({ brushSize: Math.max(1, Math.min(16, n | 0)) }),
    togglePixelPerfect: () => set((s) => ({ pixelPerfect: !s.pixelPerfect })),
    setSymmetryMode: (m) => set({ symmetryMode: m }),
    toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),

    activeCel: () => {
      const s = get();
      const id = s.currentLayerId;
      if (!id) return null;
      return s.sprite.cels.find((c) => c.layerId === id && c.frame === s.currentFrame) ?? null;
    },

    activeImage: () => {
      const s = get();
      if (s.mode === 'tile' && s.selectedTile) {
        const ts = s.sprite.tilesets.find((t) => t.id === s.selectedTile!.tilesetId);
        const tile = ts?.tiles[s.selectedTile.index];
        if (tile && tile.image.colorMode === 'rgba') return tile.image;
        return null;
      }
      const cel = get().activeCel();
      if (!cel) return null;
      return cel.image.colorMode === 'rgba' ? cel.image : null;
    },

    editTargetDims: () => {
      const s = get();
      if (s.mode === 'tile' && s.selectedTile) {
        const ts = s.sprite.tilesets.find((t) => t.id === s.selectedTile!.tilesetId);
        if (ts) return { w: ts.grid.tw, h: ts.grid.th };
      }
      return { w: s.sprite.w, h: s.sprite.h };
    },

    createTileset: (tw, th, initialTiles, name) => {
      const ts = newTilesetWithTiles(tw, th, initialTiles, name ?? `Tileset ${get().sprite.tilesets.length + 1}`);
      set((s) => ({
        sprite: { ...s.sprite, tilesets: [...s.sprite.tilesets, ts] },
        selectedTile: initialTiles > 0 ? { tilesetId: ts.id, index: 0 } : null,
        dirtyTick: s.dirtyTick + 1,
      }));
      return ts.id;
    },

    addTile: (tilesetId) => set((s) => {
      const tilesets = s.sprite.tilesets.map((t): Tileset => {
        if (t.id !== tilesetId) return t;
        return { ...t, tiles: [...t.tiles, newEmptyTile(t.grid.tw, t.grid.th)] };
      });
      const ts = tilesets.find((t) => t.id === tilesetId)!;
      return {
        sprite: { ...s.sprite, tilesets },
        selectedTile: { tilesetId, index: ts.tiles.length - 1 },
        dirtyTick: s.dirtyTick + 1,
      };
    }),

    deleteTile: (tilesetId, index) => set((s) => {
      const tilesets = s.sprite.tilesets.map((t): Tileset => {
        if (t.id !== tilesetId) return t;
        const tiles = t.tiles.slice();
        tiles.splice(index, 1);
        return { ...t, tiles };
      });
      const selectedTile = s.selectedTile && s.selectedTile.tilesetId === tilesetId && s.selectedTile.index >= index
        ? (tilesets.find((t) => t.id === tilesetId)!.tiles.length > 0
            ? { tilesetId, index: Math.max(0, s.selectedTile.index - (s.selectedTile.index === index ? 0 : 1)) }
            : null)
        : s.selectedTile;
      return { sprite: { ...s.sprite, tilesets }, selectedTile, dirtyTick: s.dirtyTick + 1 };
    }),

    duplicateTile: (tilesetId, index) => set((s) => {
      const tilesets = s.sprite.tilesets.map((t): Tileset => {
        if (t.id !== tilesetId) return t;
        const src = t.tiles[index];
        if (!src) return t;
        const copy = {
          image: src.image.colorMode === 'rgba'
            ? { colorMode: 'rgba' as const, w: src.image.w, h: src.image.h, data: new Uint32Array(src.image.data) }
            : src.image,
        };
        const tiles = t.tiles.slice();
        tiles.splice(index + 1, 0, copy);
        return { ...t, tiles };
      });
      return {
        sprite: { ...s.sprite, tilesets },
        selectedTile: { tilesetId, index: index + 1 },
        dirtyTick: s.dirtyTick + 1,
      };
    }),

    selectTile: (tilesetId, index) => set({
      selectedTile: tilesetId == null || index == null ? null : { tilesetId, index },
    }),

    setPalette: (colors) => set((s) => ({ sprite: { ...s.sprite, palette: { colors: new Uint32Array(colors) } } })),

    addPaletteColor: (color, at) => set((s) => {
      const cur = Array.from(s.sprite.palette.colors);
      const idx = at == null ? cur.length : Math.max(0, Math.min(cur.length, at));
      cur.splice(idx, 0, color >>> 0);
      return { sprite: { ...s.sprite, palette: { colors: new Uint32Array(cur) } } };
    }),

    removePaletteColor: (index) => set((s) => {
      const cur = Array.from(s.sprite.palette.colors);
      if (index < 0 || index >= cur.length || cur.length <= 1) return {};
      cur.splice(index, 1);
      return { sprite: { ...s.sprite, palette: { colors: new Uint32Array(cur) } } };
    }),

    setPaletteColor: (index, color) => set((s) => {
      const cur = new Uint32Array(s.sprite.palette.colors);
      if (index < 0 || index >= cur.length) return {};
      cur[index] = color >>> 0;
      return { sprite: { ...s.sprite, palette: { colors: cur } } };
    }),

    reorderPaletteColor: (from, to) => set((s) => {
      const cur = Array.from(s.sprite.palette.colors);
      if (from < 0 || from >= cur.length || to < 0 || to >= cur.length || from === to) return {};
      const [m] = cur.splice(from, 1);
      cur.splice(to, 0, m);
      return { sprite: { ...s.sprite, palette: { colors: new Uint32Array(cur) } } };
    }),

    renameTileset: (tilesetId, name) => set((s) => ({
      sprite: {
        ...s.sprite,
        tilesets: s.sprite.tilesets.map((t) => (t.id === tilesetId ? { ...t, name } : t)),
      },
    })),

    addTilemapLayer: (tilesetId, tilesW, tilesH, name) => {
      const s = get();
      const ts = s.sprite.tilesets.find((t) => t.id === tilesetId);
      if (!ts) return '';
      const layerId = nextId('lay');
      const layer: TilemapLayer = {
        id: layerId,
        name: name ?? `Tilemap ${s.sprite.layers.filter((l) => l.type === 'tilemap').length + 1}`,
        type: 'tilemap',
        visible: true,
        locked: false,
        opacity: 255,
        tilesetId,
      };
      const cel: Cel = {
        id: nextId('cel'),
        layerId,
        frame: 0,
        x: 0,
        y: 0,
        opacity: 255,
        image: { colorMode: 'tilemap', w: tilesW, h: tilesH, data: new Uint32Array(tilesW * tilesH) },
      };
      // Grow sprite canvas if tilemap is bigger than current sprite dims.
      const spriteW = Math.max(s.sprite.w, tilesW * ts.grid.tw);
      const spriteH = Math.max(s.sprite.h, tilesH * ts.grid.th);
      set({
        sprite: {
          ...s.sprite,
          w: spriteW,
          h: spriteH,
          layers: [...s.sprite.layers, layer],
          layerOrder: [...s.sprite.layerOrder, layerId],
          cels: [...s.sprite.cels, cel],
        },
        currentLayerId: layerId,
        mode: 'tilemap',
        dirtyTick: s.dirtyTick + 1,
      });
      setTimeout(() => {
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) get().resetView(vp.clientWidth, vp.clientHeight);
      }, 0);
      return layerId;
    },

    setCurrentLayer: (layerId) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const update: Partial<EditorState> = { currentLayerId: layerId };
      if (layer.type === 'tilemap') update.mode = 'tilemap';
      else if (layer.type === 'raster' && s.mode === 'tilemap') update.mode = 'raster';
      set(update);
    },

    toggleBrushFlip: (flag) => set((s) => {
      const bit = flag === 'x' ? 1 << 29 : flag === 'y' ? 1 << 30 : 1 << 31;
      return { brushFlipFlags: (s.brushFlipFlags ^ bit) >>> 0 };
    }),

    clearBrushFlip: () => set({ brushFlipFlags: 0 }),

    generateTilesetFromLayer: (layerId, opts, hideSource) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'raster') return null;
      const cel = s.sprite.cels.find((c) => c.layerId === layerId && c.frame === s.currentFrame);
      if (!cel || cel.image.colorMode !== 'rgba') return null;

      const result = generateTilesetFromImage(cel.image, opts);
      if (result.mapW === 0 || result.mapH === 0) return null;

      const applied = get().applyGeneratedTileset(layerId, result, hideSource);
      if (!applied) return null;
      return {
        ...applied,
        tilesCreated: result.tilesCreated,
        duplicates: result.duplicatesFound,
      };
    },

    applyGeneratedTileset: (layerId, result, hideSource) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer) return null;
      if (result.mapW === 0 || result.mapH === 0) return null;

      const tilesetId = result.tileset.id;
      const tilemapLayerId = nextId('lay');
      const tilemapLayer: TilemapLayer = {
        id: tilemapLayerId,
        name: `${layer.name} (map)`,
        type: 'tilemap',
        visible: true,
        locked: false,
        opacity: 255,
        tilesetId,
      };
      const tilemapCel: Cel = {
        id: nextId('cel'),
        layerId: tilemapLayerId,
        frame: 0,
        x: 0,
        y: 0,
        opacity: 255,
        image: {
          colorMode: 'tilemap',
          w: result.mapW,
          h: result.mapH,
          data: result.tilemapData,
        },
      };

      const updatedLayers = s.sprite.layers
        .map((l) => (hideSource && l.id === layerId ? { ...l, visible: false } : l))
        .concat(tilemapLayer);

      set({
        sprite: {
          ...s.sprite,
          w: Math.max(s.sprite.w, result.mapW * result.tileset.grid.tw),
          h: Math.max(s.sprite.h, result.mapH * result.tileset.grid.th),
          tilesets: [...s.sprite.tilesets, result.tileset],
          layers: updatedLayers,
          layerOrder: [...s.sprite.layerOrder, tilemapLayerId],
          cels: [...s.sprite.cels, tilemapCel],
        },
        currentLayerId: tilemapLayerId,
        mode: 'tilemap',
        selectedTile: result.tileset.tiles.length > 0 ? { tilesetId, index: 0 } : null,
        dirtyTick: s.dirtyTick + 1,
      });
      setTimeout(() => {
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) get().resetView(vp.clientWidth, vp.clientHeight);
      }, 0);

      return { tilesetId, tilemapLayerId };
    },

    applyQuantizedLayer: (layerId, palette, remappedRGBA) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'raster') return false;
      const cel = s.sprite.cels.find((c) => c.layerId === layerId && c.frame === s.currentFrame);
      if (!cel || cel.image.colorMode !== 'rgba') return false;
      if (cel.image.data.length !== remappedRGBA.length) return false;
      cel.image.data.set(remappedRGBA);
      set({
        sprite: { ...s.sprite, palette: { colors: new Uint32Array(palette) } },
        dirtyTick: s.dirtyTick + 1,
      });
      return true;
    },

    setTiledMode: (m) => set({ tiledMode: m }),
    toggleShowTileNumbers: () => set((s) => ({ showTileNumbers: !s.showTileNumbers })),

    setCurrentFrame: (index) => set((s) => {
      const clamped = Math.max(0, Math.min(s.sprite.frames.length - 1, index));
      return { currentFrame: clamped };
    }),

    addFrame: (afterIndex, duplicateCels = true) => {
      const s = get();
      const at = afterIndex == null ? s.sprite.frames.length - 1 : Math.max(-1, Math.min(s.sprite.frames.length - 1, afterIndex));
      const newIndex = at + 1;
      const prevFrame = at >= 0 ? s.sprite.frames[at] : { duration: 100 };
      const frames = [...s.sprite.frames];
      frames.splice(newIndex, 0, { duration: prevFrame.duration });

      // Shift any cels at frame >= newIndex up by one.
      const shiftedCels = s.sprite.cels.map((c) =>
        c.frame >= newIndex ? { ...c, frame: c.frame + 1 } : c
      );

      // Optionally copy cels from the previous frame onto the new frame index.
      const newCels: Cel[] = [];
      if (duplicateCels && at >= 0) {
        for (const layer of s.sprite.layers) {
          if (layer.type === 'group') continue;
          const src = shiftedCels.find((c) => c.layerId === layer.id && c.frame === at);
          if (!src) continue;
          newCels.push({
            ...src,
            id: nextId('cel'),
            frame: newIndex,
            image: cloneImage(src.image),
          });
        }
      }

      set({
        sprite: { ...s.sprite, frames, cels: [...shiftedCels, ...newCels] },
        currentFrame: newIndex,
        dirtyTick: s.dirtyTick + 1,
      });
      return newIndex;
    },

    deleteFrame: (index) => set((s) => {
      if (s.sprite.frames.length <= 1) return {};
      const frames = s.sprite.frames.slice();
      frames.splice(index, 1);
      const cels = s.sprite.cels
        .filter((c) => c.frame !== index)
        .map((c) => (c.frame > index ? { ...c, frame: c.frame - 1 } : c));
      return {
        sprite: { ...s.sprite, frames, cels },
        currentFrame: Math.min(s.currentFrame, frames.length - 1),
        dirtyTick: s.dirtyTick + 1,
      };
    }),

    duplicateFrame: (index) => { get().addFrame(index, true); },

    moveFrame: (from, to) => set((s) => {
      if (from === to) return {};
      const frames = s.sprite.frames.slice();
      const [moved] = frames.splice(from, 1);
      frames.splice(to, 0, moved);
      // Remap cel frame indices via a permutation table.
      const map = new Array(s.sprite.frames.length);
      const order = s.sprite.frames.map((_, i) => i);
      const [pm] = order.splice(from, 1);
      order.splice(to, 0, pm);
      for (let i = 0; i < order.length; i++) map[order[i]] = i;
      const cels = s.sprite.cels.map((c) => ({ ...c, frame: map[c.frame] }));
      return {
        sprite: { ...s.sprite, frames, cels },
        currentFrame: to,
        dirtyTick: s.dirtyTick + 1,
      };
    }),

    setFrameDuration: (index, ms) => set((s) => {
      const frames = s.sprite.frames.map((f, i) => (i === index ? { ...f, duration: Math.max(10, Math.min(10_000, ms)) } : f));
      return { sprite: { ...s.sprite, frames } };
    }),

    setPlaying: (playing) => set({ isPlaying: playing }),
    togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
    setPlaybackSpeed: (spd) => set({ playbackSpeed: Math.max(0.1, Math.min(8, spd)) }),
    setLoopPlayback: (loop) => set({ loopPlayback: loop }),

    nextFrame: () => set((s) => {
      // Tag-aware advance: if the current frame sits inside a tag, respect that tag's range/direction.
      const tag = (s.sprite.tags ?? []).find((t) => {
        const a = Math.min(t.from, t.to), b = Math.max(t.from, t.to);
        return s.currentFrame >= a && s.currentFrame <= b;
      });
      if (tag) {
        const a = Math.min(tag.from, tag.to), b = Math.max(tag.from, tag.to);
        if (tag.direction === 'forward') {
          const n = s.currentFrame + 1;
          if (n > b) return s.loopPlayback ? { currentFrame: a } : { isPlaying: false };
          return { currentFrame: n };
        }
        if (tag.direction === 'reverse') {
          const n = s.currentFrame - 1;
          if (n < a) return s.loopPlayback ? { currentFrame: b } : { isPlaying: false };
          return { currentFrame: n };
        }
        // pingpong — bounce at boundaries.
        if (a === b) return { currentFrame: a };
        let dir: 1 | -1 = s.pingpongDir;
        let n = s.currentFrame + dir;
        if (n > b) { dir = -1; n = b - 1; }
        else if (n < a) { dir = 1; n = a + 1; }
        return { currentFrame: n, pingpongDir: dir };
      }
      const count = s.sprite.frames.length;
      const next = s.currentFrame + 1;
      if (next >= count) return s.loopPlayback ? { currentFrame: 0 } : { isPlaying: false };
      return { currentFrame: next };
    }),

    prevFrame: () => set((s) => {
      const count = s.sprite.frames.length;
      const prev = s.currentFrame - 1;
      if (prev < 0) return { currentFrame: count - 1 };
      return { currentFrame: prev };
    }),

    toggleOnionSkin: () => set((s) => ({ onionSkinEnabled: !s.onionSkinEnabled, dirtyTick: s.dirtyTick + 1 })),
    setOnionSkin: ({ prev, next, opacity }) => set((s) => ({
      onionSkinPrev: prev != null ? Math.max(0, Math.min(5, prev)) : s.onionSkinPrev,
      onionSkinNext: next != null ? Math.max(0, Math.min(5, next)) : s.onionSkinNext,
      onionSkinOpacity: opacity != null ? Math.max(0.05, Math.min(1, opacity)) : s.onionSkinOpacity,
      dirtyTick: s.dirtyTick + 1,
    })),

    addTag: (from, to, name) => {
      const s = get();
      const id = nextId('tag');
      const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];
      const tag: Tag = {
        id,
        name: name ?? `Tag ${(s.sprite.tags?.length ?? 0) + 1}`,
        from: Math.max(0, Math.min(s.sprite.frames.length - 1, from)),
        to: Math.max(0, Math.min(s.sprite.frames.length - 1, to)),
        direction: 'forward' as TagDirection,
        color: colors[(s.sprite.tags?.length ?? 0) % colors.length],
      };
      set({
        sprite: { ...s.sprite, tags: [...(s.sprite.tags ?? []), tag] },
      });
      return id;
    },

    deleteTag: (tagId) => set((s) => ({
      sprite: { ...s.sprite, tags: (s.sprite.tags ?? []).filter((t) => t.id !== tagId) },
    })),

    updateTag: (tagId, patch) => set((s) => ({
      sprite: {
        ...s.sprite,
        tags: (s.sprite.tags ?? []).map((t) => (t.id === tagId ? { ...t, ...patch } : t)),
      },
    })),

    rotateCanvas: (direction) => {
      const s = get();
      const cels = s.sprite.cels.map((c) => {
        const img = c.image;
        let rotated: typeof img;
        if (direction === 'cw') rotated = rotate90(img, false);
        else if (direction === 'ccw') rotated = rotate90(img, true);
        else rotated = rotate180(img);
        // Update the cel offset so rotated content remains within the (possibly swapped) canvas.
        // For 90°: new canvas is h × w. Cel position: (c.x, c.y) → (oldH - c.y - imgH, c.x)? For
        // simplicity (cels at origin in our sprites), we leave x/y alone when the cel is full-size.
        return { ...c, image: rotated };
      });
      const swap = direction !== '180';
      set({
        sprite: {
          ...s.sprite,
          w: swap ? s.sprite.h : s.sprite.w,
          h: swap ? s.sprite.w : s.sprite.h,
          cels,
        },
        dirtyTick: s.dirtyTick + 1,
      });
      setTimeout(() => {
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) get().resetView(vp.clientWidth, vp.clientHeight);
      }, 0);
    },

    flipCanvas: (axis) => {
      const s = get();
      const cels = s.sprite.cels.map((c) => ({ ...c, image: flipAny(c.image, axis) }));
      set({
        sprite: { ...s.sprite, cels },
        dirtyTick: s.dirtyTick + 1,
      });
    },

    resizeCanvas: (newW, newH, anchor) => {
      const s = get();
      const { ox, oy } = anchorOffset(anchor, s.sprite.w, s.sprite.h, newW, newH);
      const cels = s.sprite.cels.map((c) => {
        if (c.image.colorMode === 'rgba') {
          // Paint the old image into a fresh buffer of the new size, offset by (ox, oy).
          const out = new Uint32Array(newW * newH);
          const src = c.image.data;
          for (let y = 0; y < c.image.h; y++) {
            const dy = y + oy;
            if (dy < 0 || dy >= newH) continue;
            for (let x = 0; x < c.image.w; x++) {
              const dx = x + ox;
              if (dx < 0 || dx >= newW) continue;
              out[dy * newW + dx] = src[y * c.image.w + x];
            }
          }
          return { ...c, image: { colorMode: 'rgba' as const, w: newW, h: newH, data: out } };
        }
        // Tilemap: change cel image tile-dimensions to fit the new canvas.
        if (c.image.colorMode === 'tilemap') {
          const layer = s.sprite.layers.find((l) => l.id === c.layerId);
          if (!layer || layer.type !== 'tilemap') return c;
          const ts = s.sprite.tilesets.find((t) => t.id === layer.tilesetId);
          if (!ts) return c;
          const tilesW = Math.max(1, Math.floor(newW / ts.grid.tw));
          const tilesH = Math.max(1, Math.floor(newH / ts.grid.th));
          const data = new Uint32Array(tilesW * tilesH);
          // Offset in tile units.
          const tox = Math.round(ox / ts.grid.tw);
          const toy = Math.round(oy / ts.grid.th);
          for (let ty = 0; ty < c.image.h; ty++) {
            const dy = ty + toy;
            if (dy < 0 || dy >= tilesH) continue;
            for (let tx = 0; tx < c.image.w; tx++) {
              const dx = tx + tox;
              if (dx < 0 || dx >= tilesW) continue;
              data[dy * tilesW + dx] = c.image.data[ty * c.image.w + tx];
            }
          }
          return { ...c, image: { colorMode: 'tilemap' as const, w: tilesW, h: tilesH, data } };
        }
        return c;
      });
      set({
        sprite: { ...s.sprite, w: newW, h: newH, cels },
        dirtyTick: s.dirtyTick + 1,
      });
      setTimeout(() => {
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) get().resetView(vp.clientWidth, vp.clientHeight);
      }, 0);
    },

    selectEllipse: (x, y, w, h, mode = 'replace') => set((s) => {
      const sw = s.sprite.w, sh = s.sprite.h;
      if (w <= 0 || h <= 0) return {};
      const next = new Uint8Array(sw * sh);
      // Rasterize ellipse inscribed in [x, x+w) × [y, y+h).
      const cx = x + w / 2 - 0.5;
      const cy = y + h / 2 - 0.5;
      const rx = w / 2, ry = h / 2;
      for (let yy = Math.max(0, y); yy < Math.min(sh, y + h); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(sw, x + w); xx++) {
          const nx = (xx - cx) / rx, ny = (yy - cy) / ry;
          if (nx * nx + ny * ny <= 1) next[yy * sw + xx] = 1;
        }
      }
      return { selection: mergeMasks(s.selection, next, sw, sh, mode) };
    }),

    selectPolygon: (points, mode = 'replace') => set((s) => {
      const sw = s.sprite.w, sh = s.sprite.h;
      if (points.length < 3) return {};
      const next = new Uint8Array(sw * sh);
      // Bounding box of polygon for loop bounds.
      let minX = points[0][0], minY = points[0][1], maxX = minX, maxY = minY;
      for (const [px, py] of points) {
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
      minX = Math.max(0, Math.floor(minX));
      minY = Math.max(0, Math.floor(minY));
      maxX = Math.min(sw - 1, Math.ceil(maxX));
      maxY = Math.min(sh - 1, Math.ceil(maxY));
      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          if (pointInPolygon(xx + 0.5, yy + 0.5, points)) next[yy * sw + xx] = 1;
        }
      }
      return { selection: mergeMasks(s.selection, next, sw, sh, mode) };
    }),

    selectRect: (x, y, w, h, mode = 'replace') => set((s) => {
      const sw = s.sprite.w, sh = s.sprite.h;
      const x0 = Math.max(0, Math.min(sw, x));
      const y0 = Math.max(0, Math.min(sh, y));
      const x1 = Math.max(0, Math.min(sw, x + w));
      const y1 = Math.max(0, Math.min(sh, y + h));
      if (x1 <= x0 || y1 <= y0) return {};
      const next = new Uint8Array(sw * sh);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) next[yy * sw + xx] = 1;
      const merged = mergeMasks(s.selection, next, sw, sh, mode);
      return { selection: merged };
    }),

    selectAll: () => set((s) => ({
      selection: fullSelection(s.sprite.w, s.sprite.h),
    })),

    deselect: () => set({ selection: null }),

    invertSelection: () => set((s) => {
      const sw = s.sprite.w, sh = s.sprite.h;
      const old = s.selection?.mask ?? new Uint8Array(sw * sh);
      const out = new Uint8Array(sw * sh);
      for (let i = 0; i < out.length; i++) out[i] = old[i] ? 0 : 1;
      return { selection: maskToSelection(out, sw, sh) };
    }),

    selectByColor: (x, y, tolerance, mode = 'replace') => set((s) => {
      const img = s.activeImage();
      if (!img) return {};
      const cel = s.activeCel();
      if (!cel) return {};
      const lx = x - cel.x, ly = y - cel.y;
      if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) return {};
      const target = img.data[ly * img.w + lx];
      const sw = s.sprite.w, sh = s.sprite.h;
      const next = new Uint8Array(sw * sh);
      const tol2 = tolerance * tolerance;
      const tr = target & 0xff, tg = (target >>> 8) & 0xff, tb = (target >>> 16) & 0xff, ta = (target >>> 24) & 0xff;
      for (let yy = 0; yy < img.h; yy++) {
        for (let xx = 0; xx < img.w; xx++) {
          const c = img.data[yy * img.w + xx];
          const cr = c & 0xff, cg = (c >>> 8) & 0xff, cb = (c >>> 16) & 0xff, ca = (c >>> 24) & 0xff;
          const dr = cr - tr, dg = cg - tg, db = cb - tb, da = ca - ta;
          if (dr * dr + dg * dg + db * db + da * da <= tol2) {
            const sx = cel.x + xx, sy = cel.y + yy;
            if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) next[sy * sw + sx] = 1;
          }
        }
      }
      const merged = mergeMasks(s.selection, next, sw, sh, mode);
      return { selection: merged };
    }),

    deleteSelectionContent: () => {
      const s = get();
      const cel = s.activeCel();
      const img = s.activeImage();
      if (!cel || !img) return false;
      const sel = s.selection;
      const sw = s.sprite.w;
      for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
          const sx = cel.x + x, sy = cel.y + y;
          if (sel && (sx < 0 || sy < 0 || sx >= sw || sy >= sel.h || sel.mask[sy * sw + sx] === 0)) continue;
          img.data[y * img.w + x] = 0;
        }
      }
      set({ dirtyTick: s.dirtyTick + 1 });
      return true;
    },

    copySelection: () => {
      const s = get();
      const img = s.activeImage();
      const cel = s.activeCel();
      if (!img || !cel) return false;
      const bounds = s.selection?.bounds ?? { x: 0, y: 0, w: s.sprite.w, h: s.sprite.h };
      const buf = new Uint32Array(bounds.w * bounds.h);
      const mask = new Uint8Array(bounds.w * bounds.h);
      const sel = s.selection;
      const sw = s.sprite.w;
      for (let yy = 0; yy < bounds.h; yy++) {
        for (let xx = 0; xx < bounds.w; xx++) {
          const sx = bounds.x + xx, sy = bounds.y + yy;
          if (sel && sel.mask[sy * sw + sx] === 0) continue;
          const lx = sx - cel.x, ly = sy - cel.y;
          if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
          buf[yy * bounds.w + xx] = img.data[ly * img.w + lx];
          mask[yy * bounds.w + xx] = 1;
        }
      }
      set({ clipboard: { w: bounds.w, h: bounds.h, data: buf, mask } });
      return true;
    },

    cutSelection: () => {
      const ok = get().copySelection();
      if (!ok) return false;
      return get().deleteSelectionContent();
    },

    nudgeSelection: (dx, dy) => {
      const s = get();
      const sel = s.selection;
      const img = s.activeImage();
      const cel = s.activeCel();
      if (!sel || !img || !cel) return false;
      const sw = sel.w, sh = sel.h;
      // Capture pixels under the current mask (in sprite space), then clear them.
      const snap: Array<{ sx: number; sy: number; color: number }> = [];
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (sel.mask[y * sw + x] === 0) continue;
          const lx = x - cel.x, ly = y - cel.y;
          if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
          snap.push({ sx: x, sy: y, color: img.data[ly * img.w + lx] });
          img.data[ly * img.w + lx] = 0;
        }
      }
      // Build new mask shifted by (dx, dy) and paint snapshots back.
      const newMask = new Uint8Array(sw * sh);
      for (const p of snap) {
        const nx = p.sx + dx, ny = p.sy + dy;
        if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
        const lx = nx - cel.x, ly = ny - cel.y;
        if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
        img.data[ly * img.w + lx] = p.color;
        newMask[ny * sw + nx] = 1;
      }
      set({
        selection: maskToSelection(newMask, sw, sh),
        dirtyTick: s.dirtyTick + 1,
      });
      return true;
    },

    flipSelectionContent: (axis) => {
      const s = get();
      const sel = s.selection;
      const img = s.activeImage();
      const cel = s.activeCel();
      if (!sel || !img || !cel) return false;
      const b = sel.bounds;
      const buf = new Uint32Array(b.w * b.h);
      const mb = new Uint8Array(b.w * b.h);
      // Extract content + sub-mask from the sprite.
      for (let yy = 0; yy < b.h; yy++) {
        for (let xx = 0; xx < b.w; xx++) {
          const sx = b.x + xx, sy = b.y + yy;
          if (sel.mask[sy * sel.w + sx] === 0) continue;
          const lx = sx - cel.x, ly = sy - cel.y;
          if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
          buf[yy * b.w + xx] = img.data[ly * img.w + lx];
          mb[yy * b.w + xx] = 1;
          // Clear in place; we'll repaint flipped below.
          img.data[ly * img.w + lx] = 0;
        }
      }
      // Flip content + sub-mask.
      const flipBoth = (a: Uint32Array | Uint8Array) => {
        if (axis === 'h') {
          for (let yy = 0; yy < b.h; yy++) {
            for (let xx = 0; xx < (b.w >> 1); xx++) {
              const i1 = yy * b.w + xx;
              const i2 = yy * b.w + (b.w - 1 - xx);
              const t = a[i1]; a[i1] = a[i2]; a[i2] = t;
            }
          }
        } else {
          for (let yy = 0; yy < (b.h >> 1); yy++) {
            for (let xx = 0; xx < b.w; xx++) {
              const i1 = yy * b.w + xx;
              const i2 = (b.h - 1 - yy) * b.w + xx;
              const t = a[i1]; a[i1] = a[i2]; a[i2] = t;
            }
          }
        }
      };
      flipBoth(buf);
      flipBoth(mb);
      // Paint back + rebuild mask.
      const newMask = new Uint8Array(sel.mask.length);
      for (let yy = 0; yy < b.h; yy++) {
        for (let xx = 0; xx < b.w; xx++) {
          if (mb[yy * b.w + xx] === 0) continue;
          const sx = b.x + xx, sy = b.y + yy;
          const lx = sx - cel.x, ly = sy - cel.y;
          if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
          img.data[ly * img.w + lx] = buf[yy * b.w + xx];
          newMask[sy * sel.w + sx] = 1;
        }
      }
      set({
        selection: maskToSelection(newMask, sel.w, sel.h),
        dirtyTick: s.dirtyTick + 1,
      });
      return true;
    },

    rotateSelection180: () => {
      const s = get();
      const sel = s.selection;
      const img = s.activeImage();
      const cel = s.activeCel();
      if (!sel || !img || !cel) return false;
      const b = sel.bounds;
      const buf = new Uint32Array(b.w * b.h);
      const mb = new Uint8Array(b.w * b.h);
      for (let yy = 0; yy < b.h; yy++) {
        for (let xx = 0; xx < b.w; xx++) {
          const sx = b.x + xx, sy = b.y + yy;
          if (sel.mask[sy * sel.w + sx] === 0) continue;
          const lx = sx - cel.x, ly = sy - cel.y;
          if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
          buf[yy * b.w + xx] = img.data[ly * img.w + lx];
          mb[yy * b.w + xx] = 1;
          img.data[ly * img.w + lx] = 0;
        }
      }
      // 180° rotation of an N-length buffer = reverse.
      const rotBuf = new Uint32Array(buf.length);
      const rotMask = new Uint8Array(mb.length);
      for (let i = 0; i < buf.length; i++) { rotBuf[i] = buf[buf.length - 1 - i]; rotMask[i] = mb[mb.length - 1 - i]; }
      const newMask = new Uint8Array(sel.mask.length);
      for (let yy = 0; yy < b.h; yy++) {
        for (let xx = 0; xx < b.w; xx++) {
          if (rotMask[yy * b.w + xx] === 0) continue;
          const sx = b.x + xx, sy = b.y + yy;
          const lx = sx - cel.x, ly = sy - cel.y;
          if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
          img.data[ly * img.w + lx] = rotBuf[yy * b.w + xx];
          newMask[sy * sel.w + sx] = 1;
        }
      }
      set({
        selection: maskToSelection(newMask, sel.w, sel.h),
        dirtyTick: s.dirtyTick + 1,
      });
      return true;
    },

    pasteSelection: () => {
      const s = get();
      const img = s.activeImage();
      const cel = s.activeCel();
      const clip = s.clipboard;
      if (!img || !cel || !clip) return false;
      // Paste at top-left of current selection, or (0,0) if none.
      const dstX = s.selection?.bounds.x ?? 0;
      const dstY = s.selection?.bounds.y ?? 0;
      const sw = s.sprite.w, sh = s.sprite.h;
      const newMask = new Uint8Array(sw * sh);
      for (let yy = 0; yy < clip.h; yy++) {
        for (let xx = 0; xx < clip.w; xx++) {
          if (clip.mask[yy * clip.w + xx] === 0) continue;
          const sx = dstX + xx, sy = dstY + yy;
          if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
          const lx = sx - cel.x, ly = sy - cel.y;
          if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
          const c = clip.data[yy * clip.w + xx];
          if (((c >>> 24) & 0xff) === 0) continue;
          img.data[ly * img.w + lx] = c;
          newMask[sy * sw + sx] = 1;
        }
      }
      set({
        selection: maskToSelection(newMask, sw, sh),
        dirtyTick: s.dirtyTick + 1,
      });
      return true;
    },

    scaleSprite: (newW, newH) => {
      const s = get();
      if (newW <= 0 || newH <= 0) return false;
      if (newW === s.sprite.w && newH === s.sprite.h) return false;
      const sx = newW / s.sprite.w;
      const sy = newH / s.sprite.h;
      const cels = s.sprite.cels.map((c) => {
        if (c.image.colorMode === 'rgba') {
          const w = Math.max(1, Math.round(c.image.w * sx));
          const h = Math.max(1, Math.round(c.image.h * sy));
          return { ...c, x: Math.round(c.x * sx), y: Math.round(c.y * sy), image: scaleRGBANearest(c.image, w, h) };
        }
        // Tilemap scaling isn't meaningful (tiles are fixed-size); leave the cel untouched.
        return c;
      });
      set({
        sprite: { ...s.sprite, w: newW, h: newH, cels },
        dirtyTick: s.dirtyTick + 1,
      });
      setTimeout(() => {
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) get().resetView(vp.clientWidth, vp.clientHeight);
      }, 0);
      return true;
    },

    autocrop: () => {
      const s = get();
      // Union bbox of non-transparent pixels across all visible frames/layers.
      let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
      for (let f = 0; f < s.sprite.frames.length; f++) {
        for (const layer of s.sprite.layers) {
          if (layer.type === 'group' || !layer.visible) continue;
          const cel = s.sprite.cels.find((c) => c.layerId === layer.id && c.frame === f);
          if (!cel) continue;
          const img = cel.image;
          if (img.colorMode === 'rgba') {
            for (let y = 0; y < img.h; y++) {
              for (let x = 0; x < img.w; x++) {
                const c = img.data[y * img.w + x];
                if ((c >>> 24) === 0) continue;
                const gx = cel.x + x, gy = cel.y + y;
                if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
                if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
              }
            }
          } else if (img.colorMode === 'tilemap') {
            // Treat any non-empty tilemap word as occupying its tile bounds.
            const ts = s.sprite.tilesets.find((t) => layer.type === 'tilemap' && t.id === layer.tilesetId);
            if (!ts) continue;
            for (let ty = 0; ty < img.h; ty++) {
              for (let tx = 0; tx < img.w; tx++) {
                if (img.data[ty * img.w + tx] === 0) continue;
                const x0 = cel.x + tx * ts.grid.tw, y0 = cel.y + ty * ts.grid.th;
                const x1 = x0 + ts.grid.tw - 1, y1 = y0 + ts.grid.th - 1;
                if (x0 < minX) minX = x0; if (x1 > maxX) maxX = x1;
                if (y0 < minY) minY = y0; if (y1 > maxY) maxY = y1;
              }
            }
          }
        }
      }
      if (maxX < 0 || maxY < 0) return false; // all transparent
      const newW = maxX - minX + 1;
      const newH = maxY - minY + 1;
      if (newW === s.sprite.w && newH === s.sprite.h && minX === 0 && minY === 0) return false;
      // Translate cel positions by (-minX, -minY), then resize canvas.
      const shiftedCels = s.sprite.cels.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY }));
      set({
        sprite: { ...s.sprite, cels: shiftedCels, w: s.sprite.w, h: s.sprite.h },
      });
      // Now do a proper resize crop via resizeCanvas with anchor nw — since we've already shifted cels,
      // we can just set sprite.w/h directly.
      set((st) => ({ sprite: { ...st.sprite, w: newW, h: newH }, dirtyTick: st.dirtyTick + 1 }));
      setTimeout(() => {
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) get().resetView(vp.clientWidth, vp.clientHeight);
      }, 0);
      return true;
    },

    renameLayer: (layerId, name) => set((s) => ({
      sprite: {
        ...s.sprite,
        layers: s.sprite.layers.map((l) => (l.id === layerId ? { ...l, name } : l)),
      },
    })),
    setLayerOpacity: (layerId, opacity) => set((s) => ({
      sprite: {
        ...s.sprite,
        layers: s.sprite.layers.map((l) => (l.id === layerId ? { ...l, opacity: Math.max(0, Math.min(255, opacity)) } : l)),
      },
      dirtyTick: s.dirtyTick + 1,
    })),
    setLayerVisible: (layerId, visible) => set((s) => ({
      sprite: {
        ...s.sprite,
        layers: s.sprite.layers.map((l) => (l.id === layerId ? { ...l, visible } : l)),
      },
      dirtyTick: s.dirtyTick + 1,
    })),
    setLayerBlendMode: (layerId, mode) => set((s) => ({
      sprite: {
        ...s.sprite,
        layers: s.sprite.layers.map((l) => (l.id === layerId ? { ...l, blendMode: mode } : l)),
      },
      dirtyTick: s.dirtyTick + 1,
    })),

    addRasterLayer: (name) => {
      const s = get();
      const id = nextId('lay');
      const layer: RasterLayer = {
        id,
        name: name ?? `Layer ${s.sprite.layers.filter((l) => l.type === 'raster').length + 1}`,
        type: 'raster',
        visible: true,
        locked: false,
        opacity: 255,
        blendMode: 'normal',
      };
      // Create a blank cel for every frame.
      const newCels: Cel[] = s.sprite.frames.map((_, fi) => ({
        id: nextId('cel'),
        layerId: id,
        frame: fi,
        x: 0,
        y: 0,
        opacity: 255,
        image: { colorMode: 'rgba' as const, w: s.sprite.w, h: s.sprite.h, data: new Uint32Array(s.sprite.w * s.sprite.h) },
      }));
      set({
        sprite: {
          ...s.sprite,
          layers: [...s.sprite.layers, layer],
          layerOrder: [...s.sprite.layerOrder, id],
          cels: [...s.sprite.cels, ...newCels],
        },
        currentLayerId: id,
        mode: 'raster',
        dirtyTick: s.dirtyTick + 1,
      });
      return id;
    },

    duplicateLayer: (layerId) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer || layer.type === 'group') return null;
      const newId = nextId('lay');
      const dup: Layer = { ...layer, id: newId, name: `${layer.name} copy` };
      const dupCels: Cel[] = s.sprite.cels
        .filter((c) => c.layerId === layerId)
        .map((c) => ({ ...c, id: nextId('cel'), layerId: newId, image: cloneImage(c.image) }));
      const position = s.sprite.layerOrder.indexOf(layerId) + 1;
      const newOrder = [...s.sprite.layerOrder];
      newOrder.splice(position, 0, newId);
      set({
        sprite: {
          ...s.sprite,
          layers: [...s.sprite.layers, dup],
          layerOrder: newOrder,
          cels: [...s.sprite.cels, ...dupCels],
        },
        currentLayerId: newId,
        dirtyTick: s.dirtyTick + 1,
      });
      return newId;
    },

    moveLayer: (layerId, to) => set((s) => {
      const from = s.sprite.layerOrder.indexOf(layerId);
      if (from < 0) return {};
      const clamped = Math.max(0, Math.min(s.sprite.layerOrder.length - 1, to));
      if (from === clamped) return {};
      const order = [...s.sprite.layerOrder];
      const [m] = order.splice(from, 1);
      order.splice(clamped, 0, m);
      return { sprite: { ...s.sprite, layerOrder: order }, dirtyTick: s.dirtyTick + 1 };
    }),
    moveLayerUp: (layerId) => {
      const s = get();
      const i = s.sprite.layerOrder.indexOf(layerId);
      if (i < 0 || i >= s.sprite.layerOrder.length - 1) return;
      get().moveLayer(layerId, i + 1);
    },
    moveLayerDown: (layerId) => {
      const s = get();
      const i = s.sprite.layerOrder.indexOf(layerId);
      if (i <= 0) return;
      get().moveLayer(layerId, i - 1);
    },

    mergeLayerDown: (layerId) => {
      const s = get();
      const idx = s.sprite.layerOrder.indexOf(layerId);
      if (idx <= 0) return false; // no layer below
      const belowId = s.sprite.layerOrder[idx - 1];
      const above = s.sprite.layers.find((l) => l.id === layerId);
      const below = s.sprite.layers.find((l) => l.id === belowId);
      if (!above || !below) return false;
      if (above.type !== 'raster' || below.type !== 'raster') return false;

      // For every frame, composite the "above" cel onto the "below" cel in place.
      for (let f = 0; f < s.sprite.frames.length; f++) {
        const aboveCel = s.sprite.cels.find((c) => c.layerId === layerId && c.frame === f);
        const belowCel = s.sprite.cels.find((c) => c.layerId === belowId && c.frame === f);
        if (!aboveCel || aboveCel.image.colorMode !== 'rgba') continue;
        if (!belowCel || belowCel.image.colorMode !== 'rgba') continue;
        const aboveImg = aboveCel.image;
        const belowImg = belowCel.image;
        const opacity = above.opacity / 255;
        const mode = above.blendMode ?? 'normal';
        // Reuse the compositor's blendPixel semantics by delegating to a tiny inline version.
        const bw = belowImg.w, bh = belowImg.h;
        const bd = belowImg.data;
        const ad = aboveImg.data;
        for (let y = 0; y < aboveImg.h; y++) {
          const by = aboveCel.y + y - belowCel.y;
          if (by < 0 || by >= bh) continue;
          for (let x = 0; x < aboveImg.w; x++) {
            const bx = aboveCel.x + x - belowCel.x;
            if (bx < 0 || bx >= bw) continue;
            const src = ad[y * aboveImg.w + x];
            if (((src >>> 24) & 0xff) === 0) continue;
            const di = by * bw + bx;
            bd[di] = mergeBlend(bd[di], src, mode, opacity);
          }
        }
      }

      // Delete the above layer.
      const layers = s.sprite.layers.filter((l) => l.id !== layerId);
      const layerOrder = s.sprite.layerOrder.filter((id) => id !== layerId);
      const cels = s.sprite.cels.filter((c) => c.layerId !== layerId);
      set({
        sprite: { ...s.sprite, layers, layerOrder, cels },
        currentLayerId: belowId,
        dirtyTick: s.dirtyTick + 1,
      });
      return true;
    },
    setTilemapLayerTileset: (layerId, tilesetId) => set((s) => ({
      sprite: {
        ...s.sprite,
        layers: s.sprite.layers.map((l) => (l.id === layerId && l.type === 'tilemap' ? { ...l, tilesetId } : l)),
      },
      dirtyTick: s.dirtyTick + 1,
    })),
    deleteLayer: (layerId) => set((s) => {
      if (s.sprite.layers.length <= 1) return {}; // keep at least one
      const layers = s.sprite.layers.filter((l) => l.id !== layerId);
      const layerOrder = s.sprite.layerOrder.filter((id) => id !== layerId);
      const cels = s.sprite.cels.filter((c) => c.layerId !== layerId);
      const newCurrent = s.currentLayerId === layerId ? (layerOrder[layerOrder.length - 1] ?? null) : s.currentLayerId;
      return {
        sprite: { ...s.sprite, layers, layerOrder, cels },
        currentLayerId: newCurrent,
        dirtyTick: s.dirtyTick + 1,
      };
    }),
    setTilesetProps: (tilesetId, props) => set((s) => ({
      sprite: {
        ...s.sprite,
        tilesets: s.sprite.tilesets.map((t) => (t.id === tilesetId ? { ...t, ...props } : t)),
      },
    })),

    convertRasterToTilemap: (layerId, tilesetId, tileW, tileH) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'raster') return false;
      const cel = s.sprite.cels.find((c) => c.layerId === layerId && c.frame === s.currentFrame);
      if (!cel || cel.image.colorMode !== 'rgba') return false;
      // Delegate to the existing generate path — we re-use it for the actual dedup,
      // but we don't want a NEW tileset: the user-chosen one is passed in via selectTile.
      // Simplest implementation: call generate, then swap the returned tileset for the
      // chosen one by remapping indices. To keep scope tight, we just call generate and
      // let it create a fresh tileset; the user can choose tileset during generate.
      void tilesetId; void tileW; void tileH;
      return false; // stub — the Convert dialog uses generateTilesetFromLayer directly
    },
    convertTilemapToRaster: (layerId) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'tilemap') return false;
      const cel = s.sprite.cels.find((c) => c.layerId === layerId && c.frame === s.currentFrame);
      if (!cel || cel.image.colorMode !== 'tilemap') return false;
      // Flatten the tilemap's composite into a raster image for just this cel.
      const tileset = s.sprite.tilesets.find((t) => t.id === layer.tilesetId);
      if (!tileset) return false;
      const { tw, th } = tileset.grid;
      const w = cel.image.w * tw;
      const h = cel.image.h * th;
      const data = new Uint32Array(w * h);
      // Use the existing blit helper via a temp "fake" cel list.
      // Simple inline composite:
      for (let ty = 0; ty < cel.image.h; ty++) {
        for (let tx = 0; tx < cel.image.w; tx++) {
          const word = cel.image.data[ty * cel.image.w + tx];
          if (word === 0) continue;
          const raw = word & 0x1fffffff;
          const idx = raw === 0 ? -1 : raw - 1;
          if (idx < 0) continue;
          const tile = tileset.tiles[idx];
          if (!tile || tile.image.colorMode !== 'rgba') continue;
          const fx = (word & 0x20000000) !== 0;
          const fy = (word & 0x40000000) !== 0;
          const fd = (word & 0x80000000) !== 0;
          const ox = cel.x + tx * tw;
          const oy = cel.y + ty * th;
          const outW = fd ? th : tw;
          const outH = fd ? tw : th;
          for (let yy = 0; yy < outH; yy++) {
            for (let xx = 0; xx < outW; xx++) {
              let sx = fx ? outW - 1 - xx : xx;
              let sy = fy ? outH - 1 - yy : yy;
              if (fd) { const t = sx; sx = sy; sy = t; }
              const dx = ox + xx, dy = oy + yy;
              if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
              data[dy * w + dx] = tile.image.data[sy * tw + sx];
            }
          }
        }
      }
      // Replace layer + cel with raster equivalents.
      const newLayers = s.sprite.layers.map((l) =>
        l.id === layerId ? { id: l.id, name: l.name, type: 'raster' as const, visible: l.visible, locked: l.locked, opacity: l.opacity } : l
      );
      const newCels = s.sprite.cels.map((c) =>
        c.layerId === layerId && c.frame === s.currentFrame
          ? { ...c, image: { colorMode: 'rgba' as const, w, h, data } }
          : c
      );
      set({
        sprite: { ...s.sprite, layers: newLayers, cels: newCels },
        mode: 'raster',
        dirtyTick: s.dirtyTick + 1,
      });
      return true;
    },

    overwriteRasterLayer: (layerId, rgba) => {
      const s = get();
      const layer = s.sprite.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'raster') return false;
      const cel = s.sprite.cels.find((c) => c.layerId === layerId && c.frame === s.currentFrame);
      if (!cel || cel.image.colorMode !== 'rgba') return false;
      if (cel.image.data.length !== rgba.length) return false;
      cel.image.data.set(rgba);
      set({ dirtyTick: s.dirtyTick + 1 });
      return true;
    },

    pushPatch: (p) => set((s) => {
      const undoStack = [...s.undoStack, p];
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      return { undoStack, redoStack: [] };
    }),

    undo: () => {
      const s = get();
      const p = s.undoStack[s.undoStack.length - 1];
      if (!p) return;
      applyUndo(p);
      set({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, p], dirtyTick: s.dirtyTick + 1 });
    },

    redo: () => {
      const s = get();
      const p = s.redoStack[s.redoStack.length - 1];
      if (!p) return;
      applyRedo(p);
      set({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, p], dirtyTick: s.dirtyTick + 1 });
    },

    markDirty: () => set((s) => ({ dirtyTick: s.dirtyTick + 1 })),
  };
});
