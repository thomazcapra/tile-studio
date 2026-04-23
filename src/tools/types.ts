import type { ImageRGBA } from '../model/types';
import type { PixelPatch } from '../store/history';

export interface ToolContext {
  image: ImageRGBA;
  celId: string;
  primary: number;
  secondary: number;
  button: 0 | 2;
  // Sprite-space origin of the cel's image (for mask translation).
  celX: number;
  celY: number;
  // Optional selection mask restricting which sprite pixels the tool may touch.
  selectionMask?: Uint8Array;
  spriteW?: number;
  spriteH?: number;
  // Brush configuration (pencil, eraser).
  brushSize: number;        // 1 = single pixel, N = square of N×N
  pixelPerfect: boolean;    // skip double-pixels on diagonals
  symmetryMode: 'none' | 'h' | 'v' | 'both';
  // Optional custom brush — if set, pencil stamps this shape instead of a solid square.
  customBrush?: { w: number; h: number; data: Uint32Array; mask: Uint8Array } | null;
}

export interface ToolSession {
  /** Called on every mouse move (including initial down) with integer sprite-pixel coords. */
  move(x: number, y: number): void;
  /** Called when mouse released; returns patch to push (or null if no-op). */
  end(): PixelPatch | null;
  /** If true, each move should trigger viewport redraw. */
  live: boolean;
}

export interface Tool {
  id: string;
  shortcut?: string;
  label: string;
  cursor?: string;
  begin(ctx: ToolContext, x: number, y: number): ToolSession;
}

// Helper: create a PixelPatch recording diffs for a stroke, with optional mask enforcement.
export function newStrokePatch(ctx: ToolContext, label: string): PixelPatch {
  return {
    type: 'pixel',
    celId: ctx.celId,
    imageRef: ctx.image,
    imageOffsetX: ctx.celX,
    imageOffsetY: ctx.celY,
    selectionMask: ctx.selectionMask,
    maskW: ctx.spriteW,
    maskH: ctx.spriteH,
    oldColors: new Map(),
    newColors: new Map(),
    label,
  };
}

export function recordSet(patch: PixelPatch, i: number, newColor: number) {
  // Mask check: convert linear `i` back to (x, y) in the image, translate to sprite coords,
  // and reject if outside the selection.
  if (patch.selectionMask && patch.maskW && patch.maskH) {
    const w = patch.imageRef.w;
    const x = i % w;
    const y = (i / w) | 0;
    const sx = patch.imageOffsetX + x;
    const sy = patch.imageOffsetY + y;
    if (sx < 0 || sy < 0 || sx >= patch.maskW || sy >= patch.maskH) return;
    if (patch.selectionMask[sy * patch.maskW + sx] === 0) return;
  }
  const img = patch.imageRef;
  const old = img.data[i];
  if (old === newColor) return;
  if (!patch.oldColors.has(i)) patch.oldColors.set(i, old);
  img.data[i] = newColor;
  patch.newColors.set(i, newColor);
}
