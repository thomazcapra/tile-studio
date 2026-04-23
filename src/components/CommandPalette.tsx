import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useEditorStore } from '../store/editor';

export interface Command {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  run: () => void;
}

// Keyword scoring: contiguous matches rank higher; every query char must appear in order.
// Returns null on miss, or a positive score where higher = better.
function score(label: string, query: string): number | null {
  if (!query) return 0.1;
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  let li = 0, qi = 0;
  let matched = 0, streak = 0, best = 0;
  while (li < l.length && qi < q.length) {
    if (l[li] === q[qi]) {
      matched++;
      streak++;
      best = Math.max(best, streak);
      qi++;
    } else {
      streak = 0;
    }
    li++;
  }
  if (qi < q.length) return null;
  // Heavier weight on contiguous runs + bonus for matching at the start.
  return matched + best * 3 + (l.startsWith(q) ? 5 : 0);
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useCommands();

  const filtered = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: score(c.label, query.trim()) }))
      .filter((x): x is { c: Command; s: number } => x.s != null)
      .sort((a, b) => b.s - a.s);
    return scored.map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  if (!open) return null;

  function run(cmd: Command) {
    try {
      cmd.run();
    } catch (err) {
      toast.error(`${cmd.label} failed: ${(err as Error).message}`);
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(filtered.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selected]) run(filtered[selected]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      onMouseDown={onClose}
      data-testid="cmd-palette-backdrop"
    >
      <div
        className="w-[520px] max-h-[60vh] rounded-lg border border-border bg-panel shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
        data-testid="cmd-palette"
      >
        <input
          ref={inputRef}
          data-testid="cmd-input"
          className="w-full bg-transparent border-b border-border px-3 py-2 text-sm outline-none text-white placeholder:text-ink/40"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <ul className="overflow-y-auto" data-testid="cmd-list">
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-xs text-ink/50">No matches</li>
          )}
          {filtered.slice(0, 60).map((c, i) => (
            <li
              key={c.id}
              data-testid={`cmd-item-${c.id}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => run(c)}
              className={clsx(
                'px-3 py-1.5 flex items-center gap-3 cursor-pointer',
                selected === i ? 'bg-accent/20 text-white' : 'text-ink/80 hover:bg-panel2'
              )}
            >
              <span className="text-[10px] uppercase tracking-wider text-ink/40 w-16 shrink-0">{c.section}</span>
              <span className="flex-1 truncate text-[12px]">{c.label}</span>
              {c.shortcut && <span className="text-ink/40 font-mono text-[10px]">{c.shortcut}</span>}
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-3 py-1.5 text-[10px] text-ink/40 flex justify-between">
          <span>↑↓ navigate · Enter run · Esc close</span>
          <span>{filtered.length} / {commands.length}</span>
        </div>
      </div>
    </div>
  );
}

// Build the command catalogue fresh each render — cheap, and picks up any selection/tool state changes.
function useCommands(): Command[] {
  const s = useEditorStore((st) => st);
  return useMemo(() => {
    const st = useEditorStore.getState();
    const vp = () => document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
    const list: Command[] = [];

    const dispatch = (action: string) => window.dispatchEvent(new CustomEvent('tile-studio:action', { detail: action }));

    // File
    list.push({ id: 'file.new', section: 'File', label: 'New Sprite', shortcut: 'Ctrl+N', run: () => dispatch('file-new') });
    list.push({ id: 'file.save', section: 'File', label: 'Save Project', shortcut: 'Ctrl+S', run: () => dispatch('save-project') });
    list.push({ id: 'file.open', section: 'File', label: 'Open Project', shortcut: 'Ctrl+Shift+O', run: () => dispatch('open-project') });
    list.push({ id: 'file.export', section: 'File', label: 'Export…', run: () => dispatch('open-export') });

    // Edit
    list.push({ id: 'edit.undo', section: 'Edit', label: 'Undo', shortcut: 'Ctrl+Z', run: () => st.undo() });
    list.push({ id: 'edit.redo', section: 'Edit', label: 'Redo', shortcut: 'Ctrl+Shift+Z', run: () => st.redo() });

    // Select
    list.push({ id: 'sel.all', section: 'Select', label: 'Select All', shortcut: 'Ctrl+A', run: () => st.selectAll() });
    list.push({ id: 'sel.none', section: 'Select', label: 'Deselect', shortcut: 'Ctrl+D', run: () => st.deselect() });
    list.push({ id: 'sel.invert', section: 'Select', label: 'Invert Selection', shortcut: 'Ctrl+Shift+I', run: () => st.invertSelection() });
    list.push({ id: 'sel.cut', section: 'Select', label: 'Cut', shortcut: 'Ctrl+X', run: () => st.cutSelection() });
    list.push({ id: 'sel.copy', section: 'Select', label: 'Copy', shortcut: 'Ctrl+C', run: () => st.copySelection() });
    list.push({ id: 'sel.paste', section: 'Select', label: 'Paste', shortcut: 'Ctrl+V', run: () => st.pasteSelection() });
    list.push({ id: 'sel.fliph', section: 'Select', label: 'Flip Selection Horizontal', run: () => st.flipSelectionContent('h') });
    list.push({ id: 'sel.flipv', section: 'Select', label: 'Flip Selection Vertical', run: () => st.flipSelectionContent('v') });
    list.push({ id: 'sel.rot180', section: 'Select', label: 'Rotate Selection 180°', run: () => st.rotateSelection180() });

    // View
    list.push({ id: 'view.fit', section: 'View', label: 'Fit to Window', shortcut: '0', run: () => { const v = vp(); if (v) st.resetView(v.clientWidth, v.clientHeight); } });
    for (const z of [1, 2, 4, 8, 16]) list.push({ id: `view.zoom-${z}`, section: 'View', label: `Zoom ${z * 100}%`, run: () => st.setZoom(z) });
    list.push({ id: 'view.tiled-none', section: 'View', label: 'Tiled Mode: None', run: () => st.setTiledMode('none') });
    list.push({ id: 'view.tiled-x', section: 'View', label: 'Tiled Mode: X', run: () => st.setTiledMode('x') });
    list.push({ id: 'view.tiled-y', section: 'View', label: 'Tiled Mode: Y', run: () => st.setTiledMode('y') });
    list.push({ id: 'view.tiled-both', section: 'View', label: 'Tiled Mode: Both', run: () => st.setTiledMode('both') });
    list.push({ id: 'view.tile-numbers', section: 'View', label: 'Toggle Tile Numbers', shortcut: 'N', run: () => st.toggleShowTileNumbers() });
    list.push({ id: 'view.onion', section: 'View', label: 'Toggle Onion Skin', shortcut: 'O', run: () => st.toggleOnionSkin() });
    list.push({ id: 'view.snap', section: 'View', label: 'Toggle Snap to Grid', run: () => st.toggleSnapToGrid() });
    list.push({ id: 'view.sym-none', section: 'View', label: 'Symmetry: Off', run: () => st.setSymmetryMode('none') });
    list.push({ id: 'view.sym-h', section: 'View', label: 'Symmetry: Horizontal', run: () => st.setSymmetryMode('h') });
    list.push({ id: 'view.sym-v', section: 'View', label: 'Symmetry: Vertical', run: () => st.setSymmetryMode('v') });
    list.push({ id: 'view.sym-both', section: 'View', label: 'Symmetry: Both Axes', run: () => st.setSymmetryMode('both') });

    // Tools
    const toolIds: Array<[string, string]> = [
      ['pencil', 'B'], ['eraser', 'E'], ['bucket', 'G'], ['eyedropper', 'I'],
      ['line', 'L'], ['rect', 'U'], ['rectfill', '⇧U'], ['gradient', 'D'], ['text', 'T'],
      ['select-rect', 'M'], ['select-ellipse', '⇧M'], ['select-lasso', 'Q'], ['select-wand', 'W'],
    ];
    for (const [id, sh] of toolIds) {
      list.push({ id: `tool.${id}`, section: 'Tool', label: `Pick Tool: ${id}`, shortcut: sh, run: () => st.setTool(id as never) });
    }
    list.push({ id: 'tool.pp', section: 'Tool', label: 'Toggle Pixel-Perfect Pencil', shortcut: 'P', run: () => st.togglePixelPerfect() });

    // Sprite
    list.push({ id: 'spr.rot-cw', section: 'Sprite', label: 'Rotate Canvas 90° CW', run: () => st.rotateCanvas('cw') });
    list.push({ id: 'spr.rot-ccw', section: 'Sprite', label: 'Rotate Canvas 90° CCW', run: () => st.rotateCanvas('ccw') });
    list.push({ id: 'spr.rot-180', section: 'Sprite', label: 'Rotate Canvas 180°', run: () => st.rotateCanvas('180') });
    list.push({ id: 'spr.flip-h', section: 'Sprite', label: 'Flip Canvas Horizontal', run: () => st.flipCanvas('h') });
    list.push({ id: 'spr.flip-v', section: 'Sprite', label: 'Flip Canvas Vertical', run: () => st.flipCanvas('v') });
    list.push({ id: 'spr.autocrop', section: 'Sprite', label: 'Trim (Autocrop)', run: () => st.autocrop() });

    // Layer
    list.push({ id: 'layer.new', section: 'Layer', label: 'New Raster Layer', run: () => st.addRasterLayer() });
    list.push({ id: 'layer.new-group', section: 'Layer', label: 'New Group', run: () => st.addGroupLayer() });
    if (st.currentLayerId) {
      list.push({ id: 'layer.dup', section: 'Layer', label: 'Duplicate Layer', run: () => st.duplicateLayer(st.currentLayerId!) });
      list.push({ id: 'layer.merge-down', section: 'Layer', label: 'Merge Down', run: () => st.mergeLayerDown(st.currentLayerId!) });
      list.push({ id: 'layer.up', section: 'Layer', label: 'Move Layer Up', run: () => st.moveLayerUp(st.currentLayerId!) });
      list.push({ id: 'layer.down', section: 'Layer', label: 'Move Layer Down', run: () => st.moveLayerDown(st.currentLayerId!) });
    }

    // Frame
    list.push({ id: 'frame.new', section: 'Frame', label: 'New Frame', run: () => st.addFrame(st.currentFrame, false) });
    list.push({ id: 'frame.dup', section: 'Frame', label: 'Duplicate Frame', run: () => st.duplicateFrame(st.currentFrame) });
    list.push({ id: 'frame.del', section: 'Frame', label: 'Delete Frame', run: () => st.deleteFrame(st.currentFrame) });
    list.push({ id: 'frame.play', section: 'Frame', label: 'Play / Pause', shortcut: 'Space', run: () => st.togglePlay() });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.sprite.layers.length, s.sprite.frames.length, s.currentLayerId, s.selection, s.clipboard]);
}
