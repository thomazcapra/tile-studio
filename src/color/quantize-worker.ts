import { quantize, type QuantizeOptions } from './quantize';
import type { ImageRGBA } from '../model/types';

type RunMessage = {
  type: 'run';
  image: { w: number; h: number; data: Uint32Array };
  opts: Omit<QuantizeOptions, 'onProgress'>;
};

self.onmessage = (e: MessageEvent<RunMessage>) => {
  if (e.data.type !== 'run') return;
  try {
    const img: ImageRGBA = { colorMode: 'rgba', ...e.data.image };
    let lastPost = 0;
    const result = quantize(img, {
      ...e.data.opts,
      onProgress: (f) => {
        const now = performance.now();
        if (now - lastPost >= 33 || f >= 1) {
          lastPost = now;
          (self as unknown as Worker).postMessage({ type: 'progress', fraction: f });
        }
      },
    });
    const paletteBuf = result.palette.buffer as ArrayBuffer;
    const indexedBuf = result.indexedData.buffer as ArrayBuffer;
    const rgbaBuf = result.remappedRGBA.buffer as ArrayBuffer;
    (self as unknown as Worker).postMessage(
      {
        type: 'done',
        result: {
          paletteBuf,
          indexedBuf,
          rgbaBuf,
          colorsFound: result.colorsFound,
        },
      },
      [paletteBuf, indexedBuf, rgbaBuf]
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: (err as Error).message });
  }
};
