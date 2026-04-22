import type { ImageRGBA } from '../model/types';
import type { QuantizeOptions, QuantizeResult } from './quantize';

export function quantizeAsync(
  image: ImageRGBA,
  opts: Omit<QuantizeOptions, 'onProgress'>,
  onProgress?: (f: number) => void,
  signal?: AbortSignal,
): Promise<QuantizeResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./quantize-worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => worker.terminate();
    signal?.addEventListener('abort', () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); });
    worker.onerror = (e) => { cleanup(); reject(new Error(e.message || 'worker error')); };
    worker.onmessage = (e: MessageEvent<
      | { type: 'progress'; fraction: number }
      | { type: 'done'; result: { paletteBuf: ArrayBuffer; indexedBuf: ArrayBuffer; rgbaBuf: ArrayBuffer; colorsFound: number } }
      | { type: 'error'; message: string }
    >) => {
      const msg = e.data;
      if (msg.type === 'progress') { onProgress?.(msg.fraction); return; }
      if (msg.type === 'error') { cleanup(); reject(new Error(msg.message)); return; }
      if (msg.type === 'done') {
        cleanup();
        resolve({
          palette: new Uint32Array(msg.result.paletteBuf),
          indexedData: new Uint8Array(msg.result.indexedBuf),
          remappedRGBA: new Uint32Array(msg.result.rgbaBuf),
          colorsFound: msg.result.colorsFound,
        });
      }
    };
    const dataCopy = new Uint32Array(image.data);
    worker.postMessage(
      { type: 'run', image: { w: image.w, h: image.h, data: dataCopy }, opts },
      [dataCopy.buffer]
    );
  });
}
