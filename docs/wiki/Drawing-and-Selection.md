# Drawing and Selection

This page covers the everyday editing features used while drawing: tools, colors, brushes, selections, slices, and guides.

## Drawing Tools Overview

Tile Studio exposes these primary canvas tools:

- `Pencil`
- `Eraser`
- `Fill`
- `Eyedropper`
- `Line`
- `Rectangle`
- `Filled Rect`
- `Gradient`
- `Text`
- `Slice`
- `Rectangle Select`
- `Ellipse Select`
- `Lasso`
- `Magic Wand`

Each tool exists for a different kind of mark-making or selection task, but they all share the same viewport and undo system.

## Colors and Swatches

The editor keeps two active colors:

- primary
- secondary

You can work with them in several ways:

- click a palette swatch to make it the primary color
- right-click a palette swatch to make it the secondary color
- click the color swatch area in the tool palette to swap them
- press `X` to swap them from the keyboard

These two colors matter most for:

- raster painting
- gradient start and end colors
- eyedropper behavior

## Tool-by-Tool Reference

## Pencil

The pencil places raster pixels or tile brush content depending on mode.

In raster workflows it supports:

- brush size
- pixel-perfect mode
- symmetry
- custom-brush stamping

In tile mode it paints directly into the selected tile.

## Eraser

The eraser writes transparency instead of a solid color. It shares the same brush-size behavior as the pencil.

## Fill

The fill tool performs a flood fill from the clicked pixel. When a raster selection exists, the fill result is clipped to the selection mask.

## Eyedropper

The eyedropper samples the clicked color from the current image target.

- left click samples into the primary color
- right click samples into the secondary color

## Line

The line tool previews a line while dragging and commits it on release. It respects the current selection mask.

## Rectangle and Filled Rect

These tools draw outline or filled rectangular shapes while dragging. They also respect the current selection mask.

## Gradient

The gradient tool creates a linear blend from the primary color at the drag start to the secondary color at the drag end.

It is useful for:

- ramps
- background fills
- atmospheric overlays
- quick lighting tests

## Text

The text tool is dialog-based:

1. choose the `Text` tool
2. click the canvas
3. enter text, size, and font
4. stamp it into the active raster image

The resulting text is rasterized with the current primary color. It also respects active selections.

## Slice

The slice tool creates named rectangular metadata regions instead of pixel selections. Use it when you want persistent named regions rather than temporary edit masks.

## Brush Features

## Brush size

Brush size affects pencil and eraser behavior. The editor uses a square brush footprint.

- `[` makes the brush smaller
- `]` makes the brush larger

## Pixel-perfect mode

Pixel-perfect mode prevents the doubled elbow pixel that often appears during diagonal line drawing. This helps keep line art cleaner.

Use it when:

- drawing outlines
- making low-resolution sprites
- working with one-pixel diagonals

## Symmetry

Symmetry mirrors raster brush strokes around the sprite center. Available options are:

- off
- horizontal
- vertical
- both axes

This is useful for:

- symmetrical characters
- mirrored ornaments
- testing silhouette balance

## Snap to grid

`View -> Snap to Grid` rounds raster paint coordinates to the first tileset grid. This is especially useful when:

- planning art that will be turned into tiles later
- blocking out shapes on a tile-sized grid
- trying to keep effects aligned to tile boundaries

## Custom brushes

Selections can be captured as custom brushes.

Workflow:

1. make a raster selection
2. run `Select -> Capture as Custom Brush`
3. switch back to the pencil
4. stamp that captured shape wherever you paint

This is a quick way to reuse decals, clusters, texture fragments, or stylized marks.

## Selections

Selections are central to how Tile Studio edits raster content.

## Selection creation tools

You can create selections with:

- rectangle select
- ellipse select
- lasso
- magic wand
- select all
- invert selection

## Selection behavior

Selections are not only visual overlays. They actively restrict:

- raster painting
- fill operations
- text stamping
- delete contents
- cut, copy, and paste
- selection transforms

If painting seems to "stop working" in one area, an active selection is often the reason.

## Selection operations

The `Select` menu exposes the main selection commands:

- cut
- copy
- paste
- delete contents
- flip selection horizontally
- flip selection vertically
- rotate selection 180 degrees
- rotate selection 90 degrees clockwise
- scale selection 2x
- scale selection 1/2
- capture as custom brush
- clear custom brush

The store also supports broader transform behavior than the basic menu surface suggests, but the menu gives the main day-to-day operations directly.

## Nudge behavior

With an active raster selection:

- arrow keys nudge the selected content
- holding `Shift` increases the movement step

If no selection is active, arrow keys return to frame navigation.

## Magic Wand

The magic wand selects by color similarity rather than exact identity. The app keeps a wand-tolerance value in state so similar neighboring colors can be included together.

This is useful for:

- selecting flat fills
- isolating color ramps
- pulling out regions from imported artwork

## Slices

Slices are persistent named regions on the sprite.

They are different from selections in three important ways:

- they are saved as part of the document
- they appear in the side panel as editable entities
- they are meant for metadata and export workflows, not just temporary editing

Typical slice use cases:

- UI panel regions
- hitboxes
- named export areas
- animation metadata

## Guides

Guides are long reference lines drawn over the viewport. They are useful when:

- aligning artwork
- checking composition
- placing UI elements
- lining up tilemap structure

They do not become part of the exported image.

## Common Editing Workflows

### Cleaning line art

Use:

- `Pencil`
- brush size `1`
- pixel-perfect mode
- zoomed-in viewport

### Reusing details

Use:

- a raster selection
- `Capture as Custom Brush`
- the pencil as a stamping tool

### Blocking a region for recolor or effects

Use:

- rectangle, ellipse, lasso, or magic wand selection
- then paint or fill inside the active mask

### Labeling a sprite

Use:

- the text tool
- primary color swatch
- a raster layer dedicated to labels if you want easy later cleanup
