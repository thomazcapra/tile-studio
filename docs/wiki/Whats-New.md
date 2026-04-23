# What's New

Tile Studio is developed in numbered feature waves. Each wave lands as a focused session with its own end-to-end coverage. This page summarizes what each wave added so you can follow the project as it evolves.

## How to Read This Page

The waves are listed newest-first. Each section names the user-facing capability delivered, not the implementation detail. For the deeper technical breakdown, see the roadmap section in the repository README.

## Recent Waves

### Wave P24 — Undo Coverage for Structural Actions

The history system is now verified against every structural edit, not only paint strokes. Layer moves, tileset changes, slice edits, linked-cel operations, and tile-region transforms all round-trip through undo cleanly.

### Wave P23 — Project Persistence

The `.tstudio` format now round-trips every document feature. That includes linked cels, tile animations, slices, tags, reference layers, and tileset ordering.

### Wave P22 — Animated Tiles, Minimap, Fullscreen

Tiles can carry multi-frame animations that cycle through the global tile clock. The minimap anchors the lower-right viewport and doubles as a pan control. Distraction-free mode takes over the screen with `Tab`.

### Wave P21 — Rulers and Auto-Tiles

Top and left rulers display viewport positions. Double-clicking either ruler drops a guide. The engine also now supports a Wang-style 16-mask auto-tile helper that can rewrite tilemap cells from neighborhood masks.

### Wave P20 — Polish Tail

A batch of refinements:

- scale and rotate transforms on raster selections
- custom-brush capture from selections
- history panel seeking
- palette sorting by hue, luma, and lightness
- guide lines clearable from the view menu

### Wave P19 — Slices, Reference Layers, Linked Cels

Three distinct features in one wave:

- named rectangular slices attached to the sprite
- reference layers imported from images and excluded from export
- linked cels that share one image buffer across multiple frames

### Wave P18 — Preferences and Shortcut Editor

A real preferences dialog replaces the previous hard-coded defaults. Autosave, checker size, high-zoom grid, and clipboard mirroring become user-configurable. A dedicated shortcut editor covers the full action catalog.

### Wave P17 — Tilemap Region Ops and Tile Reorder

Selecting a rectangle on a tilemap layer now creates a tile-space region that supports fill, clear, flip, rotate, nudge, and clipboard operations. Tiles inside the tileset panel can also be dragged into a new order without breaking placed tilemap cells.

### Wave P16 — Export Formats and Palette I/O

The export dialog gained frame sequence, WebP, and JPEG output. The palette editor gained import and export for `.gpl`, `.pal`, and `.hex` formats, covering the main pixel-art palette interop targets.

## Earlier Waves

Earlier waves delivered the foundational capabilities the current app stands on. A condensed version:

- **P15** — Gradient, text stamping, layer groups, command palette, magic wand tolerance.
- **P14** — Drawing polish: brush size, pixel-perfect mode, symmetry.
- **P13** — Selection polish and combination modifiers.
- **P12** — Selection tools: rectangle, ellipse, lasso, magic wand.
- **P11** — Autosave, palette editor, sprite size dialog.
- **P10** — Layer system: add, duplicate, blend modes, visibility.
- **P9** — Canvas-level operations: rotate, flip, crop, resize.
- **P8** — Frame animation, tags, onion skin, animated GIF export.
- **P7** — Menu bar and view options.
- **P6** — Map export: Tiled, raw JSON, Aseprite array.
- **P5** — Color quantization.
- **P4** — Generate a tileset from a raster layer.
- **P3** — Tilemap painting with flip flags.
- **P2** — Tilesets.
- **P1** — Raster editor basics.
- **P0** — Initial scaffold and smoke test.

## Coverage Philosophy

Each wave ships with Playwright end-to-end tests because the editor is feature-dense and highly interactive. A feature is considered landed when there is a real browser test covering it, not only a store action or a visible button. That is why this wiki can document deep behaviors like linked cels and auto-tiles with confidence.

## Where to Next

Planned directions, though not scheduled:

- additional color picker modes (OKLCH, RGB sliders)
- free-angle rotate for tilemap regions
- Lua scripting surface
- touchscreen and stylus pressure input
- accessibility improvements across panels
- richer reload-based persistence tests

See the repository README and issues for the current status of each.
