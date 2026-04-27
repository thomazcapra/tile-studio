# Tile Studio Wiki

Tile Studio is a browser-based pixel-art editor that combines three workflows in one application:

- raster sprite drawing
- tileset and tilemap authoring
- frame-based animation and export

This wiki is meant to explain the project as a real editor, not just list component names or menu labels. It is organized so a new user can learn the app from the top down, while a contributor can still use it as a feature reference.

## Start Here

If you are new to the project, read the pages in this order:

1. [Getting Started](Getting-Started.md)
2. [Workspace and Modes](Workspace-and-Modes.md)
3. [Drawing and Selection](Drawing-and-Selection.md)
4. [Layers, Frames, and Animation](Layers-Frames-and-Animation.md)
5. [Tilesets and Tilemaps](Tilesets-and-Tilemaps.md)
6. [Color, Palette, and Import Workflows](Color-Palette-and-Import.md)
7. [Export, Persistence, and Preferences](Export-Persistence-and-Preferences.md)

If you mainly want reference material, jump straight to:

- [Keyboard Shortcuts and Commands](Keyboard-Shortcuts-and-Commands.md)
- [Data Model and Project Format](Data-Model-and-Project-Format.md)
- [BrowserQuest Maps](BrowserQuest-Maps.md)

## What Tile Studio Covers

Tile Studio already implements a broad feature set:

- direct pixel editing with multiple raster tools
- structured layer editing with blend modes, groups, and reference layers
- frame animation with tags, onion skin, and timeline control
- palette workflows, quantization, and import or export of common palette formats
- tileset creation, tile editing, tilemap painting, and tile-region operations
- sprite-sheet import, PNG import, drag-and-drop import, and clipboard integration
- flat image export, frame sequence export, sprite sheet export, animated GIF export, and tileset or map export
- full project persistence through `.tstudio` files and browser autosave

## Core Concepts

Understanding a few core terms makes the rest of the wiki easier to follow.

### Sprite

A sprite is the whole document. It has a width, a height, a palette, a list of frames, a list of layers, and any tilesets, tags, or slices that belong to the project.

### Layer

A layer is a stack item in the document. Tile Studio supports raster layers, tilemap layers, group layers, and reference layers.

### Cel

A cel is the image data for one layer on one frame. In other words, the timeline is not just a row of frame numbers. It is a grid of cels, one per frame and layer combination.

### Tileset

A tileset is a named collection of tiles that all share a grid size. Tilemap layers point at a tileset and store tile references instead of raster pixels.

### Tilemap

A tilemap layer stores a grid of tile words. Each word points to a tile index and can also store horizontal, vertical, or diagonal flip flags.

### Tag

A tag is a named frame range used for organization and playback behavior. Tags support forward, reverse, and pingpong directions.

### Slice

A slice is a named rectangular region on the sprite. Slices are useful for UI assets, hitboxes, metadata, and export-aware regions.

## Documentation Map

### [Getting Started](Getting-Started.md)

An onboarding guide for the first session with the app. It explains how to create or import artwork, how to move around the interface, and how to complete a first drawing, animation, or tilemap workflow.

### [Workspace and Modes](Workspace-and-Modes.md)

A tour of the interface and a detailed explanation of the three editor modes: `Raster`, `Tilemap`, and `Tile`.

### [Drawing and Selection](Drawing-and-Selection.md)

A full reference for the drawing tools, brush behavior, symmetry, snap-to-grid, text stamping, selection creation, selection transforms, custom brushes, slices, and guides.

### [Layers, Frames, and Animation](Layers-Frames-and-Animation.md)

Explains layer types, blending, grouping, reference layers, timeline editing, playback, onion skin, tags, linked cels, and the history system.

### [Tilesets and Tilemaps](Tilesets-and-Tilemaps.md)

Documents empty tilesets, generated tilesets, direct tile editing, tilemap layers, tile flips, tile regions, raster-to-tilemap conversion, auto-tile support, and animated tile support.

### [Color, Palette, and Import Workflows](Color-Palette-and-Import.md)

Covers color picking, the palette editor, quantization, preset palettes, PNG import, sprite-sheet import, reference image import, and clipboard round-tripping.

### [Export, Persistence, and Preferences](Export-Persistence-and-Preferences.md)

Explains every export mode, the `.tstudio` project format at a user level, autosave and restore behavior, browser-side storage, and the available preferences.

### [Keyboard Shortcuts and Commands](Keyboard-Shortcuts-and-Commands.md)

Lists the default shortcut set, command palette behavior, context-sensitive keys, and how rebinding works.

### [Data Model and Project Format](Data-Model-and-Project-Format.md)

Explains the internal document model, image types, tile encoding, worker-backed subsystems, persistence format, and advanced engine features that are broader than the current UI.

## Recommended Reading by Goal

### I want to draw sprites

Read:

1. [Getting Started](Getting-Started.md)
2. [Workspace and Modes](Workspace-and-Modes.md)
3. [Drawing and Selection](Drawing-and-Selection.md)
4. [Color, Palette, and Import Workflows](Color-Palette-and-Import.md)

### I want to animate a character or effect

Read:

1. [Getting Started](Getting-Started.md)
2. [Layers, Frames, and Animation](Layers-Frames-and-Animation.md)
3. [Export, Persistence, and Preferences](Export-Persistence-and-Preferences.md)

### I want to build tilesets and maps

Read:

1. [Getting Started](Getting-Started.md)
2. [Tilesets and Tilemaps](Tilesets-and-Tilemaps.md)
3. [Export, Persistence, and Preferences](Export-Persistence-and-Preferences.md)

### I want to understand how the project works internally

Read:

1. [Data Model and Project Format](Data-Model-and-Project-Format.md)
2. [Tilesets and Tilemaps](Tilesets-and-Tilemaps.md)
3. [Layers, Frames, and Animation](Layers-Frames-and-Animation.md)

## Current Scope Notes

Most features described in this wiki are visible in the main UI today. A small number are implemented more deeply in the engine than in the menus or panels, especially:

- animated tiles
- auto-tile helper logic
- some generic transform operations that are surfaced through tests or store actions rather than polished UI

When that happens, the related pages call it out explicitly so the documentation stays accurate.
