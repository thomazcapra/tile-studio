import type { TagDirection } from '../model/types';

export type SheetJsonFormat = 'hash' | 'array' | 'unknown';

export interface SheetFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetFrame {
  name: string;
  rect: SheetFrameRect;
  duration: number;
}

export interface SheetTag {
  name: string;
  from: number;
  to: number;
  direction: TagDirection;
}

export interface ParsedSheetJson {
  format: Exclude<SheetJsonFormat, 'unknown'>;
  frames: SheetFrame[];
  tags: SheetTag[];
  imageName?: string;
  sheetSize?: { w: number; h: number };
}

// Auto-detects Aseprite "hash" (Phaser/PixiJS) vs "array" (TexturePacker /
// Aseprite JSON Array) shapes and returns a normalized frame list. Returns
// null if the input is not a recognizable sprite-sheet JSON.
export function parseSheetJson(raw: unknown): ParsedSheetJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as { frames?: unknown; meta?: unknown };
  if (!root.frames) return null;

  const format = detectFormat(root.frames);
  if (format === 'unknown') return null;

  const frames: SheetFrame[] = [];
  if (format === 'hash') {
    const entries = Object.entries(root.frames as Record<string, unknown>);
    for (const [key, entry] of entries) {
      const f = toSheetFrame(key, entry);
      if (f) frames.push(f);
    }
  } else {
    for (const entry of root.frames as unknown[]) {
      const f = toSheetFrame(undefined, entry);
      if (f) frames.push(f);
    }
  }
  if (frames.length === 0) return null;

  const meta = (root.meta ?? null) as { frameTags?: unknown; image?: unknown; size?: unknown } | null;
  return {
    format,
    frames,
    tags: readTags(meta?.frameTags),
    imageName: typeof meta?.image === 'string' ? meta.image : undefined,
    sheetSize: readSize(meta?.size),
  };
}

function detectFormat(frames: unknown): SheetJsonFormat {
  if (Array.isArray(frames)) return frames.length > 0 && isFrameLike(frames[0]) ? 'array' : 'unknown';
  if (frames && typeof frames === 'object') {
    const values = Object.values(frames as Record<string, unknown>);
    if (values.length === 0) return 'unknown';
    return isFrameLike(values[0]) ? 'hash' : 'unknown';
  }
  return 'unknown';
}

function isFrameLike(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const f = (v as { frame?: unknown }).frame;
  if (!f || typeof f !== 'object') return false;
  const r = f as { x?: unknown; y?: unknown; w?: unknown; h?: unknown };
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.w === 'number' &&
    typeof r.h === 'number'
  );
}

function toSheetFrame(keyName: string | undefined, entry: unknown): SheetFrame | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as {
    frame?: { x: number; y: number; w: number; h: number };
    filename?: unknown;
    duration?: unknown;
  };
  if (!e.frame) return null;
  const name = typeof e.filename === 'string'
    ? e.filename
    : keyName ?? 'frame';
  const duration = typeof e.duration === 'number' && e.duration > 0 ? e.duration : 100;
  const { x, y, w, h } = e.frame;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return {
    name,
    rect: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
    duration: Math.round(duration),
  };
}

function readTags(raw: unknown): SheetTag[] {
  if (!Array.isArray(raw)) return [];
  const out: SheetTag[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const tag = t as { name?: unknown; from?: unknown; to?: unknown; direction?: unknown };
    if (typeof tag.name !== 'string') continue;
    if (typeof tag.from !== 'number' || typeof tag.to !== 'number') continue;
    out.push({
      name: tag.name,
      from: Math.max(0, Math.round(tag.from)),
      to: Math.max(0, Math.round(tag.to)),
      direction: normalizeDirection(tag.direction),
    });
  }
  return out;
}

function normalizeDirection(d: unknown): TagDirection {
  if (d === 'reverse') return 'reverse';
  if (d === 'pingpong' || d === 'ping-pong') return 'pingpong';
  return 'forward';
}

function readSize(raw: unknown): { w: number; h: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as { w?: unknown; h?: unknown };
  if (typeof s.w !== 'number' || typeof s.h !== 'number') return undefined;
  return { w: s.w, h: s.h };
}
