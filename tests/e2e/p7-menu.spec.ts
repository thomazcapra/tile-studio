import { test, expect } from '@playwright/test';

test.describe('P7 menu bar + view options', () => {
  test('menu bar renders top-level items and opens dropdowns', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('menu-bar')).toBeVisible();
    for (const m of ['file', 'edit', 'view', 'layer', 'tileset']) {
      await expect(page.getByTestId(`menu-${m}`)).toBeVisible();
    }
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('m-view-tiled-both')).toBeVisible();
  });

  test('Tiled Mode: Both toggles the option with a check mark', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-view').click();
    await page.getByTestId('m-view-tiled-both').click();
    // Re-open to verify check mark.
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('m-view-tiled-both')).toContainText('✓');
  });

  test('N toggles Show Tile Numbers', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('n');
    await page.getByTestId('menu-view').click();
    await expect(page.getByTestId('m-view-tile-numbers')).toContainText('✓');
  });

  test('Layer → Layer Properties opens dialog and renames the current layer', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-layer').click();
    await page.getByTestId('m-layer-props').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    const input = page.getByTestId('lp-name');
    await input.fill('Background');
    await page.getByTestId('lp-apply').click();
    await expect(page.getByTestId('dialog')).toBeHidden();
    await expect(page.getByTestId('layers-list')).toContainText('Background');
  });

  test('Tileset → Tileset Properties is disabled without tilesets', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-tileset').click();
    await expect(page.getByTestId('m-ts-props')).toBeDisabled();
  });

  test('Layer → Flatten turns an empty tilemap layer back into raster', async ({ page }) => {
    await page.goto('/');
    // Create a tileset with 1 initial tile + tilemap layer via exposed store.
    await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      const s = store.getState();
      const tsId = s.createTileset(8, 8, 1, 'T');
      s.addTilemapLayer(tsId, 4, 4, 'MyMap');
    });
    await page.getByTestId('menu-layer').click();
    await page.getByTestId('m-layer-to-raster').click();
    const layerType = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return s.sprite.layers.find((l: any) => l.id === s.currentLayerId)?.type;
    });
    expect(layerType).toBe('raster');
  });
});
