import type { ImageRGBA } from '../model/types';

// Pack R,G,B,A → Uint32 in little-endian ImageData byte order (AABBGGRR).
export function packRGBA(r: number, g: number, b: number, a = 255): number {
  return (((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
}
export function unpackRGBA(c: number): [number, number, number, number] {
  return [c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, (c >>> 24) & 0xff];
}

export function cloneImageRGBA(img: ImageRGBA): ImageRGBA {
  return { colorMode: 'rgba', w: img.w, h: img.h, data: new Uint32Array(img.data) };
}

export function getPixel(img: ImageRGBA, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return 0;
  return img.data[y * img.w + x];
}

// Returns true if pixel was changed.
export function setPixel(img: ImageRGBA, x: number, y: number, color: number): boolean {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return false;
  const i = y * img.w + x;
  if (img.data[i] === color) return false;
  img.data[i] = color;
  return true;
}

// Bresenham line; calls plot for every pixel.
export function lineEach(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    plot(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

export function rectEach(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void, filled = false) {
  const [xa, xb] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ya, yb] = y0 < y1 ? [y0, y1] : [y1, y0];
  if (filled) {
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) plot(x, y);
  } else {
    for (let x = xa; x <= xb; x++) { plot(x, ya); plot(x, yb); }
    for (let y = ya; y <= yb; y++) { plot(xa, y); plot(xb, y); }
  }
}

// Scanline flood fill. Records touched indices and old colors via patchOut.
export function floodFill(img: ImageRGBA, sx: number, sy: number, newColor: number, patchOut?: Map<number, number>) {
  if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) return;
  const { w, h, data } = img;
  const target = data[sy * w + sx];
  if (target === newColor) return;
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    // Scan left.
    let xl = x;
    while (xl >= 0 && data[y * w + xl] === target) xl--;
    xl++;
    // Scan right, filling as we go, queuing rows above/below.
    let spanTop = false, spanBot = false;
    for (let xr = xl; xr < w && data[y * w + xr] === target; xr++) {
      const i = y * w + xr;
      if (patchOut && !patchOut.has(i)) patchOut.set(i, data[i]);
      data[i] = newColor;
      if (y > 0) {
        const above = data[(y - 1) * w + xr] === target;
        if (above && !spanTop) { stack.push(xr, y - 1); spanTop = true; }
        else if (!above) spanTop = false;
      }
      if (y < h - 1) {
        const below = data[(y + 1) * w + xr] === target;
        if (below && !spanBot) { stack.push(xr, y + 1); spanBot = true; }
        else if (!below) spanBot = false;
      }
    }
  }
}
