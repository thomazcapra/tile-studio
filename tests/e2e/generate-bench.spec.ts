import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

// Focused perf probe. Not covered by the default CI suite in spirit, but lives here
// so it can be run with `npx playwright test generate-bench --reporter=list`.
test('bench: generate tileset from 2048x2048 map — sync + worker', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');

  const imgPath = path.resolve('C:/Users/thoma/Pictures/last.png');
  const buf = await fs.readFile(imgPath);
  const b64 = buf.toString('base64');

  const results = await page.evaluate(async ({ b64, tileSizes }) => {
    const mod = (globalThis as any).__tileStudio;
    const syncGen: (img: unknown, opts: unknown) => { mapW: number; mapH: number; tilesCreated: number; duplicatesFound: number } = mod.generateTilesetFromImage;
    const asyncGen: (img: unknown, opts: unknown, p?: unknown) => Promise<{ mapW: number; mapH: number; tilesCreated: number; duplicatesFound: number }> = mod.generateTilesetAsync;

    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const image = {
      colorMode: 'rgba' as const,
      w: bitmap.width,
      h: bitmap.height,
      data: new Uint32Array(data.data.buffer.slice(0)),
    };

    const runs: { tw: number; flips: boolean; path: string; ms: number; cells: number; tiles: number; dup: number }[] = [];

    for (const tw of tileSizes) {
      for (const flips of [true, false]) {
        const opts = { tileWidth: tw, tileHeight: tw, matchFlips: flips };

        // Sync (main thread)
        syncGen(image, opts); // warm
        const t0 = performance.now();
        const r1 = syncGen(image, opts);
        runs.push({ tw, flips, path: 'sync', ms: Math.round(performance.now() - t0), cells: r1.mapW * r1.mapH, tiles: r1.tilesCreated, dup: r1.duplicatesFound });

        // Async (worker) — measures wall-clock including worker boot + data transfer
        const t1 = performance.now();
        const r2 = await asyncGen(image, opts);
        runs.push({ tw, flips, path: 'worker', ms: Math.round(performance.now() - t1), cells: r2.mapW * r2.mapH, tiles: r2.tilesCreated, dup: r2.duplicatesFound });
      }
    }
    return runs;
  }, { b64, tileSizes: [8, 16, 32] });

  console.log('\n=== Generate-tileset bench (2048x2048) ===');
  for (const r of results) {
    console.log(
      `  tw=${r.tw}  flips=${r.flips ? 'Y' : 'N'}  path=${r.path.padEnd(6)}  cells=${r.cells}  unique=${r.tiles}  dup=${r.dup}  ${r.ms}ms`
    );
  }
  console.log('==========================================\n');
});
