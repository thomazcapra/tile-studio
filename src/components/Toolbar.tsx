import { useState } from 'react';
import { FilePlus, FolderOpen, Download, Undo2, Redo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEditorStore } from '../store/editor';
import { decodePNG, pickFile, spriteFromImage } from '../io/png';
import { newSprite } from '../model/factory';
import { ExportDialog } from './ExportDialog';

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.undoStack.length > 0);
  const canRedo = useEditorStore((s) => s.redoStack.length > 0);
  const replaceSprite = useEditorStore((s) => s.replaceSprite);

  async function onOpen() {
    const f = await pickFile('image/png,image/*');
    if (!f) return;
    try {
      const img = await decodePNG(f);
      replaceSprite(spriteFromImage(img, f.name.replace(/\.[^.]+$/, '')));
      const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
      if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
      toast.success(`Imported ${f.name} (${img.w}×${img.h})`);
    } catch (err) {
      toast.error(`Failed to import: ${(err as Error).message}`);
    }
  }

  const [exportOpen, setExportOpen] = useState(false);
  function onExport() { setExportOpen(true); }

  function onNew() {
    replaceSprite(newSprite(64, 64));
    const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
    if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
    toast('New sprite');
  }

  return (
    <div className="h-11 coarse:h-14 flex items-center px-3 gap-1 border-b border-border bg-panel text-sm" data-testid="toolbar">
      <span className="font-semibold tracking-tight mr-3 flex items-center gap-1">
        <span className="w-2 h-2 bg-accent rounded-sm" />
        Tile Studio
      </span>
      <IconBtn icon={FilePlus} label="New (Ctrl+N)" onClick={onNew} testId="btn-new" />
      <IconBtn icon={FolderOpen} label="Open PNG" onClick={onOpen} testId="btn-open" />
      <IconBtn icon={Download} label="Export…" onClick={onExport} testId="btn-export" />
      <div className="w-px h-5 bg-border mx-2" />
      <IconBtn icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} testId="btn-undo" />
      <IconBtn icon={Redo2} label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} testId="btn-redo" />
      <div className="w-px h-5 bg-border mx-2" />
      <ModeButton label="Raster" value="raster" current={mode} onSet={setMode} />
      <ModeButton label="Tilemap" value="tilemap" current={mode} onSet={setMode} />
      <TileModeButton current={mode} onSet={setMode} />
      <div className="flex-1" />
      <span className="text-xs text-ink/60">P6</span>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function IconBtn({ icon: Icon, label, onClick, disabled, testId }: { icon: React.ComponentType<{ size?: number }>; label: string; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="w-8 h-8 coarse:w-11 coarse:h-11 rounded-md flex items-center justify-center text-ink/80 hover:text-white hover:bg-panel2 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon size={15} />
    </button>
  );
}

function TileModeButton({ current, onSet }: { current: string; onSet: (m: 'raster' | 'tilemap' | 'tile') => void }) {
  const hasTiles = useEditorStore((s) => s.sprite.tilesets.some((t) => t.tiles.length > 0));
  const active = current === 'tile';
  return (
    <button
      data-testid="mode-tile"
      aria-pressed={active}
      disabled={!hasTiles && !active}
      onClick={() => onSet('tile')}
      title={hasTiles ? 'Edit selected tile' : 'Create a tileset first'}
      className={`px-2.5 py-1 coarse:py-2 coarse:px-3 rounded-md text-[11px] uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'bg-accent/25 text-white ring-1 ring-accent/60' : 'text-ink/70 hover:text-white hover:bg-panel2'}`}
    >
      Tile
    </button>
  );
}

function ModeButton({ label, value, current, onSet }: { label: string; value: 'raster' | 'tilemap' | 'tile'; current: string; onSet: (m: 'raster' | 'tilemap' | 'tile') => void }) {
  const active = current === value;
  return (
    <button
      data-testid={`mode-${value}`}
      aria-pressed={active}
      onClick={() => onSet(value)}
      className={`px-2.5 py-1 coarse:py-2 coarse:px-3 rounded-md text-[11px] uppercase tracking-wider transition-colors ${active ? 'bg-accent/25 text-white ring-1 ring-accent/60' : 'text-ink/70 hover:text-white hover:bg-panel2'}`}
    >
      {label}
    </button>
  );
}
