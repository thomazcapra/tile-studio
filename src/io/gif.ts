// @ts-expect-error — gifenc ships no types
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { Sprite } from '../model/types';
import { compositeFrame } from '../render/composite';

export interface GifExportOptions {
  maxColorsPerFrame?: number; // gif palettes max 256; defaults to 256
  onProgress?: (fraction: number) => void;
}

// Render every frame of the sprite, quantize each to an indexed palette, and emit an animated GIF.
export function exportAnimatedGIF(sprite: Sprite, opts: GifExportOptions = {}): Blob {
  const gif = GIFEncoder();
  const total = sprite.frames.length;
  const maxColors = Math.max(2, Math.min(256, opts.maxColorsPerFrame ?? 256));

  for (let i = 0; i < total; i++) {
    const imgData = compositeFrame(sprite, i, { includeReference: false });
    const rgba = imgData.data; // Uint8ClampedArray RGBA
    // gifenc expects Uint8Array/Uint8ClampedArray. quantize() returns a palette.
    const palette = quantize(rgba, maxColors);
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, sprite.w, sprite.h, {
      palette,
      delay: Math.max(20, Math.round(sprite.frames[i].duration)),
      transparent: true,
      transparentIndex: findTransparentIndex(palette),
      dispose: 2, // Restore to background
    });
    opts.onProgress?.((i + 1) / total);
  }
  gif.finish();
  const bytes = gif.bytes();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' });
}

function findTransparentIndex(palette: number[][]): number {
  for (let i = 0; i < palette.length; i++) {
    if (palette[i][3] !== undefined && palette[i][3] === 0) return i;
  }
  return -1;
}
