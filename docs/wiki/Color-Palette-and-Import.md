# Color, Palette, and Import Workflows

This page explains how Tile Studio handles color choice, palette editing, palette reduction, and artwork import.

## Color Workflow Overview

Tile Studio uses a palette-aware workflow even when you are editing raster art. That gives you several ways to control the look of the project:

- direct color picking
- preset palettes
- palette editing
- layer quantization
- preprocessing before tileset generation

## Primary and Secondary Colors

The editor always tracks:

- a primary color
- a secondary color

These are used by:

- pencil
- gradient
- text
- eyedropper sampling

You can edit them from the `Color` section of the side panel.

## Color Picker

The color picker is opened by clicking either the primary or secondary swatch in the side panel.

Use it when you want to:

- fine-tune a chosen color
- adjust the active paint color without editing the whole palette
- swap between two working colors quickly

## Palette Panel

The side-panel palette grid is the fastest way to work with the current sprite palette.

You can:

- click a swatch to set the primary color
- right-click a swatch to set the secondary color
- open the full palette editor
- open the reduce-colors dialog

## Palette Editor

The palette editor is a complete palette-management tool rather than a simple list of swatches.

### What you can do

- load preset palettes
- import palette files
- export palette files
- add swatches
- remove swatches
- drag-reorder swatches
- edit a swatch by hex value
- edit a swatch by RGB channels
- sort by hue
- sort by luma
- sort by lightness

### Preset palettes

The bundled presets include:

- Default 16
- PICO-8
- Game Boy
- NES
- DB32

These are useful starting points for retro constraints and stylized palettes.

### Supported palette file formats

- `.gpl`
- `.pal`
- `.hex`

This makes it easy to move palettes between Tile Studio and other pixel-art tools.

## Reduce Colors

`Tileset -> Reduce Colors...` opens the quantization dialog for the active raster layer.

### What it does

It analyzes the layer, builds a smaller palette, remaps the pixels, and updates the sprite palette.

### Main options

- source layer
- target color count
- dithering on or off

### Preview

The dialog provides a live preview so you can compare results before applying them.

### When to use it

Use quantization when:

- reducing a painting to a strict palette
- preparing art for tile generation
- unifying a sprite set visually
- creating retro-style output

## Preprocessing Before Tile Generation

The tileset generation dialog includes two useful preprocessing steps that belong to the color workflow:

- pixelate
- quantize

This matters because tile extraction quality often depends heavily on how clean and limited the source image is before deduplication begins.

## Importing Art

Tile Studio supports several import paths.

## PNG import

You can import a regular image with:

- the toolbar open button
- `File -> Import PNG...`
- drag and drop onto the app window

The imported image becomes the new sprite document and the viewport recenters automatically.

## Sprite-sheet import

`File -> Import Sprite Sheet...` slices a source image into one frame per grid cell.

The dialog lets you control:

- frame width
- frame height
- offset X
- offset Y
- spacing X
- spacing Y
- frame duration
- trimming of fully transparent frames

This is the fastest way to turn an existing strip or atlas into an animated sprite document.

## Reference-image import

`Layer -> New Reference Layer...` imports an image as a reference layer instead of replacing the current document.

Use this when:

- tracing over concept art
- redrawing sprites from a sketch sheet
- aligning final art to an external reference

Reference layers stay visible while editing but are excluded from exports.

## Clipboard Integration

When OS clipboard mirroring is enabled in Preferences:

- copying a selection can write a PNG to the system clipboard
- pasting can read an image from the system clipboard into the editor

This makes Tile Studio easier to use alongside browsers, paint tools, and design apps.

## Common Workflows

### Start from a preset palette

1. open the palette editor
2. load a preset
3. paint using the limited swatch set
4. export or continue refining

### Clean up an imported image

1. import the PNG
2. quantize it to a smaller palette
3. adjust the palette manually if needed
4. begin editing or convert it into tiles

### Bring in a finished sprite sheet

1. open `Import Sprite Sheet`
2. set frame size, offsets, and spacing
3. preview the slicing grid
4. import the frames
5. review the timeline and adjust frame durations
