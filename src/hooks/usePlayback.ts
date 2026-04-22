import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editor';

// Drives frame advancement via requestAnimationFrame when isPlaying is true.
// Per-frame duration is read from sprite.frames[currentFrame].duration and scaled by playbackSpeed.
export function usePlayback() {
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const accRef = useRef<number>(0);

  useEffect(() => {
    function tick(ts: number) {
      const s = useEditorStore.getState();
      if (!s.isPlaying) {
        rafRef.current = null;
        return;
      }
      const dt = lastTimeRef.current === 0 ? 0 : ts - lastTimeRef.current;
      lastTimeRef.current = ts;
      accRef.current += dt * s.playbackSpeed;

      const frameDur = s.sprite.frames[s.currentFrame]?.duration ?? 100;
      while (accRef.current >= frameDur) {
        accRef.current -= frameDur;
        useEditorStore.getState().nextFrame();
        // If nextFrame stopped playback (e.g. reached end and no loop), break.
        if (!useEditorStore.getState().isPlaying) break;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    const unsub = useEditorStore.subscribe((s, prev) => {
      if (s.isPlaying && !prev.isPlaying) {
        lastTimeRef.current = 0;
        accRef.current = 0;
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
      }
    });

    // In case the store starts already playing (e.g. hot reload).
    if (useEditorStore.getState().isPlaying && rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      unsub();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);
}
