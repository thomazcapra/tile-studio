import { test, expect } from '@playwright/test';

// P25: Pointer Events foundation, pen pressure, multi-touch gestures, soft modifiers.
// Verifies that the iPad/touch/pen migration didn't regress mouse behavior and that
// the new pen + touch code paths work via dispatched PointerEvents.
//
// Coordinate notes: every dispatch translates a sprite-pixel coord through the live
// viewport state (zoom + pan) so the tests work regardless of the runtime canvas size.

test.describe('P25 pointer / pen / touch', () => {
  test('pen pressure shrinks brush size; mouse ignores pressure', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('palette-5').click();
    await page.getByTestId('tool-pencil').click();
    await page.evaluate(() => {
      // @ts-expect-error - dev-only global
      window.__tileStudio.store.getState().setBrushSize(6);
    });

    const counts = await page.evaluate(async () => {
      // @ts-expect-error - dev-only global
      const store = window.__tileStudio.store;
      const c = document.querySelector('[data-testid="viewport-canvas"]') as HTMLCanvasElement;
      const rect = c.getBoundingClientRect();

      // Sprite-coord → client-coord conversion uses the LIVE viewport state.
      function spriteToClient(sx: number, sy: number) {
        const v = store.getState().viewport;
        return { cx: rect.left + sx * v.zoom + v.panX, cy: rect.top + sy * v.zoom + v.panY };
      }

      function paint(pointerType: 'mouse' | 'pen', pressure: number, sx0 = 16, sy0 = 24, sx1 = 40, sy1 = 24) {
        const opts = (cx: number, cy: number, buttons = 1) => ({
          pointerType, isPrimary: true, button: 0, buttons, pointerId: 7,
          clientX: cx, clientY: cy, pressure,
          bubbles: true, cancelable: true,
        });
        const start = spriteToClient(sx0, sy0);
        const end = spriteToClient(sx1, sy1);
        c.dispatchEvent(new PointerEvent('pointerdown', opts(start.cx, start.cy)));
        for (let t = 1; t <= 10; t++) {
          c.dispatchEvent(new PointerEvent('pointermove', opts(
            start.cx + (end.cx - start.cx) * (t / 10),
            start.cy + (end.cy - start.cy) * (t / 10),
          )));
        }
        c.dispatchEvent(new PointerEvent('pointerup', opts(end.cx, end.cy, 0)));
      }

      function countPainted(): number {
        const s = store.getState();
        const layer = s.sprite.layers[0];
        const cel = s.sprite.cels.find((c: { layerId: string; frame: number }) => c.layerId === layer.id && c.frame === 0);
        if (!cel || cel.image.colorMode !== 'rgba') return -1;
        let n = 0;
        const data = cel.image.data as Uint32Array;
        for (let i = 0; i < data.length; i++) if (data[i] !== 0) n++;
        return n;
      }
      function reset() { while (store.getState().undoStack.length > 0) store.getState().undo(); }

      reset();
      paint('pen', 1.0);
      const fullPen = countPainted();
      reset();
      paint('pen', 0.2);
      const lowPen = countPainted();
      reset();
      paint('mouse', 0.2);
      const mousePen = countPainted();
      reset();
      return { fullPen, lowPen, mousePen };
    });

    expect(counts.lowPen).toBeGreaterThan(0);
    expect(counts.lowPen).toBeLessThan(counts.fullPen);
    expect(counts.mousePen).toBe(counts.fullPen);
  });

  test('two-finger pinch zooms the canvas without committing a paint stroke', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tool-pencil').click();

    const result = await page.evaluate(async () => {
      // @ts-expect-error - dev-only global
      const store = window.__tileStudio.store;
      const c = document.querySelector('[data-testid="viewport-canvas"]') as HTMLCanvasElement;
      const rect = c.getBoundingClientRect();
      while (store.getState().undoStack.length > 0) store.getState().undo();
      store.getState().resetView(rect.width, rect.height);

      function ev(type: string, pointerId: number, x: number, y: number, buttons = 1) {
        return new PointerEvent(type, {
          pointerType: 'touch', isPrimary: pointerId === 1,
          button: 0, buttons, pointerId,
          clientX: rect.left + x, clientY: rect.top + y,
          pressure: buttons ? 0.5 : 0, bubbles: true, cancelable: true,
        });
      }

      const before = { ...store.getState().viewport };
      const cx = rect.width / 2, cy = rect.height / 2;
      // First finger touches → starts a single-finger stroke at sprite center.
      c.dispatchEvent(ev('pointerdown', 1, cx - 50, cy));
      c.dispatchEvent(ev('pointermove', 1, cx - 60, cy));
      // Second finger arrives → aborts the stroke, enters gesture mode.
      c.dispatchEvent(ev('pointerdown', 2, cx + 50, cy));
      // Spread fingers to pinch-zoom.
      c.dispatchEvent(ev('pointermove', 1, cx - 100, cy));
      c.dispatchEvent(ev('pointermove', 2, cx + 100, cy));
      c.dispatchEvent(ev('pointerup', 1, cx - 100, cy, 0));
      c.dispatchEvent(ev('pointerup', 2, cx + 100, cy, 0));

      return {
        zoomBefore: before.zoom,
        zoomAfter: store.getState().viewport.zoom,
        historyLen: store.getState().undoStack.length,
      };
    });

    expect(result.zoomAfter).toBeGreaterThan(result.zoomBefore);
    // Critically: pinch must NOT push a paint patch onto undo.
    expect(result.historyLen).toBe(0);
  });

  test('long-press on a layer row opens the layer context menu (touch only)', async ({ page }) => {
    await page.goto('/');
    const layerRow = page.locator('li[data-testid^="layer-"]').first();
    await expect(layerRow).toBeVisible();

    const opened = await page.evaluate(async () => {
      const row = document.querySelector('li[data-testid^="layer-"]') as HTMLElement;
      const r = row.getBoundingClientRect();
      const opts = (buttons: number) => ({
        pointerType: 'touch', isPrimary: true, button: 0, buttons, pointerId: 30,
        clientX: r.left + 50, clientY: r.top + 8, pressure: 0.5, bubbles: true, cancelable: true,
      });
      row.dispatchEvent(new PointerEvent('pointerdown', opts(1)));
      await new Promise((r) => setTimeout(r, 600));
      row.dispatchEvent(new PointerEvent('pointerup', opts(0)));
      return !!document.querySelector('[data-testid="layer-ctx-menu"]');
    });

    expect(opened).toBe(true);
  });

  test('soft Shift latch makes a touch selection-rect drag add to the existing mask', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tool-select-rect').click();

    const result = await page.evaluate(async () => {
      // @ts-expect-error - dev-only global
      const store = window.__tileStudio.store;
      const c = document.querySelector('[data-testid="viewport-canvas"]') as HTMLCanvasElement;
      const rect = c.getBoundingClientRect();
      store.getState().clearSoftModifiers();
      store.getState().deselect?.();

      function spriteToClient(sx: number, sy: number) {
        const v = store.getState().viewport;
        return { cx: rect.left + sx * v.zoom + v.panX, cy: rect.top + sy * v.zoom + v.panY };
      }
      function dispatch(type: string, sx: number, sy: number, buttons = 1) {
        const { cx, cy } = spriteToClient(sx, sy);
        c.dispatchEvent(new PointerEvent(type, {
          pointerType: 'touch', isPrimary: true, button: 0, buttons,
          pointerId: 50, clientX: cx, clientY: cy, pressure: 0.5,
          bubbles: true, cancelable: true,
        }));
      }

      // First selection (no modifier) — replace mode.
      dispatch('pointerdown', 8, 8);
      dispatch('pointermove', 18, 18);
      dispatch('pointerup', 18, 18, 0);
      const before = (store.getState().selection?.mask as Uint8Array | undefined)?.reduce((n: number, v: number) => n + (v ? 1 : 0), 0) ?? 0;

      // Latch soft Shift, then make a non-overlapping rectangle → should ADD to mask.
      store.getState().setSoftModifier('shift', true);
      dispatch('pointerdown', 30, 30);
      dispatch('pointermove', 40, 40);
      dispatch('pointerup', 40, 40, 0);
      const after = (store.getState().selection?.mask as Uint8Array | undefined)?.reduce((n: number, v: number) => n + (v ? 1 : 0), 0) ?? 0;

      return { before, after, autoCleared: !store.getState().softShift };
    });

    expect(result.before).toBeGreaterThan(0);
    expect(result.after).toBeGreaterThan(result.before);
    expect(result.autoCleared).toBe(true);
  });
});
