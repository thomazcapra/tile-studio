import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';

// Rasterizes text via Canvas 2D and stamps it into the active cel at the click position.
export function TextDialog({ open, x, y, onClose }: { open: boolean; x: number; y: number; onClose: () => void }) {
  const primary = useEditorStore((s) => s.primary);
  const [text, setText] = useState('Hello');
  const [size, setSize] = useState(12);
  const [family, setFamily] = useState('monospace');

  useEffect(() => { if (open) { setText('Hello'); setSize(12); setFamily('monospace'); } }, [open]);

  function apply() {
    const s = useEditorStore.getState();
    const img = s.activeImage();
    const cel = s.activeCel();
    if (!img || !cel) { toast.error('No raster layer'); return; }

    // Render the text into a temp canvas at 1×.
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d')!;
    tctx.font = `${size}px ${family}`;
    const metrics = tctx.measureText(text);
    const tw = Math.max(1, Math.ceil(metrics.width));
    const th = Math.max(1, Math.ceil(size * 1.2));
    tmp.width = tw;
    tmp.height = th;
    const ctx = tmp.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.font = `${size}px ${family}`;
    const r = primary & 0xff;
    const g = (primary >>> 8) & 0xff;
    const b = (primary >>> 16) & 0xff;
    const a = (primary >>> 24) & 0xff;
    ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
    ctx.textBaseline = 'top';
    ctx.fillText(text, 0, 0);

    const data = ctx.getImageData(0, 0, tw, th).data;
    const src = new Uint32Array(data.buffer.slice(0));
    // Stamp into cel, honoring selection mask (if any).
    const sel = s.selection;
    for (let yy = 0; yy < th; yy++) {
      for (let xx = 0; xx < tw; xx++) {
        const c = src[yy * tw + xx];
        if (((c >>> 24) & 0xff) === 0) continue;
        const spriteX = x + xx;
        const spriteY = y + yy;
        if (sel && (sel.mask[spriteY * sel.w + spriteX] === 0)) continue;
        const lx = spriteX - cel.x;
        const ly = spriteY - cel.y;
        if (lx < 0 || ly < 0 || lx >= img.w || ly >= img.h) continue;
        img.data[ly * img.w + lx] = c;
      }
    }
    s.markDirty();
    toast.success(`Stamped "${text.slice(0, 20)}${text.length > 20 ? '…' : ''}"`);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Text at (${x}, ${y})`}>
      <DialogField label="Text">
        <input
          data-testid="tx-text"
          autoFocus
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); apply(); } }}
        />
      </DialogField>
      <DialogField label="Size">
        <NumberInput value={size} onChange={setSize} min={6} max={128} />
      </DialogField>
      <DialogField label="Font">
        <select
          data-testid="tx-font"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
        >
          <option value="monospace">monospace</option>
          <option value="sans-serif">sans-serif</option>
          <option value="serif">serif</option>
          <option value="system-ui">system-ui</option>
          <option value="'Courier New', monospace">Courier New</option>
          <option value="'Press Start 2P', monospace">Press Start 2P (fallback)</option>
        </select>
      </DialogField>
      <div className="text-[10px] text-ink/60 font-mono">
        Sharp-edged rasterization. Colors come from the active primary swatch.
      </div>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="tx-apply" onClick={apply}>Stamp</Button>
      </DialogActions>
    </Dialog>
  );
}
