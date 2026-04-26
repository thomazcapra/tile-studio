import { floodFill, lineEach, rectEach } from '../render/image-ops';
import type { PixelPatch } from '../store/history';
import { newStrokePatch, recordSet, type Tool, type ToolContext, type ToolSession } from './types';

function strokeColor(ctx: ToolContext): number {
  return ctx.button === 2 ? ctx.secondary : ctx.primary;
}

function makeLineSession(ctx: ToolContext, label: string, color: number, startX: number, startY: number): ToolSession {
  const patch = newStrokePatch(ctx, label);
  const image = ctx.image;
  const baseBs = Math.max(1, ctx.brushSize | 0);
  const sym = ctx.symmetryMode;
  // Pressure scaling only fires for pen pointers, when the user pref is on, and only when
  // the base brush is bigger than 1 (a 1-px brush has no headroom to shrink).
  const pressureActive = ctx.pointerType === 'pen' && !!ctx.pressureEnabled && baseBs > 1;
  const pMin = Math.max(0.01, Math.min(1, ctx.pressureMin ?? 0.1));
  const effectiveBs = (pressure: number): number => {
    if (!pressureActive) return baseBs;
    const clamped = Math.max(pMin, Math.min(1, pressure));
    return Math.max(1, Math.round(baseBs * clamped));
  };

  const plotPixel = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= image.w || y >= image.h) return;
    recordSet(patch, y * image.w + x, color);
  };
  const plotBrushOne = (x: number, y: number, pressure: number) => {
    // Custom brush stamp — the saved data is painted relative to (x,y) centered.
    // (Pressure is intentionally ignored for custom stamps; resampling them per-stroke
    // would change the user's authored shape and surprise them.)
    if (ctx.customBrush) {
      const cb = ctx.customBrush;
      const cx = (cb.w - 1) >> 1;
      const cy = (cb.h - 1) >> 1;
      for (let yy = 0; yy < cb.h; yy++) {
        for (let xx = 0; xx < cb.w; xx++) {
          if (cb.mask[yy * cb.w + xx] === 0) continue;
          const px = x + xx - cx, py = y + yy - cy;
          if (px < 0 || py < 0 || px >= image.w || py >= image.h) continue;
          recordSet(patch, py * image.w + px, cb.data[yy * cb.w + xx]);
        }
      }
      return;
    }
    const bs = effectiveBs(pressure);
    if (bs === 1) { plotPixel(x, y); return; }
    const half = Math.floor(bs / 2);
    for (let oy = -half; oy < bs - half; oy++) {
      for (let ox = -half; ox < bs - half; ox++) {
        plotPixel(x + ox, y + oy);
      }
    }
  };
  // Symmetry mirrors the brush around the image's central axes.
  const plotBrush = (x: number, y: number, pressure: number) => {
    plotBrushOne(x, y, pressure);
    const mx = image.w - 1 - x;
    const my = image.h - 1 - y;
    if (sym === 'h' || sym === 'both') plotBrushOne(mx, y, pressure);
    if (sym === 'v' || sym === 'both') plotBrushOne(x, my, pressure);
    if (sym === 'both') plotBrushOne(mx, my, pressure);
  };

  // Pixel-perfect filter — rolling window of the last 3 stamp centers. If the middle pixel
  // is "diagonal between its neighbours" (an elbow), we skip it. This matches Aseprite's PP pencil.
  // Each entry carries its own pressure so the brush size is computed at draw time, not enqueue time.
  const pending: Array<[number, number, number]> = [];
  const flush = (final: boolean) => {
    while (pending.length >= 3 || (final && pending.length >= 1)) {
      if (pending.length >= 3 && ctx.pixelPerfect) {
        const a = pending[0], b = pending[1], c = pending[2];
        const isElbow = Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1 && (b[0] === a[0] || b[0] === c[0]) && (b[1] === a[1] || b[1] === c[1]) && !(a[0] === c[0] || a[1] === c[1]);
        if (isElbow) {
          // Drop the middle pixel; keep the outer two.
          pending.splice(1, 1);
          continue;
        }
      }
      const [px, py, pp] = pending.shift()!;
      plotBrush(px, py, pp);
      if (pending.length < 2 && !final) break;
    }
  };
  const enqueue = (x: number, y: number, pressure: number) => {
    const last = pending[pending.length - 1];
    if (last && last[0] === x && last[1] === y) return;
    pending.push([x, y, pressure]);
    flush(false);
  };

  let lastX = startX, lastY = startY;
  let lastPressure = ctx.pressure ?? 1;
  enqueue(startX, startY, lastPressure);
  return {
    live: true,
    move(x, y, pressure) {
      const pp = pressure ?? lastPressure;
      lineEach(lastX, lastY, x, y, (px, py) => enqueue(px, py, pp));
      lastX = x; lastY = y;
      lastPressure = pp;
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

// Linear A→B gradient between primary (at A) and secondary (at B).
export const gradient: Tool = {
  id: 'gradient',
  shortcut: 'd',
  label: 'Gradient',
  cursor: 'crosshair',
  begin(ctx, x, y) {
    const patch = newStrokePatch(ctx, 'Gradient');
    const image = ctx.image;
    const a = ctx.primary, b = ctx.secondary;
    const [ar, ag, ab, aa] = [a & 0xff, (a >>> 8) & 0xff, (a >>> 16) & 0xff, (a >>> 24) & 0xff];
    const [br, bg, bb, ba] = [b & 0xff, (b >>> 8) & 0xff, (b >>> 16) & 0xff, (b >>> 24) & 0xff];
    const startX = x, startY = y;
    const backup = new Map<number, number>();
    const apply = (tx: number, ty: number) => {
      for (const [i, old] of backup) image.data[i] = old;
      backup.clear();
      const vx = tx - startX, vy = ty - startY;
      const len2 = vx * vx + vy * vy;
      if (len2 === 0) return;
      for (let yy = 0; yy < image.h; yy++) {
        for (let xx = 0; xx < image.w; xx++) {
          if (!inMask(ctx, xx, yy)) continue;
          const dx = xx - startX, dy = yy - startY;
          let t = (dx * vx + dy * vy) / len2;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          const r = Math.round(ar + (br - ar) * t);
          const g = Math.round(ag + (bg - ag) * t);
          const bch = Math.round(ab + (bb - ab) * t);
          const al = Math.round(aa + (ba - aa) * t);
          const i = yy * image.w + xx;
          if (!backup.has(i)) backup.set(i, image.data[i]);
          image.data[i] = (((al & 0xff) << 24) | ((bch & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
        }
      }
    };
    apply(x + 1, y); // avoid zero-length on initial click
    return {
      live: true,
      move(x2, y2) { apply(x2, y2); },
      end() {
        for (const [i, old] of backup) {
          const newColor = image.data[i];
          if (old === newColor) continue;
          patch.oldColors.set(i, old);
          patch.newColors.set(i, newColor);
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

// The text tool is dialog-based: it just switches to a mode where clicking the canvas opens the
// TextDialog. No session-level pixel work is done here.
export const textTool: Tool = {
  id: 'text',
  shortcut: 't',
  label: 'Text',
  cursor: 'text',
  begin() { return { live: false, move() {}, end: () => null }; },
};

export const TOOLS: Record<string, Tool> = {
  pencil, eraser, bucket, eyedropper, line, rect, rectfill, gradient, text: textTool,
  'select-rect': selectRect, 'select-ellipse': selectEllipse, 'select-lasso': selectLasso, 'select-wand': selectWand,
};
