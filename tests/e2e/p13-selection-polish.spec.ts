import { test, expect } from '@playwright/test';

test.describe('P13 selection polish', () => {
  test('Ellipse select produces a rounded mask', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().selectEllipse(0, 0, 10, 10, 'replace'));
    const info = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      if (!s.selection) return null;
      // Corner pixel (0,0) should be OUTSIDE an inscribed ellipse; center pixel (5,5) should be inside.
      return {
        corner: s.selection.mask[0],
        center: s.selection.mask[5 * 64 + 5],
      };
    });
    expect(info!.corner).toBe(0);
    expect(info!.center).toBe(1);
  });

  test('Lasso polygon selects only enclosed pixels', async ({ page }) => {
    await page.goto('/');
    // Triangle with vertices (10,10), (30,10), (20,25).
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().selectPolygon([[10, 10], [30, 10], [20, 25]], 'replace'));
    const info = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return {
        inside: s.selection?.mask[15 * 64 + 20],  // middle-ish
        outside: s.selection?.mask[0],
      };
    });
    expect(info.inside).toBe(1);
    expect(info.outside).toBe(0);
  });

  test('Arrow-key nudges selection + content', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[10 * img.w + 10] = 0xffabcd12; // marker
      s.markDirty();
      s.selectRect(10, 10, 1, 1, 'replace');
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    const info = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      return {
        old: img.data[10 * img.w + 10],
        nw: img.data[11 * img.w + 11],
        selx: s.selection?.bounds.x,
        sely: s.selection?.bounds.y,
      };
    });
    expect(info.old).toBe(0);
    expect(info.nw).toBe(0xffabcd12);
    expect(info.selx).toBe(11);
    expect(info.sely).toBe(11);
  });

  test('Flip Selection Horizontal mirrors marker across the selection bbox', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      // Paint a marker at the left edge of a 4-wide selection.
      img.data[5 * img.w + 10] = 0xff0000ff;
      s.markDirty();
      // Select a 4x1 strip starting at x=10.
      s.selectRect(10, 5, 4, 1, 'replace');
    });
    await page.getByTestId('menu-select').click();
    await page.getByTestId('m-select-flip-h').click();
    const info = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      return { left: img.data[5 * img.w + 10], right: img.data[5 * img.w + 13] };
    });
    expect(info.left).toBe(0);
    expect(info.right).toBe(0xff0000ff);
  });

  test('Rotate Selection 180 swaps marker across the bbox diagonal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[0] = 0xffabcd12; // top-left marker
      s.markDirty();
      // 4x4 selection including the marker.
      s.selectRect(0, 0, 4, 4, 'replace');
    });
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().rotateSelection180());
    const info = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      return { tl: img.data[0], br: img.data[3 * img.w + 3] };
    });
    expect(info.tl).toBe(0);
    expect(info.br).toBe(0xffabcd12);
  });

  test('Brush size shortcut [ and ] adjusts brush; pixel-perfect toggle via P', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    const bs = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().brushSize);
    expect(bs).toBe(3);
    await expect(page.getByTestId('status-brush')).toContainText('3px');
    await page.keyboard.press('p');
    const pp = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().pixelPerfect);
    expect(pp).toBe(true);
    await expect(page.getByTestId('status-brush')).toContainText('PP');
  });

  test('Brush size 3 pencil paints a 3x3 square on a single dot', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      (globalThis as any).__tileStudio.store.getState().setBrushSize(3);
    });
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // Count non-zero pixels in the cel — should be 9 (3×3).
    const count = await page.evaluate(() => {
      const img = (globalThis as any).__tileStudio.store.getState().activeImage();
      let n = 0;
      for (let i = 0; i < img.data.length; i++) if ((img.data[i] >>> 24) !== 0) n++;
      return n;
    });
    expect(count).toBe(9);
  });
});
