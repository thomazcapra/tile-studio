# FAQ and Troubleshooting

Quick answers to common questions and fixes for the issues that come up most often during a first session.

## Drawing and Canvas

### Why is nothing painting?

Several pieces of state can all stop a brush stroke from landing. Check them in order:

- the active layer might be locked or hidden
- you might be in `Tilemap` mode when you meant to be in `Raster`
- an active selection may be restricting edits to a region off-canvas
- in `Tile` mode the paint target is the tile image, not the sprite
- the layer might be a reference layer (these are read-only by default)

### Why did my arrow keys stop changing frames?

Arrow keys have a priority order:

1. if a raster selection exists, arrow keys nudge its pixels
2. if a tile region exists, arrow keys nudge tile cells
3. otherwise arrow keys navigate frames

Press `Escape` to clear the selection or region, then arrow keys will navigate the timeline again.

### Why is the pencil painting in a color I didn't pick?

Tile Studio keeps two active colors — primary and secondary. Left click uses primary, right click uses secondary. Press `X` to swap them.

### How do I make the pixel grid visible?

Zoom in. The pixel grid appears automatically above the zoom threshold configured in Preferences. You can also toggle it from `View -> Show Pixel Grid`.

### Why does my line tool create a stepped diagonal?

Enable pixel-perfect mode with `P`. It removes the doubled elbow pixel that naturally appears on 45-degree strokes.

## Tilesets and Tilemaps

### I made a tilemap layer but I can't paint on it

Three things have to be true at once:

1. the active layer is a tilemap layer
2. the editor is in `Tilemap` mode
3. a tile is selected in the tileset panel

If any one is missing, clicks on the viewport do nothing. A ghost-tile cursor preview confirms the state is correct.

### My tileset generated too many tiles

Turn on flip matching in the generator dialog — horizontally, vertically, and diagonally mirrored duplicates will then collapse into one tile. Consider also:

- pixelate or quantize the source before extraction
- raise the tile size if the source is noisy at 16x16
- clean up stray pixels in the source layer

### Can I edit the tiles after generating them?

Yes. Double-click any tile in the tileset panel to enter `Tile` mode and paint the tile image directly. Every placement of that tile in every map updates automatically.

### Why did my tilemap break after I deleted a tile?

It shouldn't — tile references are remapped when you delete or reorder tiles. If a map cell is showing the wrong art, use `Ctrl+Z` to restore it and open an issue.

## Export

### My exported image is missing the tracing image

Reference layers are intentionally excluded from export output. If you want the reference visible in the export, convert it to a regular raster layer first.

### My JPEG exports have a colored background where transparency used to be

JPEG does not support transparency. The export flattens alpha onto a background color you can configure in the export dialog. Use PNG or WebP if you need real transparency.

### The GIF export is slower than expected

GIF encoding quantizes each frame to 256 colors in the browser. Large canvases or long animations take longer. For faster iteration, export a single preview frame first and use animated GIF only for the final deliverable.

### Tiled (`.tmj`) files don't seem to import cleanly

Open the generated zip and check:

- `.tmj` is the map file
- `.tsj` is the tileset file
- the tileset PNG is in the same folder

Tiled expects all three together. The zip-bundle option keeps them adjacent automatically.

## Projects and Persistence

### Where is my project saved?

- `Ctrl+S` writes a `.tstudio` file you download to disk
- a separate autosave snapshot is kept in the browser's IndexedDB

Autosave is a safety net, not a replacement for saving. If you clear browser data, the autosave is gone.

### Autosave keeps restoring an old project

Use `File -> Discard Autosave` to clear the snapshot, or click the discard action on the restore toast when it appears.

### Can I move a project between browsers or machines?

Yes. Save a `.tstudio` file and open it in the other browser. Preferences and shortcut bindings are local to each browser and will not follow the project.

### Can I version control projects in git?

`.tstudio` is a ZIP of JSON and binary blobs, so it commits cleanly as a single file. Diffs will be opaque because the archive is binary, but it does not suffer line-ending issues.

## Performance

### The editor feels sluggish on my document

Try these in order:

- collapse or hide layers you are not actively using
- reduce onion skin range
- turn off high-zoom pixel grid if you're zoomed far out
- flatten old tilemap layers you no longer edit
- close the command palette or dialogs when not in use

### My browser is warning me about memory use

Very large canvases (3000+ pixels) with many frames and layers can push memory hard. Consider:

- scaling the sprite down with `Sprite Size`
- splitting the document into smaller projects
- exporting and reimporting after major structural changes

## Interface and Shortcuts

### How do I find an action I know exists?

Press `Ctrl+K` to open the command palette and search by name. This covers most menu and tool actions.

### Can I rebind shortcuts?

Yes. Open `Edit -> Preferences -> Shortcuts`. Capture a new combo, clear one with `Backspace`, or reset individual actions to defaults. Arrow-key nudging and `Escape` clearing are intentionally hard-coded because their meaning depends on context.

### How do I go full screen?

Press `Tab` for distraction-free mode (hides panels but stays in the browser). Use your browser's full-screen control (`F11` in most browsers) for real full screen.

## Everything Else

### Can I use Tile Studio offline?

After the first load it runs entirely in the browser, so a subsequent visit works without a network if your browser has cached the bundle. There is no installable PWA build yet.

### Can I collaborate on a project?

Not in real time. Share the `.tstudio` file manually and merge changes by exporting and reimporting. Live collaboration is not on the current roadmap.

### How do I report a bug or request a feature?

Open an issue at the project repository. Please include a repro case, your browser and OS, and a copy of the `.tstudio` file if the problem is document-specific.
