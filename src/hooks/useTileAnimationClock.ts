import { useEffect } from 'react';
import { useEditorStore } from '../store/editor';

// Ticks the store's tileClockMs on each animation frame whenever any tileset
// contains a tile with an attached animation. Throttled to ~30 fps to avoid
// hammering React when no animated tiles exist.
export function useTileAnimationClock() {
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const sprite = useEditorStore.getState().sprite;
      const hasAnimated = sprite.tilesets.some((ts) => ts.tiles.some((t) => t.animation));
      if (hasAnimated && now - last >= 33) {
        useEditorStore.getState().setTileClock(Math.round(now));
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
