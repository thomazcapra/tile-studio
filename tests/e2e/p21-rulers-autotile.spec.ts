import { test, expect } from '@playwright/test';

test.describe('P21 rulers + auto-tile', () => {
  test('Rulers render at the top and left edges of the viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('ruler-top')).toBeVisible();
    await expect(page.getByTestId('ruler-left')).toBeVisible();
  });

  test('Double-click on top ruler adds a vertical guide', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().guides.length);
    await page.getByTestId('ruler-top').dblclick({ position: { x: 50, y: 5 } });
    const after = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().guides);
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].axis).toBe('v');
  });

  test('Double-click on left ruler adds a horizontal guide', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().guides.length);
    await page.getByTestId('ruler-left').dblclick({ position: { x: 5, y: 50 } });
    const after = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().guides);
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].axis).toBe('h');
  });

  test('autoTileGrid helper returns correct masks for a 3×3 centered cross', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.autotile;
      // Filled grid:  . X .
      //               X X X
      //               . X .
      const filled = [false, true, false, true, true, true, false, true, false];
      const grid = mod.autoTileGrid({
        mapW: 3, mapH: 3, filled, map: mod.CANONICAL_WANG_16,
      });
      return Array.from(grid).map((w: number) => w & 0x1fffffff);
    });
    // Expected tile indices (raw = idx + 1):
    //   (0,0) empty → 0
    //   (1,0) N-cap → mask S(4)+W(8)? NO — center position, neighbors:
    //         N=?(0,-1)=false, E=(2,0)=false, S=(1,1)=true, W=(0,0)=false → mask=4 → idx 4 → raw 5
    //   (2,0) empty → 0
    //   (0,1) W-cap: N(0,0)=false, E(1,1)=true, S(0,2)=false, W(-1,1)=false → mask=2 → idx 2 → raw 3
    //   (1,1) center: N(1,0)=true, E(2,1)=true, S(1,2)=true, W(0,1)=true → mask=15 → raw 16
    //   (2,1) E-cap: N=false, E=false, S=false, W(1,1)=true → mask=8 → idx 8 → raw 9
    //   (0,2) empty
    //   (1,2) S-cap: N(1,1)=true, others false → mask=1 → raw 2
    //   (2,2) empty
    expect(out).toEqual([0, 5, 0, 3, 16, 9, 0, 2, 0]);
  });

  test('applyAutoTile on a tilemap cel rewrites words per neighborhood', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      const mod = (globalThis as any).__tileStudio;
      let s = store.getState();
      // Create a tileset with 16 tiles, one tilemap 3×3.
      const tsId = s.createTileset(8, 8, 16, 'Wang');
      s = store.getState();
      const layerId = s.addTilemapLayer(tsId, 3, 3);
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      // Fill cross pattern: any non-0 word counts as "filled".
      const make = (idx: number) => ((idx + 1) & 0x1fffffff) >>> 0;
      cel.image.data[1] = make(0);
      cel.image.data[3] = make(0);
      cel.image.data[4] = make(0);
      cel.image.data[5] = make(0);
      cel.image.data[7] = make(0);
      s.applyAutoTile(layerId, mod.autotile.CANONICAL_WANG_16);
      s = store.getState();
      const after = s.sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      return Array.from(after.image.data).map((w: number) => w & 0x1fffffff);
    });
    expect(out).toEqual([0, 5, 0, 3, 16, 9, 0, 2, 0]);
  });

  test('autoTileGrid with wrap=true treats edges as a torus', async ({ page }) => {
    await page.goto('/');
    const mask = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.autotile;
      // A single filled cell at (0,0) on a 2×2 grid; with wrap, its neighbors are
      // (0,1), (1,0), (0,1), (1,0) — all empty — so mask=0, idx 0, raw=1.
      const filled = [true, false, false, false];
      const grid = mod.autoTileGrid({ mapW: 2, mapH: 2, filled, wrap: true, map: mod.CANONICAL_WANG_16 });
      return grid[0] & 0x1fffffff;
    });
    expect(mask).toBe(1);
  });
});
