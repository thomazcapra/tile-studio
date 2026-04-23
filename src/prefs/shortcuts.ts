// Shortcut registry: every bindable action in the app.
// Each action has a stable id, a human label, and a dispatch function.
// Shortcut bindings live in a separate Map that can be edited by the user.

import { useEditorStore } from '../store/editor';
import { usePrefsStore } from './prefs-store';
import { imageToClipboardBuffer, readClipboardImage, writeClipboardAsPNG } from '../io/os-clipboard';

export interface ShortcutAction {
  id: string;
  label: string;
  group: 'file' | 'edit' | 'view' | 'tool' | 'selection' | 'frame' | 'tilemap';
  run: () => void;
}

function fire(detail: string) {
  window.dispatchEvent(new CustomEvent('tile-studio:action', { detail }));
}

// The full action catalog. Actions that dispatch through the bus are resolved
// by MenuBar / App's handlers (kept out of the store to preserve React locality).
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // File
  { id: 'file.new',          label: 'New Sprite',       group: 'file',  run: () => fire('file-new') },
  { id: 'file.save',         label: 'Save Project',     group: 'file',  run: () => fire('save-project') },
  { id: 'file.open',         label: 'Open Project',     group: 'file',  run: () => fire('open-project') },
  { id: 'file.export',       label: 'Export…',          group: 'file',  run: () => fire('open-export') },
  { id: 'file.command',      label: 'Command Palette',  group: 'file',  run: () => fire('open-command-palette') },

  // Edit
  { id: 'edit.undo',         label: 'Undo',             group: 'edit',  run: () => useEditorStore.getState().undo() },
  { id: 'edit.redo',         label: 'Redo',             group: 'edit',  run: () => useEditorStore.getState().redo() },

  // Selection
  { id: 'select.all',        label: 'Select All',       group: 'selection', run: () => useEditorStore.getState().selectAll() },
  { id: 'select.none',       label: 'Deselect',         group: 'selection', run: () => useEditorStore.getState().deselect() },
  { id: 'select.invert',     label: 'Invert Selection', group: 'selection', run: () => useEditorStore.getState().invertSelection() },
  { id: 'select.cut',        label: 'Cut',              group: 'selection', run: () => runCut() },
  { id: 'select.copy',       label: 'Copy',             group: 'selection', run: () => runCopy() },
  { id: 'select.paste',      label: 'Paste',            group: 'selection', run: () => runPaste() },
  { id: 'select.delete',     label: 'Delete Contents',  group: 'selection', run: () => useEditorStore.getState().deleteSelectionContent() },

  // Frame
  { id: 'frame.play',        label: 'Play / Pause',     group: 'frame', run: () => useEditorStore.getState().togglePlay() },
  { id: 'frame.next',        label: 'Next Frame',       group: 'frame', run: () => useEditorStore.getState().nextFrame() },
  { id: 'frame.prev',        label: 'Prev Frame',       group: 'frame', run: () => useEditorStore.getState().prevFrame() },

  // View
  { id: 'view.fit',          label: 'Fit to Window',    group: 'view',  run: () => {
      const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
      if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
    } },
  { id: 'view.zoom-in',      label: 'Zoom In',          group: 'view',  run: () => useEditorStore.getState().setZoom(useEditorStore.getState().viewport.zoom * 2) },
  { id: 'view.zoom-out',     label: 'Zoom Out',         group: 'view',  run: () => useEditorStore.getState().setZoom(useEditorStore.getState().viewport.zoom / 2) },
  { id: 'view.zoom-100',     label: 'Zoom 100%',        group: 'view',  run: () => useEditorStore.getState().setZoom(1) },
  { id: 'view.zoom-200',     label: 'Zoom 200%',        group: 'view',  run: () => useEditorStore.getState().setZoom(2) },
  { id: 'view.zoom-400',     label: 'Zoom 400%',        group: 'view',  run: () => useEditorStore.getState().setZoom(4) },
  { id: 'view.onion',        label: 'Toggle Onion Skin', group: 'view', run: () => useEditorStore.getState().toggleOnionSkin() },
  { id: 'view.tile-numbers', label: 'Toggle Tile Numbers', group: 'view', run: () => useEditorStore.getState().toggleShowTileNumbers() },
  { id: 'view.pixel-perfect', label: 'Toggle Pixel Perfect', group: 'view', run: () => useEditorStore.getState().togglePixelPerfect() },
  { id: 'view.distraction-free', label: 'Toggle Distraction Free', group: 'view', run: () => useEditorStore.getState().toggleDistractionFree() },

  // Tools
  { id: 'tool.pencil',       label: 'Pencil',           group: 'tool',  run: () => useEditorStore.getState().setTool('pencil') },
  { id: 'tool.eraser',       label: 'Eraser',           group: 'tool',  run: () => useEditorStore.getState().setTool('eraser') },
  { id: 'tool.bucket',       label: 'Bucket',           group: 'tool',  run: () => useEditorStore.getState().setTool('bucket') },
  { id: 'tool.eyedropper',   label: 'Eyedropper',       group: 'tool',  run: () => useEditorStore.getState().setTool('eyedropper') },
  { id: 'tool.line',         label: 'Line',             group: 'tool',  run: () => useEditorStore.getState().setTool('line') },
  { id: 'tool.rect',         label: 'Rectangle',        group: 'tool',  run: () => useEditorStore.getState().setTool('rect') },
  { id: 'tool.rectfill',     label: 'Filled Rectangle', group: 'tool',  run: () => useEditorStore.getState().setTool('rectfill') },
  { id: 'tool.gradient',     label: 'Gradient',         group: 'tool',  run: () => useEditorStore.getState().setTool('gradient') },
  { id: 'tool.text',         label: 'Text',             group: 'tool',  run: () => useEditorStore.getState().setTool('text') },
  { id: 'tool.slice',        label: 'Slice',            group: 'tool',  run: () => useEditorStore.getState().setTool('slice') },
  { id: 'tool.select-rect',  label: 'Rect Select',      group: 'tool',  run: () => useEditorStore.getState().setTool('select-rect') },
  { id: 'tool.select-ellipse', label: 'Ellipse Select', group: 'tool',  run: () => useEditorStore.getState().setTool('select-ellipse') },
  { id: 'tool.select-lasso', label: 'Lasso',            group: 'tool',  run: () => useEditorStore.getState().setTool('select-lasso') },
  { id: 'tool.select-wand',  label: 'Magic Wand',       group: 'tool',  run: () => useEditorStore.getState().setTool('select-wand') },
  { id: 'tool.brush-smaller', label: 'Smaller Brush',   group: 'tool',  run: () => useEditorStore.getState().setBrushSize(useEditorStore.getState().brushSize - 1) },
  { id: 'tool.brush-larger',  label: 'Larger Brush',    group: 'tool',  run: () => useEditorStore.getState().setBrushSize(useEditorStore.getState().brushSize + 1) },
  { id: 'tool.swap-colors',  label: 'Swap Colors',      group: 'tool',  run: () => useEditorStore.getState().swapColors() },

  // Tilemap
  { id: 'tilemap.flip-x',    label: 'Tilemap Flip X',   group: 'tilemap', run: () => { if (useEditorStore.getState().mode === 'tilemap') useEditorStore.getState().toggleBrushFlip('x'); } },
  { id: 'tilemap.flip-y',    label: 'Tilemap Flip Y',   group: 'tilemap', run: () => { if (useEditorStore.getState().mode === 'tilemap') useEditorStore.getState().toggleBrushFlip('y'); } },
  { id: 'tilemap.flip-d',    label: 'Tilemap Flip D',   group: 'tilemap', run: () => { if (useEditorStore.getState().mode === 'tilemap') useEditorStore.getState().toggleBrushFlip('d'); } },
];

export const ACTION_BY_ID: Map<string, ShortcutAction> = new Map(SHORTCUT_ACTIONS.map((a) => [a.id, a]));

// Cut/copy/paste helpers that optionally round-trip through the OS clipboard.
// These are promise-returning but we fire-and-forget to keep keybinding handlers sync.
async function runCopy(): Promise<boolean> {
  const ok = useEditorStore.getState().copySelection();
  if (!ok) return false;
  if (usePrefsStore.getState().osClipboardEnabled) {
    const clip = useEditorStore.getState().clipboard;
    if (clip) void writeClipboardAsPNG(clip);
  }
  return true;
}
async function runCut(): Promise<boolean> {
  const ok = await runCopy();
  if (!ok) return false;
  return useEditorStore.getState().deleteSelectionContent();
}
async function runPaste(): Promise<boolean> {
  if (usePrefsStore.getState().osClipboardEnabled) {
    const img = await readClipboardImage();
    if (img) {
      useEditorStore.setState({ clipboard: imageToClipboardBuffer(img) });
    }
  }
  return useEditorStore.getState().pasteSelection();
}

// Default shortcut bindings. Keys use the same canonical format as
// `keyEventToShortcut()`: modifier prefix (Ctrl/Shift/Alt) + lowercase key.
// The empty string means "unbound".
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'file.new':            '', // Reserved — browsers swallow Ctrl+N. Leave unbound.
  'file.save':           'Ctrl+s',
  'file.open':           'Ctrl+Shift+o',
  'file.export':         'Ctrl+Shift+e',
  'file.command':        'Ctrl+k',
  'edit.undo':           'Ctrl+z',
  'edit.redo':           'Ctrl+Shift+z',
  'select.all':          'Ctrl+a',
  'select.none':         'Ctrl+d',
  'select.invert':       'Ctrl+Shift+i',
  'select.cut':          'Ctrl+x',
  'select.copy':         'Ctrl+c',
  'select.paste':        'Ctrl+v',
  'select.delete':       'Delete',
  'frame.play':          'Space',
  'view.fit':            '0',
  'view.zoom-in':        '+',
  'view.zoom-out':       '-',
  'view.zoom-100':       '1',
  'view.zoom-200':       '2',
  'view.zoom-400':       '4',
  'view.onion':          'o',
  'view.tile-numbers':   'n',
  'view.pixel-perfect':  'p',
  'view.distraction-free': 'Tab',
  'tool.pencil':         'b',
  'tool.eraser':         'e',
  'tool.bucket':         'g',
  'tool.eyedropper':     'i',
  'tool.line':           'l',
  'tool.rect':           'u',
  'tool.rectfill':       'Shift+u',
  'tool.gradient':       'd',
  'tool.text':           't',
  'tool.slice':          's',
  'tool.select-rect':    'm',
  'tool.select-ellipse': 'Shift+m',
  'tool.select-lasso':   'q',
  'tool.select-wand':    'w',
  'tool.brush-smaller':  '[',
  'tool.brush-larger':   ']',
  'tool.swap-colors':    'x',
  'tilemap.flip-x':      'f',
  'tilemap.flip-y':      'v',
  'tilemap.flip-d':      'r',
  'frame.next':          '',
  'frame.prev':          '',
};

// Convert a KeyboardEvent into a canonical shortcut string, e.g. "Ctrl+Shift+S".
// Single-char keys are lowercased except when Shift is held AND the key isn't
// already a control character — then we keep it as a pure `Shift+<lower>`.
export function keyEventToShortcut(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toLowerCase();
  // Skip pure modifier-key keydowns so "Shift" alone doesn't match.
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return '';
  parts.push(key);
  return parts.join('+');
}
