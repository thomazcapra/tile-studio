import { test, expect } from '@playwright/test';

test.describe('P1 raster editor', () => {
  test('tool palette renders all tools and clicking activates them', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tool-palette')).toBeVisible();
    for (const id of ['pencil', 'eraser', 'bucket', 'eyedropper', 'line', 'rect', 'rectfill']) {
      await expect(page.getByTestId(`tool-${id}`)).toBeVisible();
    }
    await page.getByTestId('tool-bucket').click();
    await expect(page.getByTestId('status-bar')).toContainText('Tool: bucket');
  });

  test('keyboard shortcuts switch tools', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('e');
    await expect(page.getByTestId('status-bar')).toContainText('Tool: eraser');
    await page.keyboard.press('g');
    await expect(page.getByTestId('status-bar')).toContainText('Tool: bucket');
    await page.keyboard.press('b');
    await expect(page.getByTestId('status-bar')).toContainText('Tool: pencil');
  });

  test('pencil actually paints + undo/redo works', async ({ page }) => {
    await page.goto('/');
    // Pick a clearly distinguishable color (red) from the default palette.
    await page.getByTestId('palette-5').click(); // index 5 = 0xdf7126-ish orange
    await page.getByTestId('tool-pencil').click();

    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    // Paint a short horizontal line near the center.
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - 20, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 20, cy);
    await page.mouse.up();

    // At least one stroke should be in history.
    await expect(page.getByTestId('history-list')).not.toContainText('No edits yet');
    await expect(page.getByTestId('btn-undo')).toBeEnabled();

    // Undo restores "no edits".
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('history-list')).toContainText('No edits yet');
    // Redo brings it back.
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByTestId('history-list')).not.toContainText('No edits yet');
  });

  test('color picker opens on swatch click and hex input reflects primary', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('primary-swatch').click();
    await expect(page.getByTestId('color-picker')).toBeVisible();
    const hex = page.getByTestId('hex-input');
    await expect(hex).toBeVisible();
    await hex.fill('#ff00aa');
    await hex.press('Enter');
    // Status bar HUD shows the current primary hex.
    await expect(page.getByTestId('status-bar')).toContainText('#ff00aa');
  });

  test('palette right-click sets secondary color', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('palette-8').click({ button: 'right' });
    // Swap so secondary becomes primary, status bar will reflect it.
    await page.keyboard.press('x');
    // The color at palette-8 is 0xfbf236 (yellow) — check status bar updated.
    await expect(page.getByTestId('status-bar')).toContainText('#fbf236');
  });
});
