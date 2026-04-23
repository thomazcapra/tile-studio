import { expect, test } from '@playwright/test';

test.describe('wiki routes', () => {
  test('root route still renders the editor application', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('app-root')).toBeVisible();
    await expect(page.getByTestId('viewport-canvas')).toBeVisible();
  });

  test('wiki home route renders the documentation shell', async ({ page }) => {
    await page.goto('/wiki');
    await expect(page.getByTestId('wiki-shell')).toBeVisible();
    await expect(page.getByTestId('wiki-page-title')).toContainText('Home');
    await expect(page.locator('.wiki-nav-link[href="/wiki/getting-started"]').first()).toBeVisible();
  });

  test('wiki article routes render detailed pages and link back to the editor', async ({ page }) => {
    await page.goto('/wiki/getting-started');
    await expect(page.getByTestId('wiki-page-title')).toContainText('Getting Started');
    await expect(page.getByTestId('wiki-article')).toContainText('Your First Five Minutes');
    await expect(page.getByTestId('wiki-back-editor')).toHaveAttribute('href', '/');
  });
});
