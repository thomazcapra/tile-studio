import { floodFill, lineEach, rectEach } from '../render/image-ops';
import type { PixelPatch } from '../store/history';
import { newStrokePatch, recordSet, type Tool, type ToolContext, type ToolSession } from './types';

function strokeColor(ctx: ToolContext): number {
  return ctx.button === 2 ? ctx.secondary : ctx.primary;
}

function makeLineSession(ctx: ToolContext, label: string, color: number, startX: number, startY: number): ToolSession {
  const patch = newStrokePatch(ctx, label);
  const image = ctx.image;
  const bs = Math.max(1, ctx.brushSize | 0);
  const half = Math.floor(bs / 2);
  const sym = ctx.symmetryMode;

  const plotPixel = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= image.w || y >= image.h) return;
    recordSet(patch, y * image.w + x, color);
  };
  const plotBrushOne = (x: number, y: number) => {
    if (bs === 1) { plotPixel(x, y); return; }
    for (let oy = -half; oy < bs - half; oy++) {
      for (let ox = -half; ox < bs - half; ox++) {
        plotPixel(x + ox, y + oy);
      }
    }
  };
  // Symmetry mirrors the brush around the image's central axes.
  const plotBrush = (x: number, y: number) => {
    plotBrushOne(x, y);
    const mx = image.w - 1 - x;
    const my = image.h - 1 - y;
    if (sym === 'h' || sym === 'both') plotBrushOne(mx, y);
    if (sym === 'v' || sym === 'both') plotBrushOne(x, my);
    if (sym === 'both') plotBrushOne(mx, my);
  };

  // Pixel-perfect filter — rolling window of the last 3 stamp centers. If the middle pixel
  // is "diagonal between its neighbours" (an elbow), we skip it. This matches Aseprite's PP pencil.
  const pending: Array<[number, number]> = [];
  const flush = (final: boolean) => {
    while (pending.length >= 3 || (final && pending.length >= 1)) {
      if (pending.length >= 3 && ctx.pixelPerfect) {
        const [[ax, ay], [bx, by], [cx, cy]] = pending;
        const isElbow = Math.abs(ax - cx) === 1 && Math.abs(ay - cy) === 1 && (bx === ax || bx === cx) && (by === ay || by === cy) && !(ax === cx || ay === cy);
        if (isElbow) {
          // Drop the middle pixel; keep the outer two.
          pending.splice(1, 1);
          continue;
        }
      }
      const [px, py] = pending.shift()!;
      plotBrush(px, py);
      if (pending.length < 2 && !final) break;
    }
  };
  const enqueue = (x: number, y: number) => {
    const last = pending[pending.length - 1];
    if (last && last[0] === x && last[1] === y) return;
    pending.push([x, y]);
    flush(false);
  };

  let lastX = startX, lastY = startY;
  enqueue(startX, startY);
  return {
    live: true,
    move(x, y) {
      lineEach(lastX, lastY, x, y, (px, py) => enqueue(px, py));
      lastX = x; lastY = y;
    },
    end() {
      flush(true);
      return patch.newColors.size ? patch : null;
    },
  };
}

export const pencil: Tool = {
  id: 'pencil',
  shortcut: 'b',
  label: 'Pencil',
  cursor: 'crosshair',
  begin(ctx, x, y) {
    return makeLineSession(ctx, 'Pencil', strokeColor(ctx), x, y);
  },
};

export const eraser: Tool = {
  id: 'eraser',
  shortcut: 'e',
  label: 'Eraser',
  cursor: 'crosshair',
  begin(ctx, x, y) {
    return makeLineSession(ctx, 'Eraser', 0, x, y);
  },
};

// True if the sprite-space pixel (celX+lx, celY+ly) is inside the current selection mask.
// When there is no selection, everything is "selected".
function inMask(ctx: ToolContext, lx: number, ly: number): boolean {
  if (!ctx.selectionMask || !ctx.spriteW || !ctx.spriteH) return true;
  const sx = ctx.celX + lx;
  const sy = ctx.celY + ly;
  if (sx < 0 || sy < 0 || sx >= ctx.spriteW || sy >= ctx.spriteH) return false;
  return ctx.selectionMask[sy * ctx.spriteW + sx] !== 0;
}

export const bucket: Tool = {
  id: 'bucket',
  shortcut: 'g',
  label: 'Fill',
  cursor: 'crosshair',
  begin(ctx, x, y) {
    const patch = newStrokePatch(ctx, 'Fill');
    const color = strokeColor(ctx);
    const oldMap = new Map<number, number>();
    floodFill(ctx.image, x, y, color, oldMap);
    // Merge flood-fill results into the patch — enforce selection mask per pixel.
    for (const [i, oldColor] of oldMap) {
      const lx = i % ctx.image.w, ly = (i / ctx.image.w) | 0;
      if (!inMask(ctx, lx, ly)) {
        // Revert the flood-fill write outside the selection.
        ctx.image.data[i] = oldColor;
        continue;
      }
      if (!patch.oldColors.has(i)) patch.oldColors.set(i, oldColor);
      patch.newColors.set(i, color);
    }
    return {
      live: true,
      move() { /* fill is one-shot */ },
      end(): PixelPatch | null { return patch.newColors.size ? patch : null; },
    };
  },
};

export const eyedropper: Tool = {
  id: 'eyedropper',
  shortcut: 'i',
  label: 'Eyedropper',
  cursor: 'copy',
  begin(ctx, x, y) {
    // Eyedropper doesn't mutate the image, but we still need to return a session.
    let picked = 0;
    const { w, h, data } = ctx.image;
    if (x >= 0 && y >= 0 && x < w && y < h) picked = data[y * w + x];
    return {
      live: false,
      _picked: picked,
      move(x2, y2) {
        if (x2 >= 0 && y2 >= 0 && x2 < w && y2 < h) this._picked = data[y2 * w + x2];
      },
      end() { return null; },
    } as ToolSession & { _picked: number };
  },
};

export const line: Tool = {
  id: 'line',
  shortcut: 'l',
  label: 'Line',
  cursor: 'crosshair',
  begin(ctx, x, y) {
    const patch = newStrokePatch(ctx, 'Line');
    const color = strokeColor(ctx);
    const startX = x, startY = y;
    const originalBackup = new Map<number, number>();
    const apply = (tx: number, ty: number) => {
      for (const [i, old] of originalBackup) ctx.image.data[i] = old;
      originalBackup.clear();
      lineEach(startX, startY, tx, ty, (px, py) => {
        if (px < 0 || py < 0 || px >= ctx.image.w || py >= ctx.image.h) return;
        if (!inMask(ctx, px, py)) return;
        const i = py * ctx.image.w + px;
        if (!originalBackup.has(i)) originalBackup.set(i, ctx.image.data[i]);
        ctx.image.data[i] = color;
      });
    };
    apply(x, y);
    return {
      live: true,
      move(x2, y2) { apply(x2, y2); },
      end() {
        for (const [i, old] of originalBackup) {
          patch.oldColors.set(i, old);
          patch.newColors.set(i, color);
        }
        return patch.newColors.size ? patch : null;
      },
    };
  },
};

function rectTool(id: string, label: string, shortcut: string, filled: boolean): Tool {
  return {
    id, shortcut, label,
    cursor: 'crosshair',
    begin(ctx, x, y) {
      const patch = newStrokePatch(ctx, label);
      const color = strokeColor(ctx);
      const startX = x, startY = y;
      const backup = new Map<number, number>();
      const apply = (tx: number, ty: number) => {
        for (const [i, old] of backup) ctx.image.data[i] = old;
        backup.clear();
        rectEach(startX, startY, tx, ty, (px, py) => {
          if (px < 0 || py < 0 || px >= ctx.image.w || py >= ctx.image.h) return;
          if (!inMask(ctx, px, py)) return;
          const i = py * ctx.image.w + px;
          if (!backup.has(i)) backup.set(i, ctx.image.data[i]);
          ctx.image.data[i] = color;
        }, filled);
      };
      apply(x, y);
      return {
        live: true,
        move(x2, y2) { apply(x2, y2); },
        end() {
          for (const [i, old] of backup) {
            patch.oldColors.set(i, old);
            patch.newColors.set(i, color);
          }
          return patch.newColors.size ? patch : null;
        },
      };
    },
  };
}
export const rect = rectTool('rect', 'Rectangle', 'u', false);
export const rectfill = rectTool('rectfill', 'Filled Rect', 'U', true);

// Selection tools are handled directly by the Viewport; these entries exist so the tool palette
// can surface them and shortcut bindings can switch to them via setTool.
export const selectRect: Tool = {
  id: 'select-rect',
  shortcut: 'm',
  label: 'Select',
  cursor: 'crosshair',
  begin() { return { live: false, move() {}, end: () => null }; },
};
export const selectEllipse: Tool = {
  id: 'select-ellipse',
  shortcut: 'M',
  label: 'Ellipse Select',
  cursor: 'crosshair',
  begin() { return { live: false, move() {}, end: () => null }; },
};
export const selectLasso: Tool = {
  id: 'select-lasso',
  shortcut: 'q',
  label: 'Lasso',
  cursor: 'crosshair',
  begin() { return { live: false, move() {}, end: () => null }; },
};
export const selectWand: Tool = {
  id: 'select-wand',
  shortcut: 'w',
  label: 'Magic Wand',
  cursor: 'crosshair',
  begin() { return { live: false, move() {}, end: () => null }; },
};

export const TOOLS: Record<string, Tool> = {
  pencil, eraser, bucket, eyedropper, line, rect, rectfill,
  'select-rect': selectRect, 'select-ellipse': selectEllipse, 'select-lasso': selectLasso, 'select-wand': selectWand,
};
