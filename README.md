# Tile Studio

A browser-based pixel-art and tilemap editor inspired by [Aseprite](https://www.aseprite.org/). Runs entirely in the browser — no installer, no server — with a data model designed around the same primitives: layers, frames, tilesets, tilemaps, slices, tags.

**Live demo:** https://asprite-805f9.web.app

![status: beta](https://img.shields.io/badge/status-beta-orange) ![tests: 183](https://img.shields.io/badge/tests-183%20passing-brightgreen) ![license: MIT](https://img.shields.io/badge/license-MIT-blue)

---

## Wiki

Feature documentation now lives in [`docs/wiki`](docs/wiki/Home.md).

- [Home](docs/wiki/Home.md)
- [Getting Started](docs/wiki/Getting-Started.md)
- [Workspace and Modes](docs/wiki/Workspace-and-Modes.md)
- [Drawing and Selection](docs/wiki/Drawing-and-Selection.md)
- [Layers, Frames, and Animation](docs/wiki/Layers-Frames-and-Animation.md)
- [Tilesets and Tilemaps](docs/wiki/Tilesets-and-Tilemaps.md)
- [Color, Palette, and Import Workflows](docs/wiki/Color-Palette-and-Import.md)
- [Export, Persistence, and Preferences](docs/wiki/Export-Persistence-and-Preferences.md)
- [Keyboard Shortcuts and Commands](docs/wiki/Keyboard-Shortcuts-and-Commands.md)
- [Data Model and Project Format](docs/wiki/Data-Model-and-Project-Format.md)
- [BrowserQuest Maps](docs/wiki/BrowserQuest-Maps.md)

---

## Why?

Aseprite is great desktop software, but distributing a pixel-art workflow over the web has real advantages:

- Zero-install onboarding for tutorials, game-jam teammates, students
- Drag-and-drop PNG → sprite in one click
- Exports that plug directly into Phaser, PixiJS, Tiled, and raw JSON pipelines
- Git-friendly project format (`.tstudio`) that's just a ZIP of JSON + pixel blobs

Tile Studio is an opinionated open-source take on that niche. It's deliberately feature-complete enough for real work (183 e2e tests), and small enough to hack on (< 10 kLOC TypeScript).

---

## Features

### Drawing & selection
- **Tools**: pencil, eraser, bucket, eyedropper, line, rectangle (filled/outline), gradient (linear A→B with mask support), text
- **Selections**: rectangle, ellipse, lasso, magic wand with tolerance — combinable via Shift/Alt/Ctrl modifiers
- **Selection transforms**: nudge (arrow keys, Shift = ×10), flip H/V, rotate 180°, free-angle rotate, scale (nearest-neighbor), capture as custom stamp brush
- **Brush**: variable size, pixel-perfect mode, symmetry (H/V/both), OS clipboard round-trip for cut/copy/paste

### Layers & frames
- Raster layers with 9 blend modes (normal / multiply / screen / darken / lighten / add / subtract / difference / overlay)
- Tilemap layers (each referencing a tileset) with H/V/D flip flags per cell (Aseprite-compatible encoding)
- Layer groups with nested hierarchies, shift-drag to nest, ancestor-aware visibility
- Reference layers (non-exported tracing guides, locked + semi-transparent by default)
- Linked cels — multiple frames share one pixel buffer by reference, edits propagate
- Onion skin with configurable previous/next frames and opacity
- Tags (forward / reverse / pingpong) drive tag-aware playback

### Tilesets & tilemaps
- Auto-generate a tileset from a raster layer with H/V/D flip-matched deduplication
- Drag-reorder tiles; every cel word referencing that tileset is remapped automatically
- Per-tile animation (multiple frames + duration) — cycles via a global tile clock
- Auto-tile / Wang 2-corner helper with configurable mask → tile mappings
- Tilemap region selection (tile-space) with flip, rotate, nudge, fill, copy/cut/paste

### Export
- PNG (single frame), WebP, JPEG (auto-flattens alpha onto a configurable background)
- Frame sequence as a ZIP of numbered PNGs
- Sprite-sheet atlas with JSON metadata in Phaser/PixiJS "hash" layout or TexturePacker "array" layout
- Tilemap exports: Tiled (TMJ + TSJ), Aseprite JSON Array, raw JSON
- BrowserQuest map pair (`world_client.json` + `world_server.json`) — see [docs/wiki/BrowserQuest-Maps.md](docs/wiki/BrowserQuest-Maps.md)
- Animated GIF (quantized per-frame)
- Tileset atlas PNG on its own

### Palette
- Drag-to-reorder swatches; add/remove; inline hex + RGB editor
- Presets (Default 16, PICO-8, Game Boy, NES, DB32)
- Import `.gpl` (GIMP), `.pal` (JASC), `.hex` (lospec); export the same three formats
- Sort by hue, luma (Rec.601), or HSL lightness
- Quantize a raster layer to a target color count (octree + Floyd–Steinberg optional dither)

### UX
- Keyboard-driven command palette (`Ctrl+K`) with fuzzy search over 70+ actions
- Fully customizable keyboard shortcuts via the Preferences dialog
- Visual rulers along viewport edges; double-click to drop a guide line
- Minimap navigator (click / drag to pan)
- Distraction-free mode (`Tab`) hides every panel except the canvas
- Autosave to IndexedDB with restore-or-discard prompt
- Native project save/load (`.tstudio` = ZIP of `manifest.json` + pixel blobs)
- Drag a PNG onto the window to import it as a new sprite
- Snapshot-based undo covering every structural edit (not just pixel strokes)

---

## Getting started

### Requirements
- Node.js 20+ (any LTS works)
- A modern Chromium-based browser for development — we test against Chromium via Playwright

### Install & run
```bash
git clone https://github.com/thomazcapra/tile-studio.git
cd tile-studio
npm install
npm run dev
```
Dev server runs at http://localhost:5173 with HMR.

### Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server + HMR |
| `npm run build` | `tsc -b` then production build into `dist/` |
| `npm run preview` | Serve `dist/` locally (matches deployed behavior) |
| `npm run lint` | ESLint across `src/` |
| `npm run test:e2e` | Playwright end-to-end suite (spins up dev server if needed) |

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript 6 | Strict type safety without sacrificing iteration speed |
| State | Zustand 5 | Flat store, no provider noise, easy to expose to tests |
| Build | Vite 8 | Fast HMR, native ES modules, good Web Worker support |
| Styling | Tailwind CSS 3 | Utility-first, minimal CSS output |
| Icons | lucide-react | Tree-shaken SVG icons |
| ZIP | fflate | Pure JS, works in Web Workers, no WASM |
| GIF | gifenc | Tiny GIF89a encoder |
| Toast | sonner | Modern toast UI |
| Tests | Playwright 1.59 | Real browser coverage |

Pixel data is `Uint32Array` packed as `AABBGGRR` (little-endian RGBA, matches canvas `ImageData` byte order). Tilemap cells use the Aseprite word encoding: low 29 bits = tile index, high 3 bits = X / Y / diagonal flip flags.

---

## Project structure

```
src/
  App.tsx                   — root layout, hook wiring, global drag-drop
  main.tsx                  — entry + dev-only globals for e2e tests
  model/
    types.ts                — Sprite, Layer, Cel, Tileset, Slice, Frame, Tag
    factory.ts              — builders for newSprite / newTileset / nextId
    palette-presets.ts      — the five bundled palettes
  store/
    editor.ts               — Zustand store (the heart of the app, ~2500 LOC)
    history.ts              — PixelPatch + SnapshotPatch undo engine
  tools/
    types.ts                — ToolContext / ToolSession interfaces
    tools.ts                — pencil, eraser, bucket, line, rect, gradient, text
  render/
    composite.ts            — compositeFrame() with 9 blend modes + tilemap blit
    image-ops.ts            — floodFill, lineEach, rectEach, packRGBA/unpackRGBA
  image/
    transform.ts            — rotate90/rotate180, flipAny, scaleRGBANearest
  tileset/
    generate.ts             — FNV-1a dedup with flip-orientation matching
    generate-async.ts       — Web Worker wrapper
    generate-worker.ts      — The actual worker entry
    autotile.ts             — Wang 2-corner / 16-mask auto-tile helper
  color/
    quantize.ts             — octree + Floyd–Steinberg dither
    pixelate.ts             — nearest-neighbor down-then-up resample
  io/
    native.ts               — .tstudio serializer (manifest v2)
    png.ts                  — PNG decode + downloadBlob helper
    export.ts               — PNG/WebP/JPEG/sheet/sequence/Tiled exporters
    gif.ts                  — Animated GIF via gifenc
    palette-io.ts           — .gpl / .pal / .hex parsers + serializers
    os-clipboard.ts         — Clipboard API round-trip (best-effort)
    autosave.ts             — IndexedDB snapshot
  prefs/
    prefs-store.ts          — persisted preferences + shortcut bindings
    shortcuts.ts            — action catalog + default keybindings
  hooks/                    — useShortcuts, usePlayback, useAutosave,
                              useRestoreAutosave, useTileAnimationClock
  components/
    Viewport.tsx            — canvas, tool pipeline, cursor, overlays, rulers
    MenuBar.tsx             — top menu (File/Edit/View/…)
    ToolPalette.tsx         — left tool column
    SidePanel.tsx           — right panel: colors, palette, tilesets, layers,
                              slices, history
    Timeline.tsx            — frame strip + playback controls
    StatusBar.tsx           — bottom status (mode, dims, zoom)
    CommandPalette.tsx      — Ctrl+K fuzzy command launcher
    Minimap.tsx             — bottom-right overview + viewport rectangle
    Dialog.tsx              — modal wrapper + Button/DialogField/NumberInput
    …Dialog.tsx (×13)       — one per heavy action (export, generate tileset,
                              quantize, resize canvas, text tool, preferences,
                              etc.)
tests/e2e/
  p0–p24.spec.ts            — 24 Playwright specs, grouped by feature wave
  quality-bench.spec.ts     — informational dedup/quantize quality benchmark
```

Each `p<N>` spec file corresponds to a feature session. See the [roadmap section](#roadmap) for what each one covers.

---

## File format (`.tstudio`)

Projects save as a ZIP (via fflate) containing:
- `manifest.json` — sprite metadata (dims, palette, layer tree, tilesets, slices, tags, cels, tile animations, linked-cel groups)
- `blobs/<id>.bin` — raw typed-array buffers referenced by id

The manifest is version-tagged (`CURRENT_VERSION = 2`). Older savefiles load fine; the reader preserves linked-cel buffer sharing by de-duplicating blob ids during rehydration.

---

## Testing

End-to-end tests live in `tests/e2e/`. Each spec drives the real app through Playwright (no mocks) and both asserts on DOM and calls store actions directly via the `__tileStudio` global that's exposed in dev mode.

```bash
npm run test:e2e                          # whole suite (~35 s on modern hw)
npx playwright test p17                   # single wave
npx playwright test -g "palette hue"      # single test by name substring
```

- Coverage breakdown is in the roadmap section below.
- The `quality-bench.spec.ts` prints a markdown table of tile-dedup rates across preprocessing presets — useful when tuning the generator.

---

## Roadmap

Development happened in numbered waves. Each wave landed as a single commit with its own Playwright spec.

| Wave | Theme | Spec file | Tests |
|---|---|---|---|
| P0 | Scaffold / smoke | `smoke.spec.ts` | 4 |
| P1 | Raster editor basics | `p1-editor.spec.ts` | 6 |
| P2 | Tilesets | `p2-tilesets.spec.ts` | 4 |
| P3 | Tilemap painting + flip flags | `p3-tilemap.spec.ts` | 6 |
| P4 | Auto-generate tileset | `p4-generate.spec.ts` | 3 |
| P5 | Color quantization | `p5-quantize.spec.ts` | 2 |
| P6 | Export (Tiled / raw / Aseprite array) | `p6-export.spec.ts`, `p6b-preset.spec.ts` | 5 |
| P7 | Menu bar + view options | `p7-menu.spec.ts` | 6 |
| P8 | Animation + frames | `p8-animation.spec.ts`, `p8b-tags-onion-gif.spec.ts` | 12 |
| P9 | Canvas ops (rotate/flip/crop/resize) | `p9-canvas-ops.spec.ts` | 4 |
| P10 | Layers (add, dup, opacity, blend modes) | `p10-layers.spec.ts` | 10 |
| P11 | Autosave · Palette editor · Sprite size | `p11a/b/c-*.spec.ts` | 14 |
| P12 | Selection tools | `p12-selection.spec.ts` | 9 |
| P13 | Selection polish | `p13-selection-polish.spec.ts` | 4 |
| P14 | Drawing polish (brush size, symmetry) | `p14-drawing-polish.spec.ts` | 4 |
| P15 | HIGH priority (gradient, text, layer groups, command palette, wand tolerance) | `p15-high-priority.spec.ts` | 7 |
| P16 | Export + palette I/O (sequence, WebP, JPEG, sheet, `.gpl`/`.pal`/`.hex`) | `p16-export-palette.spec.ts` | 11 |
| P17 | Tilemap region ops + tileset drag-reorder | `p17-tilemap-ops.spec.ts` | 9 |
| P18 | Preferences + shortcut editor + OS clipboard | `p18-preferences.spec.ts` | 12 |
| P19 | Slices + reference layers + linked cels | `p19-slices-ref-links.spec.ts` | 10 |
| P20 | Scale/rotate selection · custom brush · history seek · palette sort · guides | `p20-polish-tail.spec.ts` | 11 |
| P21 | Rulers + auto-tile helper | `p21-rulers-autotile.spec.ts` | 6 |
| P22 | Animated tiles · minimap · fullscreen | `p22-animated-minimap-fullscreen.spec.ts` | 7 |
| P23 | `.tstudio` persistence coverage | `p23-persistence-coverage.spec.ts` | 5 |
| P24 | Undo coverage for structural actions | `p24-undo-coverage.spec.ts` | 16 |

**Total: 183 tests.**

---

## Known limitations / things we'd love help with

These are real gaps that a second pair of eyes would catch quickly. If you're looking for a way in, pick one:

- **13 ESLint `set-state-in-effect` warnings** in dialogs — legitimate "reset form on open" pattern, but cascades a render. Cleanest fix is to remount via `key` or use an uncontrolled component + ref.
- **Mixed undo interleavings are untested** — P24 tests each new action in isolation; we don't have a spec covering a paint → structural-change → paint → undo×N sequence.
- **No reload-based serialization test** — P23 round-trips in memory but doesn't simulate writing a file from one session and loading it in another.
- **Color picker variants** — only HSV is implemented; OKLCH and RGB slider modes would help users coming from Procreate/Pixelmator.
- **Free-angle rotate for tilemap regions** — selection-content supports arbitrary angles, but tilemap region ops only support orthogonal flip/rotate-180°.
- **Lua scripting** — Aseprite's killer feature. No work here yet; would need a sandboxed interpreter.
- **Touchscreen / stylus pressure** — Apple Pencil and Wacom would be nice.
- **Accessibility pass** — aria labels are spotty; keyboard navigation of the side panels isn't great.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

---

## Deploying your own

The project ships with a `firebase.json` pointing at the `asprite-805f9` site:

```bash
npm run build
firebase deploy --only hosting
```

Replace the `site` field in `firebase.json` with your own hosting target if you're forking. Any static host works — GitHub Pages, Cloudflare Pages, Netlify, Vercel — just serve `dist/` with an SPA rewrite to `/index.html`.

---

## Credits

- Inspired by [Aseprite](https://www.aseprite.org/) by David Capello and contributors. Some data-model shapes (tilemap word encoding, cel structure) are intentionally compatible so projects can be migrated later.
- Palettes: PICO-8 (Lexaloffle), Game Boy (Nintendo), NES (Nintendo), DB32 (Arne Niklas Jansson / DawnBringer).
- Originally bootstrapped from the [Vite](https://vitejs.dev/) React + TS template.

---

## License

[MIT](LICENSE). Do whatever you want — but please don't claim you wrote it if you didn't.
