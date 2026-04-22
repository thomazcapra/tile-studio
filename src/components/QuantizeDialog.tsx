import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField } from './Dialog';
import { useEditorStore } from '../store/editor';
import { quantizeAsync } from '../color/quantize-async';
import { quantize } from '../color/quantize';

export function QuantizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const currentLayerId = useEditorStore((s) => s.currentLayerId);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const apply = useEditorStore((s) => s.applyQuantizedLayer);

  const rasterLayers = useMemo(() => sprite.layers.filter((l) => l.type === 'raster'), [sprite.layers]);
  const [layerId, setLayerId] = useState<string>(currentLayerId ?? rasterLayers[0]?.id ?? '');
  const [maxColors, setMaxColors] = useState(16);
  const [dither, setDither] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [previewStats, setPreviewStats] = useState<{ colors: number; ms: number } | null>(null);

  const layer = rasterLayers.find((l) => l.id === layerId) ?? rasterLayers[0];
  const cel = layer ? sprite.cels.find((c) => c.layerId === layer.id && c.frame === currentFrame) : null;
  const image = cel && cel.image.colorMode === 'rgba' ? cel.image : null;

  // Live preview: run a fast synchronous quantization at a downscaled size for low latency.
  useEffect(() => {
    if (!open || !image) { setPreviewStats(null); return; }
    const c = previewRef.current;
    if (!c) return;

    const previewW = Math.min(image.w, 128);
    const previewH = Math.round((previewW / image.w) * image.h);
    c.width = previewW;
    c.height = previewH;
    const ctx = c.getContext('2d')!;

    // Nearest-neighbor downscale the source.
    const tmp = document.createElement('canvas');
    tmp.width = image.w; tmp.height = image.h;
    const timage = new ImageData(image.w, image.h);
    new Uint32Array(timage.data.buffer).set(image.data);
    tmp.getContext('2d')!.putImageData(timage, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, previewW, previewH);
    const down = ctx.getImageData(0, 0, previewW, previewH);
    const downImg = {
      colorMode: 'rgba' as const,
      w: previewW,
      h: previewH,
      data: new Uint32Array(down.data.buffer.slice(0)),
    };

    const t0 = performance.now();
    const r = quantize(downImg, { maxColors, dither });
    const ms = Math.round(performance.now() - t0);

    const outImg = new ImageData(previewW, previewH);
    new Uint32Array(outImg.data.buffer).set(r.remappedRGBA);
    ctx.putImageData(outImg, 0, 0);
    setPreviewStats({ colors: r.colorsFound, ms });
  }, [open, image, maxColors, dither]);

  async function submit() {
    if (!layer || !image) { toast.error('No raster layer to quantize'); return; }
    setRunning(true);
    setProgress(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    try {
      const r = await quantizeAsync(image, { maxColors, dither }, (f) => setProgress(f), ctrl.signal);
      const ok = apply(layer.id, r.palette, r.remappedRGBA);
      if (!ok) { toast.error('Failed to apply palette'); return; }
      const elapsed = Math.round(performance.now() - t0);
      toast.success(`Quantized to ${r.colorsFound} colors in ${elapsed}ms`);
      onClose();
    } catch (err) {
      if ((err as Error).name === 'AbortError') toast('Cancelled');
      else toast.error(`Quantize failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
      setProgress(0);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <Dialog open={open} onClose={running ? () => {} : onClose} title="Reduce Colors">
      {rasterLayers.length === 0 || !image ? (
        <p className="text-xs text-ink/70">No raster layer available.</p>
      ) : (
        <>
          <DialogField label="Source layer">
            <select
              data-testid="q-layer"
              value={layer?.id ?? ''}
              onChange={(e) => setLayerId(e.target.value)}
              disabled={running}
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
            >
              {rasterLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </DialogField>
          <DialogField label={`Colors (${maxColors})`}>
            <input
              data-testid="q-colors"
              type="range"
              min={2}
              max={256}
              step={1}
              value={maxColors}
              onChange={(e) => setMaxColors(parseInt(e.target.value, 10))}
              disabled={running}
              className="w-full accent-[#3794ff]"
            />
          </DialogField>
          <DialogField label="Dither">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
              <input
                data-testid="q-dither"
                type="checkbox"
                checked={dither}
                onChange={(e) => setDither(e.target.checked)}
                disabled={running}
              />
              Floyd-Steinberg error diffusion
            </label>
          </DialogField>
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-panel2 p-1">
              <canvas
                ref={previewRef}
                data-testid="q-preview"
                className="block"
                style={{ imageRendering: 'pixelated', width: 128, height: 'auto' }}
              />
            </div>
            <div className="flex flex-col gap-1 text-[10px] font-mono text-ink/60">
              <span>Preview</span>
              {previewStats && (
                <>
                  <span data-testid="q-preview-stats">{previewStats.colors} colors</span>
                  <span>~{previewStats.ms}ms</span>
                </>
              )}
            </div>
          </div>
          {running && (
            <div className="flex flex-col gap-1.5 mt-1" data-testid="q-progress">
              <div className="h-1.5 w-full bg-panel2 rounded overflow-hidden">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="text-[10px] text-ink/60 font-mono">
                {Math.round(progress * 100)}% — quantizing in worker
              </span>
            </div>
          )}
        </>
      )}
      <DialogActions>
        {running ? (
          <Button testId="q-cancel" onClick={cancel}>Cancel</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" testId="q-submit" onClick={submit}>Apply</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
