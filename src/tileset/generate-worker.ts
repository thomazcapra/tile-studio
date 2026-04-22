// Web Worker that runs generateTilesetFromImage off the main thread.
// Messages:
//   → { type: 'run', image: {w,h,data}, opts }
//   ← { type: 'progress', fraction: number }
//   ← { type: 'done', result: { ... } }
//   ← { type: 'error', message: string }

import { generateTilesetFromImage, type GenerateOptions } from './generate';
import type { ImageRGBA } from '../model/types';

type RunMessage = {
  type: 'run';
  image: { w: number; h: number; data: Uint32Array };
  opts: Omit<GenerateOptions, 'onProgress'>;
};

self.onmessage = (e: MessageEvent<RunMessage>) => {
  if (e.data.type !== 'run') return;
  try {
    const img: ImageRGBA = { colorMode: 'rgba', ...e.data.image };
    let lastPost = 0;
    const result = generateTilesetFromImage(img, {
      ...e.data.opts,
      onProgress: (f) => {
        // Throttle to at most 30 messages/sec (~33ms) to avoid postMessage flood.
        const now = performance.now();
        if (now - lastPost >= 33 || f >= 1) {
          lastPost = now;
          (self as unknown as Worker).postMessage({ type: 'progress', fraction: f });
        }
      },
    });

    // Serialize tiles as flat transferable buffers to avoid costly structured cloning of nested arrays.
    // Pack all tiles into one flat Uint32Array and transfer a single buffer.
    // Avoids 60K-way structured clone overhead for pathological pixel-map cases.
    const tw = result.tileset.grid.tw;
    const th = result.tileset.grid.th;
    const tileLen = tw * th;
    const tileCount = result.tileset.tiles.length;
    const flat = new Uint32Array(tileLen * tileCount);
    for (let i = 0; i < tileCount; i++) {
      const img = result.tileset.tiles[i].image;
      if (img.colorMode !== 'rgba') throw new Error('unexpected colorMode');
      flat.set(img.data, i * tileLen);
    }
    const tilesFlatBuffer = flat.buffer as ArrayBuffer;
    const tilemapBuffer = result.tilemapData.buffer as ArrayBuffer;

    (self as unknown as Worker).postMessage(
      {
        type: 'done',
        result: {
          tilesetId: result.tileset.id,
          tilesetName: result.tileset.name,
          grid: result.tileset.grid,
          tileCount,
          tilesFlatBuffer,
          tilemapBuffer,
          mapW: result.mapW,
          mapH: result.mapH,
          duplicatesFound: result.duplicatesFound,
          tilesCreated: result.tilesCreated,
        },
      },
      [tilemapBuffer, tilesFlatBuffer]
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: (err as Error).message });
  }
};
