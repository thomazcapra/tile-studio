import type { ImageRGBA } from '../model/types';

// Nearest-neighbor downscale to `targetW` pixels wide (preserving aspect ratio),
// then upscale back to the original dimensions. Produces chunky "pixel art" blocks.
// Uses the browser's fast canvas-based nearest scaler.
export function pixelate(img: ImageRGBA, targetW: number): ImageRGBA {
  const ratio = img.w / Math.max(1, targetW);
  const targetH = Math.max(1, Math.round(img.h / ratio));
  if (targetW >= img.w && targetH >= img.h) {
    return { colorMode: 'rgba', w: img.w, h: img.h, data: new Uint32Array(img.data) };
  }
  // Put source into an offscreen canvas.
  const src = document.createElement('canvas');
  src.width = img.w;
  src.height = img.h;
  const id = new ImageData(img.w, img.h);
  new Uint32Array(id.data.buffer).set(img.data);
  src.getContext('2d')!.putImageData(id, 0, 0);

  // Downscale (nearest).
  const small = document.createElement('canvas');
  small.width = targetW;
  small.height = targetH;
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(src, 0, 0, targetW, targetH);

  // Upscale back (nearest).
  const big = document.createElement('canvas');
  big.width = img.w;
  big.height = img.h;
  const bctx = big.getContext('2d')!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, img.w, img.h);
  const out = bctx.getImageData(0, 0, img.w, img.h);
  return { colorMode: 'rgba', w: img.w, h: img.h, data: new Uint32Array(out.data.buffer.slice(0)) };
}
