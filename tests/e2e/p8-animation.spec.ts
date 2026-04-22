import { test, expect } from '@playwright/test';

test.describe('P8 animation', () => {
  test('timeline renders with initial frame and default layer row', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('timeline')).toBeVisible();
    await expect(page.getByTestId('tl-frame-0')).toBeVisible();
    await expect(page.getByTestId('tl-position')).toContainText('Frame 1/1');
  });

  test('add frame via toolbar grows frame count', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tl-add-frame').click();
    await expect(page.getByTestId('tl-position')).toContainText('Frame 2/2');
    await expect(page.getByTestId('tl-frame-1')).toBeVisible();
  });

  test('duplicate frame copies the cel contents', async ({ page }) => {
    await page.goto('/');
    // Stamp a pixel into the current cel.
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[0] = 0xff0000ff; // red
      s.markDirty();
    });
    await page.getByTestId('tl-dup-frame').click();
    const firstFrameNonZero = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const cel0 = s.sprite.cels.find((c: any) => c.frame === 0);
      return cel0.image.data[0];
    });
    const secondFrameNonZero = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const cel1 = s.sprite.cels.find((c: any) => c.frame === 1);
      return cel1?.image?.data?.[0] ?? 0;
    });
    expect(firstFrameNonZero).toBe(secondFrameNonZero);
    expect(secondFrameNonZero).not.toBe(0);
  });

  test('delete frame reduces count and clamps currentFrame', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tl-add-frame').click();
    await page.getByTestId('tl-add-frame').click();
    await expect(page.getByTestId('tl-position')).toContainText('Frame 3/3');
    await page.getByTestId('tl-del-frame').click();
    await expect(page.getByTestId('tl-position')).toContainText('/2');
  });

  test('arrow keys and space control playback', async ({ page }) => {
    await page.goto('/');
    // Create 2 more frames.
    await page.getByTestId('tl-add-frame').click();
    await page.getByTestId('tl-add-frame').click();
    await page.getByTestId('tl-first').click();
    await expect(page.getByTestId('tl-position')).toContainText('Frame 1/3');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tl-position')).toContainText('Frame 2/3');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tl-position')).toContainText('Frame 3/3');
    // Space toggles play state; verify the button flips into the paused icon after a second press.
    await page.keyboard.press(' ');
    const playing = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().isPlaying);
    expect(playing).toBe(true);
    await page.keyboard.press(' ');
    const stopped = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().isPlaying);
    expect(stopped).toBe(false);
  });

  test('Frame menu has New/Duplicate/Delete entries', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-frame').click();
    await expect(page.getByTestId('m-frame-new')).toBeVisible();
    await expect(page.getByTestId('m-frame-dup')).toBeVisible();
    await expect(page.getByTestId('m-frame-del')).toBeDisabled(); // only 1 frame
  });

  test('double-clicking a frame header edits its duration', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tl-frame-0').dblclick();
    const input = page.locator('input[type=number]').first();
    await input.fill('250');
    await input.press('Enter');
    await expect(page.getByTestId('tl-position')).toContainText('250ms');
  });
});
