import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname_ = dirname(fileURLToPath(import.meta.url));

// BrowserQuest adapter round-trip. Builds a synthetic tilesheet + world client/server
// pair, calls importBQ → exportBQ, and asserts the exported JSONs match the input
// modulo intentional canonicalizations (drop empty arrays, trim trailing zeros, sort).

test.describe('P25 BrowserQuest adapter', () => {
  test('round-trips a synthetic 4x4 world', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const bq = await import('/src/io/browser-quest.ts' as any);

      // Synthetic 16x16 tilesheet: 1 col x 6 rows = 6 tiles, each filled with a
      // unique color. Encoded as a Uint32 ImageRGBA (AABBGGRR on LE hosts).
      const tw = 16;
      const tilesPerCol = 6;
      const palette = [0xff0000ff, 0xff00ff00, 0xffff0000, 0xffffffff, 0xff00ffff, 0xffff00ff];
      const sheetW = tw, sheetH = tw * tilesPerCol;
      const sheet = new Uint32Array(sheetW * sheetH);
      for (let i = 0; i < tilesPerCol; i++) {
        for (let y = 0; y < tw; y++) {
          for (let x = 0; x < tw; x++) {
            sheet[(i * tw + y) * sheetW + x] = palette[i];
          }
        }
      }
      const tilesheet = { colorMode: 'rgba' as const, w: sheetW, h: sheetH, data: sheet };

      // 4x4 map. Layer 0 = solid tile 1 background, layer 1 = a doodad of tile 2 in the corner.
      const W = 4, H = 4;
      const data: (number | number[])[] = [];
      for (let i = 0; i < W * H; i++) {
        // (0,0) gets a stack [1,2]; rest get just 1.
        data.push(i === 0 ? [1, 2] : 1);
      }

      const client = {
        width: W,
        height: H,
        tilesize: 16,
        data,
        // Cells (1,0) and (2,1) collide.
        collisions: [1, W + 2],
        // Tile id 3 is plateau cell at (3,3).
        plateau: [W * H - 1],
        high: [4],
        animated: { '5': { l: 2, d: 200 } },
        doors: [{ x: 2, y: 2, p: 0, tx: 0, ty: 0, to: 'u' }],
        checkpoints: [{ id: 7, x: 0, y: 0, w: 2, h: 1 }],
        musicAreas: [{ id: 'theme', x: 1, y: 1, w: 2, h: 2 }],
      };
      const server = {
        width: W,
        height: H,
        tilesize: 16,
        roamingAreas: [{ id: 0, type: 'rat', nb: 3, x: 0, y: 0, width: 2, height: 2 }],
        chestAreas: [{ x: 0, y: 0, w: 2, h: 2, i: [11, 22], tx: 1, ty: 1 }],
        staticChests: [{ x: 3, y: 0, i: [99] }],
        staticEntities: { [W + 1]: 'goblin' }, // (1,1)
      };

      const { sprite, warnings } = bq.importBQ(client, server, tilesheet);
      const out = bq.exportBQ(sprite);

      return {
        warnings,
        client: out.client,
        server: out.server,
        exportWarnings: out.warnings,
        spriteShape: {
          layers: sprite.layers.map((l: any) => ({ name: l.name, type: l.type })),
          tilesetTiles: sprite.tilesets[0].tiles.length,
          slices: sprite.slices.length,
        },
      };
    });

    // Sanity: imported sprite shape.
    expect(result.spriteShape.layers).toEqual([
      { name: 'Layer 0', type: 'tilemap' },
      { name: 'Layer 1', type: 'tilemap' },
      { name: 'Collision', type: 'tilemap' },
      { name: 'Plateau', type: 'tilemap' },
    ]);
    expect(result.spriteShape.tilesetTiles).toBe(6);
    // 1 door + 1 checkpoint + 1 music + 1 roam + 1 chestArea + 1 staticChest + 1 npc = 7.
    expect(result.spriteShape.slices).toBe(7);

    // No import warnings expected for a well-formed input.
    expect(result.warnings).toEqual([]);
    expect(result.exportWarnings).toEqual([]);

    // Client round-trip.
    expect(result.client.width).toBe(4);
    expect(result.client.height).toBe(4);
    expect(result.client.tilesize).toBe(16);
    expect(result.client.data).toEqual([
      [1, 2], 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
    ]);
    expect(result.client.collisions).toEqual([1, 6]);
    expect(result.client.plateau).toEqual([15]);
    expect(result.client.high).toEqual([4]);
    expect(result.client.animated).toEqual({ '5': { l: 2, d: 200 } });
    expect(result.client.doors).toEqual([{ x: 2, y: 2, p: 0, tx: 0, ty: 0, tcx: undefined, tcy: undefined, to: 'u' }]);
    expect(result.client.checkpoints).toEqual([{ id: 7, x: 0, y: 0, w: 2, h: 1 }]);
    expect(result.client.musicAreas).toEqual([{ id: 'theme', x: 1, y: 1, w: 2, h: 2 }]);

    // Server round-trip.
    expect(result.server.roamingAreas).toEqual([{ id: 0, type: 'rat', nb: 3, x: 0, y: 0, width: 2, height: 2 }]);
    expect(result.server.chestAreas).toEqual([{ x: 0, y: 0, w: 2, h: 2, i: [11, 22], tx: 1, ty: 1 }]);
    expect(result.server.staticChests).toEqual([{ x: 3, y: 0, i: [99] }]);
    expect(result.server.staticEntities).toEqual({ [4 + 1]: 'goblin' });
    expect(result.server.collisions).toEqual([1, 6]);
  });

  test('handles trailing-empty data length mismatch', async ({ page }) => {
    await page.goto('/');
    const { warnings, dataLen } = await page.evaluate(async () => {
      const bq = await import('/src/io/browser-quest.ts' as any);
      const tilesheet = { colorMode: 'rgba' as const, w: 16, h: 16, data: new Uint32Array(16 * 16).fill(0xff808080) };
      // 4x4 = 16 cells, but feed 14.
      const client = {
        width: 4,
        height: 4,
        tilesize: 16,
        data: new Array(14).fill(1),
      };
      const { sprite, warnings } = bq.importBQ(client, null, tilesheet);
      const out = bq.exportBQ(sprite);
      return { warnings, dataLen: out.client.data.length };
    });
    expect(dataLen).toBe(16);
    expect(warnings.some((w: string) => w.includes('padded'))).toBe(true);
  });

  test('round-trips the real BrowserQuest world (172x314)', async ({ page }) => {
    const fxDir = join(__dirname_, 'fixtures');
    const tilesheetB64 = readFileSync(join(fxDir, 'bq-tilesheet.png')).toString('base64');
    const realClient = JSON.parse(readFileSync(join(fxDir, 'bq-world_client.json'), 'utf8'));
    const realServer = JSON.parse(readFileSync(join(fxDir, 'bq-world_server.json'), 'utf8'));

    await page.goto('/');
    const result = await page.evaluate(async (args) => {
      const bq = await import('/src/io/browser-quest.ts' as any);
      const png = await import('/src/io/png.ts' as any);

      // Decode the PNG via the page's native loader so we get an ImageRGBA.
      const bin = atob(args.tilesheetB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'tilesheet.png', { type: 'image/png' });
      const tilesheet = await png.decodePNG(file);

      const t0 = performance.now();
      const { sprite, warnings: importWarnings } = bq.importBQ(args.client, args.server, tilesheet);
      const tImport = performance.now() - t0;

      const t1 = performance.now();
      const out = bq.exportBQ(sprite);
      const tExport = performance.now() - t1;

      // Compare structurally: data, collisions, doors, etc.
      function arrayEq(a: any[], b: any[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          const ai = a[i], bi = b[i];
          if (Array.isArray(ai) && Array.isArray(bi)) {
            if (!arrayEq(ai, bi)) return false;
          } else if (ai !== bi) {
            return false;
          }
        }
        return true;
      }

      // Pad real data to width*height for comparison (round-trip canonicalizes this).
      const totalCells = args.client.width * args.client.height;
      const inputData = args.client.data.slice();
      while (inputData.length < totalCells) inputData.push(0);

      const dataMatches = arrayEq(inputData, out.client.data);

      // Collisions: input may include both `collisions` and `blocking`; we merge
      // into a single sorted set on export.
      const inputCollisionSet = new Set<number>([
        ...(args.client.collisions ?? []),
        ...(args.client.blocking ?? []),
        ...(args.server.collisions ?? []),
      ]);
      const inputCollisions = Array.from(inputCollisionSet).sort((a, b) => a - b);
      const collisionsMatch = arrayEq(inputCollisions, out.client.collisions ?? []);

      const inputDoorsSorted = (args.client.doors ?? []).slice().sort((a: any, b: any) => (a.y - b.y) || (a.x - b.x));
      const outputDoors = out.client.doors ?? [];
      const doorsMatch = inputDoorsSorted.length === outputDoors.length &&
        inputDoorsSorted.every((d: any, i: number) =>
          d.x === outputDoors[i].x && d.y === outputDoors[i].y && d.p === outputDoors[i].p &&
          d.tx === outputDoors[i].tx && d.ty === outputDoors[i].ty &&
          (d.to ?? '') === outputDoors[i].to,
        );

      const checkpointsMatch = (args.client.checkpoints ?? []).length === (out.client.checkpoints ?? []).length;
      const musicAreasMatch = (args.client.musicAreas ?? []).length === (out.client.musicAreas ?? []).length;
      const plateauMatch = arrayEq([...(args.client.plateau ?? [])].sort((a, b) => a - b), out.client.plateau ?? []);
      const highMatch = arrayEq([...(args.client.high ?? [])].sort((a, b) => a - b), out.client.high ?? []);
      const animatedKeysIn = Object.keys(args.client.animated ?? {}).map(Number).sort((a, b) => a - b);
      const animatedKeysOut = Object.keys(out.client.animated ?? {}).map(Number).sort((a, b) => a - b);
      const animatedMatch = arrayEq(animatedKeysIn, animatedKeysOut);

      const npcCountIn = Object.keys(args.server.staticEntities ?? {}).length;
      const npcCountOut = Object.keys(out.server.staticEntities ?? {}).length;
      const roamMatch = (args.server.roamingAreas ?? []).length === (out.server.roamingAreas ?? []).length;
      const chestAreasMatch = (args.server.chestAreas ?? []).length === (out.server.chestAreas ?? []).length;
      const staticChestsMatch = (args.server.staticChests ?? []).length === (out.server.staticChests ?? []).length;

      return {
        dims: { w: out.client.width, h: out.client.height, tilesize: out.client.tilesize },
        timings: { import: Math.round(tImport), export: Math.round(tExport) },
        importWarningCount: importWarnings.length,
        exportWarningCount: out.warnings.length,
        firstImportWarning: importWarnings[0],
        spriteShape: {
          layerCount: sprite.layers.length,
          tilesetTiles: sprite.tilesets[0].tiles.length,
          sliceCount: (sprite.slices ?? []).length,
        },
        dataMatches,
        collisionsMatch,
        doorsMatch,
        checkpointsMatch,
        musicAreasMatch,
        plateauMatch,
        highMatch,
        animatedMatch,
        roamMatch,
        chestAreasMatch,
        staticChestsMatch,
        npcCountIn,
        npcCountOut,
      };
    }, { tilesheetB64, client: realClient, server: realServer });

    // Print timing for visibility (both should be sub-second).
    // eslint-disable-next-line no-console
    console.log('[bq-real] import/export ms:', result.timings, 'shape:', result.spriteShape);

    expect(result.dims).toEqual({ w: 172, h: 314, tilesize: 16 });
    expect(result.spriteShape.tilesetTiles).toBe(1960);
    expect(result.dataMatches).toBe(true);
    expect(result.collisionsMatch).toBe(true);
    expect(result.doorsMatch).toBe(true);
    expect(result.checkpointsMatch).toBe(true);
    expect(result.musicAreasMatch).toBe(true);
    expect(result.plateauMatch).toBe(true);
    expect(result.highMatch).toBe(true);
    expect(result.animatedMatch).toBe(true);
    expect(result.roamMatch).toBe(true);
    expect(result.chestAreasMatch).toBe(true);
    expect(result.staticChestsMatch).toBe(true);
    expect(result.npcCountOut).toBe(result.npcCountIn);
  });

  test('exporter drops empty fields to keep diffs minimal', async ({ page }) => {
    await page.goto('/');
    const keys = await page.evaluate(async () => {
      const bq = await import('/src/io/browser-quest.ts' as any);
      const tilesheet = { colorMode: 'rgba' as const, w: 16, h: 16, data: new Uint32Array(16 * 16) };
      // 2x2 map of all empty cells.
      const client = {
        width: 2,
        height: 2,
        tilesize: 16,
        data: [0, 0, 0, 0],
      };
      const { sprite } = bq.importBQ(client, null, tilesheet);
      const out = bq.exportBQ(sprite);
      return { client: Object.keys(out.client), server: Object.keys(out.server) };
    });
    // Only width/height/tilesize/data should remain; everything else dropped.
    expect(keys.client.sort()).toEqual(['data', 'height', 'tilesize', 'width']);
    expect(keys.server.sort()).toEqual(['height', 'tilesize', 'width']);
  });
});
