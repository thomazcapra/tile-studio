# Export, Persistence, and Preferences

This page explains how artwork leaves the editor, how projects are stored, and how the app can be configured.

## Export Dialog Overview

The export dialog is divided into five modes:

- `Tileset + map`
- `Flat image`
- `Frame sequence`
- `Sprite sheet`
- `Animated GIF`

The right export mode depends on the kind of asset you are producing.

## Tileset + Map Export

Use this mode when you want map-ready data instead of a flattened picture.

### What it exports

- a tileset atlas image
- map data
- metadata files depending on the chosen format

### Supported formats

- Tiled (`.tmj` and `.tsj`)
- raw JSON
- Aseprite JSON Array

### Options

- pick the tileset
- choose atlas columns
- choose filename base
- bundle everything into a zip
- export only the atlas PNG as a quick preview

This is the best export path for external map tools and tile-based engines.

## Flat Image Export

Flat image export renders the current frame as one composited image.

Supported formats:

- PNG
- WebP
- JPEG

Use it for:

- still sprites
- icons
- UI assets
- previews

JPEG export automatically flattens alpha because the format cannot store transparency.

## Frame Sequence Export

Frame sequence export writes each frame as its own image file and bundles the results as a zip archive.

Use it when:

- another tool expects numbered frames
- you want individual editable frame images
- you need a neutral format for a pipeline outside Tile Studio

## Sprite Sheet Export

Sprite sheet export packs every frame into a grid and writes JSON metadata beside it.

### Main options

- output columns
- JSON layout
- image format
- filename base
- zip bundling

### JSON layouts

- hash layout
- array layout

This mode is especially useful for game engines that expect atlas metadata and frame rectangles.

## Animated GIF Export

Animated GIF export uses the current frame list and frame durations to build a `.gif`.

Use it for:

- quick previews
- social sharing
- lightweight animation review

## Export Rules Worth Knowing

- visible normal layers are composited
- hidden layers do not export
- hidden group descendants do not export
- reference layers are skipped from export output
- tags are included in sprite sheet metadata

## Saving and Loading Projects

Tile Studio stores full project documents in `.tstudio` files.

## What a `.tstudio` file keeps

- sprite size
- palette
- frames and durations
- layers and order
- cels
- tilesets
- tags
- slices
- linked-cel information
- tile animation data

This is the format to use when you want to reopen the project in Tile Studio later.

## Autosave

The app also maintains a browser-side autosave in IndexedDB.

### How it works

- edits are serialized in the background
- autosave behavior follows the Preferences settings
- the saved snapshot is restored on the next load if present
- the restore toast offers a discard action

### Manual control

You can clear the autosave via `File -> Discard Autosave`.

## Preferences

The Preferences dialog has two tabs:

- `General`
- `Shortcuts`

## General preferences

The general tab currently controls:

- autosave enabled or disabled
- autosave interval
- checker size for transparency background rendering
- high-zoom pixel grid visibility
- OS clipboard mirroring

These settings affect editor behavior immediately and are stored as user preferences rather than project data.

## Shortcut preferences

The shortcut editor lets you:

- browse the full action catalog
- filter by label or action id
- capture a new shortcut
- clear a shortcut
- reset one binding
- reset all bindings

If a new shortcut conflicts with an old one, the old binding is cleared so the new one becomes authoritative.

## Browser-Side Storage

Tile Studio uses different storage areas for different responsibilities:

- IndexedDB for autosave snapshots
- localStorage for preferences and shortcut bindings
- downloadable `.tstudio` files for full portable project documents

This separation is useful because:

- user preferences stay local to the browser profile
- project files remain portable
- autosave can act as a safety net without replacing deliberate save files

## Recommended Export Workflows

### For still artwork

Use:

- `Flat image`
- usually PNG unless you explicitly need WebP or JPEG

### For animation in engines

Use:

- `Sprite sheet` if your engine expects atlas metadata
- `Frame sequence` if your pipeline wants individual images

### For tile-based engines and map tools

Use:

- `Tileset + map`
- usually the Tiled format option

### For quick visual review

Use:

- `Animated GIF`

## Related Pages

- [Tilesets and Tilemaps](Tilesets-and-Tilemaps.md)
- [Keyboard Shortcuts and Commands](Keyboard-Shortcuts-and-Commands.md)
- [Data Model and Project Format](Data-Model-and-Project-Format.md)
