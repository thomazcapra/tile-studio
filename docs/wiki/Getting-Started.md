# Getting Started

This page is the fastest way to get productive with Tile Studio.

## What You See on First Launch

When the app opens, the default workspace is already usable:

- the canvas is centered in the main viewport
- a raster layer exists by default
- one frame exists by default
- the tool palette is visible on the left
- the side panel is visible on the right
- the timeline is visible at the bottom

If an autosave exists, the app restores it automatically and offers a way to discard it.

## Your First Five Minutes

### 1. Pick a starting point

You can begin in several ways:

- create a blank sprite with `File -> New`
- import a PNG with `File -> Import PNG...`
- drag an image file onto the window
- import a sprite sheet with `File -> Import Sprite Sheet...`

### 2. Learn the three modes

Tile Studio has three main editing modes:

- `Raster` for normal pixel drawing
- `Tilemap` for painting tile references on a tilemap layer
- `Tile` for editing a single tile inside a tileset

For a first session, stay in `Raster`.

### 3. Make a mark on the canvas

Use these starting shortcuts:

- `B` for Pencil
- `E` for Eraser
- `G` for Fill
- `I` for Eyedropper

Click a swatch in the palette to choose a primary color, then paint on the canvas.

### 4. Move around the document

- use the mouse wheel to zoom
- press `0` to fit to window
- middle-drag or `Alt+drag` to pan
- click the minimap to recenter the view

### 5. Save your work

- use `Ctrl+S` to save a `.tstudio` project
- use `File -> Export...` to create output files for engines or image workflows

## First Raster Workflow

This is the simplest end-to-end drawing flow.

1. Stay in `Raster` mode.
2. Pick the `Pencil` tool.
3. Choose a color from the palette.
4. Paint on the default raster layer.
5. Add a second raster layer from `Layer -> New Raster Layer`.
6. Use the second layer for shading, outlines, or effects.
7. Export the current frame as a PNG from the export dialog.

This workflow is ideal for icons, UI elements, still sprites, or quick pixel sketches.

## First Animation Workflow

This flow builds a simple frame animation.

1. Draw the first pose on the current frame.
2. Add a second frame from the timeline or `Frame -> New Frame`.
3. Duplicate a frame if you want to preserve most of the previous drawing.
4. Edit the next frame.
5. Turn on onion skin to see ghosted neighboring frames.
6. Use `Space` to preview playback.
7. Double-click a frame header to adjust its duration.
8. Export as an animated GIF or sprite sheet.

This workflow is best for characters, effects, or looping animated tilesets.

## First Tileset Workflow

This flow builds a tilemap-ready setup.

1. Create an empty tileset with `Tileset -> New Empty Tileset...`, or generate one from raster art with `Tileset -> Generate from Layer...`.
2. Double-click a tile in the tileset panel to enter `Tile` mode.
3. Paint the tile graphics directly.
4. Create a tilemap layer with `Layer -> New Tilemap Layer...`.
5. Switch to `Tilemap` mode.
6. Select a tile in the tileset panel.
7. Paint the tilemap in the viewport.
8. Use the flip HUD if you need mirrored placements.
9. Export through `Tileset + map` in the export dialog.

This workflow is useful for level art, world building, and tile-based game content.

## Common Early Tasks

### Change the canvas size

Use `Sprite -> Canvas Size...` when you want to expand or crop the canvas without scaling the existing pixels. The anchor grid decides which side stays fixed.

### Scale the whole sprite

Use `Sprite -> Sprite Size (Scale)...` when you want to resize the artwork itself. Raster content is scaled with nearest-neighbor behavior.

### Undo or inspect history

- `Ctrl+Z` undoes
- `Ctrl+Shift+Z` redoes
- the `History` section in the side panel lets you jump directly to an earlier point

### Focus on the artwork

Press `Tab` to toggle distraction-free mode.

## Recommended Learning Order

If the app feels broad at first, learn it in layers:

1. Raster drawing and navigation
2. Selections and transforms
3. Layers and blend modes
4. Frames and playback
5. Palette editing and quantization
6. Tilesets and tilemaps
7. Export formats

## Common Pitfalls

### "Nothing is painting"

Check these first:

- the active layer might be locked
- you might be in `Tilemap` mode instead of `Raster`
- a selection might be restricting edits
- in `Tile` mode you may be editing a tile instead of the main sprite

### "My export does not include the tracing image"

Reference layers are intentionally excluded from export output.

### "Arrow keys are not changing frames"

If a raster selection or tile region is active, the arrow keys nudge that content instead of navigating the timeline.
