import { test, expect } from '@playwright/test';

test.describe('P11c sprite size / scale', () => {
  test('Sprite Size dialog doubles dimensions via 2× preset', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-sprite').click();
    await page.getByTestId('m-sprite-size').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    await page.getByTestId('ss-preset-2').click();
    await page.getByTestId('ss-apply').click();
    await expect(page.getByTestId('dialog')).toBeHidden();
    const dims = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return { w: s.sprite.w, h: s.sprite.h };
    });
    expect(dims.w).toBe(128);
    expect(dims.h).toBe(128);
  });

  test('Scaling is nearest-neighbor — sampled pixel maps to origin', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      s.activeImage().data[0] = 0xffabcd12;
      s.markDirty();
    });
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().scaleSprite(128, 128));
    const pix = await page.evaluate(() => {
      const img = (globalThis as any).__tileStudio.store.getState().activeImage();
      // (0,0) in the scaled image still samples the top-left pixel.
      return img.data[0];
    });
    expect(pix).toBe(0xffabcd12);
  });

  test('Lock-ratio updates both fields when one changes', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-sprite').click();
    await page.getByTestId('m-sprite-size').click();
    // Initial sprite is 64×64. Change width to 128; height should also become 128.
    const inputs = page.locator('input[type=number]');
    await inputs.nth(0).fill('128');
    // Blur to apply
    await inputs.nth(0).press('Tab');
    const h = await inputs.nth(1).inputValue();
    expect(parseInt(h, 10)).toBe(128);
  });
});
