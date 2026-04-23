import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2, Sparkles, Upload, Download, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField } from './Dialog';
import { useEditorStore } from '../store/editor';
import { PALETTE_PRESETS, packPreset } from '../model/palette-presets';
import { packRGBA, unpackRGBA } from '../render/image-ops';
import { paletteToGPL, paletteToPAL, paletteToHex, parsePaletteFile } from '../io/palette-io';
import { downloadBlob, pickFile } from '../io/png';

export function PaletteEditorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const palette = useEditorStore((s) => s.sprite.palette);
  const addColor = useEditorStore((s) => s.addPaletteColor);
  const removeColor = useEditorStore((s) => s.removePaletteColor);
  const setColor = useEditorStore((s) => s.setPaletteColor);
  const reorder = useEditorStore((s) => s.reorderPaletteColor);
  const setPalette = useEditorStore((s) => s.setPalette);

  const [selected, setSelected] = useState(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => { if (!open) return; setSelected(0); }, [open]);

  function applyPreset(presetName: string) {
    const p = PALETTE_PRESETS.find((x) => x.name === presetName);
    if (!p) return;
    const packed = new Uint32Array(p.colors.map(packPreset));
    setPalette(packed);
    toast(`Loaded preset: ${p.name} (${p.colors.length} colors)`);
  }

  async function onImport() {
    const f = await pickFile('.gpl,.pal,.hex,.txt,text/plain');
    if (!f) return;
    try {
      const text = await f.text();
      const colors = parsePaletteFile(f.name, text);
      setPalette(colors);
      toast.success(`Imported ${f.name} (${colors.length} colors)`);
    } catch (err) {
      toast.error(`Palette import failed: ${(err as Error).message}`);
    }
  }

  function onExport(kind: 'gpl' | 'pal' | 'hex') {
    const text =
      kind === 'gpl' ? paletteToGPL(palette.colors, 'Tile Studio')
      : kind === 'pal' ? paletteToPAL(palette.colors)
      : paletteToHex(palette.colors);
    const mime = kind === 'pal' ? 'application/octet-stream' : 'text/plain';
    downloadBlob(new Blob([text], { type: mime }), `palette.${kind}`);
    toast.success(`Saved palette.${kind}`);
  }

  function sortBy(mode: 'hue' | 'luma' | 'lightness') {
    const arr = Array.from(palette.colors).map((c) => {
      const r = c & 0xff, g = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const v = max / 255, s = max === 0 ? 0 : (max - min) / max;
      let h = 0;
      if (max !== min) {
        const d = max - min;
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
      }
      // Rec.601 luma.
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const lightness = (max + min) / 2;
      let key: number;
      if (mode === 'hue') key = h * 1e6 + s * 1e3 + v;
      else if (mode === 'luma') key = luma;
      else key = lightness;
      return { c, key };
    });
    arr.sort((a, b) => a.key - b.key);
    setPalette(new Uint32Array(arr.map((x) => x.c)));
    toast(`Sorted palette by ${mode}`);
  }

  const current = palette.colors[selected] ?? 0;

  return (
    <Dialog open={open} onClose={onClose} title="Palette">
      <DialogField label="Preset">
        <select
          data-testid="pe-preset"
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          onChange={(e) => { if (e.target.value) applyPreset(e.target.value); e.target.value = ''; }}
          defaultValue=""
        >
          <option value="" disabled>Load preset…</option>
          {PALETTE_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name} ({p.colors.length})</option>
          ))}
        </select>
      </DialogField>

      <div className="flex flex-wrap gap-1 text-[11px]">
        <button
          data-testid="pe-import"
          onClick={onImport}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-panel hover:text-white text-ink/80"
          title="Import .gpl / .pal / .hex"
        >
          <Upload size={11} /> Import…
        </button>
        <button
          data-testid="pe-export-gpl"
          onClick={() => onExport('gpl')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-panel hover:text-white text-ink/80"
          title="GIMP .gpl"
        >
          <Download size={11} /> .gpl
        </button>
        <button
          data-testid="pe-export-pal"
          onClick={() => onExport('pal')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-panel hover:text-white text-ink/80"
          title="JASC .pal"
        >
          <Download size={11} /> .pal
        </button>
        <button
          data-testid="pe-export-hex"
          onClick={() => onExport('hex')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-panel hover:text-white text-ink/80"
          title="HEX list"
        >
          <Download size={11} /> .hex
        </button>
        <button
          data-testid="pe-sort-hue"
          onClick={() => sortBy('hue')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-panel hover:text-white text-ink/80"
          title="Sort by hue/saturation/value"
        >
          <ArrowUpDown size={11} /> Sort hue
        </button>
        <button
          data-testid="pe-sort-luma"
          onClick={() => sortBy('luma')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-panel hover:text-white text-ink/80"
          title="Sort by luma (Rec.601)"
        >
          <ArrowUpDown size={11} /> Sort luma
        </button>
        <button
          data-testid="pe-sort-lightness"
          onClick={() => sortBy('lightness')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-panel hover:text-white text-ink/80"
          title="Sort by HSL lightness"
        >
          <ArrowUpDown size={11} /> Sort light
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-ink/60 flex-1">Swatches ({palette.colors.length})</span>
        <button
          data-testid="pe-add"
          onClick={() => { addColor(current, selected + 1); setSelected(selected + 1); }}
          className="text-ink/70 hover:text-white flex items-center gap-1 text-[11px]"
          title="Duplicate selected swatch"
        >
          <Plus size={12} /> Add
        </button>
        <button
          data-testid="pe-remove"
          onClick={() => { removeColor(selected); setSelected(Math.max(0, selected - 1)); }}
          disabled={palette.colors.length <= 1}
          className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Remove selected"
        >
          <Trash2 size={12} /> Remove
        </button>
      </div>

      <div
        className="grid grid-cols-8 gap-[3px] p-2 bg-panel2 rounded border border-border max-h-52 overflow-auto"
        data-testid="pe-grid"
      >
        {Array.from(palette.colors).map((c, i) => (
          <button
            key={i}
            data-testid={`pe-swatch-${i}`}
            onClick={() => setSelected(i)}
            draggable
            onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { if (dragIdx != null && dragIdx !== i) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
            onDrop={(e) => { e.preventDefault(); if (dragIdx != null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
            onDragEnd={() => setDragIdx(null)}
            className={clsx(
              'aspect-square rounded-sm border',
              selected === i ? 'border-white ring-2 ring-accent' : 'border-black/40 hover:ring-2 hover:ring-accent/60',
              dragIdx === i && 'opacity-50',
            )}
            style={{ background: u32ToCss(c) }}
            title={`#${i}`}
          />
        ))}
      </div>

      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded border border-black/50 mt-1" style={{ background: u32ToCss(current) }} />
        <div className="flex-1 relative">
          <div className="text-[10px] uppercase tracking-wider text-ink/60 mb-1">Edit swatch #{selected}</div>
          <InlinePicker value={current} onChange={(c) => setColor(selected, c)} />
        </div>
      </div>

      <DialogActions>
        <span className="flex-1 text-[10px] text-ink/50 inline-flex items-center gap-1"><Sparkles size={10} /> Tip: drag to reorder</span>
        <Button variant="primary" testId="pe-close" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

function InlinePicker({ value, onChange }: { value: number; onChange: (c: number) => void }) {
  const [r, g, b, a] = unpackRGBA(value);
  const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <input
        data-testid="pe-hex"
        className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
        value={hex}
        onChange={(e) => {
          const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(e.target.value.trim());
          if (!m) return;
          let h = m[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join('');
          onChange(packRGBA(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a));
        }}
      />
      <div className="flex gap-1">
        {(['R', 'G', 'B'] as const).map((ch, i) => (
          <label key={ch} className="flex-1 flex items-center gap-1">
            <span className="text-ink/60 w-3">{ch}</span>
            <input
              data-testid={`pe-rgb-${ch.toLowerCase()}`}
              type="number"
              min={0}
              max={255}
              value={[r, g, b][i]}
              onChange={(e) => {
                const v = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                const rgb = [r, g, b]; rgb[i] = v;
                onChange(packRGBA(rgb[0], rgb[1], rgb[2], a));
              }}
              className="w-full bg-panel2 border border-border rounded px-1 py-0.5 font-mono text-[10px]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function u32ToCss(c: number): string {
  const r = c & 0xff, g = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff, a = (c >>> 24) & 0xff;
  return `rgba(${r},${g},${b},${a / 255})`;
}
