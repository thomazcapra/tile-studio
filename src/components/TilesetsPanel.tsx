import { useState } from 'react';
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useEditorStore } from '../store/editor';
import { TileThumbnail } from './TileThumbnail';
import { NewTilesetDialog } from './NewTilesetDialog';
import { GenerateTilesetDialog } from './GenerateTilesetDialog';

export function TilesetsPanel() {
  const tilesets = useEditorStore((s) => s.sprite.tilesets);
  const [open, setOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  return (
    <>
      <div className="border-b border-border flex flex-col min-h-0" data-testid="tilesets-panel">
        <div className="px-2.5 h-7 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink/60 bg-panel2">
          <span>Tilesets</span>
          <span className="flex-1" />
          <button
            data-testid="tileset-generate"
            className="text-ink/70 hover:text-white"
            onClick={() => setGenOpen(true)}
            title="Generate from layer"
          >
            <Sparkles size={11} />
          </button>
          <button
            data-testid="tileset-new"
            className="text-ink/70 hover:text-white"
            onClick={() => setOpen(true)}
            title="New tileset"
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="min-h-0 overflow-auto">
          {tilesets.length === 0 && (
            <p className="text-[11px] text-ink/50 px-2.5 py-2">
              No tilesets yet. Use <span className="text-white">+</span> for empty or <span className="text-white">✨</span> to auto-generate from a layer.
            </p>
          )}
          {tilesets.map((t) => <TilesetBlock key={t.id} tilesetId={t.id} />)}
        </div>
      </div>
      <NewTilesetDialog open={open} onClose={() => setOpen(false)} />
      <GenerateTilesetDialog open={genOpen} onClose={() => setGenOpen(false)} />
    </>
  );
}

function TilesetBlock({ tilesetId }: { tilesetId: string }) {
  const tileset = useEditorStore((s) => s.sprite.tilesets.find((t) => t.id === tilesetId));
  const selectedTile = useEditorStore((s) => s.selectedTile);
  const dirtyTick = useEditorStore((s) => s.dirtyTick);
  const selectTile = useEditorStore((s) => s.selectTile);
  const setMode = useEditorStore((s) => s.setMode);
  const addTile = useEditorStore((s) => s.addTile);
  const duplicateTile = useEditorStore((s) => s.duplicateTile);
  const deleteTile = useEditorStore((s) => s.deleteTile);
  const reorderTile = useEditorStore((s) => s.reorderTile);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  if (!tileset) return null;

  function open(tileIndex: number) {
    selectTile(tilesetId, tileIndex);
    setMode('tile');
  }

  const thumbSize = 32;

  return (
    <div className="border-b border-border/60" data-testid={`tileset-${tilesetId}`}>
      <div className="px-2.5 py-1.5 flex items-center gap-2">
        <span className="text-[11px] font-medium text-white truncate flex-1">{tileset.name}</span>
        <span className="text-[10px] text-ink/50 font-mono">
          {tileset.grid.tw}×{tileset.grid.th} · {tileset.tiles.length}
        </span>
        <button
          data-testid={`tileset-${tilesetId}-add`}
          className="text-ink/60 hover:text-white"
          onClick={() => addTile(tilesetId)}
          title="Add tile"
        >
          <Plus size={11} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1 px-2 pb-2">
        {tileset.tiles.map((tile, i) => {
          const active = selectedTile?.tilesetId === tilesetId && selectedTile.index === i;
          return (
            <button
              key={i}
              data-testid={`tile-${tilesetId}-${i}`}
              onClick={() => selectTile(tilesetId, i)}
              onDoubleClick={() => open(i)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, index: i }); }}
              draggable
              onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragIdx != null && dragIdx !== i) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx != null && dragIdx !== i) reorderTile(tilesetId, dragIdx, i);
                setDragIdx(null);
              }}
              onDragEnd={() => setDragIdx(null)}
              className={clsx(
                'relative rounded-sm overflow-hidden group ring-1 transition-all',
                active ? 'ring-accent' : 'ring-black/40 hover:ring-accent/50',
                dragIdx === i && 'opacity-50',
              )}
              title={`Tile #${i} — drag to reorder · double-click to edit`}
              style={{ width: thumbSize, height: thumbSize }}
            >
              <div className="absolute inset-0" style={{
                background: 'repeating-conic-gradient(#2a2a2a 0 25%, #333 0 50%) 0 0 / 8px 8px',
              }} />
              <div className="relative">
                <TileThumbnail tile={tile} size={thumbSize} dirtyTick={dirtyTick} />
              </div>
              <span className="absolute bottom-0 right-0 text-[8px] px-0.5 text-white/80 bg-black/50 leading-none rounded-tl-sm">
                {i}
              </span>
            </button>
          );
        })}
      </div>

      {menu && (
        <div
          className="fixed z-50 bg-panel2 border border-border rounded-md shadow-2xl py-1 text-xs min-w-[140px]"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
          data-testid="tile-context-menu"
        >
          <MenuItem icon={<Copy size={12} />} label="Duplicate" onClick={() => { duplicateTile(tilesetId, menu.index); setMenu(null); }} testId="menu-duplicate" />
          <MenuItem icon={<Trash2 size={12} />} label="Delete" onClick={() => { deleteTile(tilesetId, menu.index); setMenu(null); }} danger testId="menu-delete" />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger, testId }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={clsx('w-full flex items-center gap-2 px-2.5 py-1 text-left hover:bg-panel', danger ? 'text-red-400 hover:text-red-300' : 'text-ink/80 hover:text-white')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
