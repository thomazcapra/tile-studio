# Layers, Frames, and Animation

This page explains how Tile Studio structures artwork over space and time.

## The Structural Model

Tile Studio does not treat the document as one flat image. Instead it combines:

- layers for stack order
- cels for per-layer image data
- frames for time

That is why the app can support blend modes, animation, tilemaps, reference art, linked cels, and timeline thumbnails inside the same project.

## Layer Types

Tile Studio supports four layer types.

## Raster layers

Raster layers hold normal pixel artwork. Use them for:

- character art
- effects
- shading
- outlines
- UI elements

These are the layers most tools target in normal drawing workflows.

## Tilemap layers

Tilemap layers store tile references instead of raster pixels. They are used for:

- level layout
- repeated patterns
- grid-based world building

Every tilemap layer points at a specific tileset.

## Group layers

Group layers organize other layers hierarchically. They are useful when:

- you want to hide or show a whole cluster of layers
- you want cleaner organization in large scenes
- you want to separate parts of a sprite into logical bundles

## Reference layers

Reference layers are special non-exported guide layers. They are created from an imported image and are:

- visible in the editor
- locked by default
- semi-transparent by default
- excluded from exports

They are ideal for tracing and planning.

## Layer Operations

From the layer menu and layer panel you can:

- create raster layers
- create tilemap layers
- create groups
- create reference layers
- duplicate layers
- move layers up and down
- drag-reorder layers
- nest layers inside groups
- toggle visibility
- toggle locking
- open layer properties
- merge raster layers downward
- convert raster layers into tilemaps
- flatten tilemaps back to raster
- delete layers

## Layer Properties

Layer properties cover:

- layer name
- opacity
- visibility
- blend mode
- tilemap tileset assignment for tilemap layers

Blend modes include:

- normal
- multiply
- screen
- darken
- lighten
- add
- subtract
- difference
- overlay

These are especially useful for shading, light effects, and tinting workflows.

## Group Behavior

Groups affect more than organization. If a parent group is hidden, the compositor skips all of its children as well.

This makes groups useful for:

- alternate costume sets
- temporary effect stacks
- layout variants
- comparing multiple versions of the same asset

## Reference Layer Workflow

A typical reference-layer workflow looks like this:

1. choose `Layer -> New Reference Layer...`
2. import a source image
3. lower its opacity if needed
4. draw on normal raster layers above it
5. export the sprite without the reference art showing up

## Frames and Cels

Each frame stores a duration. Each layer also has a corresponding cel on that frame. The timeline is therefore best understood as a cel grid, not just a filmstrip.

This enables:

- per-frame pixel changes
- per-frame tilemap changes
- frame duplication
- linked cels across frames

## Timeline Controls

The timeline includes:

- first, previous, next, and last frame buttons
- play or pause
- loop toggle
- playback speed selector
- add frame
- duplicate frame
- delete frame
- onion skin toggle
- tag creation button

## Frame Operations

You can:

- create a new blank frame
- duplicate the current frame
- delete a frame
- reorder frames by drag-and-drop
- click a frame to activate it
- double-click a frame header to edit duration

## Playback

Playback supports:

- normal forward stepping
- loop mode
- speed presets
- tag-aware direction handling

Use `Space` to toggle playback quickly.

## Onion Skin

Onion skin draws surrounding frames as tinted ghosts under the current frame:

- previous frames are tinted toward red
- next frames are tinted toward blue

This is useful for:

- animation spacing
- cleanup
- making sure motion arcs stay coherent

## Tags

Tags define named frame ranges and store:

- name
- start frame
- end frame
- direction
- color

Supported directions are:

- forward
- reverse
- pingpong

Tags appear as colored strips in the timeline and are also included in sprite sheet metadata exports.

## Linked Cels

Linked cels let multiple frames share the same underlying image buffer. This means:

- editing one linked cel updates the others
- unlinking a cel clones the image so it can diverge

This is powerful when several frames intentionally reuse identical art.

## Slices in Animation

Slices belong to the sprite, not just a single frame. They can also hold per-frame keys in the data model. That makes them useful for:

- changing hitbox bounds across frames
- animation-aware UI metadata
- export-driven frame annotations

## History and Undo

Tile Studio uses an undo system that covers more than paint strokes. It also tracks structural operations such as:

- layer changes
- tile operations
- slice edits
- reference layer creation
- linked-cel changes
- tile-region transforms

The side-panel history list lets you jump directly to an earlier point instead of stepping back one action at a time.

## Common Workflows

### Multi-layer sprite rendering

Use:

- one raster layer for flats
- one raster layer for shading
- one raster layer for highlights or effects
- blend modes on upper layers if needed

### Animation cleanup

Use:

- duplicated frames as a starting point
- onion skin
- frame-duration editing
- tags to organize loops and sequences

### Tracing from a concept sheet

Use:

- a reference layer for the source image
- raster layers above it for final line art and color
- export once the tracing is complete, since reference layers do not render in output
