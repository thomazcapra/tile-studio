import type { ImageRGBA, Tile, Tileset } from '../model/types';
import type { GenerateOptions, GenerateResult } from './generate';

// Async wrapper around the worker. Clones image.data into a transferable to avoid
// detaching the source buffer still used by the editor.
export function generateTilesetAsync(
  image: ImageRGBA,
  opts: Omit<GenerateOptions, 'onProgress'>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./generate-worker.ts', import.meta.url), { type: 'module' });

    const cleanup = () => {
      worker.terminate();
    };
    signal?.addEventListener('abort', () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); });

    worker.onerror = (e) => { cleanup(); reject(new Error(e.message || 'worker error')); };
    worker.onmessage = (e: MessageEvent<
      | { type: 'progress'; fraction: number }
      | { type: 'done'; result: WorkerDoneResult }
      | { type: 'error'; message: string }
    >) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.fraction);
        return;
      }
      if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message));
        return;
      }
      if (msg.type === 'done') {
        const { grid, tileCount, tilesFlatBuffer } = msg.result;
        const tileLen = grid.tw * grid.th;
        const flat = new Uint32Array(tilesFlatBuffer);
        const tiles: Tile[] = new Array(tileCount);
        for (let i = 0; i < tileCount; i++) {
          tiles[i] = {
            image: {
              colorMode: 'rgba',
              w: grid.tw,
              h: grid.th,
              data: new Uint32Array(flat.buffer, i * tileLen * 4, tileLen),
            },
          };
        }
        const tileset: Tileset = {
          id: msg.result.tilesetId,
          name: msg.result.tilesetName,
          grid,
          tiles,
          hash: new Map(),
        };
        const result: GenerateResult = {
          tileset,
          tilemapData: new Uint32Array(msg.result.tilemapBuffer),
          mapW: msg.result.mapW,
          mapH: msg.result.mapH,
          duplicatesFound: msg.result.duplicatesFound,
          tilesCreated: msg.result.tilesCreated,
        };
        cleanup();
        resolve(result);
      }
    };

    // Copy image.data so we can transfer without detaching the editor's source buffer.
    const dataCopy = new Uint32Array(image.data);
    worker.postMessage(
      {
        type: 'run',
        image: { w: image.w, h: image.h, data: dataCopy },
        opts,
      },
      [dataCopy.buffer]
    );
  });
}

interface WorkerDoneResult {
  tilesetId: string;
  tilesetName: string;
  grid: { tw: number; th: number };
  tileCount: number;
  tilesFlatBuffer: ArrayBuffer;
  tilemapBuffer: ArrayBuffer;
  mapW: number;
  mapH: number;
  duplicatesFound: number;
  tilesCreated: number;
}
