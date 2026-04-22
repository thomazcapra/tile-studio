import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';

export function SpriteSizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const scale = useEditorStore((s) => s.scaleSprite);
  const [w, setW] = useState(sprite.w);
  const [h, setH] = useState(sprite.h);
  const [lock, setLock] = useState(true);

  useEffect(() => { if (open) { setW(sprite.w); setH(sprite.h); setLock(true); } }, [open, sprite.w, sprite.h]);

  function onW(newW: number) {
    setW(newW);
    if (lock) setH(Math.max(1, Math.round((newW / sprite.w) * sprite.h)));
  }
  function onH(newH: number) {
    setH(newH);
    if (lock) setW(Math.max(1, Math.round((newH / sprite.h) * sprite.w)));
  }

  function preset(scalePct: number) {
    const nw = Math.max(1, Math.round(sprite.w * scalePct));
    const nh = Math.max(1, Math.round(sprite.h * scalePct));
    setW(nw); setH(nh);
  }

  function apply() {
    if (!scale(w, h)) { onClose(); return; }
    toast.success(`Scaled sprite → ${w}×${h}`);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Sprite Size (Scale)">
      <DialogField label="Width">
        <NumberInput value={w} onChange={onW} min={1} max={8192} />
      </DialogField>
      <DialogField label="Height">
        <NumberInput value={h} onChange={onH} min={1} max={8192} />
      </DialogField>
      <DialogField label="Lock ratio">
        <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
          <input
            data-testid="ss-lock"
            type="checkbox"
            checked={lock}
            onChange={(e) => setLock(e.target.checked)}
          />
          Keep aspect ratio
        </label>
      </DialogField>
      <DialogField label="Presets">
        <div className="flex gap-1">
          {[0.5, 1, 2, 4, 8].map((p) => (
            <button
              key={p}
              data-testid={`ss-preset-${p}`}
              onClick={() => preset(p)}
              className="flex-1 py-1 rounded text-[10px] font-mono bg-panel2 text-ink/70 hover:text-white hover:bg-[#2d2d30]"
            >
              {p === 1 ? '1×' : p < 1 ? `${p * 100}%` : `${p}×`}
            </button>
          ))}
        </div>
      </DialogField>
      <div className="text-[10px] text-ink/60 font-mono">
        Nearest-neighbor. Raster layers scale; tilemap layers keep their tile dimensions.
      </div>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="ss-apply" onClick={apply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
