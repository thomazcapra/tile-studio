// Tile Studio's pure modules use `new ImageData(w, h)` for the compositor's
// output buffer. ImageData isn't a Node global, but the shape is trivial:
// { width, height, data: Uint8ClampedArray of length w*h*4 }.
// We register a polyfill on globalThis before any tile-studio code is imported.

class ImageDataPolyfill {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  colorSpace: 'srgb' = 'srgb';

  constructor(arg1: number | Uint8ClampedArray, arg2: number, arg3?: number) {
    if (typeof arg1 === 'number') {
      this.width = arg1;
      this.height = arg2;
      this.data = new Uint8ClampedArray(arg1 * arg2 * 4);
    } else {
      // ImageData(data, width, height?)
      this.data = arg1;
      this.width = arg2;
      this.height = arg3 ?? arg1.length / (4 * arg2);
    }
  }
}

// Only polyfill if missing (so it stays safe under bun, deno, or future Node).
const g = globalThis as unknown as { ImageData?: typeof ImageDataPolyfill };
if (typeof g.ImageData === 'undefined') {
  g.ImageData = ImageDataPolyfill;
}

export {};
