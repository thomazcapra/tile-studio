import { test, expect } from '@playwright/test';

// These specs exercise the .tstudio round-trip for the three data types that
// were added after the original serializer shipped: slices, linked cels, and
// animated tiles. The test setup pattern is always:
//
//   1. Construct a sprite in memory
//   2. serialize → deserialize
//   3. Assert the reloaded sprite preserves the feature in question

test.describe('P23 .tstudio persistence coverage', () => {
  test('slices round-trip through serialize/deserialize', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      let s = mod.store.getState();
      s.addSlice({ x: 4, y: 5, w: 10, h: 12 }, 'HitBox');
      s = mod.store.getState();
      const bytes = mod.nativeIO.serializeSprite(s.sprite);
      const loaded = mod.nativeIO.deserializeSprite(bytes);
      const slice = loaded.slices?.[0];
      return {
        count: loaded.slices?.length ?? 0,
        name: slice?.name,
        bounds: slice?.keys?.[0]?.bounds,
      };
    });
    expect(out.count).toBe(1);
    expect(out.name).toBe('HitBox');
    expect(out.bounds).toEqual({ x: 4, y: 5, w: 10, h: 12 });
  });

  test('linked cels preserve linkedGroupId AND share the same image buffer after reload', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      let s = mod.store.getState();
      // Two frames, one raster layer — link the two cels.
      s.addFrame(0, true);
      s = mod.store.getState();
      const layerId = s.currentLayerId;
      const cels = s.sprite.cels.filter((c: any) => c.layerId === layerId);
      s.linkCels(cels.map((c: any) => c.id));
      s = mod.store.getState();
      // Paint a unique pixel in the shared buffer so we can verify both see it after reload.
      const cel0 = s.sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      cel0.image.data[0] = 0xffabcd01;

      const bytes = mod.nativeIO.serializeSprite(s.sprite);
      const loaded = mod.nativeIO.deserializeSprite(bytes);
      const lc0 = loaded.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      const lc1 = loaded.cels.find((c: any) => c.layerId === layerId && c.frame === 1)!;
      return {
        groupId0: lc0.linkedGroupId,
        groupId1: lc1.linkedGroupId,
        sameImage: lc0.image === lc1.image,
        sameBuffer: lc0.image.data === lc1.image.data,
        c0v: lc0.image.data[0],
        c1v: lc1.image.data[0],
      };
    });
    expect(out.groupId0).toBeTruthy();
    expect(out.groupId0).toBe(out.groupId1);
    // The serializer de-duplicates by blob id, so identical buffers must
    // rehydrate to the same Uint32Array instance.
    expect(out.sameImage).toBe(true);
    expect(out.sameBuffer).toBe(true);
    expect(out.c0v).toBe(0xffabcd01);
    expect(out.c1v).toBe(0xffabcd01);
  });

  test('animated tiles survive serialize/deserialize with frame count + frameMs', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      let s = mod.store.getState();
      const tsId = s.createTileset(4, 4, 1, 'Anim');
      s = mod.store.getState();
      const ts = s.sprite.tilesets.find((t: any) => t.id === tsId)!;
      ts.tiles[0].image.data.fill(0xff0000ff);
      const mk = (c: number) => ({ colorMode: 'rgba', w: 4, h: 4, data: new Uint32Array(16).fill(c) });
      s.setTileAnimation(tsId, 0, [ts.tiles[0].image, mk(0xff00ff00), mk(0xffff0000)], 120);
      s = mod.store.getState();
      const bytes = mod.nativeIO.serializeSprite(s.sprite);
      const loaded = mod.nativeIO.deserializeSprite(bytes);
      const loadedTile = loaded.tilesets.find((t: any) => t.id === tsId)!.tiles[0];
      return {
        hasAnim: !!loadedTile.animation,
        frames: loadedTile.animation?.frames.length,
        frameMs: loadedTile.animation?.frameMs,
        // The base tile and frames[0] originally share a buffer; verify the
        // deserializer collapses them back to one.
        firstShared: loadedTile.image === loadedTile.animation?.frames[0],
        frame1First: loadedTile.animation?.frames[1].data[0],
        frame2First: loadedTile.animation?.frames[2].data[0],
      };
    });
    expect(out.hasAnim).toBe(true);
    expect(out.frames).toBe(3);
    expect(out.frameMs).toBe(120);
    expect(out.firstShared).toBe(true);
    expect(out.frame1First).toBe(0xff00ff00);
    expect(out.frame2First).toBe(0xffff0000);
  });

  test('Reference layer type and opacity round-trip', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const refImg = { colorMode: 'rgba', w: 8, h: 8, data: new Uint32Array(64).fill(0xff00ff00) };
      const s0 = mod.store.getState();
      const id = s0.addReferenceLayer(refImg, 'Ref');
      const s = mod.store.getState();
      const bytes = mod.nativeIO.serializeSprite(s.sprite);
      const loaded = mod.nativeIO.deserializeSprite(bytes);
      const layer = loaded.layers.find((l: any) => l.id === id);
      return { type: layer?.type, locked: layer?.locked, opacity: layer?.opacity };
    });
    expect(out.type).toBe('reference');
    expect(out.locked).toBe(true);
    expect(out.opacity).toBe(128);
  });

  test('default empty sprite round-trips without losing layers/cels', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const s = mod.store.getState();
      const bytes = mod.nativeIO.serializeSprite(s.sprite);
      const loaded = mod.nativeIO.deserializeSprite(bytes);
      return {
        name: loaded.name,
        dims: `${loaded.w}x${loaded.h}`,
        layerCount: loaded.layers.length,
        celCount: loaded.cels.length,
        paletteLen: loaded.palette.colors.length,
      };
    });
    expect(out.dims).toBe('64x64');
    expect(out.layerCount).toBeGreaterThan(0);
    expect(out.celCount).toBeGreaterThan(0);
    expect(out.paletteLen).toBeGreaterThan(0);
  });
});
