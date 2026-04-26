// Two-finger pinch+pan controller for the canvas viewport.
//
// Lifecycle:
//   1. enter() with two pointer positions and the current viewport (zoom, panX, panY).
//   2. update() per move with the latest pointer positions; emits new (zoom, panX, panY).
//   3. leave() when fewer than 2 pointers remain.
//
// Anchor invariant: the centroid of the two pointers stays over the same SPRITE pixel
// across the gesture. This matches setZoom(z, cx, cy) semantics already used by
// wheel-zoom in the editor store.

export interface PinchPanInputs {
  // Initial centroid (client pixels, relative to canvas).
  cx0: number;
  cy0: number;
  // Initial pointer distance (px).
  dist0: number;
  // Initial viewport snapshot.
  zoom0: number;
  panX0: number;
  panY0: number;
}

export interface PinchPanOutput {
  zoom: number;
  panX: number;
  panY: number;
}

export function makePinchPan(initial: PinchPanInputs) {
  return {
    update(cx: number, cy: number, dist: number): PinchPanOutput {
      const ratio = initial.dist0 > 0 ? dist / initial.dist0 : 1;
      const zoom = initial.zoom0 * ratio;
      // The sprite point under the initial centroid: (cx0 - panX0) / zoom0
      const sx = (initial.cx0 - initial.panX0) / initial.zoom0;
      const sy = (initial.cy0 - initial.panY0) / initial.zoom0;
      // After zoom, anchor that sprite point under the CURRENT centroid (which may have
      // translated as the user dragged the two fingers).
      const panX = cx - sx * zoom;
      const panY = cy - sy * zoom;
      return { zoom, panX, panY };
    },
  };
}

export function centroid(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
