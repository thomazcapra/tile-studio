import { test, expect } from '@playwright/test';

test.describe('P12 selection tools', () => {
  test('Rectangle selection via tool + drag produces a mask', async ({ page }) => {
    await page.goto('/');
    // Ensure the select-rect tool is active.
    await page.getByTestId('tool-select-rect').click();

    // Drag a rectangle over the center of the canvas.
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - 50, cy - 50);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy + 50);
    await page.mouse.up();

    const sel = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      if (!s.selection) return null;
      return { w: s.selection.bounds.w, h: s.selection.bounds.h };
    });
    expect(sel).not.toBeNull();
    expect(sel!.w).toBeGreaterThan(0);
    expect(sel!.h).toBeGreaterThan(0);
  });

  test('Ctrl+A selects all, Ctrl+D deselects', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+a');
    const total = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return s.selection?.bounds.w * s.selection?.bounds.h;
    });
    expect(total).toBe(64 * 64);

    await page.keyboard.press('Control+d');
    const none = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().selection);
    expect(none).toBeNull();
  });

  test('Delete clears selection contents but leaves outside-mask pixels untouched', async ({ page }) => {
    await page.goto('/');
    // Paint everything red.
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      for (let i = 0; i < img.data.length; i++) img.data[i] = 0xff0000ff;
      s.markDirty();
      // Select a 10x10 region at (5,5).
      s.selectRect(5, 5, 10, 10, 'replace');
    });
    await page.keyboard.press('Delete');
    const sample = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      return {
        outside: img.data[0],                    // (0,0)
        inside: img.data[7 * img.w + 7],          // (7,7)
      };
    });
    expect(sample.outside).toBe(0xff0000ff);
    expect(sample.inside).toBe(0);
  });

  test('Paint respects selection — pencil outside does nothing', async ({ page }) => {
    await page.goto('/');
    // Select a 4x4 region at (10,10).
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().selectRect(10, 10, 4, 4, 'replace'));
    await page.getByTestId('tool-pencil').click();
    // Try to paint at canvas top-left (which is outside the selection).
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + 5);
    const pix = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().activeImage().data[0]);
    expect(pix).toBe(0);
  });

  test('Cut + Paste moves pixels', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      // Paint a marker at (5,5).
      img.data[5 * img.w + 5] = 0xffabcd12;
      s.markDirty();
      // Select a 3x3 around the marker.
      s.selectRect(4, 4, 3, 3, 'replace');
    });
    await page.keyboard.press('Control+x');
    const cleared = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().activeImage().data[5 * 64 + 5]);
    expect(cleared).toBe(0);

    // Move selection to (20,20) then paste.
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().selectRect(20, 20, 3, 3, 'replace'));
    await page.keyboard.press('Control+v');
    const landed = await page.evaluate(() => {
      const img = (globalThis as any).__tileStudio.store.getState().activeImage();
      // The marker was at offset (1,1) within the 3x3 clipboard.
      return img.data[(20 + 1) * img.w + (20 + 1)];
    });
    expect(landed).toBe(0xffabcd12);
  });

  test('Magic wand selects pixels matching the target color', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const img = s.activeImage();
      // Left half red, right half blue.
      for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
          img.data[y * img.w + x] = x < img.w / 2 ? 0xff0000ff : 0xffff0000;
        }
      }
      s.markDirty();
      s.setTool('select-wand');
    });
    // Drive the wand via the store directly at a known sprite coordinate (the canvas→sprite
    // mapping depends on zoom/pan which makes click coords flaky in headless tests).
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().selectByColor(10, 10, 0, 'replace'));
    const area = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      if (!s.selection) return 0;
      let n = 0;
      for (let i = 0; i < s.selection.mask.length; i++) if (s.selection.mask[i]) n++;
      return n;
    });
    expect(area).toBe(32 * 64); // left half of a 64×64 sprite
  });
});
