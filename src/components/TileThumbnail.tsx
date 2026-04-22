import { useEffect, useRef } from 'react';
import type { Tile } from '../model/types';

// Renders a tile's pixel data at `size` CSS pixels (square), nearest-neighbor.
export function TileThumbnail({ tile, size, dirtyTick }: { tile: Tile; size: number; dirtyTick?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const img = tile.image;
    if (img.colorMode !== 'rgba') return;
    c.width = img.w;
    c.height = img.h;
    const ctx = c.getContext('2d')!;
    const data = new ImageData(img.w, img.h);
    new Uint32Array(data.data.buffer).set(img.data);
    ctx.putImageData(data, 0, 0);
  }, [tile, dirtyTick]);
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className="block"
    />
  );
}
