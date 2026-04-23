import { test, expect } from '@playwright/test';

test.describe('P22 animated tiles + minimap + fullscreen', () => {
  test('setTileAnimation attaches frames and tick picks different frame', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      let s = mod.store.getState();
      const tsId = s.createTileset(4, 4, 1, 'A');
      s = mod.store.getState();
      const ts = s.sprite.tilesets.find((t: any) => t.id === tsId)!;
      // Paint the base tile red.
      ts.tiles[0].image.data.fill(0xff0000ff);
      // Build two extra animation frames (green, blue).
      const mk = (c: number) => ({ colorMode: 'rgba', w: 4, h: 4, data: new Uint32Array(16).fill(c) });
      const ok = s.setTileAnimation(tsId, 0, [ts.tiles[0].image, mk(0xff00ff00), mk(0xffff0000)], 100);
      s = mod.store.getState();
      const tmapId = s.addTilemapLayer(tsId, 1, 1);
      s = mod.store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      cel.image.data[0] = 1; // tile index 0, raw 1
      // Render at clock 0 (frame 0 → red).
      const r0 = mod.exporters.spriteFrameImage; void r0;
      // Use compositor directly via export path.
      // Tick clock to frame 1 (100ms → frame 1 green).
      s.setTileClock(150);
      return { ok };
    });
    expect(out.ok).toBe(true);
    // Set the clock explicitly right before sampling — the RAF hook may have advanced
    // it to an arbitrary phase. 150ms at 100ms/frame with 3 frames → frame 1 (green).
    const pixel = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      const s = mod.store.getState();
      const blob = await mod.exporters.spriteFrameImage(s.sprite, 0, 'png', undefined, undefined, 150);
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      const d = c.getContext('2d')!.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    });
    expect(pixel.g).toBeGreaterThan(200);
    expect(pixel.r).toBeLessThan(40);
  });

  test('clearTileAnimation drops the frame sequence', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      const tsId = s.createTileset(4, 4, 1, 'A');
      s = store.getState();
      const img = { colorMode: 'rgba', w: 4, h: 4, data: new Uint32Array(16) };
      s.setTileAnimation(tsId, 0, [img, img], 100);
      s = store.getState();
      const before = s.sprite.tilesets.find((t: any) => t.id === tsId)!.tiles[0].animation;
      s.clearTileAnimation(tsId, 0);
      s = store.getState();
      const after = s.sprite.tilesets.find((t: any) => t.id === tsId)!.tiles[0].animation;
      return { before: !!before, after: !!after };
    });
    expect(out.before).toBe(true);
    expect(out.after).toBe(false);
  });

  test('Minimap canvas renders in the viewport corner', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('minimap')).toBeVisible();
  });

  test('Distraction-free mode hides menu bar and tool palette', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('menu-bar')).toBeVisible();
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().toggleDistractionFree());
    await expect(page.getByTestId('menu-bar')).toHaveCount(0);
    await expect(page.getByTestId('tool-palette')).toHaveCount(0);
    // Viewport remains.
    await expect(page.getByTestId('viewport-canvas')).toBeVisible();
  });

  test('Tab shortcut toggles distraction-free', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const flag = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().distractionFree);
    expect(flag).toBe(true);
    await page.keyboard.press('Tab');
    const back = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().distractionFree);
    expect(back).toBe(false);
  });

  test('View menu exposes "Distraction Free" entry', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('m-view-distraction')).toBeVisible();
  });

  test('tileClockMs state updates via setTileClock', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().setTileClock(1234));
    const clock = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().tileClockMs);
    expect(clock).toBe(1234);
  });
});
