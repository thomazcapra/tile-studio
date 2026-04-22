import { useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, Plus, Image as ImageIcon, Grid3x3, Sparkles, Copy, Trash2, ChevronUp, ChevronDown, Merge, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import { useEditorStore } from '../store/editor';
import { ColorPicker } from './ColorPicker';
import { TilesetsPanel } from './TilesetsPanel';
import { NewTilemapLayerDialog } from './NewTilemapLayerDialog';
import { QuantizeDialog } from './QuantizeDialog';
import { PaletteEditorDialog } from './PaletteEditorDialog';

export function SidePanel() {
  return (
    <aside className="w-64 shrink-0 border-l border-border bg-panel flex flex-col min-h-0" data-testid="side-panel">
      <ColorsSection />
      <PaletteSection />
      <TilesetsPanel />
      <LayersSection />
      <HistorySection />
    </aside>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-border flex flex-col min-h-0">
      <div className="px-2.5 h-7 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink/60 bg-panel2">
        <span>{title}</span>
        <span className="flex-1" />
        {right}
      </div>
      <div className="min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

function ColorsSection() {
  const primary = useEditorStore((s) => s.primary);
  const secondary = useEditorStore((s) => s.secondary);
  const setPrimary = useEditorStore((s) => s.setPrimary);
  const setSecondary = useEditorStore((s) => s.setSecondary);
  const swap = useEditorStore((s) => s.swapColors);
  const [picker, setPicker] = useState<null | 'primary' | 'secondary'>(null);
  const val = picker === 'secondary' ? secondary : primary;
  const setVal = picker === 'secondary' ? setSecondary : setPrimary;
  return (
    <Section title="Color">
      <div className="flex items-center gap-3 p-2.5">
        <button
          data-testid="primary-swatch"
          onClick={() => setPicker((p) => (p === 'primary' ? null : 'primary'))}
          className={clsx('w-8 h-8 rounded-md border', picker === 'primary' ? 'border-accent ring-2 ring-accent/30' : 'border-black/50')}
          style={{ background: u32ToCss(primary) }}
          title="Primary"
        />
        <button
          data-testid="secondary-swatch"
          onClick={() => setPicker((p) => (p === 'secondary' ? null : 'secondary'))}
          className={clsx('w-8 h-8 rounded-md border', picker === 'secondary' ? 'border-accent ring-2 ring-accent/30' : 'border-black/50')}
          style={{ background: u32ToCss(secondary) }}
          title="Secondary"
        />
        <button onClick={swap} className="text-xs text-ink/60 hover:text-white">Swap (X)</button>
      </div>
      {picker && <ColorPicker value={val} onChange={setVal} onClose={() => setPicker(null)} />}
    </Section>
  );
}

function PaletteSection() {
  const palette = useEditorStore((s) => s.sprite.palette);
  const setPrimary = useEditorStore((s) => s.setPrimary);
  const setSecondary = useEditorStore((s) => s.setSecondary);
  const [qOpen, setQOpen] = useState(false);
  const [peOpen, setPeOpen] = useState(false);
  return (
    <>
      <Section
        title={`Palette (${palette.colors.length})`}
        right={
          <div className="flex items-center gap-1">
            <button
              data-testid="palette-edit"
              className="text-ink/70 hover:text-white"
              onClick={() => setPeOpen(true)}
              title="Edit palette (add / remove / reorder / presets)"
            >
              <Settings2 size={11} />
            </button>
            <button
              data-testid="palette-quantize"
              className="text-ink/70 hover:text-white"
              onClick={() => setQOpen(true)}
              title="Reduce colors of active layer"
            >
              <Sparkles size={11} />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-8 gap-[2px] p-2" data-testid="palette-grid">
          {Array.from(palette.colors).map((c, i) => (
            <button
              key={i}
              data-testid={`palette-${i}`}
              onClick={() => setPrimary(c)}
              onContextMenu={(e) => { e.preventDefault(); setSecondary(c); }}
              className="w-6 h-6 rounded-sm border border-black/40 hover:ring-2 hover:ring-accent/60 transition-shadow"
              style={{ background: u32ToCss(c) }}
              title={`#${i} — click=primary, right-click=secondary`}
            />
          ))}
        </div>
      </Section>
      <QuantizeDialog open={qOpen} onClose={() => setQOpen(false)} />
      <PaletteEditorDialog open={peOpen} onClose={() => setPeOpen(false)} />
    </>
  );
}

function LayersSection() {
  const sprite = useEditorStore((s) => s.sprite);
  const current = useEditorStore((s) => s.currentLayerId);
  const setCurrentLayer = useEditorStore((s) => s.setCurrentLayer);
  const addRaster = useEditorStore((s) => s.addRasterLayer);
  const duplicate = useEditorStore((s) => s.duplicateLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const moveUp = useEditorStore((s) => s.moveLayerUp);
  const moveDown = useEditorStore((s) => s.moveLayerDown);
  const mergeDown = useEditorStore((s) => s.mergeLayerDown);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const setVisible = useEditorStore((s) => s.setLayerVisible);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tmlOpen, setTmlOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <>
      <Section
        title="Layers"
        right={
          <div className="relative flex items-center gap-1">
            <button
              data-testid="layer-move-up"
              className="text-ink/60 hover:text-white disabled:opacity-30"
              onClick={() => current && moveUp(current)}
              title="Move layer up"
              disabled={!current}
            >
              <ChevronUp size={11} />
            </button>
            <button
              data-testid="layer-move-down"
              className="text-ink/60 hover:text-white disabled:opacity-30"
              onClick={() => current && moveDown(current)}
              title="Move layer down"
              disabled={!current}
            >
              <ChevronDown size={11} />
            </button>
            <button
              data-testid="layer-add"
              className="text-ink/60 hover:text-white"
              onClick={() => setMenuOpen((v) => !v)}
              title="Add layer"
            >
              <Plus size={11} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-5 z-30 min-w-[160px] rounded-md bg-panel2 border border-border shadow-xl py-1 text-xs"
                onMouseLeave={() => setMenuOpen(false)}
                data-testid="layer-add-menu"
              >
                <button
                  data-testid="layer-add-raster"
                  className="w-full flex items-center gap-2 px-2.5 py-1 text-left text-ink/80 hover:text-white hover:bg-panel"
                  onClick={() => { setMenuOpen(false); addRaster(); }}
                >
                  <ImageIcon size={12} /> Raster Layer
                </button>
                <button
                  data-testid="layer-add-tilemap"
                  className="w-full flex items-center gap-2 px-2.5 py-1 text-left text-ink/80 hover:text-white hover:bg-panel"
                  onClick={() => { setMenuOpen(false); setTmlOpen(true); }}
                >
                  <Grid3x3 size={12} /> Tilemap Layer
                </button>
              </div>
            )}
          </div>
        }
      >
        <ul className="text-xs" data-testid="layers-list">
          {sprite.layerOrder.slice().reverse().map((id) => {
            const l = sprite.layers.find((x) => x.id === id)!;
            const active = id === current;
            const mode = l.blendMode ?? 'normal';
            return (
              <li
                key={id}
                data-testid={`layer-${id}`}
                onClick={() => setCurrentLayer(id)}
                onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, layerId: id }); }}
                draggable
                onDragStart={(e) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { if (dragId && dragId !== id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== id) {
                    const toIdx = sprite.layerOrder.indexOf(id);
                    moveLayer(dragId, toIdx);
                  }
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
                className={clsx(
                  'px-2 py-1 flex items-center gap-2 border-l-2 cursor-pointer',
                  active ? 'bg-accent/10 border-accent' : 'border-transparent hover:bg-panel2',
                  dragId === id && 'opacity-50',
                )}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setVisible(l.id, !l.visible); }}
                  className="text-ink/70 hover:text-white"
                  title="Toggle visible"
                >
                  {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="text-ink/70 hover:text-white"
                  title="Toggle lock"
                >
                  {l.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                <span className="flex-1 truncate" data-testid={`layer-${id}-name`}>{l.name}</span>
                {mode !== 'normal' && (
                  <span className="text-accent/70 uppercase text-[9px] font-mono" data-testid={`layer-${id}-blend`}>{mode}</span>
                )}
                <span className="text-ink/40 uppercase text-[9px]">{l.type}</span>
              </li>
            );
          })}
        </ul>
      </Section>
      <NewTilemapLayerDialog open={tmlOpen} onClose={() => setTmlOpen(false)} />

      {ctx && (() => {
        const l = sprite.layers.find((x) => x.id === ctx.layerId);
        const idx = sprite.layerOrder.indexOf(ctx.layerId);
        const canMergeDown = l?.type === 'raster' && idx > 0 && sprite.layers.find((x) => x.id === sprite.layerOrder[idx - 1])?.type === 'raster';
        return (
          <div
            className="fixed z-50 bg-panel2 border border-border rounded-md shadow-2xl py-1 text-xs min-w-[180px]"
            style={{ left: ctx.x, top: ctx.y }}
            onMouseLeave={() => setCtx(null)}
            data-testid="layer-ctx-menu"
          >
            <CtxItem testId="layer-ctx-duplicate" icon={<Copy size={12} />} label="Duplicate" onClick={() => { duplicate(ctx.layerId); setCtx(null); }} />
            <CtxItem testId="layer-ctx-merge" icon={<Merge size={12} />} label="Merge Down" onClick={() => { mergeDown(ctx.layerId); setCtx(null); }} disabled={!canMergeDown} />
            <CtxItem testId="layer-ctx-up" icon={<ChevronUp size={12} />} label="Move Up" onClick={() => { moveUp(ctx.layerId); setCtx(null); }} />
            <CtxItem testId="layer-ctx-down" icon={<ChevronDown size={12} />} label="Move Down" onClick={() => { moveDown(ctx.layerId); setCtx(null); }} />
            <div className="h-px bg-border my-1" />
            <CtxItem testId="layer-ctx-delete" icon={<Trash2 size={12} />} label="Delete" onClick={() => { deleteLayer(ctx.layerId); setCtx(null); }} danger disabled={sprite.layers.length <= 1} />
          </div>
        );
      })()}
    </>
  );
}

function CtxItem({ icon, label, onClick, disabled, danger, testId }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full flex items-center gap-2 px-2.5 py-1 text-left',
        disabled ? 'text-ink/35 cursor-not-allowed'
          : danger ? 'text-red-400 hover:text-red-300 hover:bg-panel'
          : 'text-ink/85 hover:text-white hover:bg-panel'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HistorySection() {
  const undoStack = useEditorStore((s) => s.undoStack);
  const redoStack = useEditorStore((s) => s.redoStack);
  return (
    <Section title={`History (${undoStack.length}/${undoStack.length + redoStack.length})`}>
      <ul className="text-[11px] font-mono text-ink/80" data-testid="history-list">
        {undoStack.slice(-10).map((p, i) => (
          <li key={i} className="px-2 py-0.5 flex justify-between">
            <span>{p.label}</span>
            <span className="text-ink/40">{p.newColors.size}px</span>
          </li>
        ))}
        {undoStack.length === 0 && <li className="px-2 py-2 text-ink/40">No edits yet</li>}
      </ul>
    </Section>
  );
}

function u32ToCss(c: number): string {
  const r = c & 0xff, g = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff, a = (c >>> 24) & 0xff;
  return `rgba(${r},${g},${b},${a / 255})`;
}
