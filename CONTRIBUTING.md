# Contributing to Tile Studio

Thanks for considering a contribution! This document covers everything you need to make a productive first PR: dev setup, architecture tour, conventions, and where to look when adding features or tracking down bugs.

---

## Ground rules

1. **Tests are not optional** for user-facing behavior. Every new feature should add at least one Playwright spec. Every bug fix should add a regression test that fails before your fix and passes after.
2. **No `any`**, no `@ts-ignore`, no `@ts-expect-error` without a comment explaining *why* the type system is wrong.
3. **Keep the bundle small.** `index.html` already gzips to ~143 kB. If you need a heavy dependency (e.g. a second image codec, a UI component library), open an issue first.
4. **Small PRs win.** A 200-line PR lands the same day. A 2,000-line PR stalls for weeks. Split aggressively.
5. **Assume the reviewer hasn't seen the bug.** Write PR descriptions that explain *what*, *why*, and *how to verify*. Include a reproduction before the fix.

---

## Quickstart

```bash
git clone https://github.com/thomazcapra/tile-studio.git
cd tile-studio
npm install
npm run dev             # http://localhost:5173
```

Before you push:
```bash
npm run lint            # ESLint (0 errors required; set-state-in-effect warnings are currently tolerated)
npm run build           # TypeScript + Vite build (must pass)
npm run test:e2e        # Playwright — 181 tests, ~35 s
```

---

## How the app is wired

### Data flow
```
┌─────────────┐   actions   ┌──────────────┐   subscribe   ┌────────────┐
│  Component  │────────────>│ Zustand store│──────────────>│ Component  │
│ (Toolbar,   │             │ (editor.ts)  │               │ (Viewport, │
│  MenuBar…)  │<────────────│ + prefs-store│<──────────────│  SidePanel)│
└─────────────┘   reads     └──────────────┘     reads     └────────────┘
                                    │
                                    │ every pixel edit emits a Patch
                                    ▼
                            ┌───────────────────┐
                            │  undo / redo stack│
                            │  (history.ts)     │
                            └───────────────────┘
```

The store is a single Zustand instance in `src/store/editor.ts`. It holds the *entire* sprite document plus UI state (selection, tool, zoom, guides, etc.). There is no separate "UI state" store — this has proven easier to reason about than splitting concerns.

### The two patch types

See [`src/store/history.ts`](src/store/history.ts).

- **`PixelPatch`** — per-pixel diff for brush strokes, fill, etc. Stored as `Map<cellIndex, oldColor>` + `Map<cellIndex, newColor>`. Captures `imageRef` + selection-mask-in-sprite-coords so replay can enforce "don't paint outside the selection" on undo/redo.
- **`SnapshotPatch`** — structural change (add/delete slice, link cels, reorder tile, flip tilemap region, etc.). Stores `undo` + `redo` closures that capture before/after state. Cheap to author, expensive to mis-author — see the [adding an undo-aware action](#adding-an-undo-aware-action) recipe below.

Every mutation that a user can kick off should push one of these. If your action doesn't, it breaks Ctrl+Z.

### Pixel format

All pixels live in `Uint32Array` packed as `AABBGGRR` (little-endian RGBA). This matches canvas `ImageData` byte order on LE hosts, so you can do `new Uint32Array(imgData.data.buffer)` without a byte swap. Use `packRGBA` / `unpackRGBA` from `render/image-ops.ts` when converting from RGB components.

### Tilemap words

A tilemap cel's `data[i]` is one `uint32`:
- Bits 0–28: tile index (1-based; 0 means "empty cell")
- Bit 29: X flip
- Bit 30: Y flip
- Bit 31: diagonal flip (transpose)

**Always** use the helpers in `model/types.ts`:
```ts
import { makeTileWord, readTilesetIndex, tileFlags, EMPTY_TILE_WORD } from './model/types';
```
Never compute the raw word by hand — it's easy to hit an off-by-one because tileset index 0 encodes as raw 1.

---

## Recipes

### Adding a tool

1. Define it in [`src/tools/tools.ts`](src/tools/tools.ts) — export a `Tool` with `id`, `label`, `cursor`, and a `begin(ctx, x, y): ToolSession`.
2. Add the id to the `ToolId` union in [`src/store/editor.ts`](src/store/editor.ts).
3. Register it in the `TOOLS` record at the bottom of `tools.ts`.
4. Add an entry to [`src/components/ToolPalette.tsx`](src/components/ToolPalette.tsx) with its icon + shortcut key.
5. Add a shortcut binding in [`src/prefs/shortcuts.ts`](src/prefs/shortcuts.ts) (both `SHORTCUT_ACTIONS` and `DEFAULT_SHORTCUTS`).
6. In [`src/components/Viewport.tsx`](src/components/Viewport.tsx), the mouse pipeline routes through `beginStroke` → `tool.begin()` → `session.move()` → `session.end()`. If your tool is click-only (like `text` or `slice`), short-circuit in `onMouseDown` similar to those two.
7. Write a spec. Look at `p14-drawing-polish.spec.ts` for a pencil example, or `p15-high-priority.spec.ts` for the gradient tool (which drives the tool via `mod.tools.gradient.begin(...)` rather than through the mouse, for deterministic pixel-level assertions).

### Adding a store action

1. Add the signature to the `EditorState` interface.
2. Implement it inside `create<EditorState>((set, get) => ({ … }))`.
3. If it mutates persistent data, **push an undo patch** (see next recipe).
4. If it's exposed to the user, bind it in:
   - A menu item (`MenuBar.tsx`)
   - A shortcut (`prefs/shortcuts.ts`)
   - The command palette (`components/CommandPalette.tsx`)
5. Write a spec.

### Adding an undo-aware action

Every mutation that changes the `sprite` object (beyond pixels) should push a `SnapshotPatch`. The pattern:

```ts
myAction: (arg) => {
  const s = get();
  const prevThing = s.sprite.thing;      // capture before
  const nextThing = computeNewThing(prevThing, arg);
  set({ sprite: { ...s.sprite, thing: nextThing } });
  get().pushPatch({
    type: 'snapshot',
    label: 'My Action',
    newColors: { size: 1 },              // cosmetic — shows in history panel
    undo: () => set((st) => ({ sprite: { ...st.sprite, thing: prevThing } })),
    redo: () => set((st) => ({ sprite: { ...st.sprite, thing: nextThing } })),
  });
},
```

**Important caveats:**
- `prevThing` / `nextThing` are captured in closures. Make sure each `undo` closure only references the state it needs — don't capture `s` wholesale, you'll hold the entire sprite alive in memory.
- For operations that mutate a `Uint32Array` in place (like tilemap region flips), snapshot the array via `new Uint32Array(data)` and restore with `data.set(before)` / `data.set(after)` so linked cels keep their shared reference.
- Don't use `structuredClone` on anything containing a linked cel's image — it would clone the buffer and break sharing. See how `deleteTile`, `flipTilemapRegion`, and `rotateSelectionContent` handle this in `store/editor.ts`.
- Every undo-aware action needs a spec in `tests/e2e/p24-undo-coverage.spec.ts` (or a new `p<N>-undo-*.spec.ts` if you add a whole new category).

### Adding an export format

1. Add a branch to [`src/io/export.ts`](src/io/export.ts). Most exports go through `canvasBlob` or `compositeFrame` + `toBlob`.
2. Extend `ExportDialog.tsx` to expose the option (new `<KindTab>`, new format dropdown entry, etc.).
3. If the format produces multiple files, return them as `GeneratedFile[]` and rely on `zipFiles` for ZIP bundling.
4. Write a round-trip spec. See `p16-export-palette.spec.ts` for a good template — each test constructs a minimal sprite, calls the exporter, and inspects the returned Blob.

### Adding a new manifest field (breaking or non-breaking)

The `.tstudio` format is version-tagged. To add new data:

1. Bump `CURRENT_VERSION` in [`src/io/native.ts`](src/io/native.ts) if the new data is required for correctness.
2. Add the field to the `Manifest` type.
3. Populate it in `serializeSprite`.
4. Read it (with a fallback for older versions) in `deserializeSprite`.
5. Add a round-trip test to `p23-persistence-coverage.spec.ts`. The pattern:
   ```ts
   const bytes = mod.nativeIO.serializeSprite(s.sprite);
   const loaded = mod.nativeIO.deserializeSprite(bytes);
   expect(loaded.newField).toBeDefined();
   ```

**Rule of thumb:** new fields should degrade gracefully. A v2 reader should be able to load a v1 file (optional field = `undefined`), and a v1 reader loading a v2 file should refuse with a clear error — we throw in the version check: `if (manifest.version > CURRENT_VERSION) throw …`.

### Writing a Playwright spec

Specs are organized by feature "wave" (P0–P24). Each file is a single `test.describe` block. Tests follow one of three patterns:

1. **Pure store driving** (fastest, most common) — call `page.goto('/')`, then `page.evaluate()` that reaches into `(globalThis as any).__tileStudio.store.getState()` and invokes actions directly. Good for correctness checks on pure logic.

2. **Menu-driven flow** — click the menu bar testIDs, verify the dialog opens, fill inputs, submit, assert on store state.

3. **Direct mouse pipeline** — use `page.mouse.move/down/up` over `page.getByTestId('viewport-canvas').boundingBox()`. Needed for genuine integration coverage (e.g. "drawing works end-to-end"), but flakier than the other two patterns.

Every test file should:
- Start with `await page.goto('/')` (fresh state; each test creates its own Playwright page and therefore its own React tree).
- Reset localStorage if the feature under test persists preferences (see `p18-preferences.spec.ts`'s `beforeEach`).
- Assert on concrete values, not just "no exception thrown". `expect(count).toBe(4)` beats `expect(result.ok).toBe(true)`.

Run a single spec with `npx playwright test p16`. Debug a single case with `npx playwright test p16 --debug`.

---

## Code style

- **TypeScript strict mode.** If you're silencing a type error, explain why in a comment.
- **Props destructure at the top** of every component. No implicit `any` on props.
- **Comments explain *why*, not *what*.** `// increment counter` is noise; `// sprite-space coords — tool-space is captured below via translateToSpritePixel` is useful.
- **Prefer `const`.** `let` is a signal the reader needs to track mutation.
- **No classes** unless required by a browser API. This is a functional codebase.
- **Single-quote string literals**, double-quotes for JSX attributes.
- **No default exports** for components. Named exports round-trip better through IDE refactors.

Tailwind conventions:
- Layout first (`flex flex-col min-h-0`), then sizing (`w-64 h-8`), then visual (`bg-panel border border-border`), then state (`hover:bg-panel2 disabled:opacity-50`).
- Prefer `text-[11px]` over `text-xs` where pixel perfection matters.
- Custom colors: `panel`, `panel2`, `border`, `ink`, `accent` — defined in `tailwind.config.js`.

---

## Commit conventions

- **One logical change per commit.** If your commit message has the word "also", it's probably two commits.
- **Imperative subject, present tense.** "Add slice tool", not "Added slice tool" or "Adds slice tool".
- **72-char subject line**, blank line, then body that explains *why*.
- **Reference specs by test ID** where helpful: "Fix TDZ crash in MenuBar (caught by p7-menu)".
- Include `Co-Authored-By:` trailers when pair-programmed (including with AI assistants).

Example:
```
Fix linked-cel undo leaving orphan Uint32Array

linkCels swaps cel.image to a shared buffer. The previous undo
captured `prevCels` but the subsequent paint pushed a PixelPatch
whose imageRef pointed at the now-orphaned buffer. On undo-redo,
PixelPatch.redo mutated the orphan, not the visible buffer.

Fix: on link, clone the donor's data before sharing so both the
pre- and post-state buffers remain reachable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Pull request checklist

Before opening a PR, verify each of these:

- [ ] `npm run build` passes (TypeScript clean + Vite build clean)
- [ ] `npm run lint` shows no errors
- [ ] `npm run test:e2e` passes all 183 specs, plus any new ones you wrote
- [ ] Every user-facing mutation goes through `pushPatch` (see [adding an undo-aware action](#adding-an-undo-aware-action))
- [ ] New store fields with object/array values are selected with stable fallbacks, not `?? []` in the selector (breaks `getSnapshot` caching in Zustand v5)
- [ ] No `useEditorStore.getState()` reads inside render bodies where reactivity matters (disabled menu items, computed labels, etc.)
- [ ] Screenshot or GIF in the PR description for any UI change
- [ ] PR description includes: what changed, why, how to test manually, and which tests were added

---

## Filing a bug

Good bug reports include:
1. **Steps to reproduce.** "Click the pencil, drag from (0,0) to (5,5) at zoom 8." Don't rely on "it obviously doesn't work".
2. **Expected vs actual.** Screenshots help; GIFs help more.
3. **Browser + version.** We target current Chromium; Firefox and Safari are best-effort.
4. **Console output.** Open DevTools, click the thing that breaks, paste the red.
5. **Sample `.tstudio`** if the bug is data-dependent. Drag-drop the save file into the issue.

If you've narrowed it down to a code path, mention the file and function. Reviewers can start from there.

---

## Security

This is a client-only app — there's no server component that could be attacked. The main risk surfaces are:
1. **Malicious `.tstudio` files** (arbitrary JSON + buffers). The deserializer validates a magic string and version, but doesn't deeply validate all fields. Don't paste `.tstudio` files from untrusted strangers into the editor if you're doing sensitive work.
2. **Malicious PNGs** decoded via `createImageBitmap`. Browsers handle this safely but we don't cap image dimensions; a 100,000×100,000 PNG would OOM the tab.

If you find a security issue, please open a private GitHub security advisory rather than a public issue.

---

## License

By contributing, you agree that your work is released under the MIT License alongside the rest of the project.

---

## Getting help

- Open a [GitHub Discussion](https://github.com/thomazcapra/tile-studio/discussions) for questions.
- Open an [Issue](https://github.com/thomazcapra/tile-studio/issues) for bugs or concrete feature requests.
- Mention `@thomazcapra` in a comment for a direct ping — but only after you've searched existing issues.

Happy pixeling. 🎨
