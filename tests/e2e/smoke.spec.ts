import { test, expect } from '@playwright/test';

test.describe('P0 scaffold — smoke', () => {
  test('app shell renders all regions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');

    await expect(page.getByTestId('app-root')).toBeVisible();
    await expect(page.getByTestId('toolbar')).toBeVisible();
    await expect(page.getByTestId('viewport-container')).toBeVisible();
    await expect(page.getByTestId('viewport-canvas')).toBeVisible();
    await expect(page.getByTestId('side-panel')).toBeVisible();
    await expect(page.getByTestId('status-bar')).toBeVisible();
    await expect(page.getByTestId('palette-grid').locator('> *')).toHaveCount(16);
    await expect(page.getByTestId('layers-list').locator('li')).toHaveCount(1);

    expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('mode switching updates status bar and aria-pressed', async ({ page }) => {
    await page.goto('/');
    const tilemapBtn = page.getByTestId('mode-tilemap');
    await expect(tilemapBtn).toHaveAttribute('aria-pressed', 'false');
    await tilemapBtn.click();
    await expect(tilemapBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('status-bar')).toContainText('Mode: tilemap');
  });

  test('wheel-over-viewport changes zoom HUD', async ({ page }) => {
    await page.goto('/');
    const canvas = page.getByTestId('viewport-canvas');
    const hud = page.getByTestId('hud-zoom');
    const before = await hud.textContent();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not measured');
    // Zoom in: wheel up (deltaY < 0).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(100);
    const after = await hud.textContent();
    expect(after, `hud before=${before} after=${after}`).not.toEqual(before);
  });

  test('canvas actually paints the sprite (non-blank pixels)', async ({ page }) => {
    await page.goto('/');
    // Give the layout/offscreen a moment to render.
    await page.waitForTimeout(300);
    const canvas = page.getByTestId('viewport-canvas');
    const hasContent = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx || !el.width || !el.height) return false;
      // Sample the full canvas — the sprite is centered so we can't assume top-left.
      const d = ctx.getImageData(0, 0, el.width, el.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 0) return true;
      }
      return false;
    });
    expect(hasContent).toBe(true);
  });
});
