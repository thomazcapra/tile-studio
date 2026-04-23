import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';
import { decodePNG, pickFile } from '../io/png';
import { newSprite, nextId } from '../model/factory';
import type { Cel, ImageRGBA } from '../model/types';

// Slices an imported sprite-sheet image into a new sprite with one frame per tile.
export function ImportSpriteSheetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const replaceSprite = useEditorStore((s) => s.replaceSprite);
  const [source, setSource] = useState<ImageRGBA | null>(null);
  const [fileName, setFileName] = useState('Imported');
  const [tw, setTw] = useState(16);
  const [th, setTh] = useState(16);
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [spacingX, setSpacingX] = useState(0);
  const [spacingY, setSpacingY] = useState(0);
  const [frameDuration, setFrameDuration] = useState(100);
  const [trimEmpty, setTrimEmpty] = useState(true);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) { setSource(null); return; }
  }, [open]);

  const grid = useMemo(() => {
    if (!source) return { cols: 0, rows: 0 };
    const cols = Math.max(0, Math.floor((source.w - offX + spacingX) / (tw + spacingX)));
    const rows = Math.max(0, Math.floor((source.h - offY + spacingY) / (th + spacingY)));
    return { cols, rows };
  }, [source, tw, th, offX, offY, spacingX, spacingY]);

  useEffect(() => {
    if (!source) return;
    const c = previewRef.current;
    if (!c) return;
    const W = Math.min(source.w, 220);
    const scale = W / source.w;
    const H = Math.round(source.h * scale);
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const tmp = document.createElement('canvas');
    tmp.width = source.w; tmp.height = source.h;
    const id = new ImageData(source.w, source.h);
    new Uint32Array(id.data.buffer).set(source.data);
    tmp.getContext('2d')!.putImageData(id, 0, 0);
    ctx.drawImage(tmp, 0, 0, W, H);
    // Overlay grid.
    ctx.strokeStyle = '#3794ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r < grid.rows; r++) {
      for (let col = 0; col < grid.cols; col++) {
        const sx = (offX + col * (tw + spacingX)) * scale;
        const sy = (offY + r * (th + spacingY)) * scale;
        ctx.rect(sx + 0.5, sy + 0.5, tw * scale - 1, th * scale - 1);
      }
    }
    ctx.stroke();
  }, [source, grid, tw, th, offX, offY, spacingX, spacingY]);

  async function pick() {
    const f = await pickFile('image/png,image/*');
    if (!f) return;
    try {
      const img = await decodePNG(f);
      setSource(img);
      setFileName(f.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      toast.error(`Failed to import: ${(err as Error).message}`);
    }
  }

  function apply() {
    if (!source) { toast.error('Pick an image first'); return; }
    const count = grid.cols * grid.rows;
    if (count <= 0) { toast.error('No frames fit with these dimensions'); return; }

    const sprite = newSprite(tw, th, fileName);
    const layer = sprite.layers[0];
    // Blow away the default blank cel; we'll replace with per-frame cels.
    sprite.cels = [];
    sprite.frames = [];
    let emitted = 0;
    for (let r = 0; r < grid.rows; r++) {
      for (let col = 0; col < grid.cols; col++) {
        const sx = offX + col * (tw + spacingX);
        const sy = offY + r * (th + spacingY);
        const data = new Uint32Array(tw * th);
        let hasContent = false;
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            const gx = sx + x, gy = sy + y;
            if (gx < 0 || gy < 0 || gx >= source.w || gy >= source.h) continue;
            const c = source.data[gy * source.w + gx];
            data[y * tw + x] = c;
            if (((c >>> 24) & 0xff) !== 0) hasContent = true;
          }
        }
        if (trimEmpty && !hasContent) continue;
        const frameIdx = emitted++;
        sprite.frames.push({ duration: frameDuration });
        const cel: Cel = {
          id: nextId('cel'),
          layerId: layer.id,
          frame: frameIdx,
          x: 0,
          y: 0,
          opacity: 255,
          image: { colorMode: 'rgba', w: tw, h: th, data },
        };
        sprite.cels.push(cel);
      }
    }
    if (sprite.frames.length === 0) {
      toast.error('All frames were empty — tweak the slice parameters');
      return;
    }
    replaceSprite(sprite);
    const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
    if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
    toast.success(`Imported ${sprite.frames.length} frames from ${fileName}`);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Import Sprite Sheet">
      {!source ? (
        <>
          <p className="text-[11px] text-ink/70">Pick an image file to slice into frames.</p>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" testId="iss-pick" onClick={pick}>Choose image…</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogField label="Frame width">
            <NumberInput value={tw} onChange={setTw} min={1} max={1024} />
          </DialogField>
          <DialogField label="Frame height">
            <NumberInput value={th} onChange={setTh} min={1} max={1024} />
          </DialogField>
          <DialogField label="Offset X">
            <NumberInput value={offX} onChange={setOffX} min={0} max={1024} />
          </DialogField>
          <DialogField label="Offset Y">
            <NumberInput value={offY} onChange={setOffY} min={0} max={1024} />
          </DialogField>
          <DialogField label="Spacing X">
            <NumberInput value={spacingX} onChange={setSpacingX} min={0} max={64} />
          </DialogField>
          <DialogField label="Spacing Y">
            <NumberInput value={spacingY} onChange={setSpacingY} min={0} max={64} />
          </DialogField>
          <DialogField label="Duration (ms)">
            <NumberInput value={frameDuration} onChange={setFrameDuration} min={10} max={10_000} />
          </DialogField>
          <DialogField label="Trim empty">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
              <input
                data-testid="iss-trim"
                type="checkbox"
                checked={trimEmpty}
                onChange={(e) => setTrimEmpty(e.target.checked)}
              />
              Skip fully-transparent frames
            </label>
          </DialogField>
          <div className="rounded-md border border-border bg-panel2 p-1 flex justify-center">
            <canvas ref={previewRef} data-testid="iss-preview" className="block" style={{ imageRendering: 'pixelated' }} />
          </div>
          <p className="text-[10px] text-ink/60 font-mono" data-testid="iss-summary">
            {grid.cols}×{grid.rows} = {grid.cols * grid.rows} frames · {tw}×{th} px each
          </p>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" testId="iss-apply" onClick={apply}>Import</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
