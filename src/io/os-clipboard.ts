// OS clipboard integration — best-effort PNG round-trip for selection content.
// Falls back silently when the browser blocks clipboard access (file://, etc.).

import type { ClipboardBuffer } from '../store/editor';
import type { ImageRGBA } from '../model/types';

// Write a ClipboardBuffer (selection rectangle + mask) as a PNG image to the
// OS clipboard. Returns true on success.
export async function writeClipboardAsPNG(clip: ClipboardBuffer): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = clip.w; canvas.height = clip.h;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(clip.w, clip.h);
    const dst = new Uint32Array(imgData.data.buffer);
    for (let i = 0; i < clip.data.length; i++) {
      dst[i] = clip.mask[i] ? clip.data[i] : 0;
    }
    ctx.putImageData(imgData, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

// Read a PNG from the OS clipboard, return an ImageRGBA or null.
export async function readClipboardImage(): Promise<ImageRGBA | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          const id = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
          return {
            colorMode: 'rgba',
            w: bitmap.width,
            h: bitmap.height,
            data: new Uint32Array(id.data.buffer.slice(0)),
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Helper: turn an ImageRGBA into a ClipboardBuffer (fully-opaque pixels counted as inside the mask).
export function imageToClipboardBuffer(img: ImageRGBA): ClipboardBuffer {
  const mask = new Uint8Array(img.w * img.h);
  for (let i = 0; i < img.data.length; i++) mask[i] = ((img.data[i] >>> 24) & 0xff) === 0 ? 0 : 1;
  return { w: img.w, h: img.h, data: new Uint32Array(img.data), mask };
}
