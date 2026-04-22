import { test, expect, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

// Helper: set up a small sprite with a tileset + tilemap via the exposed store, so we can
// drive exports without painting through the UI.
async function primeSprite(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    const { store } = (globalThis as any).__tileStudio;
    const s = store.getState();
    // Paint two 4x4 tiles into the raster cel.
    const img = s.activeImage();
    const w = img.w, h = img.h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        img.data[y * w + x] = (x < 4 && y < 4)
          ? 0xff0000ff  // red tile at 0,0
          : (x < 8 && x >= 4 && y < 4 ? 0xffff0000 : 0);  // blue tile at 4,0
      }
    }
    s.markDirty();

    // Generate 4x4 tileset (flips off for deterministic counts).
    const srcLayerId = s.sprite.layers.find((l: any) => l.type === 'raster').id;
    s.generateTilesetFromLayer(srcLayerId, { tileWidth: 4, tileHeight: 4, matchFlips: false, name: 'Test' }, false);
  });
}

// Capture a programmatic download from the page.
async function captureDownload(page: Page, action: () => Promise<void>) {
  const dlPromise = page.waitForEvent('download');
  await action();
  const dl = await dlPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) chunks.push(chunk as Buffer);
  return { filename: dl.suggestedFilename(), body: Buffer.concat(chunks) };
}

test.describe('P6 export', () => {
  test('export dialog shows tileset summary and tabs enable correctly', async ({ page }) => {
    await primeSprite(page);
    await page.getByTestId('btn-export').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    await expect(page.getByTestId('ex-summary')).toContainText(/tiles/);
    await expect(page.getByTestId('kind-tileset')).toBeVisible();
    await expect(page.getByTestId('kind-sprite')).toBeVisible();
  });

  test('tiled export bundles .png + .tsj + .tmj in a zip', async ({ page }) => {
    await primeSprite(page);
    await page.getByTestId('btn-export').click();
    await page.getByTestId('ex-format').selectOption('tiled');

    const { filename, body } = await captureDownload(page, async () => {
      await page.getByTestId('ex-submit').click();
    });

    expect(filename).toMatch(/\.zip$/);
    const entries = unzipSync(new Uint8Array(body));
    const names = Object.keys(entries).sort();
    expect(names).toContain('export.png');
    expect(names).toContain('export.tsj');
    expect(names).toContain('export.tmj');

    const tmj = JSON.parse(new TextDecoder().decode(entries['export.tmj']));
    expect(tmj.type).toBe('map');
    expect(tmj.tilesets[0].source).toBe('export.tsj');
    // One tilemap layer was produced by generate, referencing Layer 1 (map).
    expect(tmj.layers.length).toBe(1);
    expect(Array.isArray(tmj.layers[0].data)).toBe(true);
    expect(tmj.layers[0].width).toBeGreaterThan(0);

    const tsj = JSON.parse(new TextDecoder().decode(entries['export.tsj']));
    expect(tsj.type).toBe('tileset');
    expect(tsj.tilewidth).toBe(4);
  });

  test('raw JSON format emits flips array with per-cell bits', async ({ page }) => {
    await primeSprite(page);

    // Mutate one cell to carry a horizontal flip so we can verify flips encoding.
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const layer = s.sprite.layers.find((l: any) => l.type === 'tilemap');
      const cel = s.sprite.cels.find((c: any) => c.layerId === layer.id);
      // Set cell 0 to tile index 0 + X flip.
      const TILE_FLIP_X = 1 << 29;
      const EXISTING = cel.image.data[0];
      cel.image.data[0] = (EXISTING | TILE_FLIP_X) >>> 0;
      s.markDirty();
    });

    await page.getByTestId('btn-export').click();
    await page.getByTestId('ex-format').selectOption('raw');

    const { body } = await captureDownload(page, async () => {
      await page.getByTestId('ex-submit').click();
    });
    const entries = unzipSync(new Uint8Array(body));
    const raw = JSON.parse(new TextDecoder().decode(entries['export.json']));
    expect(raw.tileset.tilewidth).toBe(4);
    expect(raw.layers[0].flips).toBeDefined();
    // Cell 0's flips should have bit 1 (X) set.
    expect(raw.layers[0].flips[0] & 1).toBe(1);
  });

  test('sprite-only flat PNG export downloads a single file', async ({ page }) => {
    await primeSprite(page);
    await page.getByTestId('btn-export').click();
    await page.getByTestId('kind-sprite').click();
    const { filename } = await captureDownload(page, async () => {
      await page.getByTestId('ex-submit').click();
    });
    expect(filename).toMatch(/\.png$/);
  });
});
