# Data Model and Project Format

This page explains how Tile Studio represents artwork internally and how that affects persistence, rendering, and advanced features.

## Why the Data Model Matters

Tile Studio is not built around a single bitmap. Its document model is closer to a sprite editor like Aseprite:

- the document contains multiple layers
- each layer has cels across multiple frames
- tilemaps use tile references instead of direct pixels
- tilesets, tags, slices, and linked cels are all part of the same sprite file

That structure is why the app can support animation, tile workflows, and export metadata inside one project.

## Core Document Types

### Sprite

The top-level sprite contains:

- document size
- palette
- frames
- layers
- layer order
- cels
- tilesets
- tags
- slices

### Frame

A frame mainly stores its duration in milliseconds. The image content for a frame actually lives inside the per-layer cels.

### Layer

Tile Studio supports four layer types:

- raster
- tilemap
- group
- reference

Layers also carry visibility, lock state, opacity, optional blend mode, and optional parent group identity.

### Cel

A cel belongs to one layer and one frame. It stores position, opacity, image data, and optionally a linked-cel group id if its image buffer is shared with sibling cels.

### Tileset

A tileset stores:

- a name
- a tile grid size
- a list of tiles
- a hash map used for fast deduplication and lookup

### Tile

A tile stores image data and can optionally carry:

- user data
- tile animation data

## Image Types

The editor supports these image color modes:

- `rgba`
- `indexed`
- `grayscale`
- `tilemap`

In practice, the visible editing workflows mostly revolve around raster RGBA images and tilemap grids.

## Pixel Storage

RGBA pixels are stored in `Uint32Array` form using `0xAABBGGRR`, which matches canvas `ImageData` ordering on little-endian systems. This keeps rendering and worker transfer efficient.

## Tilemap Word Encoding

Tilemap cells are not stored as tile objects. They are stored as 32-bit words:

- the low 29 bits store the tile index
- the high 3 bits store horizontal, vertical, and diagonal flip flags

An empty tile cell is encoded as `0`.

The project uses helper functions to build and read these words so tile references can be remapped safely when tiles are deleted or reordered.

## Rendering Model

The compositor:

- walks the ordered layer stack
- skips hidden layers and hidden group descendants
- optionally skips reference layers for export
- blends raster layers with the active blend mode
- draws tilemap cells by resolving them through their tileset
- respects the global tile animation clock when animated tiles are present

## Worker-Backed Subsystems

Two heavier workflows use async worker paths:

- quantization
- tileset generation

This lets the app keep the UI responsive during larger image operations.

## `.tstudio` Project Files

Tile Studio saves projects as `.tstudio` files. These are zip bundles that contain:

- `manifest.json`
- binary blobs for image data

The manifest stores document structure and points to image blobs by id. The format is versioned so future changes can be managed more safely.

## What the Project Format Preserves

The current format preserves:

- document dimensions
- palette
- frame durations
- layer tree and order
- raster and tilemap cels
- tilesets
- slices
- tags
- linked cel identity
- tile animation data

## Autosave and Local Storage

The editor uses two main browser-side persistence areas:

- IndexedDB for autosave snapshots
- localStorage for user preferences and shortcut bindings

That means project files and user settings are intentionally separate concerns.

## Advanced Engine Features

Some implemented capabilities are broader than the current UI:

### Animated tiles

Tiles can carry multiple frames plus a frame duration. The renderer, undo system, persistence layer, and exports all understand this.

### Auto-tiling

The project includes Wang-style 16-mask auto-tile logic that can rewrite tilemap cells from neighborhood patterns.

### Generic selection transforms

The store supports several selection-content transforms that are only partially surfaced through polished dialogs or menu flows.

## Testing and Confidence

The project uses Playwright end-to-end coverage extensively. Many structural features, including persistence-heavy behavior, are exercised through browser tests rather than only unit tests. That is one reason the wiki can document not just the visible UI but also deeper behaviors like linked cels, slices, animated tiles, and auto-tile support with confidence.
