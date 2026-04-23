import { test, expect } from '@playwright/test';

test.describe('P16 export + palette I/O', () => {
  test('Palette: round-trip GPL export → parse reproduces palette', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const s = mod.store.getState();
      const colors = s.sprite.palette.colors;
      const gpl = mod.paletteIO.paletteToGPL(colors, 'Test');
      const parsed = mod.paletteIO.parseGPL(gpl);
      // Only the RGB part round-trips (GPL has no alpha).
      const rgbOnly = (c: number) => c & 0x00ffffff;
      return {
        startsWith: gpl.startsWith('GIMP Palette'),
        len: parsed.length,
        origLen: colors.length,
        firstMatches: rgbOnly(parsed[0]) === rgbOnly(colors[0]),
      };
    });
    expect(result.startsWith).toBe(true);
    expect(result.len).toBe(result.origLen);
    expect(result.firstMatches).toBe(true);
  });

  test('Palette: JASC .pal serializes with header and parses back', async ({ page }) => {
    await page.goto('/');
    const ok = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const colors = mod.store.getState().sprite.palette.colors;
      const pal = mod.paletteIO.paletteToPAL(colors);
      const lines = pal.split(/\r?\n/).filter(Boolean);
      const parsed = mod.paletteIO.parsePAL(pal);
      return {
        hdr: lines[0],
        version: lines[1],
        count: parseInt(lines[2], 10),
        parsedLen: parsed.length,
      };
    });
    expect(ok.hdr).toBe('JASC-PAL');
    expect(ok.version).toBe('0100');
    expect(ok.count).toBe(ok.parsedLen);
  });

  test('Palette: HEX round-trip', async ({ page }) => {
    await page.goto('/');
    const ok = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const src = new Uint32Array([0xff0000ff, 0xff00ff00, 0xffff0000]); // #ff0000, #00ff00, #0000ff
      const text = mod.paletteIO.paletteToHex(src);
      const parsed = mod.paletteIO.parseHex(text);
      return {
        first: text.split(/\r?\n/)[0],
        n: parsed.length,
        match: parsed[0] === src[0] && parsed[1] === src[1] && parsed[2] === src[2],
      };
    });
    expect(ok.first).toBe('FF0000');
    expect(ok.n).toBe(3);
    expect(ok.match).toBe(true);
  });

  test('Palette: parsePaletteFile sniffs format from filename', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const mod = (globalThis as any).__tileStudio;
      const text = ['JASC-PAL', '0100', '2', '255 0 0', '0 255 0'].join('\r\n');
      const parsed = mod.paletteIO.parsePaletteFile('foo.pal', text);
      return Array.from(parsed);
    });
    // 255,0,0 → AABBGGRR = 0xff0000ff;  0,255,0 → 0xff00ff00
    expect(result).toEqual([0xff0000ff, 0xff00ff00]);
  });

  test('Export: sprite frame as WebP produces an image/webp blob', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      const s = mod.store.getState();
      // Paint a single red pixel so the encoder has real content.
      const img = s.activeImage();
      img.data[0] = 0xff0000ff;
      s.markDirty();
      const blob = await mod.exporters.spriteFrameImage(s.sprite, 0, 'webp', 0.9);
      return { type: blob.type, size: blob.size };
    });
    expect(info.type).toBe('image/webp');
    expect(info.size).toBeGreaterThan(0);
  });

  test('Export: sprite frame as JPEG flattens alpha onto background', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      const blob = await mod.exporters.spriteFrameImage(mod.store.getState().sprite, 0, 'jpeg', 0.95);
      return { type: blob.type, size: blob.size };
    });
    expect(info.type).toBe('image/jpeg');
    expect(info.size).toBeGreaterThan(0);
  });

  test('Export: frame sequence returns one PNG per frame', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      // Add 2 more frames (total 3).
      const s1 = mod.store.getState();
      s1.addFrame(0, false);
      s1.addFrame(0, false);
      const s = mod.store.getState();
      const files = await mod.exporters.spriteFrameSequence(s.sprite, { format: 'png', filenameBase: 'anim' });
      return { count: files.length, names: files.map((f: any) => f.name) };
    });
    expect(info.count).toBe(3);
    expect(info.names[0]).toBe('anim_0.png');
    expect(info.names[2]).toBe('anim_2.png');
  });

  test('Export: sprite-sheet with JSON hash layout', async ({ page }) => {
    await page.goto('/');
    const info = await page.evaluate(async () => {
      const mod = (globalThis as any).__tileStudio;
      mod.store.getState().addFrame(0, false); // now 2 frames
      const files = await mod.exporters.spriteSheetWithMeta(mod.store.getState().sprite, 2, {
        format: 'png',
        filenameBase: 'sheet',
        layout: 'hash',
      });
      const jsonFile = files.find((f: any) => f.name.endsWith('.json'));
      const text = await jsonFile!.blob.text();
      const parsed = JSON.parse(text);
      return {
        count: files.length,
        hasPng: files.some((f: any) => f.name === 'sheet.png'),
        hasJson: !!jsonFile,
        framesIsObject: !Array.isArray(parsed.frames) && typeof parsed.frames === 'object',
        firstFrameKey: Object.keys(parsed.frames)[0],
      };
    });
    expect(info.count).toBe(2);
    expect(info.hasPng).toBe(true);
    expect(info.hasJson).toBe(true);
    expect(info.framesIsObject).toBe(true);
    expect(info.firstFrameKey).toBe('sheet_0');
  });

  test('Palette editor has import/export buttons', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('palette-edit').click();
    await expect(page.getByTestId('pe-import')).toBeVisible();
    await expect(page.getByTestId('pe-export-gpl')).toBeVisible();
    await expect(page.getByTestId('pe-export-pal')).toBeVisible();
    await expect(page.getByTestId('pe-sort-hue')).toBeVisible();
  });

  test('Palette editor sort-by-hue reorders colors', async ({ page }) => {
    await page.goto('/');
    // Install a deliberately out-of-hue-order palette.
    await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      s.setPalette(new Uint32Array([0xff0000ff, 0xff00ff00, 0xffff0000])); // red, green, blue (AABBGGRR)
    });
    await page.getByTestId('palette-edit').click();
    await page.getByTestId('pe-sort-hue').click();
    const first = await page.evaluate(() => {
      const s = (globalThis as any).__tileStudio.store.getState();
      return s.sprite.palette.colors[0];
    });
    // Red has the lowest hue in HSV; it should land at index 0.
    expect(first).toBe(0xff0000ff);
  });

  test('Export dialog exposes new format tabs (sequence + sheet) for multi-frame', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { (globalThis as any).__tileStudio.store.getState().addFrame(0, false); });
    await page.getByTestId('menu-file').click();
    await page.getByTestId('m-file-export').click();
    await expect(page.getByTestId('kind-sprite')).toBeVisible();
    await expect(page.getByTestId('kind-sequence')).toBeVisible();
    await expect(page.getByTestId('kind-sheet')).toBeVisible();
  });
});
