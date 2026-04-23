// A patch records word-level edits on a Uint32 image buffer.
// Used for both RGBA raster edits and Tilemap word edits (tile index + flip flags).
// Map<cellIndex, oldWord> — apply mutates imageRef.data in place; undo replays old values.
//
// Optional mask fields let a selection restrict which indices the tool is allowed to touch.
// When set, recordSet rejects writes whose sprite-space pixel is not selected.
export interface PixelPatch {
  type: 'pixel';
  celId: string;
  imageRef: { data: Uint32Array; w: number; h: number };
  // Sprite-space offset of the image buffer (cel.x, cel.y).
  imageOffsetX: number;
  imageOffsetY: number;
  // Optional selection mask in sprite-space. Width/height must be provided if set.
  selectionMask?: Uint8Array;
  maskW?: number;
  maskH?: number;
  oldColors: Map<number, number>;
  newColors: Map<number, number>;
  label: string;
}

// Snapshot patches cover structural edits (tileset tiles, slices, layers, regions…)
// that don't fit the per-pixel model. The action captures before/after snapshots
// of the affected sub-tree and provides closures to re-apply them. These patches
// only live at runtime — undo/redo history is not persisted across reloads.
export interface SnapshotPatch {
  type: 'snapshot';
  label: string;
  undo: () => void;
  redo: () => void;
  // Cosmetic — counted in the history list as "size" for consistency with PixelPatch.
  newColors: { size: number };
}

export type Patch = PixelPatch | SnapshotPatch;

export interface HistoryState {
  undoStack: Patch[];
  redoStack: Patch[];
}

export const MAX_HISTORY = 100;

export function applyUndo(patch: Patch) {
  if (patch.type === 'pixel') {
    const { imageRef, oldColors } = patch;
    for (const [i, c] of oldColors) imageRef.data[i] = c;
    return;
  }
  if (patch.type === 'snapshot') {
    patch.undo();
    return;
  }
}

export function applyRedo(patch: Patch) {
  if (patch.type === 'pixel') {
    const { imageRef, newColors } = patch;
    for (const [i, c] of newColors) imageRef.data[i] = c;
    return;
  }
  if (patch.type === 'snapshot') {
    patch.redo();
    return;
  }
}
