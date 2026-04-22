// Octree color quantization.
// Adapted to TypeScript from the canonical 8-level octree algorithm used by Aseprite
// (src/doc/octree_map.h) and widely described in graphics literature.

interface OctreeNode {
  isLeaf: boolean;
  pixelCount: number;
  sumR: number;
  sumG: number;
  sumB: number;
  children: (OctreeNode | null)[]; // length 8
  paletteIndex: number;
}

function newNode(): OctreeNode {
  return {
    isLeaf: false,
    pixelCount: 0,
    sumR: 0, sumG: 0, sumB: 0,
    children: [null, null, null, null, null, null, null, null],
    paletteIndex: -1,
  };
}

export class Octree {
  private root: OctreeNode = newNode();
  // Levels are stored so we can prune deepest-first. levels[0] = children-of-root (level 1).
  private levels: OctreeNode[][] = Array.from({ length: 8 }, () => []);
  private leafCount = 0;

  addColor(r: number, g: number, b: number) {
    this.addRec(this.root, r, g, b, 0);
  }

  private addRec(node: OctreeNode, r: number, g: number, b: number, level: number) {
    if (level === 8) {
      if (!node.isLeaf) {
        node.isLeaf = true;
        this.leafCount++;
      }
      node.pixelCount++;
      node.sumR += r; node.sumG += g; node.sumB += b;
      return;
    }
    const shift = 7 - level;
    const idx =
      (((r >> shift) & 1) << 2) |
      (((g >> shift) & 1) << 1) |
      ((b >> shift) & 1);
    let child = node.children[idx];
    if (!child) {
      child = newNode();
      node.children[idx] = child;
      this.levels[level].push(child);
    }
    this.addRec(child, r, g, b, level + 1);
  }

  // Reduce tree until leafCount ≤ maxColors, by merging the deepest non-leaf's children
  // into that node (turning it into a leaf).
  reduceTo(maxColors: number) {
    let level = 7;
    while (this.leafCount > maxColors) {
      while (level >= 0 && this.levels[level].length === 0) level--;
      if (level < 0) break;
      const node = this.levels[level].pop()!;
      // Fold children (they may already have been folded; count merges).
      let mergedLeaves = 0;
      for (let i = 0; i < 8; i++) {
        const c = node.children[i];
        if (!c) continue;
        node.sumR += c.sumR;
        node.sumG += c.sumG;
        node.sumB += c.sumB;
        node.pixelCount += c.pixelCount;
        if (c.isLeaf) mergedLeaves++;
        node.children[i] = null;
      }
      if (!node.isLeaf) { node.isLeaf = true; mergedLeaves--; /* node itself becomes a leaf */ }
      // Net change: we removed `mergedLeaves` leaves, added 1 (node became leaf if not already).
      this.leafCount -= mergedLeaves;
    }
  }

  // Walk leaves in traversal order, assign palette indices, return palette as RGBA Uint32 (alpha=0xff).
  buildPalette(): Uint32Array {
    const colors: number[] = [];
    this.walkLeaves(this.root, (leaf) => {
      const r = Math.round(leaf.sumR / leaf.pixelCount);
      const g = Math.round(leaf.sumG / leaf.pixelCount);
      const b = Math.round(leaf.sumB / leaf.pixelCount);
      leaf.paletteIndex = colors.length;
      // Pack as AABBGGRR (little-endian ImageData order) with opaque alpha.
      colors.push((0xff << 24) | (b << 16) | (g << 8) | r);
    });
    return new Uint32Array(colors);
  }

  private walkLeaves(node: OctreeNode, fn: (n: OctreeNode) => void) {
    if (node.isLeaf) { fn(node); return; }
    for (let i = 0; i < 8; i++) {
      const c = node.children[i];
      if (c) this.walkLeaves(c, fn);
    }
  }

  // Map a color (r,g,b) to a palette index by descending the tree greedily.
  findIndex(r: number, g: number, b: number): number {
    let node = this.root;
    for (let level = 0; level < 8; level++) {
      if (node.isLeaf) break;
      const shift = 7 - level;
      const idx =
        (((r >> shift) & 1) << 2) |
        (((g >> shift) & 1) << 1) |
        ((b >> shift) & 1);
      const child = node.children[idx];
      if (!child) break;
      node = child;
    }
    return node.paletteIndex;
  }
}
