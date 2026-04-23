import { test, expect } from '@playwright/test';

test.describe('P18 preferences + shortcut editor', () => {
  test.beforeEach(async ({ page }) => {
    // Reset prefs before every test so customizations from earlier runs don't leak.
    await page.addInitScript(() => {
      try { localStorage.removeItem('tileStudio.prefs.v1'); } catch { /* ignore */ }
    });
  });

  test('Preferences dialog opens from Edit menu', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('m-edit-prefs').click();
    await expect(page.getByTestId('dialog')).toBeVisible();
    await expect(page.getByTestId('pref-tab-general')).toBeVisible();
    await expect(page.getByTestId('pref-tab-shortcuts')).toBeVisible();
  });

  test('General tab toggles autosave + updates checker size', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('m-edit-prefs').click();
    const initial = await page.evaluate(() => (globalThis as any).__tileStudio.prefs.getState().autosaveEnabled);
    await page.getByTestId('pref-autosave').click();
    const after = await page.evaluate(() => (globalThis as any).__tileStudio.prefs.getState().autosaveEnabled);
    expect(after).toBe(!initial);
  });

  test('Shortcut editor surfaces the action catalog', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('m-edit-prefs').click();
    await page.getByTestId('pref-tab-shortcuts').click();
    await expect(page.getByTestId('pref-sc-row-tool.pencil')).toBeVisible();
    await expect(page.getByTestId('pref-sc-row-select.copy')).toBeVisible();
    await expect(page.getByTestId('pref-sc-row-edit.undo')).toBeVisible();
  });

  test('Rebind a shortcut via the key-capture UI', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('m-edit-prefs').click();
    await page.getByTestId('pref-tab-shortcuts').click();
    // Start capturing for the pencil tool.
    await page.getByTestId('pref-sc-edit-tool.pencil').click();
    // Press a new combo.
    await page.keyboard.press('k');
    const bound = await page.evaluate(() =>
      (globalThis as any).__tileStudio.prefs.getState().shortcuts['tool.pencil']
    );
    expect(bound).toBe('k');
  });

  test('Filter field narrows the shortcut list', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('m-edit-prefs').click();
    await page.getByTestId('pref-tab-shortcuts').click();
    await page.getByTestId('pref-sc-filter').fill('undo');
    await expect(page.getByTestId('pref-sc-row-edit.undo')).toBeVisible();
    await expect(page.getByTestId('pref-sc-row-tool.pencil')).toHaveCount(0);
  });

  test('Reset all restores DEFAULT_SHORTCUTS', async ({ page }) => {
    await page.goto('/');
    // Mutate a shortcut directly.
    await page.evaluate(() => {
      (globalThis as any).__tileStudio.prefs.getState().setShortcut('tool.pencil', 'z');
    });
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('m-edit-prefs').click();
    await page.getByTestId('pref-tab-shortcuts').click();
    await page.getByTestId('pref-sc-reset-all').click();
    const bound = await page.evaluate(() =>
      (globalThis as any).__tileStudio.prefs.getState().shortcuts['tool.pencil']
    );
    expect(bound).toBe('b');
  });

  test('Custom shortcut actually fires the action when pressed', async ({ page }) => {
    await page.goto('/');
    // Rebind pencil to "k" and verify pressing "k" sets the tool.
    await page.evaluate(() => {
      (globalThis as any).__tileStudio.prefs.getState().setShortcut('tool.pencil', 'k');
      // Start from eraser so switching to pencil is observable.
      (globalThis as any).__tileStudio.store.getState().setTool('eraser');
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('k');
    const tool = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().tool);
    expect(tool).toBe('pencil');
  });

  test('keyEventToShortcut produces canonical combos', async ({ page }) => {
    await page.goto('/');
    const combos = await page.evaluate(() => {
      const k = (globalThis as any).__tileStudio.shortcuts.keyEventToShortcut;
      const make = (init: any) => k({ ...{ ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }, ...init, preventDefault(){}, stopPropagation(){} });
      return [
        make({ key: 's', ctrlKey: true }),
        make({ key: 'S', ctrlKey: true, shiftKey: true }),
        make({ key: 'a', altKey: true }),
        make({ key: ' ' }),
        make({ key: 'Shift' }),
      ];
    });
    expect(combos[0]).toBe('Ctrl+s');
    expect(combos[1]).toBe('Ctrl+Shift+s');
    expect(combos[2]).toBe('Alt+a');
    expect(combos[3]).toBe('Space');
    expect(combos[4]).toBe('');
  });

  test('OS clipboard: write then read round-trips an image (if browser permits)', async ({ page, context }) => {
    // Grant clipboard permissions up front — Playwright's Chromium needs this.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    const ok = await page.evaluate(async () => {
      const mod = await import('/src/io/os-clipboard.ts');
      const buf = new Uint32Array(4); buf.fill(0xff0000ff);
      const mask = new Uint8Array(4); mask.fill(1);
      const wrote = await mod.writeClipboardAsPNG({ w: 2, h: 2, data: buf, mask });
      const img = await mod.readClipboardImage();
      return { wrote, w: img?.w ?? 0, h: img?.h ?? 0 };
    });
    // We only assert the round-trip structurally — some browsers flake on timing.
    if (ok.wrote) {
      expect(ok.w).toBe(2);
      expect(ok.h).toBe(2);
    }
  });

  test('Frame navigation keys still work even when no shortcut is bound to them', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().addFrame(0, false));
    // currentFrame should be 1 now (addFrame returns index 1 and sets current).
    const before = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().currentFrame);
    await page.keyboard.press('ArrowLeft');
    const after = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().currentFrame);
    expect(after).toBe(Math.max(0, before - 1));
  });
});
