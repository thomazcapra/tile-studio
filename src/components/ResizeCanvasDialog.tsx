import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore, type Anchor } from '../store/editor';

const ANCHORS: Anchor[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
const LABELS: Record<Anchor, string> = { nw: '↖', n: '↑', ne: '↗', w: '←', c: '·', e: '→', sw: '↙', s: '↓', se: '↘' };

export function ResizeCanvasDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const resize = useEditorStore((s) => s.resizeCanvas);
  const [w, setW] = useState(sprite.w);
  const [h, setH] = useState(sprite.h);
  const [anchor, setAnchor] = useState<Anchor>('c');

  useEffect(() => { if (open) { setW(sprite.w); setH(sprite.h); setAnchor('c'); } }, [open, sprite.w, sprite.h]);

  function apply() {
    if (w === sprite.w && h === sprite.h) { onClose(); return; }
    resize(w, h, anchor);
    toast.success(`Canvas → ${w}×${h}`);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Canvas Size">
      <DialogField label="Width">
        <NumberInput value={w} onChange={setW} min={1} max={8192} />
      </DialogField>
      <DialogField label="Height">
        <NumberInput value={h} onChange={setH} min={1} max={8192} />
      </DialogField>
      <DialogField label="Anchor">
        <div className="grid grid-cols-3 gap-1 w-24" data-testid="rc-anchor-grid">
          {ANCHORS.map((a) => (
            <button
              key={a}
              data-testid={`rc-anchor-${a}`}
              onClick={() => setAnchor(a)}
              className={clsx(
                'h-7 rounded text-[11px] font-mono',
                anchor === a ? 'bg-accent/30 text-white ring-1 ring-accent' : 'bg-panel2 text-ink/70 hover:text-white'
              )}
            >
              {LABELS[a]}
            </button>
          ))}
        </div>
      </DialogField>
      <div className="text-[10px] text-ink/60 font-mono">
        Anchor chooses which edge stays put; the other edges expand or crop.
      </div>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="rc-apply" onClick={apply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
