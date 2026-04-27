import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname_ = dirname(fileURLToPath(import.meta.url));

// Performance benchmark for large-map rendering. Numbers are informational —
// the test asserts coarse upper bounds so a future regression that 10x's the
// composite path will fail loudly. Tighten bounds once optimizations land.

test.describe('P26 perf bench (large BQ map)', () => {
  test.setTimeout(60_000);

  test('compositeFrame + paint timings on 172x314 world', async ({ page }) => {
    const fxDir = join(__dirname_, 'fixtures');
    const tilesheetB64 = readFileSync(join(fxDir, 'bq-tilesheet.png')).toString('base64');
    const realClient = JSON.parse(readFileSync(join(fxDir, 'bq-world_client.json'), 'utf8'));
    const realServer = JSON.parse(readFileSync(join(fxDir, 'bq-world_server.json'), 'utf8'));

    await page.goto('/');

    const bench = await page.evaluate(async (args) => {
      const bq = await import('/src/io/browser-quest.ts' as any);
      const png = await import('/src/io/png.ts' as any);
      const composite = await import('/src/render/composite.ts' as any);
      const types = await import('/src/model/types.ts' as any);

      // Decode tilesheet → ImageRGBA → import sprite.
      const bin = atob(args.tilesheetB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'tilesheet.png', { type: 'image/png' });
      const tilesheet = await png.decodePNG(file);
      const { sprite } = bq.importBQ(args.client, args.server, tilesheet);

      // Warm-up (JIT) — discard first run.
      composite.compositeFrame(sprite, 0);

      // Cold full composite, repeated for stability.
      const N = 5;
      const compTimes: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = performance.now();
        composite.compositeFrame(sprite, 0);
        compTimes.push(performance.now() - t);
      }

      // Replace sprite into the store and wait for the offscreen rebuild useEffect to fire.
      const store = (globalThis as any).__tileStudio.store;
      const t1 = performance.now();
      store.getState().replaceSprite(sprite);
      // Force a flush — the offscreen rebuild is in a useEffect that runs after render.
      // Wait two animation frames to let React effect + rAF finish.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const tReplace = performance.now() - t1;

      // Mirror what the import dialog does: fit the view to the viewport so subsequent
      // pan/zoom timings reflect the realistic sub-1.0 zoom level a user actually starts at.
      const vp = document.querySelector('[data-testid="viewport-container"]') as HTMLElement;
      if (vp) store.getState().resetView(vp.clientWidth, vp.clientHeight);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Paint timings: simulate two flows — the legacy markDirty path (full
      // recomposite) and the new partial-recompose path that the tile stroke
      // helpers in Viewport.tsx now use. The latter is what users actually hit
      // while dragging a brush across tiles.
      const s = store.getState();
      const layerId = sprite.layers.find((l: any) => l.type === 'tilemap')!.id;
      const cel = s.sprite.cels.find((c: any) => c.layerId === layerId && c.frame === 0);
      const data = cel.image.data as Uint32Array;
      const composite2 = await import('/src/render/composite.ts' as any);
      // Locate the offscreen canvas. The Viewport useEffect created it; reach in
      // via the canvas children to find the parent and reuse the underlying
      // composite invariants by calling compositeRect on a fresh canvas the same
      // size as the sprite. (The real Viewport offscreen is private; for the
      // bench we re-create the same setup.)
      const benchOff = document.createElement('canvas');
      benchOff.width = sprite.w;
      benchOff.height = sprite.h;
      const benchCtx = benchOff.getContext('2d')!;
      benchCtx.putImageData(composite.compositeFrame(sprite, 0), 0, 0);

      const M = 5;
      const paintTimes: number[] = [];
      for (let n = 0; n < M; n++) {
        const x = 50 + n, y = 50;
        const tStart = performance.now();
        data[y * cel.image.w + x] = types.makeTileWord(0);
        store.getState().markDirty();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        paintTimes.push(performance.now() - tStart);
      }
      // Partial-update path: single-tile compositeRect.
      const paintPartialTimes: number[] = [];
      const ts = sprite.tilesets[0];
      for (let n = 0; n < M; n++) {
        const x = 60 + n, y = 60;
        const tStart = performance.now();
        data[y * cel.image.w + x] = types.makeTileWord(1);
        composite2.compositeRect(sprite, 0, benchCtx, { x: x * ts.grid.tw, y: y * ts.grid.th, w: ts.grid.tw, h: ts.grid.th });
        paintPartialTimes.push(performance.now() - tStart);
      }

      // Pan: change panX/panY (just affects draw, not recomposite).
      (globalThis as any).__tileStudioPerf = [];
      const panTimes: number[] = [];
      const panSyncTimes: number[] = [];
      let panBreakdown: any = null;
      for (let n = 0; n < M; n++) {
        const tStart = performance.now();
        store.getState().setPan(n * 50, n * 50);
        const tSync = performance.now();
        panSyncTimes.push(tSync - tStart);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        panTimes.push(performance.now() - tStart);
        if (n === 0) {
          panBreakdown = (globalThis as any).__tileStudioPerf.slice();
        }
      }
      (globalThis as any).__tileStudioPerf = null;

      // Zoom (also recomputes pan, redraws — should be cheap).
      const zoomTimes: number[] = [];
      const zooms = [1, 2, 4, 1, 0.5];
      for (const z of zooms) {
        const tStart = performance.now();
        store.getState().setZoom(z);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        zoomTimes.push(performance.now() - tStart);
      }

      function stats(arr: number[]) {
        const sorted = [...arr].sort((a, b) => a - b);
        const sum = arr.reduce((a, b) => a + b, 0);
        return {
          n: arr.length,
          mean: sum / arr.length,
          median: sorted[Math.floor(sorted.length / 2)],
          min: sorted[0],
          max: sorted[sorted.length - 1],
        };
      }

      return {
        spriteW: sprite.w,
        spriteH: sprite.h,
        layerCount: sprite.layers.length,
        cellCount: args.client.width * args.client.height,
        composite: stats(compTimes),
        replaceFlow: tReplace,
        paint: stats(paintTimes),
        paintPartial: stats(paintPartialTimes),
        pan: stats(panTimes),
        panSync: stats(panSyncTimes),
        zoom: stats(zoomTimes),
        panBreakdown,
      };
    }, { tilesheetB64, client: realClient, server: realServer });

    const fmt = (s: { mean: number; median: number; min: number; max: number; n: number }) =>
      `n=${s.n} median=${s.median.toFixed(1)}ms mean=${s.mean.toFixed(1)}ms (min=${s.min.toFixed(1)} max=${s.max.toFixed(1)})`;

    // eslint-disable-next-line no-console
    console.log(`\n=== Perf bench: ${bench.spriteW}x${bench.spriteH} px (${bench.cellCount} cells, ${bench.layerCount} layers) ===`);
    // eslint-disable-next-line no-console
    console.log(`  compositeFrame (cold):       ${fmt(bench.composite)}`);
    // eslint-disable-next-line no-console
    console.log(`  replaceSprite → offscreen:   ${bench.replaceFlow.toFixed(1)}ms`);
    // eslint-disable-next-line no-console
    console.log(`  paint stroke (full rebuild): ${fmt(bench.paint)}`);
    // eslint-disable-next-line no-console
    console.log(`  paint stroke (partial rect): ${fmt(bench.paintPartial)}`);
    // eslint-disable-next-line no-console
    console.log(`  pan (sync setPan call):      ${fmt(bench.panSync)}`);
    // eslint-disable-next-line no-console
    console.log(`  pan (full):                  ${fmt(bench.pan)}`);
    // eslint-disable-next-line no-console
    console.log(`  zoom:                        ${fmt(bench.zoom)}\n`);
    if (bench.panBreakdown) {
      // eslint-disable-next-line no-console
      console.log('  pan breakdown (cumulative ms since draw start):');
      for (const m of bench.panBreakdown) {
        // eslint-disable-next-line no-console
        console.log(`    ${m.label.padEnd(20)} ${m.ms.toFixed(1)}ms`);
      }
    }

    // Coarse upper bounds to catch 5-10x regressions. Tighten as we optimize.
    expect(bench.composite.median, 'compositeFrame median').toBeLessThan(2000);
    // Partial-rect paint is the new hot path — should be sub-frame even at 172x314.
    expect(bench.paintPartial.median, 'partial paint median').toBeLessThan(20);
    // Pan/zoom run in dev mode under StrictMode (double-fired effects). The
    // production path is much faster; these bounds are loose to accommodate dev.
    expect(bench.pan.median, 'pan median').toBeLessThan(2000);
    expect(bench.zoom.median, 'zoom median').toBeLessThan(2000);
  });
});
