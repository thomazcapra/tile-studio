import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Play, Pause, SkipBack, SkipForward, Plus, Copy, Trash2, Repeat, Tag as TagIcon, Layers as LayersIcon } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useEditorStore } from '../store/editor';
import { imageRGBAToImageData } from '../render/composite';
import type { TagDirection } from '../model/types';

// Horizontal timeline: top strip of playback controls + frames header, then per-layer rows
// with per-cel thumbnails.
export function Timeline() {
  const sprite = useEditorStore((s) => s.sprite);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const currentLayerId = useEditorStore((s) => s.currentLayerId);
  const dirtyTick = useEditorStore((s) => s.dirtyTick);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
  const addFrame = useEditorStore((s) => s.addFrame);
  const duplicateFrame = useEditorStore((s) => s.duplicateFrame);
  const deleteFrame = useEditorStore((s) => s.deleteFrame);
  const setFrameDuration = useEditorStore((s) => s.setFrameDuration);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const nextFrame = useEditorStore((s) => s.nextFrame);
  const prevFrame = useEditorStore((s) => s.prevFrame);
  const loopPlayback = useEditorStore((s) => s.loopPlayback);
  const setLoopPlayback = useEditorStore((s) => s.setLoopPlayback);
  const playbackSpeed = useEditorStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useEditorStore((s) => s.setPlaybackSpeed);
  const setCurrentLayer = useEditorStore((s) => s.setCurrentLayer);
  const onionSkinEnabled = useEditorStore((s) => s.onionSkinEnabled);
  const toggleOnionSkin = useEditorStore((s) => s.toggleOnionSkin);
  const addTag = useEditorStore((s) => s.addTag);
  const deleteTag = useEditorStore((s) => s.deleteTag);
  const updateTag = useEditorStore((s) => s.updateTag);
  const moveFrame = useEditorStore((s) => s.moveFrame);
  const tags = sprite.tags ?? [];

  const [menu, setMenu] = useState<{ x: number; y: number; frame: number } | null>(null);
  const [editingDurationFor, setEditingDurationFor] = useState<number | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [dragFrame, setDragFrame] = useState<number | null>(null);

  const frameCount = sprite.frames.length;
  const cellSize = 32;

  // Long-press → frame context menu (touch / pen).
  const lpRef = useRef<{ timer: number | null; pid: number | null; sx: number; sy: number }>({ timer: null, pid: null, sx: 0, sy: 0 });
  const cancelLP = useCallback(() => {
    if (lpRef.current.timer != null) { clearTimeout(lpRef.current.timer); lpRef.current.timer = null; }
    lpRef.current.pid = null;
  }, []);
  const startLP = useCallback((e: ReactPointerEvent, frame: number) => {
    if (e.pointerType === 'mouse') return;
    cancelLP();
    lpRef.current.pid = e.pointerId;
    lpRef.current.sx = e.clientX;
    lpRef.current.sy = e.clientY;
    const x = e.clientX, y = e.clientY;
    lpRef.current.timer = window.setTimeout(() => {
      lpRef.current.timer = null;
      setMenu({ x, y, frame });
    }, 500);
  }, [cancelLP]);
  const moveLP = useCallback((e: ReactPointerEvent) => {
    if (lpRef.current.timer == null || lpRef.current.pid !== e.pointerId) return;
    if (Math.abs(e.clientX - lpRef.current.sx) > 8 || Math.abs(e.clientY - lpRef.current.sy) > 8) cancelLP();
  }, [cancelLP]);

  return (
    <div className="flex flex-col border-t border-border bg-panel text-[11px]" data-testid="timeline">
      {/* Control strip */}
      <div className="h-8 flex items-center px-2 gap-1 border-b border-border">
        <button data-testid="tl-first" title="First frame" onClick={() => setCurrentFrame(0)} className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80"><SkipBack size={14} /></button>
        <button data-testid="tl-prev" title="Previous frame (←)" onClick={prevFrame} className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80 rotate-180"><SkipForward size={14} /></button>
        <button data-testid="tl-play" title={isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={togglePlay} className={clsx('w-7 h-7 rounded flex items-center justify-center', isPlaying ? 'bg-accent/25 text-white ring-1 ring-accent/60' : 'text-ink/80 hover:bg-panel2')}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button data-testid="tl-next" title="Next frame (→)" onClick={nextFrame} className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80"><SkipForward size={14} /></button>
        <button data-testid="tl-last" title="Last frame" onClick={() => setCurrentFrame(frameCount - 1)} className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80 rotate-180"><SkipBack size={14} /></button>

        <div className="w-px h-4 bg-border mx-1" />

        <button data-testid="tl-loop" title="Loop" onClick={() => setLoopPlayback(!loopPlayback)} className={clsx('w-7 h-7 rounded flex items-center justify-center', loopPlayback ? 'bg-accent/25 text-white ring-1 ring-accent/60' : 'text-ink/80 hover:bg-panel2')}>
          <Repeat size={14} />
        </button>
        <select
          data-testid="tl-speed"
          className="bg-panel2 border border-border rounded px-1 py-0.5 font-mono text-[10px]"
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
        >
          {[0.25, 0.5, 1, 1.5, 2, 3].map((v) => <option key={v} value={v}>{v}×</option>)}
        </select>

        <div className="w-px h-4 bg-border mx-1" />

        <button data-testid="tl-add-frame" title="New frame" onClick={() => addFrame(currentFrame, false)} className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80"><Plus size={14} /></button>
        <button data-testid="tl-dup-frame" title="Duplicate current frame" onClick={() => duplicateFrame(currentFrame)} className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80"><Copy size={14} /></button>
        <button data-testid="tl-del-frame" title="Delete current frame" onClick={() => deleteFrame(currentFrame)} className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80" disabled={frameCount <= 1}><Trash2 size={14} /></button>

        <div className="w-px h-4 bg-border mx-1" />

        <button
          data-testid="tl-onion"
          title="Onion skin (show ghosts of adjacent frames)"
          onClick={toggleOnionSkin}
          className={clsx('w-7 h-7 rounded flex items-center justify-center',
            onionSkinEnabled ? 'bg-accent/25 text-white ring-1 ring-accent/60' : 'text-ink/80 hover:bg-panel2')}
        >
          <LayersIcon size={14} />
        </button>
        <button
          data-testid="tl-add-tag"
          title="Create tag spanning the current frame"
          onClick={() => { const id = addTag(currentFrame, currentFrame); setEditingTagId(id); }}
          className="w-7 h-7 rounded hover:bg-panel2 flex items-center justify-center text-ink/80"
          disabled={frameCount < 1}
        >
          <TagIcon size={14} />
        </button>

        <div className="flex-1" />
        <span className="text-ink/60 font-mono" data-testid="tl-position">
          Frame {currentFrame + 1}/{frameCount} · {sprite.frames[currentFrame]?.duration ?? 0}ms
        </span>
      </div>

      {/* Grid: tag strip → header row with frame numbers → per-layer rows */}
      <div className="overflow-x-auto overflow-y-hidden">
        {/* Tag strip */}
        {tags.length > 0 && (
          <div className="flex border-b border-border/60" data-testid="tl-tag-strip">
            <div className="w-28 shrink-0 bg-panel2 border-r border-border/60 px-2 py-0.5 text-ink/60 text-[10px] uppercase tracking-wider">Tags</div>
            <div className="relative" style={{ width: sprite.frames.length * cellSize, height: 18 }}>
              {tags.map((t) => {
                const left = Math.min(t.from, t.to) * cellSize;
                const width = (Math.abs(t.to - t.from) + 1) * cellSize;
                return (
                  <div
                    key={t.id}
                    data-testid={`tl-tag-${t.id}`}
                    className="absolute top-0.5 bottom-0.5 rounded-sm text-[10px] font-mono text-white px-1 flex items-center gap-1 shadow-sm cursor-pointer hover:brightness-110"
                    style={{ left, width, background: t.color }}
                    onClick={() => setEditingTagId(t.id)}
                    title={`${t.name} · ${t.direction}`}
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="text-white/70">{directionGlyph(t.direction)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex border-b border-border/60">
          <div className="w-28 shrink-0 bg-panel2 border-r border-border/60 px-2 py-1 text-ink/60 text-[10px] uppercase tracking-wider">
            Layer / Frame
          </div>
          <div className="flex">
            {sprite.frames.map((f, i) => {
              const active = i === currentFrame;
              return (
                <button
                  key={i}
                  data-testid={`tl-frame-${i}`}
                  onClick={() => setCurrentFrame(i)}
                  onDoubleClick={() => setEditingDurationFor(i)}
                  onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, frame: i }); }}
                  onPointerDown={(e) => startLP(e, i)}
                  onPointerMove={moveLP}
                  onPointerUp={cancelLP}
                  onPointerCancel={cancelLP}
                  draggable
                  onDragStart={(e) => { setDragFrame(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
                  onDragOver={(e) => { if (dragFrame != null && dragFrame !== i) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                  onDrop={(e) => { e.preventDefault(); if (dragFrame != null && dragFrame !== i) { moveFrame(dragFrame, i); toast(`Moved frame ${dragFrame + 1} → ${i + 1}`); } setDragFrame(null); }}
                  onDragEnd={() => setDragFrame(null)}
                  style={{ width: cellSize }}
                  className={clsx(
                    'h-6 coarse:h-9 border-r border-border/40 text-[10px] font-mono flex items-center justify-center transition-colors',
                    active ? 'bg-accent/25 text-white' : 'bg-panel2 text-ink/60 hover:bg-panel',
                    dragFrame === i && 'opacity-50',
                  )}
                >
                  {editingDurationFor === i ? (
                    <input
                      autoFocus
                      type="number"
                      defaultValue={f.duration}
                      onBlur={(e) => { setFrameDuration(i, parseInt(e.target.value, 10) || 100); setEditingDurationFor(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full text-center bg-black/40 text-white text-[10px] outline-none"
                      min={10}
                      max={10000}
                    />
                  ) : (
                    i + 1
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        {sprite.layerOrder.slice().reverse().map((layerId) => {
          const layer = sprite.layers.find((l) => l.id === layerId);
          if (!layer) return null;
          const active = layerId === currentLayerId;
          return (
            <div key={layerId} className={clsx('flex border-b border-border/40', active && 'bg-accent/5')}>
              <button
                onClick={() => setCurrentLayer(layerId)}
                data-testid={`tl-layer-${layerId}`}
                className={clsx(
                  'w-28 shrink-0 border-r border-border/60 px-2 py-0.5 text-left text-[11px] truncate',
                  active ? 'text-white font-medium' : 'text-ink/75 hover:bg-panel2'
                )}
                style={{ height: cellSize }}
              >
                {layer.name}
              </button>
              <div className="flex">
                {sprite.frames.map((_, fi) => {
                  const cel = sprite.cels.find((c) => c.layerId === layerId && c.frame === fi);
                  const isCurrent = fi === currentFrame && layerId === currentLayerId;
                  return (
                    <button
                      key={fi}
                      data-testid={`tl-cel-${layerId}-${fi}`}
                      onClick={() => { setCurrentFrame(fi); setCurrentLayer(layerId); }}
                      style={{ width: cellSize, height: cellSize }}
                      className={clsx(
                        'border-r border-border/40 flex items-center justify-center transition-colors relative',
                        isCurrent ? 'bg-accent/20 ring-1 ring-inset ring-accent/70' : 'bg-panel2 hover:bg-panel'
                      )}
                    >
                      {cel ? <CelThumb cel={cel} size={cellSize - 4} dirtyTick={dirtyTick} /> : <span className="text-ink/20 text-[10px]">·</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {menu && (
        <div
          className="fixed z-50 bg-panel2 border border-border rounded-md shadow-2xl py-1 text-xs min-w-[160px]"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
          data-testid="tl-ctx-menu"
        >
          <MenuItem label="Duplicate frame" onClick={() => { duplicateFrame(menu.frame); setMenu(null); }} testId="tl-ctx-dup" />
          <MenuItem label="Delete frame" onClick={() => { deleteFrame(menu.frame); setMenu(null); }} disabled={frameCount <= 1} danger testId="tl-ctx-del" />
          <MenuItem label="Edit duration…" onClick={() => { setEditingDurationFor(menu.frame); setMenu(null); }} testId="tl-ctx-dur" />
        </div>
      )}

      {editingTagId && (() => {
        const t = tags.find((x) => x.id === editingTagId);
        if (!t) return null;
        return (
          <div
            className="fixed z-50 left-1/2 top-1/3 -translate-x-1/2 bg-panel2 border border-border rounded-lg shadow-2xl p-3 w-64 flex flex-col gap-2"
            data-testid="tl-tag-editor"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink/60">Tag</div>
            <input
              data-testid="tl-tag-name"
              className="w-full bg-panel border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
              value={t.name}
              onChange={(e) => updateTag(t.id, { name: e.target.value })}
            />
            <div className="flex gap-1 text-[11px]">
              <label className="flex items-center gap-1 flex-1">
                <span className="text-ink/60">From</span>
                <input
                  type="number"
                  min={0}
                  max={frameCount - 1}
                  value={t.from}
                  onChange={(e) => updateTag(t.id, { from: Math.max(0, Math.min(frameCount - 1, parseInt(e.target.value, 10) || 0)) })}
                  className="w-14 bg-panel border border-border rounded px-1 py-0.5 font-mono text-[11px]"
                />
              </label>
              <label className="flex items-center gap-1 flex-1">
                <span className="text-ink/60">To</span>
                <input
                  type="number"
                  min={0}
                  max={frameCount - 1}
                  value={t.to}
                  onChange={(e) => updateTag(t.id, { to: Math.max(0, Math.min(frameCount - 1, parseInt(e.target.value, 10) || 0)) })}
                  className="w-14 bg-panel border border-border rounded px-1 py-0.5 font-mono text-[11px]"
                />
              </label>
            </div>
            <div className="flex gap-1">
              {(['forward', 'reverse', 'pingpong'] as TagDirection[]).map((d) => (
                <button
                  key={d}
                  data-testid={`tl-tag-dir-${d}`}
                  onClick={() => updateTag(t.id, { direction: d })}
                  className={clsx(
                    'flex-1 py-1 rounded text-[10px] font-mono uppercase',
                    t.direction === d ? 'bg-accent/25 text-white ring-1 ring-accent/60' : 'bg-panel text-ink/70 hover:text-white'
                  )}
                >
                  {directionGlyph(d)} {d}
                </button>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              <div className="flex-1 flex gap-1">
                {['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'].map((c) => (
                  <button
                    key={c}
                    onClick={() => updateTag(t.id, { color: c })}
                    className="w-5 h-5 rounded-sm border border-black/50"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-1">
              <button data-testid="tl-tag-delete" className="px-2 py-1 text-[11px] rounded text-red-400 hover:text-red-300 hover:bg-panel" onClick={() => { deleteTag(t.id); setEditingTagId(null); }}>Delete</button>
              <button data-testid="tl-tag-close" className="px-2 py-1 text-[11px] rounded bg-accent text-white hover:bg-accent/90" onClick={() => setEditingTagId(null)}>Done</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function directionGlyph(d: TagDirection): string {
  switch (d) {
    case 'forward': return '→';
    case 'reverse': return '←';
    case 'pingpong': return '↔';
  }
}

function MenuItem({ label, onClick, disabled, danger, testId }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={clsx('w-full text-left px-2.5 py-1',
        disabled ? 'text-ink/35 cursor-not-allowed' :
        danger ? 'text-red-400 hover:text-red-300 hover:bg-panel' :
        'text-ink/85 hover:text-white hover:bg-panel'
      )}
    >
      {label}
    </button>
  );
}

function CelThumb({ cel, size, dirtyTick }: { cel: { image: { colorMode: string; w: number; h: number; data: Uint32Array | Uint8Array } }; size: number; dirtyTick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const img = cel.image;
    if (img.colorMode !== 'rgba') {
      // Tilemap or indexed — skip detailed thumb for now.
      c.width = 8; c.height = 8;
      c.getContext('2d')!.fillStyle = '#444';
      c.getContext('2d')!.fillRect(0, 0, 8, 8);
      return;
    }
    c.width = img.w; c.height = img.h;
    c.getContext('2d')!.putImageData(imageRGBAToImageData({ w: img.w, h: img.h, data: img.data as Uint32Array }), 0, 0);
  }, [cel, dirtyTick]);
  return <canvas ref={ref} style={{ width: size, height: size, imageRendering: 'pixelated' }} className="block" />;
}
