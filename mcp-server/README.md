# Tile Studio MCP

A Model Context Protocol (MCP) server that exposes the [Tile Studio](https://github.com/thomazcapra/tile-studio) editor engine as tools for Claude (and any other MCP client). The server runs **headless in Node** — it imports Tile Studio's pure modules directly, replaces the canvas-based PNG encoder with `pngjs`, and writes `.tstudio` files compatible with the live web editor.

> No browser, no Chromium. Just `tsx src/index.ts` and you're talking to Claude.

## What it does

You can ask Claude things like:

> Generate a 16-color forest tileset (16×16 tiles) from a Gemini prompt, dedupe with flip matching, and save it to `nexus-survival/assets/forest.tstudio` plus a Tiled `.tmj` export under `nexus-survival/assets/maps/`.

…and Claude will chain `gemini_to_tileset`, `project_save`, and `export_tilemap` to do exactly that.

## Tool surface

**Project lifecycle.** `project_create`, `project_load`, `project_save`, `project_status`.

**Layers / frames / tags.** `layer_add_raster`, `layer_add_tilemap`, `layer_add_group`, `layer_add_reference`, `layer_set_visibility`, `frame_add`, `frame_set_duration`, `tag_add`.

**Raster painting.** `paint_pixel`, `paint_rect`, `paint_line`, `paint_flood_fill`, `paint_clear`.

**Tilemap painting.** `tilemap_paint_cell`, `tilemap_resize`, `tilemap_autotile_region` (Wang 2-corner / 16-mask).

**Tilesets.** `tileset_create`, `tileset_generate_from_layer` (flip-aware dedup).

**Color.** `palette_set`, `layer_quantize` (octree + optional Floyd–Steinberg).

**Image I/O.** `image_import_png_as_raster`.

**Exports.** `export_frame_png`, `export_sprite_sheet` (Phaser/PixiJS hash or array), `export_tilemap` (Tiled TMJ+TSJ, raw, Aseprite array), `export_sequence_zip`.

**Animation conveniences.** `anim_make_walk_cycle_template` (creates layer + N frames + `walk` tag).

**Gemini.** `gemini_generate_image`, `gemini_to_tileset` (full pipeline: prompt → image → quantize → dedup → tilemap).

## Install

```bash
cd mcp-server
npm install
```

Optional sanity check:

```bash
npm run typecheck      # tsc --noEmit
npm run inspect        # opens the MCP Inspector against this server
```

## Wire it into Claude Desktop / Cowork

Add to `claude_desktop_config.json` (path varies by platform — see Anthropic's docs):

```jsonc
{
  "mcpServers": {
    "tile-studio": {
      "command": "npx",
      "args": ["tsx", "C:\\Users\\thoma\\Documents\\Projects\\tile-studio\\mcp-server\\src\\index.ts"],
      "env": {
        "GEMINI_API_KEY": "your-key-here"
      }
    }
  }
}
```

Restart the host. The 30+ tools should appear under the `tile-studio` MCP.

For Cowork, the same config goes into the MCP servers section of Settings → Integrations.

## Architecture

```
mcp-server/src/
  index.ts              # MCP server, stdio transport
  shim.ts               # registers ImageData polyfill BEFORE tile-studio imports
  state.ts              # in-memory Sprite + paint primitives + .tstudio I/O
  encoders.ts           # pngjs-based PNG / sprite-sheet / Tiled / sequence zip
  tools.ts              # ~30 tool definitions, each with a Zod schema
  gemini.ts             # Google Gemini image-gen wrapper
  zod-to-jsonschema.ts  # tiny converter — only the Zod nodes we actually use
```

The server imports these Tile Studio modules **directly** from `../src/`:

- `model/types.ts`, `model/factory.ts` — data shapes + builders
- `tileset/generate.ts` — flip-aware tile dedup
- `tileset/autotile.ts` — Wang 2-corner / 16-mask
- `color/quantize.ts`, `color/octree.ts` — palette reduction
- `render/composite.ts` — layer compositor (uses ImageData polyfill)
- `io/native.ts` — `.tstudio` zip serializer

The canvas-using modules (`io/export.ts`, `io/png.ts`, `color/pixelate.ts`, `io/os-clipboard.ts`) are **not** imported — `encoders.ts` reimplements the parts we need with `pngjs`.

## Why not just drive the live web app via Playwright?

Speed and determinism. The pure modules cover ~95% of what's interesting (paint, dedup, autotile, quantize, export). A Playwright fallback for the remaining 5% (e.g. text-tool rendering, GIF encoding) is a future addition under `src/playwright-bridge.ts`.

## License

MIT, matching the parent Tile Studio project.
