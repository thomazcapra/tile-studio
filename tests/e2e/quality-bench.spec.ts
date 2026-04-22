import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

// Diagnostic: does quantize alone make tiles dedup well on a gradient-heavy map?
// Runs several pipelines against last.png and prints the resulting unique-tile counts.
test('quality: quantize → generate dedup rate on last.png', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');

  const imgPath = path.resolve('C:/Users/thoma/Pictures/last.png');
  const buf = await fs.readFile(imgPath);
  const b64 = buf.toString('base64');

  const runs = await page.evaluate(async ({ b64 }) => {
    const { generateTilesetFromImage, quantize } = (globalThis as any).__tileStudio;

    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const cctx = c.getContext('2d')!;
    cctx.drawImage(bitmap, 0, 0);
    const src = cctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const srcImg = { colorMode: 'rgba', w: bitmap.width, h: bitmap.height, data: new Uint32Array(src.data.buffer.slice(0)) };

    // Nearest-neighbor downscale helper (pixelate).
    function pixelate(img: any, targetW: number) {
      const ratio = img.w / targetW;
      const targetH = Math.max(1, Math.floor(img.h / ratio));
      const cc = document.createElement('canvas');
      cc.width = img.w; cc.height = img.h;
      const id = new ImageData(img.w, img.h);
      new Uint32Array(id.data.buffer).set(img.data);
      cc.getContext('2d')!.putImageData(id, 0, 0);

      const small = document.createElement('canvas');
      small.width = targetW; small.height = targetH;
      const sctx = small.getContext('2d')!;
      sctx.imageSmoothingEnabled = false;
      sctx.drawImage(cc, 0, 0, targetW, targetH);
      const big = document.createElement('canvas');
      big.width = img.w; big.height = img.h;
      const bctx = big.getContext('2d')!;
      bctx.imageSmoothingEnabled = false;
      bctx.drawImage(small, 0, 0, img.w, img.h);
      const out = bctx.getImageData(0, 0, img.w, img.h);
      return { colorMode: 'rgba', w: img.w, h: img.h, data: new Uint32Array(out.data.buffer.slice(0)) };
    }

    function runScenario(name: string, image: any, tw: number, flips: boolean) {
      const r = generateTilesetFromImage(image, { tileWidth: tw, tileHeight: tw, matchFlips: flips });
      return { name, tw, flips, cells: r.mapW * r.mapH, unique: r.tilesCreated, dup: r.duplicatesFound };
    }

    const out: { name: string; cells: number; unique: number; dup: number; tw: number; flips: boolean }[] = [];

    // Baseline — raw source.
    out.push(runScenario('raw (no preprocessing)', srcImg, 16, true));

    // Quantize only (various color counts, no dither).
    for (const n of [8, 16, 32, 64]) {
      const q = quantize(srcImg, { maxColors: n, dither: false });
      const qImg = { colorMode: 'rgba', w: srcImg.w, h: srcImg.h, data: q.remappedRGBA };
      out.push(runScenario(`quantize ${n} (no dither)`, qImg, 16, true));
    }

    // Quantize with dither — should be WORSE for dedup because dither adds spatial noise.
    {
      const q = quantize(srcImg, { maxColors: 16, dither: true });
      const qImg = { colorMode: 'rgba', w: srcImg.w, h: srcImg.h, data: q.remappedRGBA };
      out.push(runScenario('quantize 16 (WITH dither)', qImg, 16, true));
    }

    // Pixelate only — downscale to 128 then back.
    for (const p of [128, 256]) {
      const px = pixelate(srcImg, p);
      out.push(runScenario(`pixelate ${p} (no quantize)`, px, 16, true));
    }

    // The golden path: pixelate 128 → quantize 16.
    {
      const px = pixelate(srcImg, 128);
      const q = quantize(px, { maxColors: 16, dither: false });
      const qImg = { colorMode: 'rgba', w: px.w, h: px.h, data: q.remappedRGBA };
      out.push(runScenario('pixelate 128 + quantize 16', qImg, 16, true));
    }
    {
      const px = pixelate(srcImg, 128);
      const q = quantize(px, { maxColors: 8, dither: false });
      const qImg = { colorMode: 'rgba', w: px.w, h: px.h, data: q.remappedRGBA };
      out.push(runScenario('pixelate 128 + quantize 8', qImg, 16, true));
    }
    {
      const px = pixelate(srcImg, 256);
      const q = quantize(px, { maxColors: 16, dither: false });
      const qImg = { colorMode: 'rgba', w: px.w, h: px.h, data: q.remappedRGBA };
      out.push(runScenario('pixelate 256 + quantize 16', qImg, 16, true));
    }

    return out;
  }, { b64 });

  console.log('\n=== Quality: quantize/pixelate effect on tile dedup (last.png, tw=16, flips=Y) ===');
  console.log('  ' + 'scenario'.padEnd(36) + 'cells'.padStart(8) + 'unique'.padStart(8) + 'dedup%'.padStart(10));
  for (const r of runs) {
    const pct = ((r.dup / r.cells) * 100).toFixed(1);
    console.log(`  ${r.name.padEnd(36)}${String(r.cells).padStart(8)}${String(r.unique).padStart(8)}${pct.padStart(9)}%`);
  }
  console.log('===============================================================================\n');
});
