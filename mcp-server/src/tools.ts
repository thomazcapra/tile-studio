// Tool registry. Each tool gets a Zod schema + a handler. The MCP server
// (in index.ts) iterates over this list to register them with the SDK.
//
// Tool naming convention:
//   project_*   — project lifecycle
//   layer_*     — layer / frame / tag mutators
//   paint_*     — raster painting primitives
//   tilemap_*   — tilemap painting primitives
//   palette_*   — palette ops
//   tileset_*   — tileset generation / management
//   anim_*      — animation conveniences
//   image_*     — PNG import / pixel transfer
//   export_*    — file-emitting tools (write to disk)
//   gemini_*    — Gemini-powered generators

import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { generateTilesetFromImage } from '../../src/tileset/generate.js';
import { autoTileGrid, CANONICAL_WANG_16 } from '../../src/tileset/autotile.js';
import { quantize } from '../../src/color/quantize.js';
import { TILE_FLIP_X, TILE_FLIP_Y, TILE_FLIP_D, type ImageRGBA } from '../../src/model/types.js';

import * as state from './state.js';
import * as enc from './encoders.js';
import { generateImageWithGemini } from './gemini.js';

export interface ToolDef<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: T;
  handler: (input: z.infer<T>) => Promise<unknown> | unknown;
}

// ---------- Helpers ----------

const colorHex = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'expected #RRGGBB or #RRGGBBAA');

function parseColor(hex: string): number {
  const m = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const a = m.length >= 8 ? parseInt(m.slice(6, 8), 16) : 0xff;
  // tile-studio packs AABBGGRR
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

async function writeFiles(targetDir: string, files: enc.GeneratedFile[]): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true });
  const written: string[] = [];
  for (const f of files) {
    const p = path.join(targetDir, f.name);
    await fs.writeFile(p, Buffer.from(f.bytes));
    written.push(p);
  }
  return written;
}

// ---------- Project ----------

const projectCreate: ToolDef = {
  name: 'project_create',
  description:
    'Create a new in-memory Tile Studio project. Replaces any current project. Sizes are in pixels. Returns the project summary (id, dims, layer count).',
  inputSchema: z.object({
    name: z.string().default('Untitled'),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
  }),
  handler: ({ name, width, height }) => {
    const proj = state.createProject({ name, width, height });
    return summarizeProject(proj);
  },
};

const projectLoad: ToolDef = {
  name: 'project_load',
  description:
    'Load a .tstudio project file from disk. Replaces any current project. The path can be absolute or relative to the MCP server cwd.',
  inputSchema: z.object({ filePath: z.string() }),
  handler: async ({ filePath }) => {
    const proj = await state.loadProjectFromFile(filePath);
    return summarizeProject(proj);
  },
};

const projectSave: ToolDef = {
  name: 'project_save',
  description:
    'Save the current project as a .tstudio file (zip of manifest.json + pixel blobs). The file can be opened in the Tile Studio web app.',
  inputSchema: z.object({ filePath: z.string() }),
  handler: async ({ filePath }) => {
    const result = await state.saveProjectToFile(filePath);
    return { filePath, bytes: result.bytes };
  },
};

const projectStatus: ToolDef = {
  name: 'project_status',
  description:
    'Return a summary of the current project (dimensions, layer/frame counts, palette size, tilesets, dirty flag).',
  inputSchema: z.object({}),
  handler: () => {
    const proj = state.getProject();
    if (!proj) return { loaded: false };
    return { loaded: true, ...summarizeProject(proj) };
  },
};

// ---------- Layers / frames / tags ----------

const layerAddRaster: ToolDef = {
  name: 'layer_add_raster',
  description:
    'Add a raster (pixel-pushable) layer to the current project. Creates an empty cel for every existing frame. Returns the layer id.',
  inputSchema: z.object({ name: z.string().default('Layer') }),
  handler: ({ name }) => state.addRasterLayer(name),
};

const layerAddTilemap: ToolDef = {
  name: 'layer_add_tilemap',
  description:
    'Add a tilemap layer that paints into the given tileset. Creates an empty tilemap cel for each frame, sized to fit the sprite at the tileset grid.',
  inputSchema: z.object({ name: z.string().default('Tilemap'), tilesetId: z.string() }),
  handler: ({ name, tilesetId }) => state.addTilemapLayer(name, tilesetId),
};

const layerAddGroup: ToolDef = {
  name: 'layer_add_group',
  description:
    'Add a group layer (folder for nesting raster/tilemap layers). Group layers themselves hold no pixels.',
  inputSchema: z.object({ name: z.string().default('Group') }),
  handler: ({ name }) => state.addGroupLayer(name),
};

const layerAddReference: ToolDef = {
  name: 'layer_add_reference',
  description:
    'Add a reference (tracing-guide) layer. Reference layers are excluded from exports and rendered semi-transparent.',
  inputSchema: z.object({ name: z.string().default('Reference') }),
  handler: ({ name }) => state.addReferenceLayer(name),
};

const layerSetVisibility: ToolDef = {
  name: 'layer_set_visibility',
  description: 'Toggle a layer’s visible flag.',
  inputSchema: z.object({ layerId: z.string(), visible: z.boolean() }),
  handler: ({ layerId, visible }) => {
    state.setLayerVisibility(layerId, visible);
    return { ok: true };
  },
};

const frameAdd: ToolDef = {
  name: 'frame_add',
  description:
    'Append a new frame. Auto-creates an empty cel on every existing layer (raster and tilemap). Returns the new frame index.',
  inputSchema: z.object({ durationMs: z.number().int().min(1).default(100) }),
  handler: ({ durationMs }) => state.addFrame(durationMs),
};

const frameSetDuration: ToolDef = {
  name: 'frame_set_duration',
  description: 'Update the per-frame duration in milliseconds.',
  inputSchema: z.object({ frame: z.number().int().min(0), durationMs: z.number().int().min(1) }),
  handler: ({ frame, durationMs }) => {
    state.setFrameDuration(frame, durationMs);
    return { ok: true };
  },
};

const tagAdd: ToolDef = {
  name: 'tag_add',
  description:
    'Add a frame-range tag (e.g. "walk", "idle"). `direction` controls how playback iterates the range.',
  inputSchema: z.object({
    name: z.string(),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
    direction: z.enum(['forward', 'reverse', 'pingpong']).default('forward'),
    color: z.string().default('#888888'),
  }),
  handler: (i) => state.addTag(i),
};

// ---------- Painting (raster) ----------

const paintPixel: ToolDef = {
  name: 'paint_pixel',
  description: 'Set a single pixel on a raster cel.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    x: z.number().int(),
    y: z.number().int(),
    color: colorHex,
  }),
  handler: ({ layerId, frame, x, y, color }) => {
    state.paintPixel(layerId, frame, x, y, parseColor(color));
    return { ok: true };
  },
};

const paintRect: ToolDef = {
  name: 'paint_rect',
  description: 'Draw a rectangle (filled or outline) on a raster cel.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    color: colorHex,
    filled: z.boolean().default(true),
  }),
  handler: ({ layerId, frame, x, y, width, height, color, filled }) => {
    state.paintRect(layerId, frame, x, y, width, height, parseColor(color), filled);
    return { ok: true };
  },
};

const paintLine: ToolDef = {
  name: 'paint_line',
  description: 'Draw a Bresenham line on a raster cel.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    x0: z.number().int(),
    y0: z.number().int(),
    x1: z.number().int(),
    y1: z.number().int(),
    color: colorHex,
  }),
  handler: ({ layerId, frame, x0, y0, x1, y1, color }) => {
    state.paintLine(layerId, frame, x0, y0, x1, y1, parseColor(color));
    return { ok: true };
  },
};

const paintFloodFill: ToolDef = {
  name: 'paint_flood_fill',
  description: 'Bucket-fill connected pixels of the same color, starting at (x, y).',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    x: z.number().int(),
    y: z.number().int(),
    color: colorHex,
  }),
  handler: ({ layerId, frame, x, y, color }) => {
    state.floodFill(layerId, frame, x, y, parseColor(color));
    return { ok: true };
  },
};

const paintClear: ToolDef = {
  name: 'paint_clear',
  description: 'Clear an entire cel to transparent (raster) or empty (tilemap).',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
  }),
  handler: ({ layerId, frame }) => {
    state.clearCel(layerId, frame);
    return { ok: true };
  },
};

// ---------- Tilemap painting ----------

const tilemapPaintCell: ToolDef = {
  name: 'tilemap_paint_cell',
  description:
    'Set a single tilemap cell to point at the given 0-based tile index, with optional flip flags.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    tileX: z.number().int().min(0),
    tileY: z.number().int().min(0),
    tilesetIndex: z.number().int().min(-1),
    flipX: z.boolean().default(false),
    flipY: z.boolean().default(false),
    flipD: z.boolean().default(false),
  }),
  handler: ({ layerId, frame, tileX, tileY, tilesetIndex, flipX, flipY, flipD }) => {
    state.paintTilemapCell(layerId, frame, tileX, tileY, tilesetIndex, { flipX, flipY, flipD });
    return { ok: true };
  },
};

const tilemapResize: ToolDef = {
  name: 'tilemap_resize',
  description: 'Resize a tilemap cel to a new tile-grid size, preserving overlapping cells.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    tilesW: z.number().int().min(1),
    tilesH: z.number().int().min(1),
  }),
  handler: ({ layerId, frame, tilesW, tilesH }) => {
    state.resizeTilemapCel(layerId, frame, tilesW, tilesH);
    return { ok: true };
  },
};

// ---------- Tilesets ----------

const tilesetCreate: ToolDef = {
  name: 'tileset_create',
  description: 'Create an empty tileset attached to the current project.',
  inputSchema: z.object({
    name: z.string().default('Tileset'),
    tileWidth: z.number().int().min(1).max(256),
    tileHeight: z.number().int().min(1).max(256),
  }),
  handler: ({ name, tileWidth, tileHeight }) => state.addTileset(name, tileWidth, tileHeight),
};

const tilesetGenerateFromLayer: ToolDef = {
  name: 'tileset_generate_from_layer',
  description:
    'Auto-generate a tileset by slicing a raster layer at frame 0 into tw×th tiles, deduping by hash (with optional flip-aware matching). Creates a new tileset and a tilemap layer that references it. Returns counts and the new layer/tileset ids.',
  inputSchema: z.object({
    sourceLayerId: z.string(),
    tileWidth: z.number().int().min(1).max(256),
    tileHeight: z.number().int().min(1).max(256),
    matchFlips: z.boolean().default(true),
    name: z.string().default('Generated'),
    tilemapLayerName: z.string().default('Tilemap'),
  }),
  handler: ({ sourceLayerId, tileWidth, tileHeight, matchFlips, name, tilemapLayerName }) => {
    const proj = state.requireProject();
    const cel = state.requireCel(sourceLayerId, 0);
    if (cel.image.colorMode !== 'rgba') {
      throw new Error('tileset_generate_from_layer requires a raster source layer.');
    }
    const result = generateTilesetFromImage(cel.image as ImageRGBA, {
      tileWidth,
      tileHeight,
      matchFlips,
      name,
    });
    proj.sprite.tilesets.push(result.tileset);
    const tilemapLayer = state.addTilemapLayer(tilemapLayerName, result.tileset.id);
    // Initialize the tilemap cel at frame 0 with the generated map data.
    const cell0 = state.requireCel(tilemapLayer.id, 0);
    if (cell0.image.colorMode === 'tilemap') {
      cell0.image.w = result.mapW;
      cell0.image.h = result.mapH;
      cell0.image.data = result.tilemapData;
    }
    return {
      tilesetId: result.tileset.id,
      tilemapLayerId: tilemapLayer.id,
      tilesCreated: result.tilesCreated,
      duplicatesFound: result.duplicatesFound,
      mapW: result.mapW,
      mapH: result.mapH,
    };
  },
};

const tilemapAutotile: ToolDef = {
  name: 'tilemap_autotile_region',
  description:
    'Run the Wang 2-corner / 16-mask auto-tiler over a boolean fill mask and write the result into a tilemap cel. The map argument lets you customize mask→tile-index mapping; pass null to use the canonical 0..15 layout.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    mapW: z.number().int().min(1),
    mapH: z.number().int().min(1),
    filled: z.array(z.boolean()),
    mapping: z.record(z.string(), z.number().int()).nullable().default(null),
    wrap: z.boolean().default(false),
  }),
  handler: ({ layerId, frame, mapW, mapH, filled, mapping, wrap }) => {
    if (filled.length !== mapW * mapH) {
      throw new Error(`filled.length (${filled.length}) !== mapW*mapH (${mapW * mapH})`);
    }
    const map: Record<number, number> = mapping
      ? Object.fromEntries(
          Object.entries(mapping).map(([k, v]) => [Number(k), v as number])
        ) as Record<number, number>
      : CANONICAL_WANG_16;
    const words = autoTileGrid({ map, mapW, mapH, filled, wrap });
    const cel = state.requireCel(layerId, frame);
    if (cel.image.colorMode !== 'tilemap') throw new Error('autotile target must be a tilemap layer');
    cel.image.w = mapW;
    cel.image.h = mapH;
    cel.image.data = words;
    return { ok: true, cellsWritten: words.length };
  },
};

// ---------- Color / palette ----------

const paletteSet: ToolDef = {
  name: 'palette_set',
  description: 'Replace the project palette with a list of #RRGGBB or #RRGGBBAA colors.',
  inputSchema: z.object({ colors: z.array(colorHex).min(1).max(256) }),
  handler: ({ colors }) => {
    const proj = state.requireProject();
    proj.sprite.palette.colors = new Uint32Array(colors.map(parseColor));
    state.markDirty();
    return { size: colors.length };
  },
};

const layerQuantize: ToolDef = {
  name: 'layer_quantize',
  description:
    'Quantize a raster cel to N or fewer colors, optionally with Floyd–Steinberg dither. Replaces the cel pixels with the remapped output and returns the discovered palette as #RRGGBB hex strings.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    maxColors: z.number().int().min(2).max(256),
    dither: z.boolean().default(false),
    alphaThreshold: z.number().int().min(0).max(255).default(1),
  }),
  handler: ({ layerId, frame, maxColors, dither, alphaThreshold }) => {
    const cel = state.requireCel(layerId, frame);
    if (cel.image.colorMode !== 'rgba') throw new Error('layer_quantize requires a raster layer');
    const result = quantize(cel.image as ImageRGBA, { maxColors, dither, alphaThreshold });
    cel.image.data.set(result.remappedRGBA);
    state.markDirty();
    return {
      colorsFound: result.colorsFound,
      palette: Array.from(result.palette).map((c) => {
        const r = c & 0xff;
        const g = (c >>> 8) & 0xff;
        const b = (c >>> 16) & 0xff;
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }),
    };
  },
};

// ---------- Image I/O (PNG) ----------

const imageImportPNG: ToolDef = {
  name: 'image_import_png_as_raster',
  description:
    'Decode a PNG file from disk and write it into a raster cel. The cel must already exist (pre-create the layer) and the PNG dimensions must match the cel.',
  inputSchema: z.object({
    layerId: z.string(),
    frame: z.number().int().min(0).default(0),
    filePath: z.string(),
  }),
  handler: async ({ layerId, frame, filePath }) => {
    const bytes = await fs.readFile(filePath);
    const decoded = enc.decodePNG(new Uint8Array(bytes));
    state.setRasterCelFromRGBA(layerId, frame, decoded.width, decoded.height, decoded.data);
    return { width: decoded.width, height: decoded.height };
  },
};

// ---------- Exports ----------

const exportFramePNG: ToolDef = {
  name: 'export_frame_png',
  description: 'Composite and write a single frame as a PNG to disk.',
  inputSchema: z.object({
    frame: z.number().int().min(0).default(0),
    filePath: z.string(),
  }),
  handler: async ({ frame, filePath }) => {
    const proj = state.requireProject();
    const png = enc.spriteFramePNG(proj.sprite, frame);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(png));
    return { filePath, bytes: png.byteLength };
  },
};

const exportSheet: ToolDef = {
  name: 'export_sprite_sheet',
  description:
    'Pack every frame into a single sprite-sheet PNG and write a metadata JSON next to it. Layout is "hash" (Phaser/PixiJS) or "array" (TexturePacker).',
  inputSchema: z.object({
    targetDir: z.string(),
    filenameBase: z.string(),
    cols: z.number().int().min(1).default(8),
    layout: z.enum(['hash', 'array']).default('hash'),
  }),
  handler: async ({ targetDir, filenameBase, cols, layout }) => {
    const proj = state.requireProject();
    const files = enc.spriteSheetWithMeta(proj.sprite, cols, filenameBase, layout);
    const written = await writeFiles(targetDir, files);
    return { files: written };
  },
};

const exportTilemap: ToolDef = {
  name: 'export_tilemap',
  description:
    'Export a tileset + every tilemap layer that references it. `format` chooses the JSON flavor: "tiled" (TMJ+TSJ for the Tiled editor), "raw" (simple structure), "aseprite-array" (per-tile-as-frame).',
  inputSchema: z.object({
    targetDir: z.string(),
    tilesetId: z.string(),
    filenameBase: z.string(),
    format: z.enum(['raw', 'tiled', 'aseprite-array']).default('tiled'),
    columns: z.number().int().min(1).default(8),
    frame: z.number().int().min(0).default(0),
  }),
  handler: async ({ targetDir, tilesetId, filenameBase, format, columns, frame }) => {
    const proj = state.requireProject();
    const files = enc.buildTilemapExport(proj.sprite, tilesetId, format, columns, filenameBase, frame);
    const written = await writeFiles(targetDir, files);
    return { files: written };
  },
};

const exportSequenceZip: ToolDef = {
  name: 'export_sequence_zip',
  description:
    'Export every frame as a numbered PNG and bundle them into a zip file. Useful for engines that want frame folders.',
  inputSchema: z.object({
    targetZipPath: z.string(),
    filenameBase: z.string(),
  }),
  handler: async ({ targetZipPath, filenameBase }) => {
    const proj = state.requireProject();
    const digits = String(Math.max(0, proj.sprite.frames.length - 1)).length || 1;
    const files: enc.GeneratedFile[] = [];
    for (let i = 0; i < proj.sprite.frames.length; i++) {
      const png = enc.spriteFramePNG(proj.sprite, i);
      files.push({ name: `${filenameBase}_${String(i).padStart(digits, '0')}.png`, bytes: png });
    }
    const zipped = enc.zipFiles(files);
    await fs.mkdir(path.dirname(targetZipPath), { recursive: true });
    await fs.writeFile(targetZipPath, Buffer.from(zipped));
    return { targetZipPath, frames: files.length, bytes: zipped.byteLength };
  },
};

// ---------- Animation conveniences ----------

const animMakeWalkCycle: ToolDef = {
  name: 'anim_make_walk_cycle_template',
  description:
    'Create a walk-cycle scaffold: N empty raster frames on a fresh layer, plus a "walk" tag covering them. Returns the layer id, frame indices, and tag id so you can paint each pose. Default N=4 (contact, recoil, passing, high).',
  inputSchema: z.object({
    layerName: z.string().default('Walk'),
    frameCount: z.number().int().min(2).max(16).default(4),
    frameDurationMs: z.number().int().min(1).default(100),
  }),
  handler: ({ layerName, frameCount, frameDurationMs }) => {
    const proj = state.requireProject();
    const layer = state.addRasterLayer(layerName);
    // Top up frames so we have at least frameCount.
    while (proj.sprite.frames.length < frameCount) state.addFrame(frameDurationMs);
    // Ensure all existing frames have the requested duration (only the ones we care about).
    for (let i = 0; i < frameCount; i++) state.setFrameDuration(i, frameDurationMs);
    const tag = state.addTag({
      name: 'walk',
      from: 0,
      to: frameCount - 1,
      direction: 'forward',
      color: '#88cc44',
    });
    return {
      layerId: layer.id,
      frameIndices: Array.from({ length: frameCount }, (_, i) => i),
      tagId: tag.id,
    };
  },
};

// ---------- Gemini ----------

const geminiGenerate: ToolDef = {
  name: 'gemini_generate_image',
  description:
    'Generate an image with Google Gemini and save it to disk. Returns the saved path. Requires GEMINI_API_KEY (or GOOGLE_API_KEY) env var. Suggest a small canvas (e.g. 64x64) and a clear pixel-art prompt for best results.',
  inputSchema: z.object({
    prompt: z.string(),
    targetPath: z.string(),
    model: z.string().optional(),
  }),
  handler: async ({ prompt, targetPath, model }) => {
    const r = await generateImageWithGemini({ prompt, model });
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(r.bytes));
    return { targetPath, bytes: r.bytes.byteLength, mimeType: r.mimeType };
  },
};

const geminiToTileset: ToolDef = {
  name: 'gemini_to_tileset',
  description:
    'Pipeline: Gemini generates a raster image → import as new raster layer → quantize to a target color count → run tileset_generate_from_layer to dedupe into a tileset + tilemap. Returns ids and counts.',
  inputSchema: z.object({
    prompt: z.string(),
    tileWidth: z.number().int().min(4).max(128),
    tileHeight: z.number().int().min(4).max(128),
    quantizeColors: z.number().int().min(2).max(256).default(32),
    matchFlips: z.boolean().default(true),
    model: z.string().optional(),
    layerName: z.string().default('Gemini source'),
    tilesetName: z.string().default('Gemini tileset'),
    saveSourcePNGTo: z.string().optional(),
  }),
  handler: async (i) => {
    const r = await generateImageWithGemini({ prompt: i.prompt, model: i.model });
    if (i.saveSourcePNGTo) {
      await fs.mkdir(path.dirname(i.saveSourcePNGTo), { recursive: true });
      await fs.writeFile(i.saveSourcePNGTo, Buffer.from(r.bytes));
    }
    const decoded = enc.decodePNG(r.bytes);
    // Make sure the project canvas is big enough to host the image.
    const proj = state.getProject();
    if (!proj || proj.sprite.w < decoded.width || proj.sprite.h < decoded.height) {
      state.createProject({
        name: i.layerName,
        width: decoded.width,
        height: decoded.height,
      });
    }
    const layer = state.addRasterLayer(i.layerName);
    state.setRasterCelFromRGBA(layer.id, 0, decoded.width, decoded.height, decoded.data);
    // Optional quantize for cleaner tile dedup.
    const cel = state.requireCel(layer.id, 0);
    if (cel.image.colorMode === 'rgba' && i.quantizeColors > 0) {
      const q = quantize(cel.image as ImageRGBA, {
        maxColors: i.quantizeColors,
        dither: false,
      });
      cel.image.data.set(q.remappedRGBA);
    }
    const tsResult = generateTilesetFromImage(cel.image as ImageRGBA, {
      tileWidth: i.tileWidth,
      tileHeight: i.tileHeight,
      matchFlips: i.matchFlips,
      name: i.tilesetName,
    });
    state.requireProject().sprite.tilesets.push(tsResult.tileset);
    const tilemapLayer = state.addTilemapLayer(`${i.tilesetName} map`, tsResult.tileset.id);
    const cell0 = state.requireCel(tilemapLayer.id, 0);
    if (cell0.image.colorMode === 'tilemap') {
      cell0.image.w = tsResult.mapW;
      cell0.image.h = tsResult.mapH;
      cell0.image.data = tsResult.tilemapData;
    }
    state.markDirty();
    return {
      sourceLayerId: layer.id,
      tilesetId: tsResult.tileset.id,
      tilemapLayerId: tilemapLayer.id,
      tilesCreated: tsResult.tilesCreated,
      duplicatesFound: tsResult.duplicatesFound,
      mapW: tsResult.mapW,
      mapH: tsResult.mapH,
    };
  },
};

// ---------- Project summary helper ----------

function summarizeProject(proj: state.ProjectState) {
  const s = proj.sprite;
  return {
    id: s.id,
    name: s.name,
    width: s.w,
    height: s.h,
    colorMode: s.colorMode,
    paletteSize: s.palette.colors.length,
    frames: s.frames.length,
    layers: s.layers.map((l) => ({ id: l.id, name: l.name, type: l.type, visible: l.visible })),
    tilesets: s.tilesets.map((t) => ({
      id: t.id,
      name: t.name,
      tw: t.grid.tw,
      th: t.grid.th,
      tiles: t.tiles.length,
    })),
    filePath: proj.filePath,
    dirty: proj.dirty,
  };
}

// ---------- Registry export ----------

export const TOOLS: ToolDef[] = [
  // Project
  projectCreate,
  projectLoad,
  projectSave,
  projectStatus,
  // Layers / frames / tags
  layerAddRaster,
  layerAddTilemap,
  layerAddGroup,
  layerAddReference,
  layerSetVisibility,
  frameAdd,
  frameSetDuration,
  tagAdd,
  // Painting
  paintPixel,
  paintRect,
  paintLine,
  paintFloodFill,
  paintClear,
  // Tilemap
  tilemapPaintCell,
  tilemapResize,
  // Tilesets
  tilesetCreate,
  tilesetGenerateFromLayer,
  tilemapAutotile,
  // Color
  paletteSet,
  layerQuantize,
  // Image I/O
  imageImportPNG,
  // Exports
  exportFramePNG,
  exportSheet,
  exportTilemap,
  exportSequenceZip,
  // Animation
  animMakeWalkCycle,
  // Gemini
  geminiGenerate,
  geminiToTileset,
];

// Bit constants re-exported for callers who want to compose tile flags out-of-band.
export const TILEMAP_FLAGS = { TILE_FLIP_X, TILE_FLIP_Y, TILE_FLIP_D };
