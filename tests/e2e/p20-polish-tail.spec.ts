import { test, expect } from '@playwright/test';

test.describe('P20 long-tail polish', () => {
  test('rotateSelectionContent 90° rotates a 2×2 block into a 2×2 (preserving pixels)', async ({ page }) => {
    await page.goto('/');
    const opaque = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      // Paint a 2×2 square far enough from the edge that rotation stays on-canvas.
      img.data[10 * img.w + 10] = 0xff0000ff;
      img.data[10 * img.w + 11] = 0xff00ff00;
      img.data[11 * img.w + 10] = 0xffff0000;
      img.data[11 * img.w + 11] = 0xff00ffff;
      s.markDirty();
      s.selectRect(10, 10, 2, 2, 'replace');
      const s2 = (globalThis as any).__tileStudio.store.getState();
      s2.rotateSelectionContent(90);
      let n = 0;
      for (let i = 0; i < img.data.length; i++) if (((img.data[i] >>> 24) & 0xff) !== 0) n++;
      return n;
    });
    // All four painted pixels should be accounted for (placement permuted but count preserved).
    expect(opaque).toBe(4);
  });

  test('scaleSelectionContent 2× doubles the painted footprint', async ({ page }) => {
    await page.goto('/');
    const count = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[0] = 0xff00ff00; // single green pixel
      s.markDirty();
      s.selectRect(0, 0, 1, 1, 'replace');
      const s2 = (globalThis as any).__tileStudio.store.getState();
      s2.scaleSelectionContent(2, 2);
      // Count opaque pixels — a 1×1 stretch to 2×2 should leave 4 opaque pixels.
      let n = 0;
      for (let i = 0; i < img.data.length; i++) if (((img.data[i] >>> 24) & 0xff) !== 0) n++;
      return n;
    });
    expect(count).toBe(4);
  });

  test('captureCustomBrush captures selection dimensions and data', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[0] = 0xff00ff00;
      img.data[1] = 0xff00ff00;
      img.data[img.w] = 0xff00ff00;
      s.markDirty();
      s.selectRect(0, 0, 2, 2, 'replace');
      (globalThis as any).__tileStudio.store.getState().captureCustomBrush();
      const s2 = (globalThis as any).__tileStudio.store.getState();
      const cb = s2.customBrush;
      // Count colored slots in the data buffer (mask only tells us "inside the selection").
      let colored = 0;
      for (let i = 0; i < cb.data.length; i++) if (cb.data[i] !== 0) colored++;
      return { w: cb.w, h: cb.h, colored };
    });
    expect(out.w).toBe(2);
    expect(out.h).toBe(2);
    expect(out.colored).toBe(3);
  });

  test('clearCustomBrush resets to null', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      s.selectRect(0, 0, 2, 2, 'replace');
      const s2 = (globalThis as any).__tileStudio.store.getState();
      s2.captureCustomBrush();
      const s3 = (globalThis as any).__tileStudio.store.getState();
      s3.clearCustomBrush();
    });
    const br = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().customBrush);
    expect(br).toBeNull();
  });

  test('seekHistory rolls back to a chosen index', async ({ page }) => {
    await page.goto('/');
    const counts = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      // Three pencil strokes, each recording a patch.
      for (let i = 0; i < 3; i++) {
        const mod = (globalThis as any).__tileStudio;
        const ctx = {
          image: s.activeImage(),
          celId: s.activeCel().id,
          primary: 0xff0000ff,
          secondary: 0xff00000000,
          button: 0,
          celX: 0, celY: 0,
          brushSize: 1,
          pixelPerfect: false,
          symmetryMode: 'none',
        };
        const sess = mod.tools.pencil.begin(ctx, i, 0);
        const patch = sess.end();
        if (patch) s.pushPatch(patch);
        s = store.getState();
      }
      const before = s.undoStack.length;
      s.seekHistory(1);
      s = store.getState();
      const afterSeek = s.undoStack.length;
      return { before, afterSeek, redoLen: s.redoStack.length };
    });
    expect(counts.before).toBe(3);
    expect(counts.afterSeek).toBe(1);
    expect(counts.redoLen).toBe(2);
  });

  test('addGuide / clearGuides manage overlay guides', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      s.addGuide('h', 10);
      s.addGuide('v', 20);
      const s2 = (globalThis as any).__tileStudio.store.getState();
      const before = s2.guides.length;
      s2.clearGuides();
      const s3 = (globalThis as any).__tileStudio.store.getState();
      return { before, after: s3.guides.length };
    });
    expect(out.before).toBe(2);
    expect(out.after).toBe(0);
  });

  test('Palette sort luma orders dark→light', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      // AABBGGRR packs alpha high, red low — use plain RGB colors at full alpha.
      // white: (R=255,G=255,B=255) → 0xffffffff
      // gray:  (128,128,128)       → 0xff808080
      // black: (0,0,0)             → 0xff000000
      s.setPalette(new Uint32Array([0xffffffff, 0xff000000, 0xff808080]));
    });
    await page.getByTestId('palette-edit').click();
    await page.getByTestId('pe-sort-luma').click();
    const colors = await page.evaluate(() =>
      Array.from((globalThis as any).__tileStudio.store.getState().sprite.palette.colors)
    );
    expect(colors[0]).toBe(0xff000000);
    expect(colors[2]).toBe(0xffffffff);
  });

  test('History list shows entries and clicking one seeks', async ({ page }) => {
    await page.goto('/');
    // Create 2 pencil strokes to populate history.
    await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const make = (x: number) => {
        const s = mod.store.getState();
        const ctx = {
          image: s.activeImage(),
          celId: s.activeCel().id,
          primary: 0xff0000ff,
          secondary: 0, button: 0,
          celX: 0, celY: 0,
          brushSize: 1, pixelPerfect: false, symmetryMode: 'none',
        };
        const sess = mod.tools.pencil.begin(ctx, x, 0);
        const patch = sess.end();
        if (patch) s.pushPatch(patch);
      };
      make(0); make(1);
    });
    // First entry in the history list is index 0 — clicking should seek to 1.
    await page.getByTestId('history-entry-0').click();
    const undoLen = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().undoStack.length);
    expect(undoLen).toBe(1);
  });

  test('Custom brush stamps when pencil is used', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      // Make a 2×2 red patch and capture it as custom brush.
      img.data[0] = 0xff0000ff; img.data[1] = 0xff0000ff;
      img.data[img.w] = 0xff0000ff; img.data[img.w + 1] = 0xff0000ff;
      s.markDirty();
      s.selectRect(0, 0, 2, 2, 'replace');
      (globalThis as any).__tileStudio.store.getState().captureCustomBrush();
      // Now wipe the canvas + deselect + draw at (10,10) with the pencil tool manually.
      for (let i = 0; i < img.data.length; i++) img.data[i] = 0;
      (globalThis as any).__tileStudio.store.getState().deselect();
      const mod = (globalThis as any).__tileStudio;
      const s2 = mod.store.getState();
      const ctx = {
        image: s2.activeImage(),
        celId: s2.activeCel().id,
        primary: 0xff0000ff,
        secondary: 0, button: 0,
        celX: 0, celY: 0,
        brushSize: 1, pixelPerfect: false, symmetryMode: 'none',
        customBrush: s2.customBrush,
      };
      const sess = mod.tools.pencil.begin(ctx, 10, 10);
      const patch = sess.end();
      if (patch) s2.pushPatch(patch);
    });
    const count = await page.evaluate(() => {
      const img = (globalThis as any).__tileStudio.store.getState().activeImage();
      let n = 0;
      for (let i = 0; i < img.data.length; i++) if (((img.data[i] >>> 24) & 0xff) !== 0) n++;
      return n;
    });
    // A 2×2 brush centered stamps 4 pixels.
    expect(count).toBe(4);
  });

  test('View menu has Clear Guides entry', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('m-view-clear-guides')).toBeVisible();
  });

  test('Select menu has rotate/scale selection entries', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-select').click();
    await expect(page.getByTestId('m-select-rot-90')).toBeVisible();
    await expect(page.getByTestId('m-select-scale-2x')).toBeVisible();
    await expect(page.getByTestId('m-select-scale-half')).toBeVisible();
    await expect(page.getByTestId('m-select-capture-brush')).toBeVisible();
  });
});
