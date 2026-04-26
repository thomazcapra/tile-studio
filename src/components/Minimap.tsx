import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editor';
import { compositeFrame } from '../render/composite';

// Small overview panel showing the whole sprite with a viewport rectangle.
// Clicking / dragging pans the main viewport to that point.
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = useEditorStore((s) => s.sprite);
  const frame = useEditorStore((s) => s.currentFrame);
  const dirtyTick = useEditorStore((s) => s.dirtyTick);
  const viewport = useEditorStore((s) => s.viewport);
  const setPan = useEditorStore((s) => s.setPan);

  const size = 120;
  // Preserve aspect ratio of the sprite.
  const ratio = sprite.w / Math.max(1, sprite.h);
  const mmW = ratio > 1 ? size : Math.max(16, Math.round(size * ratio));
  const mmH = ratio > 1 ? Math.max(16, Math.round(size / ratio)) : size;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = mmW; c.height = mmH;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, mmW, mmH);
    // Checkered background.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, mmW, mmH);
    // Composite sprite scaled down.
    const off = document.createElement('canvas');
    off.width = sprite.w; off.height = sprite.h;
    off.getContext('2d')!.putImageData(compositeFrame(sprite, frame, { tileClockMs: useEditorStore.getState().tileClockMs }), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, mmW, mmH);
    // Viewport rectangle — show which portion of the sprite is currently visible.
    const container = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
    if (container) {
      const vx = -viewport.panX / viewport.zoom;
      const vy = -viewport.panY / viewport.zoom;
      const vw = container.clientWidth / viewport.zoom;
      const vh = container.clientHeight / viewport.zoom;
      const rx = (vx / sprite.w) * mmW;
      const ry = (vy / sprite.h) * mmH;
      const rw = (vw / sprite.w) * mmW;
      const rh = (vh / sprite.h) * mmH;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    }
  }, [sprite, frame, dirtyTick, viewport, mmW, mmH]);

  function handle(e: React.PointerEvent) {
    // Only follow drags while the primary button (or finger/pen) is engaged.
    if (e.type !== 'pointerdown' && (e.buttons & 1) === 0) return;
    const c = ref.current!;
    const rect = c.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    // Center the viewport on the clicked point.
    const container = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
    if (!container) return;
    const vpW = container.clientWidth;
    const vpH = container.clientHeight;
    const spriteX = relX * sprite.w;
    const spriteY = relY * sprite.h;
    setPan(Math.round(vpW / 2 - spriteX * viewport.zoom), Math.round(vpH / 2 - spriteY * viewport.zoom));
  }

  return (
    <div className="absolute bottom-2 right-2 rounded-md border border-border bg-panel2/80 p-1 shadow-lg" data-testid="minimap">
      <canvas
        ref={ref}
        className="block rounded cursor-crosshair touch-none"
        style={{ imageRendering: 'pixelated', width: mmW, height: mmH }}
        onPointerDown={(e) => {
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
          handle(e);
        }}
        onPointerMove={handle}
        onPointerUp={(e) => {
          const el = e.currentTarget as HTMLElement;
          if (el.hasPointerCapture?.(e.pointerId)) {
            try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          }
        }}
      />
    </div>
  );
}
