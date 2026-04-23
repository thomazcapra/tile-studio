# Tilesets and Tilemaps

Tile Studio treats tilesets and tilemaps as full editing workflows, not as an afterthought. This page explains the whole path from creating tiles to exporting map-ready data.

## Core Concepts

## Tile

A tile is a reusable image block inside a tileset.

## Tileset

A tileset is a named collection of tiles that all share a grid size.

## Tilemap layer

A tilemap layer is a grid of tile references. It points at a tileset and stores which tile is placed in each cell, along with optional flip flags.

## Why this matters

This separation lets you:

- edit a tile once and reuse it many times
- paint level layout quickly
- export data in map-friendly formats

## Creating Tilesets

Tile Studio supports two main tileset creation paths.

## Empty tilesets

Use `Tileset -> New Empty Tileset...` when you want to author tiles manually.

You choose:

- tileset name
- tile width
- tile height
- initial tile count

This is the best workflow when you already know the target tile size.

## Generated tilesets

Use `Tileset -> Generate from Layer...` or `Layer -> Convert to Tilemap...` when you already have raster artwork that should be broken into repeated tiles.

This workflow can:

- scan a raster layer by tile-sized chunks
- build a tileset from unique chunks
- deduplicate repeats
- optionally match flipped duplicates
- create a matching tilemap layer
- hide the source raster layer afterward

## Managing Tiles

Inside the tileset panel you can:

- inspect all tiles in a tileset
- select a tile for tilemap painting
- add tiles
- duplicate tiles
- delete tiles
- drag tiles to reorder them
- double-click a tile to enter direct tile-edit mode

When tiles are deleted or reordered, tilemap references are remapped so the map stays consistent.

## Direct Tile Editing

Double-clicking a tile enters `Tile` mode. In this mode:

- the selected tile becomes the edit target
- raster tools paint into that tile directly
- the viewport shows a badge identifying the tile being edited
- tileset thumbnails update as the tile changes

This is useful when:

- sketching tiles from scratch
- cleaning up generated tiles
- adjusting a single reused tile after seeing it in a map

## Tilemap Layers

Tilemap layers can be created from `Layer -> New Tilemap Layer...`.

The dialog asks for:

- layer name
- source tileset
- width in tiles
- height in tiles

It also shows the resulting canvas size in pixels.

## Painting Tilemaps

To paint a tilemap:

1. create or select a tileset
2. create a tilemap layer that uses that tileset
3. switch to `Tilemap` mode
4. click a tile in the tileset panel
5. paint on the viewport

Behavior in tilemap mode:

- left click places the current tile
- right click erases the current cell
- the viewport shows a ghost tile preview
- the badge changes to the tilemap layer name

## Tile Brush Flips

Tile placement supports three flip flags:

- horizontal
- vertical
- diagonal

You can control them through:

- the viewport flip HUD
- `F` for horizontal
- `V` for vertical
- `R` for diagonal

These flags are stored in the tile word rather than permanently changing the tile image.

## Tile Regions

When you drag a rectangle selection on a tilemap layer, Tile Studio also creates a tile-space region. That region supports its own operations:

- fill
- clear
- flip horizontally
- flip vertically
- rotate 180 degrees
- nudge
- copy
- cut
- paste
- deselect

These actions operate on tile words, not raster pixels, which is why they belong to the tilemap workflow rather than the raster selection workflow.

## Converting Raster Art into Tiles

The tileset generation dialog is one of the most important features in the project.

### Inputs and options

You can configure:

- source raster layer
- tile width
- tile height
- extraction offset X
- extraction offset Y
- tileset name
- whether flipped duplicates should be matched
- whether the source layer should be hidden after generation

### Preprocessing options

Before tile extraction, you can also:

- pixelate the source image
- quantize it to a limited palette
- commit the preprocessed result back into the source layer

### Preview

The dialog includes a preview and estimated dedup statistics so you can judge whether the current settings are producing sensible tile reuse.

### Pixel-art preset

The bundled `Pixel-art` preset enables a useful combination of:

- pixelation
- quantization
- flip matching
- source hiding

This is a good starting point when converting a painted image into a map-friendly tile set.

## Converting Tilemaps Back to Raster

`Layer -> Flatten to Raster` composites the current tilemap layer into raster pixels.

Use this when:

- you want to paint over a generated layout manually
- you want to leave the tile workflow and return to pure raster editing
- you want to merge the map appearance into a normal painted layer

## Tileset Properties

The tileset properties dialog shows:

- tileset name
- grid size
- tile count
- which tilemap layers are using that tileset

This is helpful in larger documents where several maps depend on the same tile source.

## Auto-tile Support

The project includes Wang-style 16-mask auto-tile support in the engine. At that level it can:

- inspect which tilemap cells are filled
- compute north, east, south, and west neighbor masks
- remap each filled cell to a tile index based on a mask table
- optionally wrap edges as if the map were a torus

This is currently more visible in the code and automated tests than in a dedicated artist-facing panel, but it is a real project capability.

## Animated Tiles

Tile Studio also supports animated tiles in the data model and renderer.

That support includes:

- multiple frames attached to one tile
- a per-tile frame duration
- rendering driven by a global tile animation clock
- persistence through project save and load

As with auto-tiling, this is implemented more deeply in the engine than in the visible editing UI today.

## Typical Workflows

### Hand-authored tileset workflow

1. create an empty tileset
2. double-click tiles to enter tile-edit mode
3. paint tile art directly
4. create a tilemap layer
5. switch to tilemap mode and place tiles
6. export as `Tileset + map`

### Raster-to-tilemap workflow

1. draw or import raster art
2. open `Generate Tileset`
3. adjust tile size and preprocessing
4. generate the tileset and tilemap
5. clean up tiles manually in tile mode if needed
6. export to Tiled or other formats

### Hybrid workflow

1. build layout as a tilemap
2. flatten the tilemap to raster
3. add painted effects, decals, or lighting on raster layers

This hybrid approach is one of the strengths of the project.
