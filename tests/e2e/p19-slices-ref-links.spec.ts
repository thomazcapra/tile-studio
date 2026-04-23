import { test, expect } from '@playwright/test';

test.describe('P19 slices + reference layer + linked cels', () => {
  test('addSlice creates an entry with a key for the current frame', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      const id = s.addSlice({ x: 2, y: 3, w: 10, h: 10 }, 'HitBox');
      const s2 = (globalThis as any).__tileStudio.store.getState();
      const slice = (s2.sprite.slices ?? []).find((x: any) => x.id === id);
      return {
        found: !!slice,
        name: slice?.name,
        selected: s2.selectedSliceId === id,
        key: slice?.keys[0],
      };
    });
    expect(info.found).toBe(true);
    expect(info.name).toBe('HitBox');
    expect(info.selected).toBe(true);
    expect(info.key).toEqual({ frame: 0, bounds: { x: 2, y: 3, w: 10, h: 10 } });
  });

  test('Slice tool: dragging on the canvas creates a new slice', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().setTool('slice'));
    const canvas = page.getByTestId('viewport-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    const count = await page.evaluate(() => ((globalThis as any).__tileStudio.store.getState().sprite.slices ?? []).length);
    expect(count).toBe(1);
  });

  test('Slices panel lists the slice and can rename it', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().addSlice({ x: 1, y: 1, w: 8, h: 8 }, 'Foo'));
    // Find the slice row and rename via its input.
    const id = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().sprite.slices[0].id);
    const input = page.getByTestId(`slice-${id}-name`);
    await input.fill('Renamed');
    const name = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().sprite.slices[0].name);
    expect(name).toBe('Renamed');
  });

  test('deleteSlice removes the entry and clears selection', async ({ page }) => {
    await page.goto('/');
    const sid = await page.evaluate(() => (globalThis as any).__tileStudio.store.getState().addSlice({ x: 0, y: 0, w: 4, h: 4 }));
    await page.evaluate((id: string) => (globalThis as any).__tileStudio.store.getState().deleteSlice(id), sid);
    const out = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return { count: (s.sprite.slices ?? []).length, selected: s.selectedSliceId };
    });
    expect(out.count).toBe(0);
    expect(out.selected).toBeNull();
  });

  test('Reference layer is created with locked + opacity=128, marked type=reference', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(() => {
      const img = { colorMode: 'rgba' as const, w: 4, h: 4, data: new Uint32Array(16).fill(0xff00ff00) };
      const id = (globalThis as any).__tileStudio.store.getState().addReferenceLayer(img, 'Ref');
      const s = (globalThis as any).__tileStudio.store.getState();
      const layer = s.sprite.layers.find((l: any) => l.id === id);
      const cel = s.sprite.cels.find((c: any) => c.layerId === id && c.frame === 0);
      return { type: layer.type, locked: layer.locked, opacity: layer.opacity, celW: cel?.image.w };
    });
    expect(info.type).toBe('reference');
    expect(info.locked).toBe(true);
    expect(info.opacity).toBe(128);
    expect(info.celW).toBe(4);
  });

  test('Reference layer is excluded from export composite', async ({ page }) => {
    await page.goto('/');
    const diff = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      // Paint the raster layer solid red.
      const s = mod.store.getState();
      s.activeImage().data.fill(0xff0000ff);
      s.markDirty();
      // Add a bright-green reference layer covering the whole sprite.
      const refImg = { colorMode: 'rgba' as const, w: s.sprite.w, h: s.sprite.h, data: new Uint32Array(s.sprite.w * s.sprite.h).fill(0xff00ff00) };
      s.addReferenceLayer(refImg);
      const s2 = mod.store.getState();
      // Export PNG — reference is excluded, so top-left should be red (AABBGGRR for red = 0xff0000ff).
      const blob = await mod.exporters.spriteFramePNG(s2.sprite, 0);
      const bitmap = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bitmap.width; c.height = bitmap.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const pix = ctx.getImageData(0, 0, 1, 1).data;
      // pix is RGBA in sRGB canvas order: R, G, B, A.
      return { r: pix[0], g: pix[1], b: pix[2] };
    });
    expect(diff.r).toBeGreaterThan(200);
    expect(diff.g).toBeLessThan(40);
  });

  test('linkCels groups cels so they share the same image reference', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      // Add a second frame (total 2 cels for the active raster layer).
      s.addFrame(0, true);
      s = store.getState();
      const layerId = s.currentLayerId;
      const cels = s.sprite.cels.filter((c: any) => c.layerId === layerId);
      const ids = cels.map((c: any) => c.id);
      const ok = s.linkCels(ids);
      s = store.getState();
      const sameRef = s.sprite.cels.find((c: any) => c.id === ids[0]).image ===
                       s.sprite.cels.find((c: any) => c.id === ids[1]).image;
      return { ok, sameRef, group: s.sprite.cels.find((c: any) => c.id === ids[0]).linkedGroupId };
    });
    expect(out.ok).toBe(true);
    expect(out.sameRef).toBe(true);
    expect(typeof out.group).toBe('string');
  });

  test('Editing a linked cel updates siblings (both see the pixel)', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      s.addFrame(0, true);
      s = store.getState();
      const layerId = s.currentLayerId;
      const cels = s.sprite.cels.filter((c: any) => c.layerId === layerId);
      s.linkCels(cels.map((c: any) => c.id));
      s = store.getState();
      // Mutate the first cel's data directly — the second cel shares the same buffer.
      const cel0 = s.sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0)!;
      cel0.image.data[0] = 0xffabcd01;
      const cel1 = s.sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 1)!;
      return { v0: cel0.image.data[0], v1: cel1.image.data[0] };
    });
    expect(out.v0).toBe(0xffabcd01);
    expect(out.v1).toBe(0xffabcd01);
  });

  test('unlinkCel detaches one cel and clones its buffer', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const store = (globalThis as any).__tileStudio.store;
      let s = store.getState();
      s.addFrame(0, true);
      s = store.getState();
      const layerId = s.currentLayerId;
      const cels = s.sprite.cels.filter((c: any) => c.layerId === layerId);
      s.linkCels(cels.map((c: any) => c.id));
      s = store.getState();
      const id = cels[1].id;
      const before = s.sprite.cels.find((c: any) => c.id === id).image === s.sprite.cels.find((c: any) => c.id === cels[0].id).image;
      s.unlinkCel(id);
      s = store.getState();
      const after = s.sprite.cels.find((c: any) => c.id === id).image === s.sprite.cels.find((c: any) => c.id === cels[0].id).image;
      return { before, after, link: s.sprite.cels.find((c: any) => c.id === id).linkedGroupId };
    });
    expect(out.before).toBe(true);
    expect(out.after).toBe(false);
    expect(out.link).toBeUndefined();
  });

  test('Layer menu exposes "New Reference Layer…"', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-layer').click();
    await expect(page.getByTestId('m-layer-new-ref')).toBeVisible();
  });
});
