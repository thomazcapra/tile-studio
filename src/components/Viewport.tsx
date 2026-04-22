import { useEffect, useRef } from 'react';
import { useEditorStore, type ToolId } from '../store/editor';
import { compositeFrame, drawCheckerboard, imageRGBAToImageData } from '../render/composite';
import { TOOLS } from '../tools/tools';
import type { ToolSession } from '../tools/types';
import { lineEach } from '../render/image-ops';
import { makeTileWord, TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, type Sprite } from '../model/types';
import type { PixelPatch } from '../store/history';

// Build a tinted ghost canvas for a frame (used by onion skin).
function buildOnionCanvas(sprite: Sprite, frame: number, tint: string): HTMLCanvasElement {
  const img = compositeFrame(sprite, frame);
  const c = document.createElement('canvas');
  c.width = sprite.w;
  c.height = sprite.h;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(img, 0, 0);
  // Tint: fill with tint using 'source-in' so only opaque pixels pick up the hue.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, 0, sprite.w, sprite.h);
  ctx.restore();
  return c;
}

interface TilemapCtx {
  tilesetId: string;
  celId: string;
  tilemapData: Uint32Array;
  mapW: number; mapH: number;
  tw: number; th: number;
}

function getTilemapCtx(): TilemapCtx | null {
  const s = useEditorStore.getState();
  if (s.mode !== 'tilemap') return null;
  const layer = s.sprite.layers.find((l) => l.id === s.currentLayerId);
  if (!layer || layer.type !== 'tilemap') return null;
  const tileset = s.sprite.tilesets.find((t) => t.id === layer.tilesetId);
  if (!tileset) return null;
  const cel = s.sprite.cels.find((c) => c.layerId === layer.id && c.frame === s.currentFrame);
  if (!cel || cel.image.colorMode !== 'tilemap') return null;
  return {
    tilesetId: tileset.id,
    celId: cel.id,
    tilemapData: cel.image.data,
    mapW: cel.image.w,
    mapH: cel.image.h,
    tw: tileset.grid.tw,
    th: tileset.grid.th,
  };
}

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const panRef = useRef<{ dragging: boolean; lastX: number; lastY: number } | null>(null);
  const strokeRef = useRef<{ session: ToolSession; lastPx: number; lastPy: number } | null>(null);
  const tileStrokeRef = useRef<{
    patch: PixelPatch;
    lastTx: number; lastTy: number;
    word: number;
  } | null>(null);
  const selectionDragRef = useRef<{ kind: 'rect' | 'ellipse'; x0: number; y0: number; x1: number; y1: number; mode: 'replace' | 'add' | 'subtract' | 'intersect' } | null>(null);
  const lassoRef = useRef<{ points: [number, number][]; mode: 'replace' | 'add' | 'subtract' | 'intersect' } | null>(null);
  // Animated dashOffset for marching-ants marquee (kept in a ref to avoid React churn).
  const antsRef = useRef(0);

  const sprite = useEditorStore((s) => s.sprite);
  const frame = useEditorStore((s) => s.currentFrame);
  const mode = useEditorStore((s) => s.mode);
  const selectedTile = useEditorStore((s) => s.selectedTile);
  const brushFlipFlags = useEditorStore((s) => s.brushFlipFlags);
  const currentLayerId = useEditorStore((s) => s.currentLayerId);
  const viewport = useEditorStore((s) => s.viewport);
  const tool = useEditorStore((s) => s.tool);
  const cursor = useEditorStore((s) => s.cursor);
  const dirtyTick = useEditorStore((s) => s.dirtyTick);
  const selection = useEditorStore((s) => s.selection);
  const tiledMode = useEditorStore((s) => s.tiledMode);
  const showTileNumbers = useEditorStore((s) => s.showTileNumbers);
  const onionSkinEnabled = useEditorStore((s) => s.onionSkinEnabled);
  const onionSkinPrev = useEditorStore((s) => s.onionSkinPrev);
  const onionSkinNext = useEditorStore((s) => s.onionSkinNext);
  const onionSkinOpacity = useEditorStore((s) => s.onionSkinOpacity);
  const setCursor = useEditorStore((s) => s.setCursor);
  const zoomBy = useEditorStore((s) => s.zoomBy);
  const setPan = useEditorStore((s) => s.setPan);
  const resetView = useEditorStore((s) => s.resetView);

  const dims = useEditorStore.getState().editTargetDims();

  // (Re)build offscreen bitmap for current edit target.
  useEffect(() => {
    const { w, h } = useEditorStore.getState().editTargetDims();
    const off = offscreenRef.current ?? document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d')!;
    if (mode === 'tile' && selectedTile) {
      const ts = sprite.tilesets.find((t) => t.id === selectedTile.tilesetId);
      const tile = ts?.tiles[selectedTile.index];
      if (tile && tile.image.colorMode === 'rgba') {
        ctx.putImageData(imageRGBAToImageData(tile.image), 0, 0);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    } else {
      ctx.putImageData(compositeFrame(sprite, frame), 0, 0);
    }
    offscreenRef.current = off;
    draw();
  }, [sprite, frame, dirtyTick, mode, selectedTile, currentLayerId]);

  useEffect(() => { draw(); }, [viewport, cursor, brushFlipFlags, selectedTile, tiledMode, showTileNumbers, onionSkinEnabled, onionSkinPrev, onionSkinNext, onionSkinOpacity, selection]);

  // Marching-ants animation: run while a selection exists.
  useEffect(() => {
    if (!selection) return;
    let raf = 0;
    const tick = () => {
      antsRef.current = (antsRef.current + 0.5) % 16;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!selection]);

  useEffect(() => {
    const c = canvasRef.current!;
    const parent = c.parentElement!;
    const ro = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect();
      c.width = Math.floor(rect.width * devicePixelRatio);
      c.height = Math.floor(rect.height * devicePixelRatio);
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
      if (viewport.panX === 0 && viewport.panY === 0) {
        resetView(rect.width, rect.height);
      } else {
        draw();
      }
    });
    ro.observe(parent);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const c = canvasRef.current;
    const off = offscreenRef.current;
    if (!c || !off) return;
    const { w, h } = useEditorStore.getState().editTargetDims();
    const ctx = c.getContext('2d')!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.imageSmoothingEnabled = false;
    const { zoom, panX, panY } = viewport;
    const dw = w * zoom, dh = h * zoom;
    drawCheckerboard(ctx, panX, panY, dw, dh);

    // Onion skin — draw ghost copies of neighbouring frames UNDER the current frame.
    if (onionSkinEnabled && mode !== 'tile' && sprite.frames.length > 1) {
      ctx.save();
      // Previous frames (tinted toward red).
      for (let k = onionSkinPrev; k >= 1; k--) {
        const fi = frame - k;
        if (fi < 0) continue;
        const ghost = buildOnionCanvas(sprite, fi, '#ff2e63');
        ctx.globalAlpha = Math.max(0.05, onionSkinOpacity * (1 - (k - 1) / Math.max(1, onionSkinPrev) * 0.5));
        ctx.drawImage(ghost, panX, panY, dw, dh);
      }
      // Next frames (tinted toward blue).
      for (let k = onionSkinNext; k >= 1; k--) {
        const fi = frame + k;
        if (fi >= sprite.frames.length) continue;
        const ghost = buildOnionCanvas(sprite, fi, '#3b82f6');
        ctx.globalAlpha = Math.max(0.05, onionSkinOpacity * (1 - (k - 1) / Math.max(1, onionSkinNext) * 0.5));
        ctx.drawImage(ghost, panX, panY, dw, dh);
      }
      ctx.restore();
    }

    ctx.drawImage(off, panX, panY, dw, dh);

    // Tiled-mode ghost copies so users can check for seams.
    if (tiledMode !== 'none' && mode !== 'tile') {
      const offsets: [number, number][] = [];
      const tX = tiledMode === 'x' || tiledMode === 'both';
      const tY = tiledMode === 'y' || tiledMode === 'both';
      if (tX) offsets.push([-1, 0], [1, 0]);
      if (tY) offsets.push([0, -1], [0, 1]);
      if (tX && tY) offsets.push([-1, -1], [1, -1], [-1, 1], [1, 1]);
      ctx.save();
      ctx.globalAlpha = 0.55;
      for (const [ox, oy] of offsets) {
        ctx.drawImage(off, panX + ox * dw, panY + oy * dh, dw, dh);
      }
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(panX - 0.5, panY - 0.5, dw + 1, dh + 1);

    // Grid (pixel-level).
    if (zoom >= 12 && mode !== 'tilemap') {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const gx = Math.round(panX + x * zoom) + 0.5;
        ctx.moveTo(gx, panY); ctx.lineTo(gx, panY + dh);
      }
      for (let y = 0; y <= h; y++) {
        const gy = Math.round(panY + y * zoom) + 0.5;
        ctx.moveTo(panX, gy); ctx.lineTo(panX + dw, gy);
      }
      ctx.stroke();
    }

    // Tilemap grid overlay.
    const tCtx = getTilemapCtx();
    if (tCtx) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      for (let tx = 0; tx <= tCtx.mapW; tx++) {
        const gx = Math.round(panX + tx * tCtx.tw * zoom) + 0.5;
        ctx.moveTo(gx, panY); ctx.lineTo(gx, panY + tCtx.mapH * tCtx.th * zoom);
      }
      for (let ty = 0; ty <= tCtx.mapH; ty++) {
        const gy = Math.round(panY + ty * tCtx.th * zoom) + 0.5;
        ctx.moveTo(panX, gy); ctx.lineTo(panX + tCtx.mapW * tCtx.tw * zoom, gy);
      }
      ctx.stroke();

      // Tile-number overlay (only readable when zoomed in).
      if (showTileNumbers && tCtx.tw * zoom >= 18) {
        ctx.save();
        ctx.font = `${Math.max(9, Math.round(tCtx.tw * zoom * 0.25))}px ui-monospace, Consolas, monospace`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 2;
        ctx.fillStyle = '#fff';
        for (let ty = 0; ty < tCtx.mapH; ty++) {
          for (let tx = 0; tx < tCtx.mapW; tx++) {
            const word = tCtx.tilemapData[ty * tCtx.mapW + tx];
            if (word === 0) continue;
            const raw = word & 0x1fffffff;
            const idx = raw - 1; // 0-based tileset index
            ctx.fillText(String(idx), panX + tx * tCtx.tw * zoom + 2, panY + ty * tCtx.th * zoom + 2);
          }
        }
        ctx.restore();
      }

      // Ghost brush preview at cursor.
      if (cursor.inside && selectedTile) {
        const tx = Math.floor(cursor.px / tCtx.tw);
        const ty = Math.floor(cursor.py / tCtx.th);
        const bx = panX + tx * tCtx.tw * zoom;
        const by = panY + ty * tCtx.th * zoom;
        drawGhostTile(ctx, bx, by, tCtx.tw, tCtx.th, zoom, selectedTile.tilesetId, selectedTile.index, brushFlipFlags);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 1, by + 1, tCtx.tw * zoom - 2, tCtx.th * zoom - 2);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 0.5, by - 0.5, tCtx.tw * zoom + 1, tCtx.th * zoom + 1);
      }
    } else if (cursor.inside) {
      // Pixel cursor outline.
      const cx = panX + cursor.px * zoom;
      const cy = panY + cursor.py * zoom;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, zoom - 1, zoom - 1);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(cx - 0.5, cy - 0.5, zoom + 1, zoom + 1);
    }

    // Selection marching ants (drawn last so they're always visible).
    if (selection) {
      drawSelectionAnts(ctx, selection.mask, selection.w, selection.h, panX, panY, zoom, antsRef.current);
    }

    // Rubber-band rectangle/ellipse while dragging a selection.
    const dr = selectionDragRef.current;
    if (dr) {
      const x0 = Math.min(dr.x0, dr.x1);
      const y0 = Math.min(dr.y0, dr.y1);
      const x1 = Math.max(dr.x0, dr.x1);
      const y1 = Math.max(dr.y0, dr.y1);
      const rx = panX + x0 * zoom;
      const ry = panY + y0 * zoom;
      const rw = (x1 - x0 + 1) * zoom;
      const rh = (y1 - y0 + 1) * zoom;
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -antsRef.current;
      if (dr.kind === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
      }
      ctx.restore();
    }
    // Lasso polyline in progress.
    const la = lassoRef.current;
    if (la && la.points.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -antsRef.current;
      ctx.beginPath();
      ctx.moveTo(panX + la.points[0][0] * zoom, panY + la.points[0][1] * zoom);
      for (let i = 1; i < la.points.length; i++) {
        ctx.lineTo(panX + la.points[i][0] * zoom, panY + la.points[i][1] * zoom);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawSelectionAnts(ctx: CanvasRenderingContext2D, mask: Uint8Array, w: number, h: number, panX: number, panY: number, zoom: number, offset: number) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    const edges: [number, number, number, number][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x] === 0) continue;
        const left = x === 0 || mask[y * w + (x - 1)] === 0;
        const right = x === w - 1 || mask[y * w + (x + 1)] === 0;
        const top = y === 0 || mask[(y - 1) * w + x] === 0;
        const bottom = y === h - 1 || mask[(y + 1) * w + x] === 0;
        const px = panX + x * zoom;
        const py = panY + y * zoom;
        if (left)   edges.push([px, py, px, py + zoom]);
        if (right)  edges.push([px + zoom, py, px + zoom, py + zoom]);
        if (top)    edges.push([px, py, px + zoom, py]);
        if (bottom) edges.push([px, py + zoom, px + zoom, py + zoom]);
      }
    }
    ctx.strokeStyle = '#000';
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of edges) { ctx.moveTo(x0 + 0.5, y0 + 0.5); ctx.lineTo(x1 + 0.5, y1 + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineDashOffset = -offset;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of edges) { ctx.moveTo(x0 + 0.5, y0 + 0.5); ctx.lineTo(x1 + 0.5, y1 + 0.5); }
    ctx.stroke();
    ctx.restore();
  }

  function drawGhostTile(
    ctx: CanvasRenderingContext2D,
    bx: number, by: number,
    tw: number, th: number,
    zoom: number,
    tilesetId: string, tileIndex: number,
    flipFlags: number
  ) {
    const s = useEditorStore.getState();
    const ts = s.sprite.tilesets.find((t) => t.id === tilesetId);
    const tile = ts?.tiles[tileIndex];
    if (!tile || tile.image.colorMode !== 'rgba') return;
    const tmp = document.createElement('canvas');
    tmp.width = tw; tmp.height = th;
    tmp.getContext('2d')!.putImageData(imageRGBAToImageData(tile.image), 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.translate(bx + (tw * zoom) / 2, by + (th * zoom) / 2);
    const fx = (flipFlags & TILE_FLIP_X) !== 0;
    const fy = (flipFlags & TILE_FLIP_Y) !== 0;
    const fd = (flipFlags & TILE_FLIP_D) !== 0;
    if (fd) ctx.rotate(Math.PI / 2);
    ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
    ctx.drawImage(tmp, -(tw * zoom) / 2, -(th * zoom) / 2, tw * zoom, th * zoom);
    ctx.restore();
  }

  function toSpritePixel(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    const vx = clientX - rect.left, vy = clientY - rect.top;
    const { zoom, panX, panY } = viewport;
    let x = Math.floor((vx - panX) / zoom);
    let y = Math.floor((vy - panY) / zoom);
    const state = useEditorStore.getState();
    if (state.snapToGrid) {
      const ts = state.sprite.tilesets[0];
      const gw = ts?.grid.tw ?? 8;
      const gh = ts?.grid.th ?? 8;
      x = Math.floor(x / gw) * gw;
      y = Math.floor(y / gh) * gh;
    }
    return { x, y };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    zoomBy(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
  }

  // --- Tilemap paint helpers ---
  function paintTileAt(tCtx: TilemapCtx, tx: number, ty: number, word: number) {
    if (tx < 0 || ty < 0 || tx >= tCtx.mapW || ty >= tCtx.mapH) return;
    const i = ty * tCtx.mapW + tx;
    const str = tileStrokeRef.current!;
    const old = tCtx.tilemapData[i];
    if (old === word) return;
    if (!str.patch.oldColors.has(i)) str.patch.oldColors.set(i, old);
    tCtx.tilemapData[i] = word;
    str.patch.newColors.set(i, word);
  }

  function beginTileStroke(tCtx: TilemapCtx, tx: number, ty: number, button: 0 | 2) {
    const s = useEditorStore.getState();
    let word = 0;
    if (button === 0) {
      if (!s.selectedTile || s.selectedTile.tilesetId !== tCtx.tilesetId) return;
      word = makeTileWord(s.selectedTile.index, s.brushFlipFlags);
    }
    tileStrokeRef.current = {
      patch: {
        type: 'pixel',
        celId: tCtx.celId,
        imageRef: { data: tCtx.tilemapData, w: tCtx.mapW, h: tCtx.mapH },
        imageOffsetX: 0,
        imageOffsetY: 0,
        oldColors: new Map(),
        newColors: new Map(),
        label: button === 0 ? 'Place Tile' : 'Erase Tile',
      },
      lastTx: tx, lastTy: ty,
      word,
    };
    paintTileAt(tCtx, tx, ty, word);
    s.markDirty();
  }

  function continueTileStroke(tCtx: TilemapCtx, tx: number, ty: number) {
    const str = tileStrokeRef.current;
    if (!str) return;
    if (tx === str.lastTx && ty === str.lastTy) return;
    lineEach(str.lastTx, str.lastTy, tx, ty, (x, y) => paintTileAt(tCtx, x, y, str.word));
    str.lastTx = tx; str.lastTy = ty;
    useEditorStore.getState().markDirty();
  }

  function endTileStroke() {
    const str = tileStrokeRef.current;
    if (!str) return;
    if (str.patch.newColors.size > 0) useEditorStore.getState().pushPatch(str.patch);
    tileStrokeRef.current = null;
    useEditorStore.getState().markDirty();
  }

  // --- Raster paint (existing) ---
  function beginStroke(e: React.MouseEvent, button: 0 | 2) {
    const { x, y } = toSpritePixel(e.clientX, e.clientY);
    const s = useEditorStore.getState();
    const img = s.activeImage();
    if (!img) return;
    const cel = s.activeCel();
    const celId = cel?.id ?? 'tile';
    const currentTool = TOOLS[s.tool] ?? TOOLS.pencil;
    if (currentTool.id === 'eyedropper') {
      if (x >= 0 && y >= 0 && x < img.w && y < img.h) {
        const picked = img.data[y * img.w + x];
        if (button === 2) s.setSecondary(picked);
        else s.setPrimary(picked);
      }
      return;
    }
    const session = currentTool.begin(
      {
        image: img,
        celId,
        primary: s.primary,
        secondary: s.secondary,
        button,
        celX: cel?.x ?? 0,
        celY: cel?.y ?? 0,
        selectionMask: s.selection?.mask,
        spriteW: s.sprite.w,
        spriteH: s.sprite.h,
        brushSize: s.brushSize,
        pixelPerfect: s.pixelPerfect,
        symmetryMode: s.symmetryMode,
      },
      x, y
    );
    strokeRef.current = { session, lastPx: x, lastPy: y };
    s.markDirty();
  }

  function continueStroke(e: React.MouseEvent) {
    const str = strokeRef.current;
    if (!str) return;
    const { x, y } = toSpritePixel(e.clientX, e.clientY);
    if (x === str.lastPx && y === str.lastPy) return;
    lineEach(str.lastPx, str.lastPy, x, y, (px, py) => str.session.move(px, py));
    str.lastPx = x; str.lastPy = y;
    useEditorStore.getState().markDirty();
  }

  function endStroke() {
    const str = strokeRef.current;
    if (!str) return;
    const patch = str.session.end();
    if (patch) useEditorStore.getState().pushPatch(patch);
    strokeRef.current = null;
    useEditorStore.getState().markDirty();
  }

  // --- Event handlers ---
  function onMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      panRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();

    const storeTool = useEditorStore.getState().tool;

    // Selection tools bypass the paint pipeline.
    if (storeTool === 'select-rect' || storeTool === 'select-ellipse') {
      const { x, y } = toSpritePixel(e.clientX, e.clientY);
      const mode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : (e.ctrlKey && e.shiftKey) ? 'intersect' : 'replace';
      selectionDragRef.current = { kind: storeTool === 'select-ellipse' ? 'ellipse' : 'rect', x0: x, y0: y, x1: x, y1: y, mode };
      draw();
      return;
    }
    if (storeTool === 'select-lasso') {
      const { x, y } = toSpritePixel(e.clientX, e.clientY);
      const mode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';
      lassoRef.current = { points: [[x + 0.5, y + 0.5]], mode };
      draw();
      return;
    }
    if (storeTool === 'select-wand') {
      const { x, y } = toSpritePixel(e.clientX, e.clientY);
      const mode = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';
      useEditorStore.getState().selectByColor(x, y, 0, mode);
      return;
    }

    const tCtx = getTilemapCtx();
    if (tCtx) {
      const { x, y } = toSpritePixel(e.clientX, e.clientY);
      beginTileStroke(tCtx, Math.floor(x / tCtx.tw), Math.floor(y / tCtx.th), e.button as 0 | 2);
    } else {
      beginStroke(e, e.button as 0 | 2);
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const p = panRef.current;
    if (p?.dragging) {
      setPan(viewport.panX + (e.clientX - p.lastX), viewport.panY + (e.clientY - p.lastY));
      p.lastX = e.clientX; p.lastY = e.clientY;
      return;
    }
    const { x, y } = toSpritePixel(e.clientX, e.clientY);
    const inside = x >= 0 && y >= 0 && x < dims.w && y < dims.h;
    if (x !== cursor.px || y !== cursor.py || inside !== cursor.inside) {
      setCursor({ px: x, py: y, inside });
    }
    // Selection drag — update rubber band.
    if (selectionDragRef.current) {
      selectionDragRef.current.x1 = x;
      selectionDragRef.current.y1 = y;
      draw();
      return;
    }
    // Lasso: append a point when the cursor moves to a new pixel.
    if (lassoRef.current) {
      const pts = lassoRef.current.points;
      const last = pts[pts.length - 1];
      const nx = x + 0.5, ny = y + 0.5;
      if (last[0] !== nx || last[1] !== ny) pts.push([nx, ny]);
      draw();
      return;
    }
    const tCtx = getTilemapCtx();
    if (tCtx && tileStrokeRef.current) {
      continueTileStroke(tCtx, Math.floor(x / tCtx.tw), Math.floor(y / tCtx.th));
    } else {
      continueStroke(e);
    }
  }

  function commitSelectionDrag() {
    const d = selectionDragRef.current;
    if (d) {
      const x0 = Math.min(d.x0, d.x1);
      const y0 = Math.min(d.y0, d.y1);
      const x1 = Math.max(d.x0, d.x1);
      const y1 = Math.max(d.y0, d.y1);
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      const s = useEditorStore.getState();
      if (w <= 1 && h <= 1 && d.mode === 'replace') {
        s.deselect();
      } else if (d.kind === 'ellipse') {
        s.selectEllipse(x0, y0, w, h, d.mode);
      } else {
        s.selectRect(x0, y0, w, h, d.mode);
      }
      selectionDragRef.current = null;
      draw();
    }
    const l = lassoRef.current;
    if (l) {
      const pts = l.points;
      if (pts.length < 3 && l.mode === 'replace') {
        useEditorStore.getState().deselect();
      } else if (pts.length >= 3) {
        useEditorStore.getState().selectPolygon(pts, l.mode);
      }
      lassoRef.current = null;
      draw();
    }
  }

  function onMouseUp() {
    panRef.current = null;
    commitSelectionDrag();
    endStroke();
    endTileStroke();
  }

  function onMouseLeave() {
    panRef.current = null;
    commitSelectionDrag();
    endStroke();
    endTileStroke();
    if (cursor.inside) setCursor({ ...cursor, inside: false });
  }

  const cursorCss = getTilemapCtx() ? 'crosshair' : (TOOLS[tool as ToolId] ?? TOOLS.pencil).cursor ?? 'default';

  return (
    <div className="relative flex-1 bg-[#121212] overflow-hidden" data-testid="viewport-container">
      <canvas
        ref={canvasRef}
        data-testid="viewport-canvas"
        className="block"
        style={{ cursor: cursorCss }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      <ViewportHud />
      <EditTargetBadge />
      <BrushFlipsHud />
    </div>
  );
}

function EditTargetBadge() {
  const mode = useEditorStore((s) => s.mode);
  const selectedTile = useEditorStore((s) => s.selectedTile);
  const currentLayerId = useEditorStore((s) => s.currentLayerId);
  const sprite = useEditorStore((s) => s.sprite);
  if (mode === 'tile' && selectedTile) {
    const ts = sprite.tilesets.find((t) => t.id === selectedTile.tilesetId);
    return (
      <div className="absolute top-2 left-2 px-2.5 py-1 rounded-md bg-accent/20 text-accent text-[11px] font-mono pointer-events-none border border-accent/40" data-testid="edit-target-badge">
        Editing {ts?.name ?? 'Tileset'} · Tile #{selectedTile.index}
      </div>
    );
  }
  if (mode === 'tilemap') {
    const layer = sprite.layers.find((l) => l.id === currentLayerId);
    if (!layer || layer.type !== 'tilemap') return null;
    return (
      <div className="absolute top-2 left-2 px-2.5 py-1 rounded-md bg-accent/20 text-accent text-[11px] font-mono pointer-events-none border border-accent/40" data-testid="edit-target-badge">
        Painting {layer.name}
      </div>
    );
  }
  return null;
}

function BrushFlipsHud() {
  const mode = useEditorStore((s) => s.mode);
  const flags = useEditorStore((s) => s.brushFlipFlags);
  const toggle = useEditorStore((s) => s.toggleBrushFlip);
  if (mode !== 'tilemap') return null;
  const active = (flag: number) => (flags & flag) !== 0;
  const pillCls = (on: boolean) => `px-2 py-0.5 rounded font-mono text-[10px] ${on ? 'bg-accent text-white' : 'bg-panel2 text-ink/70 hover:text-white'}`;
  return (
    <div className="absolute top-2 right-2 flex gap-1 items-center px-2 py-1 rounded-md bg-black/60 backdrop-blur border border-white/5 text-[11px]" data-testid="flips-hud">
      <span className="text-ink/50 mr-1">Flip:</span>
      <button data-testid="flip-x" onClick={() => toggle('x')} className={pillCls(active(TILE_FLIP_X))} title="Flip X (F)">H</button>
      <button data-testid="flip-y" onClick={() => toggle('y')} className={pillCls(active(TILE_FLIP_Y))} title="Flip Y (V)">V</button>
      <button data-testid="flip-d" onClick={() => toggle('d')} className={pillCls(active(TILE_FLIP_D))} title="Flip D / rotate (R)">D</button>
    </div>
  );
}

function ViewportHud() {
  const zoom = useEditorStore((s) => s.viewport.zoom);
  const mode = useEditorStore((s) => s.mode);
  const selectedTile = useEditorStore((s) => s.selectedTile);
  const sprite = useEditorStore((s) => s.sprite);
  const cursor = useEditorStore((s) => s.cursor);
  let w = sprite.w, h = sprite.h, extra = '';
  if (mode === 'tile' && selectedTile) {
    const ts = sprite.tilesets.find((t) => t.id === selectedTile.tilesetId);
    if (ts) { w = ts.grid.tw; h = ts.grid.th; }
  }
  if (mode === 'tilemap' && cursor.inside) {
    const tCtx = getTilemapCtx();
    if (tCtx) extra = ` · tile ${Math.floor(cursor.px / tCtx.tw)},${Math.floor(cursor.py / tCtx.th)}`;
  }
  return (
    <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur text-[11px] font-mono pointer-events-none border border-white/5">
      <span data-testid="hud-zoom">{Math.round(zoom * 100) / 100}×</span>
      <span className="mx-2 text-white/30">·</span>
      <span data-testid="hud-size">{w}×{h}</span>
      {cursor.inside && (
        <>
          <span className="mx-2 text-white/30">·</span>
          <span data-testid="hud-cursor">{cursor.px},{cursor.py}{extra}</span>
        </>
      )}
    </div>
  );
}
