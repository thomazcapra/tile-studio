import { test, expect, type Page } from '@playwright/test';

// Stamp a deterministic pattern into the current raster cel.
async function stampPattern(page: Page) {
  await page.evaluate(() => {
    const { store } = (globalThis as any).__tileStudio;
    const s = store.getState();
    const img = s.activeImage();
    if (!img) throw new Error('no active image');
    // Build an 8x8 image (we'll actually work within the 64x64 sprite):
    // Upper-left 4x4: solid red. Upper-right 4x4: solid red (duplicate).
    // Lower-left 4x4: horizontally-flipped gradient. Lower-right 4x4: gradient (source).
    const red = 0xff0000ff; // AABBGGRR (little-endian) = RGBA(255,0,0,255)? Actually 0xAABBGGRR means R at lowest byte, so 0xff0000ff = (R=ff, G=00, B=00, A=ff). That's red.
    const stamp = (sx: number, sy: number, fn: (x: number, y: number) => number) => {
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          img.data[(sy + y) * img.w + (sx + x)] = fn(x, y);
    };
    // Tile A (UL): solid red
    stamp(0, 0, () => red);
    // Tile B (UR): identical to A (duplicate).
    stamp(4, 0, () => red);
    // Tile C (LL): gradient L→R
    const grad = (x: number) => (0xff000000 | (x * 0x3f)) >>> 0;
    stamp(0, 4, (x) => grad(x));
    // Tile D (LR): gradient R→L — horizontal flip of C
    stamp(4, 4, (x) => grad(3 - x));
    s.markDirty();
  });
}

test.describe('P4 auto-tileset generation', () => {
  test('generate dialog is accessible and dedupes identical tiles', async ({ page }) => {
    await page.goto('/');
    await stampPattern(page);
    await page.getByTestId('tileset-generate').click();
    await expect(page.getByTestId('dialog')).toBeVisible();

    // Configure tile size 4x4 and disable flip matching (to isolate identical-tile dedup).
    const [tw, th] = await page.$$('input[type=number]').then((arr) => arr.slice(0, 2));
    await tw.fill('4');
    await th.fill('4');
    await page.getByTestId('gen-flips').uncheck();

    // Preview canvas should be visible.
    await expect(page.getByTestId('gen-preview')).toBeVisible();

    await page.getByTestId('gen-submit').click();
    await expect(page.getByTestId('dialog')).toBeHidden({ timeout: 10_000 });

    // A tileset + tilemap layer should exist.
    await expect(page.getByTestId('status-bar')).toContainText('Mode: tilemap');
    await expect(page.getByTestId('layers-list')).toContainText(/Layer 1 \(map\)/);

    // Query dedup counts from the store.
    const counts = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const ts = s.sprite.tilesets[0];
      // With our stamp: 3 distinct tiles (A+B identical; C, D, plus many empty).
      // Without flip matching, C and D are distinct.
      return { tilesetCount: s.sprite.tilesets.length, tileCount: ts.tiles.length };
    });
    expect(counts.tilesetCount).toBe(1);
    // We expect: 1 empty tile + 1 red tile + 1 gradient-L→R + 1 gradient-R→L = 4 tiles.
    expect(counts.tileCount).toBe(4);
  });

  test('match-flips collapses horizontally mirrored tiles', async ({ page }) => {
    await page.goto('/');
    await stampPattern(page);
    await page.getByTestId('tileset-generate').click();
    const [tw, th] = await page.$$('input[type=number]').then((arr) => arr.slice(0, 2));
    await tw.fill('4');
    await th.fill('4');
    // matchFlips is on by default — leave it.
    await page.getByTestId('gen-submit').click();
    await expect(page.getByTestId('dialog')).toBeHidden({ timeout: 10_000 });

    const counts = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const ts = s.sprite.tilesets[0];
      return { tileCount: ts.tiles.length };
    });
    // With flip matching: C and D are horizontal flips → 1 tile. Plus empty + red = 3 tiles.
    expect(counts.tileCount).toBe(3);
  });

  test('source layer is hidden after generation when opted in', async ({ page }) => {
    await page.goto('/');
    await stampPattern(page);
    await page.getByTestId('tileset-generate').click();
    const [tw, th] = await page.$$('input[type=number]').then((arr) => arr.slice(0, 2));
    await tw.fill('4');
    await th.fill('4');
    // hide-source defaults to checked.
    await page.getByTestId('gen-submit').click();
    await expect(page.getByTestId('dialog')).toBeHidden({ timeout: 10_000 });

    const hidden = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const raster = s.sprite.layers.find((l: any) => l.type === 'raster');
      return raster?.visible === false;
    });
    expect(hidden).toBe(true);
  });
});
