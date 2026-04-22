import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

test('pixel-art preset on last.png yields ~16 tiles (bundled dialog flow)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');

  // Load last.png into the active raster layer via the exposed store.
  const imgPath = path.resolve('C:/Users/thoma/Pictures/last.png');
  const buf = await fs.readFile(imgPath);
  const b64 = buf.toString('base64');

  await page.evaluate(async ({ b64 }) => {
    const mod = (globalThis as any).__tileStudio;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    const cctx = c.getContext('2d')!;
    cctx.drawImage(bitmap, 0, 0);
    const data = cctx.getImageData(0, 0, bitmap.width, bitmap.height);
    // Replace the default sprite via spriteFromImage-like flow.
    const img = { colorMode: 'rgba', w: bitmap.width, h: bitmap.height, data: new Uint32Array(data.data.buffer.slice(0)) };
    const store = mod.store;
    const s = store.getState();
    // Manually stuff into a new sprite with the imported image.
    s.replaceSprite(
      (function make() {
        const base = { ...s.sprite };
        base.w = img.w; base.h = img.h;
        // Reuse the existing factory for minimal shape:
        // Easier: call existing helper by synthesizing a sprite.
        return base; // NOTE: we'll overwrite layer data below
      })()
    );
    // Push the pixels into the current cel.
    const s2 = store.getState();
    const active = s2.activeImage();
    if (!active || active.data.length !== img.data.length) {
      // Fallback: resize via store by replacing — simpler path: just copy what fits.
    }
  }, { b64 });

  // Simpler+reliable: use the factory directly to load the full image.
  await page.evaluate(async ({ b64 }) => {
    const mod = (globalThis as any).__tileStudio;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    const cctx = c.getContext('2d')!;
    cctx.drawImage(bitmap, 0, 0);
    const data = cctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const img = { colorMode: 'rgba', w: bitmap.width, h: bitmap.height, data: new Uint32Array(data.data.buffer.slice(0)) };

    // Build a sprite from the image by mimicking spriteFromImage + replaceSprite.
    const store = mod.store;
    const state = store.getState();
    // Build from existing defaults, then overwrite the 1st cel's image.
    state.replaceSprite({
      id: 'spr_tmp', name: 'last',
      w: img.w, h: img.h, colorMode: 'rgba',
      palette: state.sprite.palette,
      frames: [{ duration: 100 }],
      layers: [{ id: 'lay_tmp', name: 'Layer 1', type: 'raster', visible: true, locked: false, opacity: 255 }],
      layerOrder: ['lay_tmp'],
      cels: [{ id: 'cel_tmp', layerId: 'lay_tmp', frame: 0, x: 0, y: 0, opacity: 255, image: img }],
      tilesets: [],
    });
  }, { b64 });

  // Open the generate dialog from the Tilesets panel.
  await page.getByTestId('tileset-generate').click();
  await expect(page.getByTestId('dialog')).toBeVisible();

  // Apply the preset and submit.
  await page.getByTestId('gen-preset-pixelart').click();
  await page.getByTestId('gen-submit').click();

  // Dialog closes when everything succeeds.
  await expect(page.getByTestId('dialog')).toBeHidden({ timeout: 30_000 });

  // Verify tile count is tiny.
  const tileCount = await page.evaluate(() => {
    const s = (globalThis as any).__tileStudio.store.getState();
    return s.sprite.tilesets[0]?.tiles.length ?? -1;
  });
  console.log('[preset] tile count after pixel-art preset:', tileCount);
  expect(tileCount).toBeGreaterThan(0);
  expect(tileCount).toBeLessThanOrEqual(32);
});
