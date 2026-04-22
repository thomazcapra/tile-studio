import type { ImageRGBA, Sprite } from '../model/types';
import { compositeFrame } from '../render/composite';
import { newSprite } from '../model/factory';

// Export sprite (current frame) to PNG blob.
export async function exportPNG(sprite: Sprite, frame: number): Promise<Blob> {
  const imgData = compositeFrame(sprite, frame);
  const canvas = document.createElement('canvas');
  canvas.width = sprite.w;
  canvas.height = sprite.h;
  canvas.getContext('2d')!.putImageData(imgData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

// Trigger a file download.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Decode a PNG File into an ImageRGBA (sRGB, no color profile handling).
export async function decodePNG(file: File): Promise<ImageRGBA> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const id = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { colorMode: 'rgba', w: bitmap.width, h: bitmap.height, data: new Uint32Array(id.data.buffer.slice(0)) };
}

// Create a fresh sprite from an imported PNG image.
export function spriteFromImage(img: ImageRGBA, name = 'Imported'): Sprite {
  const sprite = newSprite(img.w, img.h, name);
  const cel = sprite.cels[0];
  cel.image = img;
  return sprite;
}

// File-open dialog returning the selected File (or null).
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
