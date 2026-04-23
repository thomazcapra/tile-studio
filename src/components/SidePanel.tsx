import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Eye, EyeOff, Lock, Unlock, Plus, Image as ImageIcon, Grid3x3, Sparkles, Copy, Trash2, ChevronUp, ChevronDown, Merge, Settings2, Folder, FolderOpen, FolderInput, FolderOutput } from 'lucide-react';
import clsx from 'clsx';
import { useEditorStore } from '../store/editor';
import { ColorPicker } from './ColorPicker';
import { TilesetsPanel } from './TilesetsPanel';
import { NewTilemapLayerDialog } from './NewTilemapLayerDialog';
import { QuantizeDialog } from './QuantizeDialog';
import { PaletteEditorDialog } from './PaletteEditorDialog';
import type { Slice } from '../model/types';

const EMPTY_SLICES: Slice[] = [];

export function SidePanel() {
  return (
    <aside
      className="w-64 shrink-0 border-l border-border bg-panel flex flex-col min-h-0 overflow-y-auto overflow-x-hidden scrollbar-slim"
      data-testid="side-panel"
    >
      <ColorsSection />
      <PaletteSection />
      <TilesetsPanel />
      <LayersSection />
      <SlicesSection />
      <HistorySection />
    </aside>
  );
}

function loadStoredHeight(storageKey: string | undefined, fallback: number): number {
  if (!storageKey || typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function useResizableHeight(defaultHeight: number, storageKey?: string, minHeight = 60) {
  const [height, setHeight] = useState<number>(() => loadStoredHeight(storageKey, defaultHeight));
  const draggingRef = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startY.current = e.clientY;
    startH.current = height;
    setDragging(true);
    document.body.classList.add('section-resizing');
  }, [height]);

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = ev.clientY - startY.current;
      const next = Math.max(minHeight, startH.current + delta);
      setHeight(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.classList.remove('section-resizing');
      if (storageKey && typeof localStorage !== 'undefined') {
        try { localStorage.setItem(storageKey, String(Math.round(height))); } catch { /* ignore quota */ }
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [height, minHeight, storageKey]);

  return { height, dragging, onMouseDown };
}

export interface SectionProps {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** When true the section has a fixed, user-resizable height. */
  resizable?: boolean;
  /** Initial height in pixels when resizable. */
  defaultHeight?: number;
  /** localStorage key that persists the user-chosen height. */
  storageKey?: string;
  /** Minimum height while dragging. */
  minHeight?: number;
  testId?: string;
}

export function Section({
  title,
  right,
  children,
  resizable = false,
  defaultHeight = 180,
  storageKey,
  minHeight = 60,
  testId,
}: SectionProps) {
  const { height, dragging, onMouseDown } = useResizableHeight(defaultHeight, storageKey, minHeight);
  const style: CSSProperties | undefined = resizable
    ? { flex: `0 0 ${height}px`, height, maxHeight: height }
    : undefined;
  return (
    <div
      className="border-b border-border flex flex-col min-h-0 overflow-hidden"
      style={style}
      data-testid={testId}
    >
      <div className="px-2.5 h-7 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink/60 bg-panel2 shrink-0">
        <span>{title}</span>
        <span className="flex-1" />
        {right}
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-slim">{children}</div>
      {resizable && (
        <div
          className={clsx('section-resizer', dragging && 'is-dragging')}
          onMouseDown={onMouseDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Resize ${title} section`}
        />
      )}
    </div>
  );
}

function SlicesSection() {
  const slices = useEditorStore((s) => s.sprite.slices ?? EMPTY_SLICES);
  const selected = useEditorStore((s) => s.selectedSliceId);
  const select = useEditorStore((s) => s.selectSlice);
  const renameSlice = useEditorStore((s) => s.renameSlice);
  const deleteSlice = useEditorStore((s) => s.deleteSlice);
  return (
    <Section
      title={`Slices (${slices.length})`}
      resizable
      defaultHeight={110}
      minHeight={60}
      storageKey="tilestudio:sidepanel:slices-height"
    >
      {slices.length === 0 && (
        <p className="text-[11px] text-ink/50 px-2.5 py-2">
          Pick the slice tool (S) and drag a rectangle to create a slice.
        </p>
      )}
      <ul>
        {slices.map((sl) => {
          const active = sl.id === selected;
          return (
            <li
              key={sl.id}
              data-testid={`slice-${sl.id}`}
              onClick={() => select(sl.id)}
              className={clsx(
                'flex items-center gap-2 px-2 py-1 border-l-2 cursor-pointer text-[11px]',
                active ? 'bg-accent/10 border-accent' : 'border-transparent hover:bg-panel2',
              )}
            >
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sl.color }} />
              <input
                className="flex-1 bg-transparent text-[11px] outline-none focus:bg-panel2 px-0.5 rounded"
                value={sl.name}
                onChange={(e) => renameSlice(sl.id, e.target.value)}
                data-testid={`slice-${sl.id}-name`}
              />
              <button
                data-testid={`slice-${sl.id}-del`}
                onClick={(e) => { e.stopPropagation(); deleteSlice(sl.id); }}
                className="text-red-400 hover:text-red-300"
                title="Delete slice"
              >
                <Trash2 size={11} />
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
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
    <Section
      title="Color"
      resizable
      defaultHeight={88}
      minHeight={60}
      storageKey="tilestudio:sidepanel:color-height"
    >
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
        resizable
        defaultHeight={140}
        minHeight={60}
        storageKey="tilestudio:sidepanel:palette-height"
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
  const addGroup = useEditorStore((s) => s.addGroupLayer);
  const duplicate = useEditorStore((s) => s.duplicateLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const moveUp = useEditorStore((s) => s.moveLayerUp);
  const moveDown = useEditorStore((s) => s.moveLayerDown);
  const mergeDown = useEditorStore((s) => s.mergeLayerDown);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const setVisible = useEditorStore((s) => s.setLayerVisible);
  const setLocked = useEditorStore((s) => s.setLayerLocked);
  const setLayerParent = useEditorStore((s) => s.setLayerParent);
  const toggleGroupExpanded = useEditorStore((s) => s.toggleGroupExpanded);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tmlOpen, setTmlOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <>
      <Section
        title="Layers"
        resizable
        defaultHeight={180}
        minHeight={80}
        storageKey="tilestudio:sidepanel:layers-height"
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
                <button
                  data-testid="layer-add-group"
                  className="w-full flex items-center gap-2 px-2.5 py-1 text-left text-ink/80 hover:text-white hover:bg-panel"
                  onClick={() => { setMenuOpen(false); addGroup(); }}
                >
                  <Folder size={12} /> Group
                </button>
              </div>
            )}
          </div>
        }
      >
        <ul className="text-xs" data-testid="layers-list">
          {(() => {
            // Walk in reverse (top-to-bottom display order), indent by ancestor depth, and
            // collapse any children whose group is collapsed.
            const rows: { id: string; depth: number }[] = [];
            const depthFor = (layerId: string): number => {
              let d = 0;
              let cur = sprite.layers.find((l) => l.id === layerId);
              while (cur?.parentId) {
                d++;
                cur = sprite.layers.find((l) => l.id === cur!.parentId);
              }
              return d;
            };
            const anyAncestorCollapsed = (layerId: string): boolean => {
              let cur = sprite.layers.find((l) => l.id === layerId);
              while (cur?.parentId) {
                const p = sprite.layers.find((l) => l.id === cur!.parentId);
                if (!p) break;
                if (p.type === 'group' && p.expanded === false) return true;
                cur = p;
              }
              return false;
            };
            for (const id of sprite.layerOrder.slice().reverse()) {
              if (anyAncestorCollapsed(id)) continue;
              rows.push({ id, depth: depthFor(id) });
            }
            return rows.map(({ id, depth }) => {
              const l = sprite.layers.find((x) => x.id === id)!;
              const active = id === current;
              const mode = l.blendMode ?? 'normal';
              const isGroup = l.type === 'group';
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
                      const dropLayer = sprite.layers.find((x) => x.id === id);
                      if (e.shiftKey && dropLayer?.type === 'group') {
                        setLayerParent(dragId, id);
                      } else {
                        const toIdx = sprite.layerOrder.indexOf(id);
                        moveLayer(dragId, toIdx);
                      }
                    }
                    setDragId(null);
                  }}
                  onDragEnd={() => setDragId(null)}
                  className={clsx(
                    'px-2 py-1 flex items-center gap-2 border-l-2 cursor-pointer',
                    active ? 'bg-accent/10 border-accent' : 'border-transparent hover:bg-panel2',
                    dragId === id && 'opacity-50',
                  )}
                  style={{ paddingLeft: 8 + depth * 12 }}
                >
                  {isGroup ? (
                    <button
                      data-testid={`layer-${id}-toggle`}
                      onClick={(e) => { e.stopPropagation(); toggleGroupExpanded(id); }}
                      className="text-ink/70 hover:text-white"
                      title={(l as unknown as { expanded?: boolean }).expanded === false ? 'Expand' : 'Collapse'}
                    >
                      {(l as unknown as { expanded?: boolean }).expanded === false
                        ? <Folder size={12} />
                        : <FolderOpen size={12} />}
                    </button>
                  ) : null}
                  <button
                    onClick={(e) => { e.stopPropagation(); setVisible(l.id, !l.visible); }}
                    className="text-ink/70 hover:text-white"
                    title="Toggle visible"
                  >
                    {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    data-testid={`layer-${id}-lock`}
                    onClick={(e) => { e.stopPropagation(); setLocked(l.id, !l.locked); }}
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
            });
          })()}
        </ul>
      </Section>
      <NewTilemapLayerDialog open={tmlOpen} onClose={() => setTmlOpen(false)} />

      {ctx && (() => {
        const l = sprite.layers.find((x) => x.id === ctx.layerId);
        const idx = sprite.layerOrder.indexOf(ctx.layerId);
        const canMergeDown = l?.type === 'raster' && idx > 0 && sprite.layers.find((x) => x.id === sprite.layerOrder[idx - 1])?.type === 'raster';
        const groups = sprite.layers.filter((x) => x.type === 'group' && x.id !== ctx.layerId);
        return (
          <div
            className="fixed z-50 bg-panel2 border border-border rounded-md shadow-2xl py-1 text-xs min-w-[200px]"
            style={{ left: ctx.x, top: ctx.y }}
            onMouseLeave={() => setCtx(null)}
            data-testid="layer-ctx-menu"
          >
            <CtxItem testId="layer-ctx-duplicate" icon={<Copy size={12} />} label="Duplicate" onClick={() => { duplicate(ctx.layerId); setCtx(null); }} />
            <CtxItem testId="layer-ctx-merge" icon={<Merge size={12} />} label="Merge Down" onClick={() => { mergeDown(ctx.layerId); setCtx(null); }} disabled={!canMergeDown} />
            <CtxItem testId="layer-ctx-up" icon={<ChevronUp size={12} />} label="Move Up" onClick={() => { moveUp(ctx.layerId); setCtx(null); }} />
            <CtxItem testId="layer-ctx-down" icon={<ChevronDown size={12} />} label="Move Down" onClick={() => { moveDown(ctx.layerId); setCtx(null); }} />
            <div className="h-px bg-border my-1" />
            {l?.parentId && (
              <CtxItem testId="layer-ctx-ungroup" icon={<FolderOutput size={12} />} label="Move to Root" onClick={() => { setLayerParent(ctx.layerId, null); setCtx(null); }} />
            )}
            {groups.map((g) => (
              <CtxItem
                key={g.id}
                testId={`layer-ctx-into-${g.id}`}
                icon={<FolderInput size={12} />}
                label={`Move into ${g.name}`}
                onClick={() => { setLayerParent(ctx.layerId, g.id); setCtx(null); }}
              />
            ))}
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
  const seek = useEditorStore((s) => s.seekHistory);
  const total = undoStack.length + redoStack.length;
  const cursor = undoStack.length;
  return (
    <Section
      title={`History (${cursor}/${total})`}
      resizable
      defaultHeight={120}
      minHeight={60}
      storageKey="tilestudio:sidepanel:history-height"
    >
      <ul className="text-[11px] font-mono text-ink/80" data-testid="history-list">
        {cursor === 0 && <li className="px-2 py-2 text-ink/40">No edits yet</li>}
        {undoStack.map((p, i) => (
          <li
            key={i}
            data-testid={`history-entry-${i}`}
            onClick={() => seek(i + 1)}
            className="px-2 py-0.5 flex justify-between cursor-pointer hover:bg-panel2"
          >
            <span>{p.label}</span>
            <span className="text-ink/40">{p.newColors.size}px</span>
          </li>
        ))}
        {redoStack.length > 0 && (
          <li
            data-testid="history-redo-hint"
            className="px-2 py-0.5 text-ink/40 italic border-t border-border/40"
          >
            {redoStack.length} redo step{redoStack.length !== 1 ? 's' : ''} available
          </li>
        )}
      </ul>
    </Section>
  );
}

function u32ToCss(c: number): string {
  const r = c & 0xff, g = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff, a = (c >>> 24) & 0xff;
  return `rgba(${r},${g},${b},${a / 255})`;
}
