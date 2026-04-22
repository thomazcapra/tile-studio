import { test, expect, type Page } from '@playwright/test';

async function captureDownload(page: Page, action: () => Promise<void>) {
  const dlPromise = page.waitForEvent('download');
  await action();
  const dl = await dlPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) chunks.push(chunk as Buffer);
  return { filename: dl.suggestedFilename(), body: Buffer.concat(chunks) };
}

test.describe('P11a persistence', () => {
  test('Save Project downloads a .tstudio file with TSTUDIO magic', async ({ page }) => {
    await page.goto('/');
    // Nudge state so the sprite name / serializer has something meaningful.
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      img.data[0] = 0xff0000ff;
      s.markDirty();
    });
    await page.getByTestId('menu-file').click();
    const { filename, body } = await captureDownload(page, async () => {
      await page.getByTestId('m-file-save-project').click();
    });
    expect(filename).toMatch(/\.tstudio$/);
    // Zip file — starts with "PK"
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);
    // Manifest should reference TSTUDIO magic — unzip via fflate in the page.
    const hasMagic = await page.evaluate(async (b64: string) => {
      const { unzipSync } = await import('/node_modules/fflate/esm/browser.js' as any);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const entries = unzipSync(bytes);
      const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
      return manifest.magic === 'TSTUDIO';
    }, body.toString('base64'));
    expect(hasMagic).toBe(true);
  });

  test('Autosave round-trip: serialize → IDB → deserialize preserves pixel', async ({ page }) => {
    await page.goto('/');
    const pixel = 0xffabcdef;
    await page.evaluate((p) => {
      const s = (globalThis as any).__tileStudio.store.getState();
      s.activeImage().data[0] = p;
      s.markDirty();
    }, pixel);

    // Wait longer than the autosave debounce (1000ms).
    await page.waitForTimeout(1300);

    // Read back from IndexedDB via the exposed autosave helpers.
    const restoredPixel = await page.evaluate(async () => {
      // Use dynamic imports against our own dev server.
      const native = await import('/src/io/native.ts' as any);
      const as = await import('/src/io/autosave.ts' as any);
      const bytes = await as.getAutosave();
      if (!bytes) return -1;
      const sp = native.deserializeSprite(bytes);
      const cel = sp.cels.find((c: any) => c.frame === 0);
      return cel?.image?.data?.[0] ?? -2;
    });
    expect(restoredPixel).toBe(pixel);
  });

  test('Ctrl+S dispatches the save action (downloads .tstudio)', async ({ page }) => {
    await page.goto('/');
    const { filename } = await captureDownload(page, async () => {
      await page.keyboard.press('Control+s');
    });
    expect(filename).toMatch(/\.tstudio$/);
  });
});
