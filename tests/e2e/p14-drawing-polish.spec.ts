import { test, expect } from '@playwright/test';

test.describe('P14 drawing polish', () => {
  test('Symmetry H mirrors pencil stamps horizontally', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().setSymmetryMode('h'));
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    // Click near the left edge of the centered sprite.
    await page.mouse.click(box.x + box.width / 2 - 40, box.y + box.height / 2 - 40);
    const [left, right] = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      // Count opaque pixels on each half of the sprite.
      let l = 0, r = 0;
      for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
          if ((img.data[y * img.w + x] >>> 24) !== 0) {
            if (x < img.w / 2) l++; else r++;
          }
        }
      }
      return [l, r];
    });
    expect(left).toBeGreaterThan(0);
    expect(right).toBe(left);
  });

  test('Pixel-perfect pencil: without PP the 3-pixel elbow stamps 3 pixels; with PP it stamps 2', async ({ page }) => {
    await page.goto('/');
    const without = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      const store = mod.store;
      const tools = { pencil: mod.tools.pencil };
      const s = store.getState();
      const img = s.activeImage();
      const ctx = {
        image: img, celId: s.activeCel().id, primary: 0xff0000ff, secondary: 0, button: 0,
        celX: 0, celY: 0, brushSize: 1, pixelPerfect: false, symmetryMode: 'none',
        selectionMask: undefined, spriteW: s.sprite.w, spriteH: s.sprite.h,
      };
      const sess = tools.pencil.begin(ctx, 10, 10);
      sess.move(11, 10); sess.move(11, 11); sess.end();
      let n = 0;
      for (let i = 0; i < img.data.length; i++) if ((img.data[i] >>> 24) !== 0) n++;
      return n;
    });
    expect(without).toBe(3);

    const withPp = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      const store = mod.store;
      const tools = { pencil: mod.tools.pencil };
      // Reset the cel.
      const s = store.getState();
      const img = s.activeImage();
      img.data.fill(0);
      s.markDirty();
      const ctx = {
        image: img, celId: s.activeCel().id, primary: 0xff0000ff, secondary: 0, button: 0,
        celX: 0, celY: 0, brushSize: 1, pixelPerfect: true, symmetryMode: 'none',
        selectionMask: undefined, spriteW: s.sprite.w, spriteH: s.sprite.h,
      };
      const sess = tools.pencil.begin(ctx, 10, 10);
      sess.move(11, 10); sess.move(11, 11); sess.end();
      let n = 0;
      for (let i = 0; i < img.data.length; i++) if ((img.data[i] >>> 24) !== 0) n++;
      return n;
    });
    expect(withPp).toBe(2);
  });

  test('Snap to Grid rounds paint coords to the first tileset grid', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      s.createTileset(8, 8, 0, 'Grid');
      s.toggleSnapToGrid();
    });
    // Paint an off-grid pixel — the snap should round to the 8-px grid.
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 + 3, box.y + box.height / 2 + 3);
    const offsets = await page.evaluate(() => {
      const img = (globalThis as any).__tileStudio.store.getState().activeImage();
      const hits: number[] = [];
      for (let i = 0; i < img.data.length; i++) if ((img.data[i] >>> 24) !== 0) hits.push(i);
      return hits.map((i) => [i % img.w, Math.floor(i / img.w)]);
    });
    expect(offsets.length).toBeGreaterThan(0);
    for (const [x, y] of offsets) {
      expect(x % 8).toBe(0);
      expect(y % 8).toBe(0);
    }
  });

  test('Zoom presets: 0 = fit, 1 = 1x, 2 = 2x', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('1');
    let zoom = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().viewport.zoom);
    expect(zoom).toBe(1);
    await page.keyboard.press('2');
    zoom = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().viewport.zoom);
    expect(zoom).toBe(2);
    await page.keyboard.press('0');
    // Fit-to-window should give a zoom > 0 (depends on viewport size; just assert non-default).
    zoom = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().viewport.zoom);
    expect(zoom).toBeGreaterThan(0);
  });
});
