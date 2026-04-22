import { test, expect } from '@playwright/test';

test.describe('P9 canvas ops', () => {
  test('Rotate 90 CW swaps width and height and moves pixel from TL → TR', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[0] = 0xff0000ff; // marker at (0,0)
      s.markDirty();
    });
    await page.getByTestId('menu-sprite').click();
    await page.getByTestId('m-sprite-rot-cw').click();
    const { w, h, pixelTL, pixelTR } = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      return {
        w: s.sprite.w, h: s.sprite.h,
        pixelTL: img.data[0],
        pixelTR: img.data[img.w - 1],
      };
    });
    expect(w).toBe(64);
    expect(h).toBe(64);
    expect(pixelTL).toBe(0);
    expect(pixelTR).toBe(0xff0000ff);
  });

  test('Flip Horizontal mirrors pixel across X axis', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[0] = 0xffabcdef; // (0,0)
      s.markDirty();
    });
    await page.getByTestId('menu-sprite').click();
    await page.getByTestId('m-sprite-flip-h').click();
    const far = await page.evaluate(() => {
      const img = (globalThis as any).__tileStudio.store.getState().activeImage();
      return img.data[img.w - 1];
    });
    expect(far).toBe(0xffabcdef);
  });

  test('Canvas Size via dialog grows the canvas with NW anchor', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-sprite').click();
    await page.getByTestId('m-sprite-canvas-size').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    // Set width to 96, height to 96, anchor NW.
    const inputs = page.locator('input[type=number]');
    await inputs.nth(0).fill('96');
    await inputs.nth(1).fill('96');
    await page.getByTestId('rc-anchor-nw').click();
    await page.getByTestId('rc-apply').click();
    await expect(page.getByTestId('dialog')).toBeHidden();
    const dims = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return { w: s.sprite.w, h: s.sprite.h };
    });
    expect(dims.w).toBe(96);
    expect(dims.h).toBe(96);
  });

  test('Trim (autocrop) shrinks the canvas to painted bounds', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      // Paint a single opaque pixel at (10, 20).
      img.data[20 * img.w + 10] = 0xff00ff00;
      s.markDirty();
    });
    await page.getByTestId('menu-sprite').click();
    await page.getByTestId('m-sprite-autocrop').click();
    const dims = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return { w: s.sprite.w, h: s.sprite.h };
    });
    expect(dims.w).toBe(1);
    expect(dims.h).toBe(1);
  });
});
