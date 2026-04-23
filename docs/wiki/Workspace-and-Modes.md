# Workspace and Modes

This page explains how the editor is laid out and how the three main editing modes change what the canvas does.

## Workspace Overview

Tile Studio uses a desktop-style editor layout built around one central viewport.

### Menu bar

The menu bar is the most complete feature map in the app. It contains:

- `File`
- `Edit`
- `Select`
- `View`
- `Sprite`
- `Layer`
- `Frame`
- `Tileset`

If you are unsure whether a feature exists, the menu bar is usually the first place to check.

### Toolbar

The toolbar provides:

- new document
- image import
- export
- undo and redo
- mode switches for `Raster`, `Tilemap`, and `Tile`

It is meant for the highest-frequency actions.

### Tool palette

The left tool palette contains the active drawing and selection tools:

- selection tools
- raster paint tools
- gradient and text
- slice tool
- stacked primary and secondary color swatches

### Viewport

The center of the app is the main viewport. It handles:

- canvas display
- cursor feedback
- selection overlays
- slice overlays
- tile brush previews
- panning and zooming
- rulers and guides
- the minimap

This is where most editing happens.

### Side panel

The right side panel is split into several sections:

- `Color`
- `Palette`
- `Tilesets`
- `Layers`
- `Slices`
- `History`

These sections cover the document structure and the current editing context.

### Timeline

The bottom timeline controls frame-based animation. It includes:

- playback controls
- loop toggle
- playback speed
- frame add, duplicate, and delete actions
- onion skin toggle
- tag creation
- frame headers
- per-layer cel thumbnails

### Status bar

The status bar provides live feedback:

- active mode
- active tool
- brush size and pixel-perfect state
- sprite size
- cursor coordinates
- current primary color

## The Three Editing Modes

Tile Studio is easier to understand once you treat its modes as different editing targets rather than different workspaces.

## Raster Mode

`Raster` mode edits raster pixels on the active raster layer and current frame.

Use raster mode when you want to:

- draw pixels directly
- erase
- fill
- use gradient
- stamp text
- work with raster selections

Raster mode is the best place to start if you are learning the editor.

## Tilemap Mode

`Tilemap` mode paints tile references instead of raster pixels.

Use tilemap mode when you want to:

- place tiles onto a tilemap layer
- erase tile cells
- use tile flip flags
- work with tile-space regions

Tilemap mode depends on three things being present:

- a tileset
- a tilemap layer
- a selected tile from that tileset

When those are set up, the viewport shows a ghost tile preview under the cursor and a flip HUD in the top-right corner.

## Tile Mode

`Tile` mode edits a single tile inside a tileset.

You enter tile mode by double-clicking a tile in the tileset panel. While in this mode:

- the viewport edits the selected tile source image
- the editor displays a badge showing which tile is being edited
- the rest of the sprite is not the active drawing target

This is useful when you want to refine tiles before placing them on a map.

## Sprite-Level Operations

The `Sprite` menu contains operations that affect the whole document rather than a single layer or tool stroke.

## Canvas Size

`Sprite -> Canvas Size...` changes the document bounds without scaling the artwork itself.

Use it when you want to:

- expand the canvas
- crop from a chosen side
- add space for effects, UI padding, or composition changes

The anchor grid decides which edge or corner stays fixed while the canvas grows or shrinks.

## Sprite Size (Scale)

`Sprite -> Sprite Size (Scale)...` resizes the artwork with nearest-neighbor scaling.

Use it when you want to:

- double or halve the sprite
- normalize imported art to a new target size
- preserve hard pixel edges during resizing

The dialog also supports aspect-ratio locking and a few quick presets.

## Trim

`Sprite -> Trim (Autocrop)` reduces the canvas to the painted bounds of the artwork. This is useful for:

- removing empty borders
- tightening exported sprites
- cleaning imported art that has extra transparent margins

## Rotate and Flip

The sprite menu can transform the whole document:

- rotate 90 degrees clockwise
- rotate 90 degrees counterclockwise
- rotate 180 degrees
- flip horizontally
- flip vertically

These actions work at the sprite level and are useful for experimentation, correction, and directional variants.

## How Active Context Changes the App

The app always combines several pieces of state:

- current mode
- current layer
- current frame
- current tool
- current tile selection, if any

Those choices determine what a click on the canvas means.

Examples:

- `Pencil` plus `Raster` mode means paint pixels on the active raster cel
- `Pencil` plus `Tilemap` mode means place the selected tile word onto the tilemap cel
- `Pencil` plus `Tile` mode means paint inside the selected tile image

## Navigation and View Controls

### Zoom

Tile Studio supports several ways to zoom:

- mouse wheel over the viewport
- `0` for fit-to-window
- `1`, `2`, and `4` for quick zoom presets
- additional zoom presets from the `View` menu
- command palette actions for zoom commands

### Pan

You can pan with:

- middle mouse drag
- `Alt+drag`
- the minimap

### Minimap

The minimap appears in the lower-right corner of the viewport. It shows:

- the whole sprite
- the current viewport rectangle

Clicking or dragging on the minimap re-centers the main view.

### Tiled preview

`View -> Tiled Mode` can duplicate the current canvas around itself on:

- no axis
- X only
- Y only
- both axes

This is especially helpful for checking seamless textures and repeating tiles.

### Tile-number overlay

`View -> Show Tile Numbers` draws tile indices on tilemap cells when zoom is high enough for them to remain legible.

## Rulers and Guides

The viewport includes top and left rulers.

You can:

- read approximate document positions visually
- double-click the top ruler to create a vertical guide
- double-click the left ruler to create a horizontal guide

Guides appear as cyan dashed lines and can be cleared from `View -> Clear Guides`.

## Distraction-Free Mode

Distraction-free mode hides everything except the canvas area. It removes:

- menu bar
- toolbar
- tool palette
- side panel
- timeline
- status bar

Use `Tab` or `View -> Distraction Free` to toggle it.

## Command Palette

The command palette is opened with `Ctrl+K`. It gives you a searchable interface to many editor actions, including:

- file commands
- selection commands
- zoom commands
- sprite transforms
- layer operations
- frame operations
- tool switching

It is one of the fastest ways to navigate the app once you know the names of the actions you use most often.

## Recommended Mental Model

Think of Tile Studio as one document with multiple editing targets rather than separate tools bolted together.

- `Raster` mode edits sprite pixels
- `Tile` mode edits reusable tile source art
- `Tilemap` mode arranges those reusable tiles into map layout

That model makes the rest of the app much easier to understand.
