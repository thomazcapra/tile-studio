import { test, expect } from '@playwright/test';

async function primeTilemap(page: import('@playwright/test').Page) {
  // Create tileset with defaults.
  await page.getByTestId('tileset-new').click();
  await page.getByTestId('ts-create').click();
  // Paint tile #0 something visible.
  const tile0 = page.locator('[data-testid^="tile-tset_"]').first();
  await tile0.dblclick();
  await page.getByTestId('palette-8').click(); // yellow
  const canvas = page.getByTestId('viewport-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40);
  await page.mouse.up();
  // Go back to raster to add a tilemap layer.
  await page.getByTestId('mode-raster').click();
  // Open layer menu.
  await page.getByTestId('layer-add').click();
  await page.getByTestId('layer-add-tilemap').click();
  await expect(page.getByTestId('dialog')).toBeVisible();
  await page.getByTestId('tml-create').click();
}

test.describe('P3 tilemap', () => {
  test('add tilemap layer switches to tilemap mode with flips HUD', async ({ page }) => {
    await page.goto('/');
    await primeTilemap(page);

    await expect(page.getByTestId('status-bar')).toContainText('Mode: tilemap');
    await expect(page.getByTestId('edit-target-badge')).toContainText('Painting');
    await expect(page.getByTestId('flips-hud')).toBeVisible();
    // layer list should now show a tilemap layer.
    await expect(page.getByTestId('layers-list').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('layers-list')).toContainText(/tilemap/i);
  });

  test('painting places tile words and can be undone', async ({ page }) => {
    await page.goto('/');
    await primeTilemap(page);

    // Select tile #0 (already selected after primer) and paint on canvas.
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
    await page.mouse.up();

    await expect(page.getByTestId('history-list')).toContainText('Place Tile');

    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('history-list')).not.toContainText('Place Tile');
  });

  test('F/V/R toggle brush flips and button states update', async ({ page }) => {
    await page.goto('/');
    await primeTilemap(page);

    const flipX = page.getByTestId('flip-x');
    const flipY = page.getByTestId('flip-y');
    const flipD = page.getByTestId('flip-d');

    await page.keyboard.press('f');
    await expect(flipX).toHaveClass(/bg-accent/);
    await page.keyboard.press('v');
    await expect(flipY).toHaveClass(/bg-accent/);
    await page.keyboard.press('r');
    await expect(flipD).toHaveClass(/bg-accent/);

    // Clicking the button toggles off.
    await flipX.click();
    await expect(flipX).not.toHaveClass(/bg-accent/);
  });

  test('right-click erases a placed tile', async ({ page }) => {
    await page.goto('/');
    await primeTilemap(page);

    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Place a tile.
    await page.mouse.click(cx, cy);
    await expect(page.getByTestId('history-list')).toContainText('Place Tile');

    // Right-click erases.
    await page.mouse.click(cx, cy, { button: 'right' });
    await expect(page.getByTestId('history-list')).toContainText('Erase Tile');
  });

  test('HUD reports tile coord in tilemap mode', async ({ page }) => {
    await page.goto('/');
    await primeTilemap(page);

    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('hud-cursor')).toContainText('tile ');
  });
});
