// Auto-tile / Wang-tile helper.
//
// Given a boolean "filled" grid where each cell is either solid or empty, and
// a user-provided mapping from 4-bit cardinal-neighbor bitmasks to tile indices,
// produce a tilemap word buffer. The bitmask combines (N, E, S, W) neighbors:
//
//   bit 0 (1) = North neighbor is filled
//   bit 1 (2) = East neighbor is filled
//   bit 2 (4) = South neighbor is filled
//   bit 3 (8) = West neighbor is filled
//
// Cells that are themselves "empty" produce EMPTY_TILE_WORD (0). Cells that are
// solid receive `map[mask]` — if that's missing, falls back to `map[0] ?? -1`.
//
// The 16-tile Wang convention (the "classic" cross-style auto-tile) exposes:
//
//   N E S W  | mask | typical visual
//   0 0 0 0  |  0   | nub / isolated block
//   1 0 0 0  |  1   | south-cap
//   0 1 0 0  |  2   | west-cap
//   1 1 0 0  |  3   | SW elbow
//   0 0 1 0  |  4   | north-cap
//   1 0 1 0  |  5   | vertical corridor
//   0 1 1 0  |  6   | NW elbow
//   1 1 1 0  |  7   | west T-junction
//   0 0 0 1  |  8   | east-cap
//   1 0 0 1  |  9   | SE elbow
//   0 1 0 1  | 10   | horizontal corridor
//   1 1 0 1  | 11   | south T-junction
//   0 0 1 1  | 12   | NE elbow
//   1 0 1 1  | 13   | east T-junction
//   0 1 1 1  | 14   | north T-junction
//   1 1 1 1  | 15   | center
//
// The caller maps each mask value to a 0-based tile index in their tileset.

import { EMPTY_TILE_WORD, makeTileWord } from '../model/types';

export type AutoTileMap = Record<number, number>; // mask → 0-based tileset index

export interface AutoTileOptions {
  map: AutoTileMap;
  mapW: number;
  mapH: number;
  filled: boolean[];   // length = mapW*mapH
  wrap?: boolean;      // treat edges as wrapping (torus) when true
}

export function autoTileGrid(opts: AutoTileOptions): Uint32Array {
  const { mapW, mapH, filled, wrap = false, map } = opts;
  const out = new Uint32Array(mapW * mapH);
  const at = (x: number, y: number): boolean => {
    if (wrap) {
      x = ((x % mapW) + mapW) % mapW;
      y = ((y % mapH) + mapH) % mapH;
      return filled[y * mapW + x];
    }
    if (x < 0 || y < 0 || x >= mapW || y >= mapH) return false;
    return filled[y * mapW + x];
  };
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      if (!at(x, y)) { out[y * mapW + x] = EMPTY_TILE_WORD; continue; }
      let mask = 0;
      if (at(x, y - 1)) mask |= 1;
      if (at(x + 1, y)) mask |= 2;
      if (at(x, y + 1)) mask |= 4;
      if (at(x - 1, y)) mask |= 8;
      const idx = map[mask] ?? map[0] ?? -1;
      out[y * mapW + x] = idx < 0 ? EMPTY_TILE_WORD : makeTileWord(idx);
    }
  }
  return out;
}

// Default preset: all 16 masks → indices 0..15 in ascending mask order.
// Handy when the tileset rows follow the canonical Wang layout.
export const CANONICAL_WANG_16: AutoTileMap = (() => {
  const m: AutoTileMap = {};
  for (let i = 0; i < 16; i++) m[i] = i;
  return m;
})();
