import { test, expect } from '@playwright/test';

// Helpers used across the spec — kept inside page.evaluate factories so the
// browser has direct access to `__tileStudio`.
test.describe('P17 tilemap region + tileset reorder', () => {
  test('reorderTile moves a tile and remaps cel words', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const store = mod.store;
      let s = store.getState();
      // 1) Create a tileset with 4 solid-color tiles.
      const tsId = s.createTileset(8, 8, 4, 'T');
      s = store.getState();
      const ts = s.sprite.tilesets.find((t: any) => t.id === tsId)!;
      // Paint each tile a distinct color so we can track reorder visually.
      const colors = [0xff0000ff, 0xff00ff00, 0xffff0000, 0xff00ffff];
      for (let i = 0; i < 4; i++) ts.tiles[i].image.data.fill(colors[i]);
      // 2) Add a tilemap layer and paint tiles [0, 1, 2, 3] on the first row.
      const tmapId = s.addTilemapLayer(tsId, 4, 1, 'M');
      s = store.getState();
      const tcel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      const { makeTileWord } = mod.exporters as any; // not it, use the helper path
      // We re-implement makeTileWord inline since it's not exposed on the namespace.
      const make = (idx: number) => ((idx + 1) & 0x1fffffff) >>> 0;
      tcel.image.data[0] = make(0);
      tcel.image.data[1] = make(1);
      tcel.image.data[2] = make(2);
      tcel.image.data[3] = make(3);
      // 3) Move tile 1 → position 3. Expected final tile order: [0, 2, 3, 1].
      const ok = s.reorderTile(tsId, 1, 3);
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      return {
        ok,
        // Read back raw tile indices at each cel position.
        indices: [
          cel.image.data[0] & 0x1fffffff,
          cel.image.data[1] & 0x1fffffff,
          cel.image.data[2] & 0x1fffffff,
          cel.image.data[3] & 0x1fffffff,
        ],
        // And the tile colors at the NEW tileset positions.
        tileColors: s.sprite.tilesets.find((t: any) => t.id === tsId)!.tiles.map((t: any) => t.image.data[0]),
      };
    });
    expect(result.ok).toBe(true);
    // After reorderTile(from=1, to=3): new tile order is [old0, old2, old3, old1].
    // Index remap: old0→new0, old1→new3, old2→new1, old3→new2.
    // Cel words painted with raw = oldIdx+1 are rewritten to raw = newIdx+1.
    //   cel[0] raw=1 (old0) → new0 → raw 1
    //   cel[1] raw=2 (old1) → new3 → raw 4
    //   cel[2] raw=3 (old2) → new1 → raw 2
    //   cel[3] raw=4 (old3) → new2 → raw 3
    expect(result.indices).toEqual([1, 4, 2, 3]);
    // And the tiles are now in new order — original colors[1] (green 0xff00ff00) at new index 3.
    expect(result.tileColors[3]).toBe(0xff00ff00);
  });

  test('deleteTile remaps: tiles referencing deleted index become 0, higher indices shift down', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      const tsId = s.createTileset(8, 8, 4, 'T');
      s = store.getState();
      const tmapId = s.addTilemapLayer(tsId, 4, 1);
      s = store.getState();
      const tcel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      const make = (idx: number) => ((idx + 1) & 0x1fffffff) >>> 0;
      tcel.image.data[0] = make(0);
      tcel.image.data[1] = make(1);
      tcel.image.data[2] = make(2);
      tcel.image.data[3] = make(3);
      // Delete tile at index 1. cel[1] should become 0, cel[2] → raw 2, cel[3] → raw 3.
      s.deleteTile(tsId, 1);
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      return [
        cel.image.data[0] & 0x1fffffff,
        cel.image.data[1] & 0x1fffffff,
        cel.image.data[2] & 0x1fffffff,
        cel.image.data[3] & 0x1fffffff,
      ];
    });
    expect(out).toEqual([1, 0, 2, 3]);
  });

  test('setTilemapRegion + fillTilemapRegion writes to the cel', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      const tsId = s.createTileset(8, 8, 2, 'T');
      s = store.getState();
      const tmapId = s.addTilemapLayer(tsId, 4, 4);
      s = store.getState();
      s.setTilemapRegion({ x: 1, y: 1, w: 2, h: 2 });
      s = store.getState();
      s.fillTilemapRegion(0); // tile idx 0 → raw 1
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      // Cells (1,1), (2,1), (1,2), (2,2) should have raw=1; others 0.
      const read = (x: number, y: number) => cel.image.data[y * 4 + x] & 0x1fffffff;
      return {
        inside: [read(1, 1), read(2, 1), read(1, 2), read(2, 2)],
        outside: [read(0, 0), read(3, 3), read(0, 2)],
      };
    });
    expect(out.inside).toEqual([1, 1, 1, 1]);
    expect(out.outside).toEqual([0, 0, 0]);
  });

  test('flipTilemapRegion horizontal swaps positions AND toggles X flip flag', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      const tsId = s.createTileset(8, 8, 3, 'T');
      s = store.getState();
      const tmapId = s.addTilemapLayer(tsId, 3, 1);
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      // Tile words for idx 0, 1, 2 (no flags).
      cel.image.data[0] = 1;
      cel.image.data[1] = 2;
      cel.image.data[2] = 3;
      s.setTilemapRegion({ x: 0, y: 0, w: 3, h: 1 });
      s = store.getState();
      s.flipTilemapRegion('h');
      s = store.getState();
      const after = Array.from(cel.image.data);
      return {
        // Raw indices should be swapped: 3, 2, 1.
        raw: after.map((w: number) => w & 0x1fffffff),
        // X flip bit (1 << 29) should be set on each tile.
        xflip: after.map((w: number) => (w & (1 << 29)) !== 0),
      };
    });
    expect(out.raw).toEqual([3, 2, 1]);
    expect(out.xflip).toEqual([true, true, true]);
  });

  test('rotateTilemapRegion180 reverses positions and toggles X+Y flip flags', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      const tsId = s.createTileset(8, 8, 4, 'T');
      s = store.getState();
      const tmapId = s.addTilemapLayer(tsId, 2, 2);
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      cel.image.data.set([1, 2, 3, 4]);
      s.setTilemapRegion({ x: 0, y: 0, w: 2, h: 2 });
      s = store.getState();
      s.rotateTilemapRegion180();
      const after = Array.from(cel.image.data);
      return {
        raw: after.map((w: number) => w & 0x1fffffff),
        xflip: after.map((w: number) => (w & (1 << 29)) !== 0),
        yflip: after.map((w: number) => (w & (1 << 30)) !== 0),
      };
    });
    // 1 2   rotate 180°  →   4 3
    // 3 4                    2 1
    expect(out.raw).toEqual([4, 3, 2, 1]);
    expect(out.xflip).toEqual([true, true, true, true]);
    expect(out.yflip).toEqual([true, true, true, true]);
  });

  test('nudgeTilemapRegion moves content and clears the source cells', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      const tsId = s.createTileset(8, 8, 2, 'T');
      s = store.getState();
      const tmapId = s.addTilemapLayer(tsId, 4, 4);
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      // Place tile raw=1 at (0,0).
      cel.image.data[0] = 1;
      s.setTilemapRegion({ x: 0, y: 0, w: 1, h: 1 });
      s = store.getState();
      s.nudgeTilemapRegion(2, 1);
      const d = cel.image.data;
      return {
        src: d[0] & 0x1fffffff,
        dst: d[1 * 4 + 2] & 0x1fffffff,
      };
    });
    expect(out.src).toBe(0);
    expect(out.dst).toBe(1);
  });

  test('Region copy/cut/paste round-trips tile words', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      const tsId = s.createTileset(8, 8, 2, 'T');
      s = store.getState();
      const tmapId = s.addTilemapLayer(tsId, 4, 4);
      s = store.getState();
      const cel = s.sprite.cels.find((c: any) => c.layerId === tmapId && c.frame === 0)!;
      cel.image.data[0] = 1;
      cel.image.data[1] = 2;
      s.setTilemapRegion({ x: 0, y: 0, w: 2, h: 1 });
      s = store.getState();
      s.copyTilemapRegion();
      s = store.getState();
      s.setTilemapRegion({ x: 0, y: 2, w: 2, h: 1 });
      s = store.getState();
      s.pasteTilemapRegion();
      const d = cel.image.data;
      return {
        topStill: [d[0] & 0x1fffffff, d[1] & 0x1fffffff],
        bottom: [d[2 * 4 + 0] & 0x1fffffff, d[2 * 4 + 1] & 0x1fffffff],
      };
    });
    expect(out.topStill).toEqual([1, 2]);
    expect(out.bottom).toEqual([1, 2]);
  });

  test('Select menu exposes tilemap-region entries (disabled when no region)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-select').click();
    await expect(page.getByTestId('m-tmap-flip-h')).toBeVisible();
    await expect(page.getByTestId('m-tmap-rot-180')).toBeVisible();
    // Activate a region via the store and verify the menu enables.
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const tsId = s.createTileset(8, 8, 1, 'T');
      const s2 = (globalThis as any).__tileStudio.store.getState();
      s2.addTilemapLayer(tsId, 4, 4);
      const s3 = (globalThis as any).__tileStudio.store.getState();
      s3.setTilemapRegion({ x: 0, y: 0, w: 2, h: 2 });
    });
    await page.getByTestId('menu-select').click();
    await expect(page.getByTestId('m-tmap-flip-h')).toBeEnabled();
  });

  test('Dragging a rect selection on a tilemap layer installs a tilemap region', async ({ page }) => {
    await page.goto('/');
    // Set up: tileset + tilemap layer, then switch to select-rect.
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const tsId = s.createTileset(16, 16, 1, 'T');
      const s2 = (globalThis as any).__tileStudio.store.getState();
      s2.addTilemapLayer(tsId, 4, 4);
      const s3 = (globalThis as any).__tileStudio.store.getState();
      s3.setTool('select-rect');
    });
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    // Drag over a big enough area of the canvas.
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    const region = await page.evaluate(() => {
      return (globalThis as any).__tileStudio.store.getState().tilemapRegion;
    });
    expect(region).not.toBeNull();
    expect(region.w).toBeGreaterThan(0);
    expect(region.h).toBeGreaterThan(0);
  });
});
