import { test, expect } from '@playwright/test';

test.describe('P2 tilesets', () => {
  test('initial state: tile mode is disabled, panel is empty', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tilesets-panel')).toBeVisible();
    await expect(page.getByTestId('mode-tile')).toBeDisabled();
  });

  test('create tileset, add + duplicate + delete tiles', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tileset-new').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    await page.getByTestId('ts-create').click();

    // 8 initial tiles should render.
    const tileZero = page.getByTestId(/^tile-tset_/).first();
    await expect(tileZero).toBeVisible();
    const initialCount = await page.locator('[data-testid^="tile-tset_"]').count();
    expect(initialCount).toBe(8);

    // Mode Tile becomes enabled.
    await expect(page.getByTestId('mode-tile')).toBeEnabled();

    // Add 1 → 9 tiles.
    const addBtn = page.locator('[data-testid$="-add"]').first();
    await addBtn.click();
    await expect(page.locator('[data-testid^="tile-tset_"]')).toHaveCount(9);

    // Right-click the first tile → duplicate → 10 tiles.
    await page.locator('[data-testid^="tile-tset_"]').first().click({ button: 'right' });
    await expect(page.getByTestId('tile-context-menu')).toBeVisible();
    await page.getByTestId('menu-duplicate').click();
    await expect(page.locator('[data-testid^="tile-tset_"]')).toHaveCount(10);

    // Right-click last tile → delete → 9 tiles.
    await page.locator('[data-testid^="tile-tset_"]').last().click({ button: 'right' });
    await page.getByTestId('menu-delete').click();
    await expect(page.locator('[data-testid^="tile-tset_"]')).toHaveCount(9);
  });

  test('double-click tile enters tile mode and shows edit badge', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tileset-new').click();
    await page.getByTestId('ts-create').click();

    // Double-click first tile.
    const tiles = page.locator('[data-testid^="tile-tset_"]');
    await tiles.first().dblclick();

    await expect(page.getByTestId('edit-target-badge')).toBeVisible();
    await expect(page.getByTestId('edit-target-badge')).toContainText('Tile #0');
    await expect(page.getByTestId('status-bar')).toContainText('Mode: tile');

    // HUD now reports tile dimensions (16×16 default).
    await expect(page.getByTestId('hud-size')).toHaveText('16×16');
  });

  test('painting in tile mode edits the tile (thumbnail changes)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tileset-new').click();
    await page.getByTestId('ts-create').click();
    const firstTile = page.locator('[data-testid^="tile-tset_"]').first();

    // Snapshot thumbnail canvas pixel count before — all transparent.
    const before = await firstTile.locator('canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    expect(before).toBe(0);

    // Enter tile mode, pick red-ish palette color, paint.
    await firstTile.dblclick();
    await page.getByTestId('palette-5').click();
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30);
    await page.mouse.up();

    // After paint, thumbnail should have opaque pixels.
    const after = await firstTile.locator('canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    expect(after).toBeGreaterThan(0);
  });

  test('mode switches back to raster with button click', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tileset-new').click();
    await page.getByTestId('ts-create').click();
    await page.locator('[data-testid^="tile-tset_"]').first().dblclick();
    await expect(page.getByTestId('edit-target-badge')).toBeVisible();

    await page.getByTestId('mode-raster').click();
    await expect(page.getByTestId('edit-target-badge')).toBeHidden();
    await expect(page.getByTestId('hud-size')).toHaveText('64×64');
  });
});
