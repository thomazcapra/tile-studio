# BrowserQuest Maps

Tile Studio includes a first-class adapter for the BrowserQuest map format used by [browserquest-2.0 / nexus-survival](https://github.com/thomazcapra/nexus-survival). It lets you author or edit a BrowserQuest world entirely inside Tile Studio and export the engine-ready `world_client.json` + `world_server.json` pair with one click.

The adapter is a thin layer over the existing tile-studio primitives — there is no new editor mode. Tilemap layers, slices, tile metadata, and per-tile animation are reused directly. This page documents the conventions the adapter follows so you can see what tile-studio data maps to what BrowserQuest field, and how to author from scratch.

## Workflow at a glance

1. **File → Import BrowserQuest…**: pick the tilesheet PNG (and optionally an existing `world_client.json` + `world_server.json` pair).
2. Paint, edit metadata via slices, or rearrange layers using normal tile-studio tools.
3. **File → Export to BrowserQuest**: downloads a zip containing `<name>_client.json` + `<name>_server.json` ready for the engine to load.

Importing only a tilesheet (no world JSON) creates a blank 32×32 starter map you can immediately paint into.

## Tilesheet conventions

The tilesheet PNG is sliced into `tilesize × tilesize` (default 16) tiles in row-major order **without pixel deduplication**. Every cell of the source PNG gets its own tile, even when two cells are pixel-identical. This is the only way to keep tile-studio's tileset index aligned with BrowserQuest's tile id, which is the contract the rest of the adapter rests on:

```
tile-studio tileset index = BrowserQuest tile id - 1
```

Each generated tile carries `userData.bq.id` recording the original BrowserQuest tile id, so you can verify the alignment at a glance in the Tileset panel.

## Layer roles

Visual tilemap layers stack in `layerOrder` (top of the list = top of the stack). The exporter walks them bottom-to-top to build the per-cell `data[]` array, omitting trailing empties — exactly mirroring how the engine renders.

Two layers carry special meaning, identified by `userData.bqRole`:

| `bqRole`    | BrowserQuest field   | Meaning                                                       |
|-------------|----------------------|----------------------------------------------------------------|
| `collision` | `collisions[]`       | Any non-empty cell is collidable. Tile painted is irrelevant. |
| `plateau`   | `plateau[]`          | Any non-empty cell belongs to the plateau (jump-from) set.    |

The importer adds these layers automatically with names `Collision` and `Plateau`. They use the same tilesheet for visualization but the actual cell value is ignored on export — only "non-empty vs. empty" matters.

## Tile metadata (`Tile.userData.bq`)

| Key      | Type     | Meaning                                          |
|----------|----------|--------------------------------------------------|
| `id`     | number   | The BrowserQuest tile id (set by the importer).  |
| `high`   | boolean  | If true, this tile renders above entities (`high[]` membership). |

Per-tile **animation** is taken straight from `Tile.animation` — frame count → `l`, frame duration → `d`. The animation frames in tile-studio are usually pointers to consecutive tiles in the tilesheet (which is how BrowserQuest defines an animation), so importing populates these for you.

## Slice conventions

Every BrowserQuest gameplay rectangle (doors, checkpoints, music areas, NPC roaming, chests) is represented as a tile-studio slice with a `userData.bq` payload. Slice bounds live in pixel coordinates; the adapter converts to/from tile coordinates using the active tileset's grid size.

| `kind`         | Payload                                               | Output target              |
|----------------|--------------------------------------------------------|----------------------------|
| `door`         | `{ p, tx, ty, tcx?, tcy?, to }`                       | `client.doors[]`           |
| `checkpoint`   | `{ id }`                                               | `client.checkpoints[]`     |
| `music`        | `{ id }`                                               | `client.musicAreas[]`      |
| `roam`         | `{ type, nb }`                                         | `server.roamingAreas[]`    |
| `chestArea`    | `{ items: number[], tx, ty }`                         | `server.chestAreas[]`      |
| `staticChest`  | `{ items: number[] }`                                  | `server.staticChests[]`    |
| `npc`          | `{ type }`                                             | `server.staticEntities`    |

Slices that don't carry a `bq` payload are ignored by the exporter, so you can use slices for in-editor annotations without polluting the BrowserQuest output.

## Round-trip guarantees

The `importBQ → exportBQ` pipeline is covered by the `p25-browserquest` Playwright spec, including a real-world test against the 172×314 Eternal Realms world (1960 tiles, 398 metadata slices). The exporter:

- canonicalizes `data` length to `width × height` (the original BrowserQuest dump was two cells short),
- merges `client.collisions`, `client.blocking`, and `server.collisions` into a single sorted set,
- drops empty arrays/objects to keep diffs minimal,
- sorts `doors`, `checkpoints`, `high`, `plateau` for deterministic output.

These canonicalizations mean you cannot expect byte-identical round-trip against a hand-crafted BrowserQuest dump — but the meaning is preserved exactly, and a second round-trip after the first is byte-identical.

## Limitations

- Tilemap **flip flags** (the X/Y/D bits tile-studio uses for reflected tile painting) are **not supported** by the BrowserQuest format. The exporter discards them and emits a warning.
- The exporter assumes a **single tileset** (the BrowserQuest tilesheet). Layers referencing other tilesets are skipped with a warning.
- Tile-studio supports per-tile animation with arbitrary pixel data, but BrowserQuest expects animation frames to be **consecutive tiles in the source PNG**. The exporter only writes the frame count and duration; the per-frame pixel data is not used by the engine.
