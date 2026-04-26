import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface LongPressOptions {
  /** Hold duration in ms before firing. Default 500. */
  ms?: number;
  /** Cancel if the pointer moves more than this many pixels (Chebyshev). Default 8. */
  moveTolerance?: number;
}

/**
 * Long-press detector built on Pointer Events. Fires `onLongPress(e)` after the user
 * holds a pointer down for `ms` without moving it more than `moveTolerance` pixels.
 *
 * Returns spread-able pointer-event handlers; drop them onto any element where you
 * want long-press to act as a right-click replacement on touch / pen devices.
 *
 * Mouse pointers are intentionally ignored — desktop users have a real right button.
 */
export function useLongPress<E extends Element = Element>(
  onLongPress: (e: ReactPointerEvent<E>) => void,
  opts: LongPressOptions = {},
) {
  const ms = opts.ms ?? 500;
  const tolerance = opts.moveTolerance ?? 8;

  const stateRef = useRef<{
    timer: number | null;
    pointerId: number | null;
    startX: number;
    startY: number;
  }>({ timer: null, pointerId: null, startX: 0, startY: 0 });

  const cancel = useCallback(() => {
    const st = stateRef.current;
    if (st.timer !== null) {
      clearTimeout(st.timer);
      st.timer = null;
    }
    st.pointerId = null;
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<E>) => {
    if (e.pointerType === 'mouse') return; // mouse uses real right-click
    const st = stateRef.current;
    cancel();
    st.pointerId = e.pointerId;
    st.startX = e.clientX;
    st.startY = e.clientY;
    // React reuses synthetic events. Capture what we need now and re-dispatch later.
    const persisted = e;
    st.timer = window.setTimeout(() => {
      st.timer = null;
      onLongPress(persisted);
    }, ms);
  }, [cancel, ms, onLongPress]);

  const onPointerMove = useCallback((e: ReactPointerEvent<E>) => {
    const st = stateRef.current;
    if (st.timer === null || st.pointerId !== e.pointerId) return;
    if (Math.abs(e.clientX - st.startX) > tolerance || Math.abs(e.clientY - st.startY) > tolerance) {
      cancel();
    }
  }, [cancel, tolerance]);

  const onPointerUp = useCallback(() => { cancel(); }, [cancel]);
  const onPointerCancel = useCallback(() => { cancel(); }, [cancel]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
