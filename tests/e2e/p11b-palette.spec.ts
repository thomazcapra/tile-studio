import { test, expect } from '@playwright/test';

test.describe('P11b palette editor', () => {
  test('Palette editor opens from side panel and lists presets', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('palette-edit').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    await expect(page.getByTestId('pe-grid')).toBeVisible();
    await expect(page.getByTestId('pe-preset')).toBeVisible();
  });

  test('Loading PICO-8 preset sets palette to 16 colors', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('palette-edit').click();
    await page.getByTestId('pe-preset').selectOption('PICO-8 (16)');
    const size = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().sprite.palette.colors.length);
    expect(size).toBe(16);
  });

  test('Add swatch grows palette; remove shrinks it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('palette-edit').click();
    const before = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().sprite.palette.colors.length);
    await page.getByTestId('pe-add').click();
    const after = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().sprite.palette.colors.length);
    expect(after).toBe(before + 1);
    await page.getByTestId('pe-remove').click();
    const final = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().sprite.palette.colors.length);
    expect(final).toBe(before);
  });

  test('Editing hex of selected swatch updates the palette', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('palette-edit').click();
    await page.getByTestId('pe-swatch-0').click();
    await page.getByTestId('pe-hex').fill('#123456');
    // Hex #123456: R=0x12, G=0x34, B=0x56 → packed AABBGGRR = 0xff563412
    const c0 = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().sprite.palette.colors[0]);
    expect(c0).toBe(0xff563412);
  });

  test('Reorder via store action swaps positions', async ({ page }) => {
    await page.goto('/');
    // Capture colors of 0 and 1.
    const [c0, c1] = await page.evaluate(() => {
      const p = (globalThis as any).__tileStudio.store.getState().sprite.palette.colors;
      return [p[0], p[1]];
    });
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().reorderPaletteColor(0, 1));
    const [after0, after1] = await page.evaluate(() => {
      const p = (globalThis as any).__tileStudio.store.getState().sprite.palette.colors;
      return [p[0], p[1]];
    });
    expect(after0).toBe(c1);
    expect(after1).toBe(c0);
  });
});
