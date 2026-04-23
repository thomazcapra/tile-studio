import { test, expect } from '@playwright/test';

// Verifies that each action added in P16–P22 now participates in the undo
// history. Pattern: perform the action, observe a state change, call undo(),
// observe the state reverted to its pre-action shape.

test.describe('P24 undo coverage for P16–P22 actions', () => {
  test('addSlice is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      s.addSlice({ x: 0, y: 0, w: 5, h: 5 }, 'A');
      const after = (globalThis as any).__tileStudio.store.getState().sprite.slices?.length ?? 0;
      (globalThis as any).__tileStudio.store.getState().undo();
      const undone = (globalThis as any).__tileStudio.store.getState().sprite.slices?.length ?? 0;
      return { after, undone };
    });
    expect(out.after).toBe(1);
    expect(out.undone).toBe(0);
  });

  test('deleteSlice is undoable (restores the deleted slice)', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      mod.getState().addSlice({ x: 0, y: 0, w: 5, h: 5 }, 'ToDelete');
      const id = mod.getState().sprite.slices[0].id;
      mod.getState().deleteSlice(id);
      const after = mod.getState().sprite.slices.length;
      mod.getState().undo();
      const slices = mod.getState().sprite.slices;
      return { after, restored: slices.length, name: slices[0]?.name };
    });
    expect(out.after).toBe(0);
    expect(out.restored).toBe(1);
    expect(out.name).toBe('ToDelete');
  });

  test('renameSlice is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      mod.getState().addSlice({ x: 0, y: 0, w: 5, h: 5 }, 'Original');
      const id = mod.getState().sprite.slices[0].id;
      mod.getState().renameSlice(id, 'Changed');
      const renamed = mod.getState().sprite.slices[0].name;
      mod.getState().undo();
      return { renamed, reverted: mod.getState().sprite.slices[0].name };
    });
    expect(out.renamed).toBe('Changed');
    expect(out.reverted).toBe('Original');
  });

  test('addReferenceLayer is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      const before = mod.getState().sprite.layers.length;
      const img = { colorMode: 'rgba' as const, w: 4, h: 4, data: new Uint32Array(16) };
      mod.getState().addReferenceLayer(img, 'Ref');
      const after = mod.getState().sprite.layers.length;
      mod.getState().undo();
      return { before, after, undone: mod.getState().sprite.layers.length };
    });
    expect(out.after).toBe(out.before + 1);
    expect(out.undone).toBe(out.before);
  });

  test('linkCels is undoable (unshares the image refs)', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      const s = mod.getState();
      s.addFrame(0, true);
      const s2 = mod.getState();
      const layerId = s2.currentLayerId;
      const cels = s2.sprite.cels.filter((c: any) => c.layerId === layerId);
      s2.linkCels(cels.map((c: any) => c.id));
      const s3 = mod.getState();
      const linked = s3.sprite.cels.find((c: any) => c.id === cels[0].id).image ===
                     s3.sprite.cels.find((c: any) => c.id === cels[1].id).image;
      s3.undo();
      const s4 = mod.getState();
      const unlinked = s4.sprite.cels.find((c: any) => c.id === cels[0].id).linkedGroupId;
      return { linked, unlinked };
    });
    expect(out.linked).toBe(true);
    expect(out.unlinked).toBeUndefined();
  });

  test('deleteTile is undoable (tile is re-added + cel words restored)', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(8, 8, 3, 'T');
      s = mod.getState();
      const layerId = s.addTilemapLayer(tsId, 2, 1);
      s = mod.getState();
      const celId = s.sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!.id;
      // Paint tile idx 1 and idx 2 onto the cel.
      const initCel = s.sprite.cels.find((c: any) => c.id === celId)!;
      initCel.image.data[0] = 2;
      initCel.image.data[1] = 3;
      s.deleteTile(tsId, 1);
      // Re-fetch cel — remapTilemapCels creates new cel objects with new data arrays.
      const postDelCel = mod.getState().sprite.cels.find((c: any) => c.id === celId)!;
      const afterDel = [postDelCel.image.data[0] & 0x1fffffff, postDelCel.image.data[1] & 0x1fffffff];
      const afterTiles = mod.getState().sprite.tilesets.find((t: any) => t.id === tsId)!.tiles.length;
      mod.getState().undo();
      const restoredTiles = mod.getState().sprite.tilesets.find((t: any) => t.id === tsId)!.tiles.length;
      const restoredCel = mod.getState().sprite.cels.find((c: any) => c.id === celId)!;
      return {
        afterDel,
        afterTiles,
        restoredTiles,
        restoredWords: [restoredCel.image.data[0] & 0x1fffffff, restoredCel.image.data[1] & 0x1fffffff],
      };
    });
    // After delete: cel[0] (was idx 1 → deleted) becomes 0, cel[1] (was idx 2) shifts down to raw=2.
    expect(out.afterDel).toEqual([0, 2]);
    expect(out.afterTiles).toBe(2);
    // After undo: tileset regrows to 3, cel words restored.
    expect(out.restoredTiles).toBe(3);
    expect(out.restoredWords).toEqual([2, 3]);
  });

  test('duplicateTile is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(8, 8, 2, 'T');
      s = mod.getState();
      s.duplicateTile(tsId, 0);
      const afterDup = mod.getState().sprite.tilesets.find((t: any) => t.id === tsId)!.tiles.length;
      mod.getState().undo();
      const undone = mod.getState().sprite.tilesets.find((t: any) => t.id === tsId)!.tiles.length;
      return { afterDup, undone };
    });
    expect(out.afterDup).toBe(3);
    expect(out.undone).toBe(2);
  });

  test('reorderTile is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(8, 8, 3, 'T');
      s = mod.getState();
      // Tag each tile with a distinct first pixel so reorder is observable.
      const ts = mod.getState().sprite.tilesets.find((t: any) => t.id === tsId)!;
      ts.tiles[0].image.data[0] = 0xff0000ff;
      ts.tiles[1].image.data[0] = 0xff00ff00;
      ts.tiles[2].image.data[0] = 0xffff0000;
      s.reorderTile(tsId, 0, 2);
      const afterMove = mod.getState().sprite.tilesets
        .find((t: any) => t.id === tsId)!
        .tiles.map((t: any) => t.image.data[0]);
      mod.getState().undo();
      const restored = mod.getState().sprite.tilesets
        .find((t: any) => t.id === tsId)!
        .tiles.map((t: any) => t.image.data[0]);
      return { afterMove, restored };
    });
    // After 0→2: [g, r, red_old_to_end]
    expect(out.afterMove).toEqual([0xff00ff00, 0xffff0000, 0xff0000ff]);
    // Undo restores original order.
    expect(out.restored).toEqual([0xff0000ff, 0xff00ff00, 0xffff0000]);
  });

  test('setTileAnimation is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(4, 4, 1, 'A');
      s = mod.getState();
      const img = { colorMode: 'rgba', w: 4, h: 4, data: new Uint32Array(16) };
      s.setTileAnimation(tsId, 0, [img, img], 100);
      const before = !!mod.getState().sprite.tilesets.find((t: any) => t.id === tsId)!.tiles[0].animation;
      mod.getState().undo();
      const after = !!mod.getState().sprite.tilesets.find((t: any) => t.id === tsId)!.tiles[0].animation;
      return { before, after };
    });
    expect(out.before).toBe(true);
    expect(out.after).toBe(false);
  });

  test('fillTilemapRegion is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(8, 8, 1, 'T');
      s = mod.getState();
      const layerId = s.addTilemapLayer(tsId, 4, 4);
      s = mod.getState();
      s.setTilemapRegion({ x: 0, y: 0, w: 2, h: 2 });
      const s2 = mod.getState();
      s2.fillTilemapRegion(0);
      const cel = mod.getState().sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      const filledCount = Array.from(cel.image.data).filter((w: number) => w !== 0).length;
      mod.getState().undo();
      const clearedCount = Array.from(cel.image.data).filter((w: number) => w !== 0).length;
      return { filledCount, clearedCount };
    });
    expect(out.filledCount).toBe(4);
    expect(out.clearedCount).toBe(0);
  });

  test('flipTilemapRegion is undoable (restores words + flip flags)', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(8, 8, 2, 'T');
      s = mod.getState();
      const layerId = s.addTilemapLayer(tsId, 2, 1);
      s = mod.getState();
      const cel = mod.getState().sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      cel.image.data[0] = 1;
      cel.image.data[1] = 2;
      s.setTilemapRegion({ x: 0, y: 0, w: 2, h: 1 });
      mod.getState().flipTilemapRegion('h');
      const flipped = Array.from(cel.image.data);
      mod.getState().undo();
      const restored = Array.from(cel.image.data);
      return { flipped, restored };
    });
    // After flip: positions swapped + X flip bit set on each.
    expect(out.flipped[0] & 0x1fffffff).toBe(2);
    expect((out.flipped[0] & (1 << 29)) !== 0).toBe(true);
    // Undo restores raw words (1, 2, no flip bit).
    expect(out.restored[0]).toBe(1);
    expect(out.restored[1]).toBe(2);
  });

  test('rotateTilemapRegion180 is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(8, 8, 4, 'T');
      s = mod.getState();
      const layerId = s.addTilemapLayer(tsId, 2, 2);
      s = mod.getState();
      const cel = mod.getState().sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      cel.image.data.set([1, 2, 3, 4]);
      s.setTilemapRegion({ x: 0, y: 0, w: 2, h: 2 });
      mod.getState().rotateTilemapRegion180();
      const rotated = Array.from(cel.image.data).map((w: number) => w & 0x1fffffff);
      mod.getState().undo();
      const restored = Array.from(cel.image.data).map((w: number) => w & 0x1fffffff);
      return { rotated, restored };
    });
    expect(out.rotated).toEqual([4, 3, 2, 1]);
    expect(out.restored).toEqual([1, 2, 3, 4]);
  });

  test('nudgeTilemapRegion is undoable (restores words + region bounds)', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      let s = mod.getState();
      const tsId = s.createTileset(8, 8, 1, 'T');
      s = mod.getState();
      const layerId = s.addTilemapLayer(tsId, 4, 4);
      s = mod.getState();
      const cel = mod.getState().sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      cel.image.data[0] = 1;
      s.setTilemapRegion({ x: 0, y: 0, w: 1, h: 1 });
      mod.getState().nudgeTilemapRegion(1, 0);
      const nudged = cel.image.data[1];
      const regionAfter = mod.getState().tilemapRegion;
      mod.getState().undo();
      const restored = cel.image.data[0];
      const regionBack = mod.getState().tilemapRegion;
      return { nudged, regionAfter, restored, regionBack };
    });
    expect(out.nudged).toBe(1);
    expect(out.regionAfter).toEqual({ x: 1, y: 0, w: 1, h: 1 });
    expect(out.restored).toBe(1);
    expect(out.regionBack).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test('rotateSelectionContent is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      const s = mod.getState();
      const img = s.activeImage();
      // Paint a 2×2 block and select it.
      img.data[10 * img.w + 10] = 0xff0000ff;
      img.data[10 * img.w + 11] = 0xff00ff00;
      img.data[11 * img.w + 10] = 0xffff0000;
      img.data[11 * img.w + 11] = 0xff00ffff;
      s.markDirty();
      s.selectRect(10, 10, 2, 2, 'replace');
      mod.getState().rotateSelectionContent(90);
      const rotatedFirst = img.data[10 * img.w + 10];
      mod.getState().undo();
      return { rotatedFirst, restoredFirst: img.data[10 * img.w + 10] };
    });
    // After undo, the original red pixel (0xff0000ff) must be back at (10,10).
    expect(out.restoredFirst).toBe(0xff0000ff);
  });

  test('scaleSelectionContent is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      const s = mod.getState();
      const img = s.activeImage();
      img.data[0] = 0xff00ff00;
      s.markDirty();
      s.selectRect(0, 0, 1, 1, 'replace');
      mod.getState().scaleSelectionContent(2, 2);
      // Scale painted 4 cells (the 1×1 expanded to 2×2).
      let scaled = 0;
      for (let i = 0; i < img.data.length; i++) if (img.data[i] !== 0) scaled++;
      mod.getState().undo();
      let restored = 0;
      for (let i = 0; i < img.data.length; i++) if (img.data[i] !== 0) restored++;
      return { scaled, restored };
    });
    expect(out.scaled).toBe(4);
    expect(out.restored).toBe(1);
  });

  test('captureCustomBrush is undoable', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio.store;
      const s = mod.getState();
      s.selectRect(0, 0, 2, 2, 'replace');
      mod.getState().captureCustomBrush();
      const brushAfter = !!mod.getState().customBrush;
      mod.getState().undo();
      return { brushAfter, brushUndone: !!mod.getState().customBrush };
    });
    expect(out.brushAfter).toBe(true);
    expect(out.brushUndone).toBe(false);
  });
});
