import { test, expect } from '@playwright/test';

test.describe('P5 color quantization', () => {
  test('quantize reduces a 3-color image to 2 colors (brute-force fidelity check)', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const { quantize } = (globalThis as any).__tileStudio;
      // 64x64 image: half red, half blue, with a thin green stripe (minority color).
      const w = 64, h = 64;
      const data = new Uint32Array(w * h);
      const R = 0xff0000ff; // AABBGGRR: A=ff, B=00, G=00, R=ff → red
      const B = 0xffff0000; // blue
      const G = 0xff00ff00; // green
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (y === 32) data[i] = G; // stripe
          else data[i] = x < 32 ? R : B;
        }
      }
      const r = quantize({ colorMode: 'rgba', w, h, data }, { maxColors: 2, dither: false });
      // Count unique values in remapped output.
      const unique = new Set<number>();
      for (let i = 0; i < r.remappedRGBA.length; i++) unique.add(r.remappedRGBA[i]);
      return { paletteSize: r.palette.length, uniqueOutput: unique.size, colorsFound: r.colorsFound };
    });

    expect(result.paletteSize).toBeLessThanOrEqual(2);
    expect(result.uniqueOutput).toBeLessThanOrEqual(2);
    expect(result.colorsFound).toBeLessThanOrEqual(2);
  });

  test('quantize dialog preview updates when slider moves', async ({ page }) => {
    await page.goto('/');

    // Fill the sprite with a gradient so quantization actually matters.
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++)
          img.data[y * img.w + x] = (0xff000000 | (y << 16) | (x << 8) | ((x * 4) & 0xff)) >>> 0;
      s.markDirty();
    });

    await page.getByTestId('palette-quantize').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    await expect(page.getByTestId('q-preview-stats')).toBeVisible();

    // Capture stats at 8 colors vs 64 colors.
    const textAt = async (n: string) => {
      const slider = page.getByTestId('q-colors');
      await slider.fill(n);
      await slider.dispatchEvent('input');
      // let effect run
      await page.waitForTimeout(80);
      return (await page.getByTestId('q-preview-stats').textContent()) ?? '';
    };

    const at8 = await textAt('8');
    const at64 = await textAt('64');
    expect(at8).not.toEqual(at64);
  });

  test('applying quantize updates sprite palette size', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++)
          img.data[y * img.w + x] = (0xff000000 | (((x ^ y) & 0xff) << 16) | (x << 8) | y) >>> 0;
      s.markDirty();
    });

    await page.getByTestId('palette-quantize').click();
    const slider = page.getByTestId('q-colors');
    await slider.fill('4');
    await slider.dispatchEvent('input');
    await page.getByTestId('q-submit').click();
    await expect(page.getByTestId('dialog')).toBeHidden({ timeout: 10_000 });

    const paletteSize = await page.evaluate(() => {
      return (globalThis as any).__tileStudio.store.getState().sprite.palette.colors.length;
    });
    expect(paletteSize).toBeLessThanOrEqual(4);
    expect(paletteSize).toBeGreaterThanOrEqual(2);
  });
});
