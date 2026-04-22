import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';
import { generateTilesetAsync } from '../tileset/generate-async';
import { pixelate } from '../color/pixelate';
import { quantize } from '../color/quantize';
import { quantizeAsync } from '../color/quantize-async';
import type { ImageRGBA } from '../model/types';

export function GenerateTilesetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const currentLayerId = useEditorStore((s) => s.currentLayerId);
  const apply = useEditorStore((s) => s.applyGeneratedTileset);
  const overwriteRasterLayer = useEditorStore((s) => s.overwriteRasterLayer);
  const applyQuantizedLayer = useEditorStore((s) => s.applyQuantizedLayer);

  const rasterLayers = useMemo(
    () => sprite.layers.filter((l) => l.type === 'raster'),
    [sprite.layers]
  );

  const [layerId, setLayerId] = useState<string>(currentLayerId ?? rasterLayers[0]?.id ?? '');
  const [tw, setTw] = useState(16);
  const [th, setTh] = useState(16);
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [matchFlips, setMatchFlips] = useState(true);
  const [hideSource, setHideSource] = useState(true);
  const [name, setName] = useState('Generated');

  // Preprocessing controls.
  const [pixelateOn, setPixelateOn] = useState(false);
  const [pixelateSize, setPixelateSize] = useState(128);
  const [quantizeOn, setQuantizeOn] = useState(false);
  const [quantizeColors, setQuantizeColors] = useState(16);
  const [commitPreprocess, setCommitPreprocess] = useState(true);

  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [previewStats, setPreviewStats] = useState<{ estUnique: number; estPct: number } | null>(null);

  const layer = rasterLayers.find((l) => l.id === layerId) ?? rasterLayers[0];
  const cel = layer ? sprite.cels.find((c) => c.layerId === layer.id && c.frame === 0) : null;
  const sourceImage: ImageRGBA | null = cel && cel.image.colorMode === 'rgba' ? cel.image : null;

  // Live preview: run the pipeline on a downscaled copy for snappy feedback.
  useEffect(() => {
    if (!open || !sourceImage) { setPreviewStats(null); return; }
    const c = previewRef.current;
    if (!c) return;
    const id = window.setTimeout(() => {
      const preview = runPipelinePreview(sourceImage, {
        pixelateOn, pixelateSize, quantizeOn, quantizeColors, tw, th, matchFlips,
      });
      c.width = preview.w;
      c.height = preview.h;
      const ctx = c.getContext('2d')!;
      const d = new ImageData(preview.w, preview.h);
      new Uint32Array(d.data.buffer).set(preview.data);
      ctx.putImageData(d, 0, 0);
      setPreviewStats({ estUnique: preview.estUnique, estPct: preview.estDedupPct });
    }, 50);
    return () => window.clearTimeout(id);
  }, [open, sourceImage, pixelateOn, pixelateSize, quantizeOn, quantizeColors, tw, th, matchFlips]);

  async function submit() {
    if (!layer || !sourceImage) { toast.error('No raster layer available'); return; }
    setRunning(true);
    setProgress(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    try {
      // Step 1: pixelate (sync, canvas-accelerated).
      let workingImage: ImageRGBA = sourceImage;
      if (pixelateOn) {
        workingImage = pixelate(workingImage, pixelateSize);
      }
      setProgress(0.15);

      // Step 2: quantize (worker) — dither OFF for tile dedup.
      let palette: Uint32Array | null = null;
      if (quantizeOn) {
        const q = await quantizeAsync(
          workingImage,
          { maxColors: quantizeColors, dither: false },
          (f) => setProgress(0.15 + f * 0.35),
          ctrl.signal,
        );
        workingImage = { colorMode: 'rgba', w: workingImage.w, h: workingImage.h, data: q.remappedRGBA };
        palette = q.palette;
      }
      setProgress(0.5);

      // Step 3 (optional): commit preprocessed pixels to the source layer so the user sees the effect.
      if (commitPreprocess && (pixelateOn || quantizeOn)) {
        overwriteRasterLayer(layer.id, workingImage.data);
        if (palette) applyQuantizedLayer(layer.id, palette, workingImage.data);
      }

      // Step 4: generate tileset (worker).
      const result = await generateTilesetAsync(
        workingImage,
        { tileWidth: tw, tileHeight: th, offsetX: offX, offsetY: offY, matchFlips, name },
        (f) => setProgress(0.5 + f * 0.5),
        ctrl.signal,
      );
      const elapsed = Math.round(performance.now() - t0);
      const applied = apply(layer.id, result, hideSource);
      if (!applied) { toast.error('Failed to apply result'); return; }
      toast.success(
        `Generated ${result.tilesCreated} tiles (${result.duplicatesFound} dedup'd) in ${elapsed}ms`
      );
      onClose();
    } catch (err) {
      if ((err as Error).name === 'AbortError') toast('Cancelled');
      else toast.error(`Generate failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
      setProgress(0);
      abortRef.current = null;
    }
  }

  function cancel() { abortRef.current?.abort(); }

  function applyPreset() {
    setPixelateOn(true);
    setPixelateSize(128);
    setQuantizeOn(true);
    setQuantizeColors(16);
    setMatchFlips(true);
    setHideSource(true);
    setCommitPreprocess(true);
  }

  return (
    <Dialog open={open} onClose={running ? () => {} : onClose} title="Generate Tileset">
      {rasterLayers.length === 0 ? (
        <p className="text-xs text-ink/70">No raster layers available.</p>
      ) : (
        <>
          <button
            data-testid="gen-preset-pixelart"
            onClick={applyPreset}
            disabled={running}
            className="self-start text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25 disabled:opacity-50"
          >
            Preset: Pixel-art (128 px · 16 colors)
          </button>

          <DialogField label="Source layer">
            <select
              data-testid="gen-layer"
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

          <div className="pt-1 border-t border-border/60" />
          <div className="text-[10px] uppercase tracking-wider text-ink/50">Preprocess</div>

          <DialogField label="Pixelate">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
              <input
                data-testid="gen-pixelate-on"
                type="checkbox"
                checked={pixelateOn}
                onChange={(e) => setPixelateOn(e.target.checked)}
                disabled={running}
              />
              Downscale source to a true pixel-art resolution first
            </label>
          </DialogField>
          {pixelateOn && (
            <DialogField label={`Target px (${pixelateSize})`}>
              <input
                data-testid="gen-pixelate-size"
                type="range"
                min={16}
                max={512}
                step={8}
                value={pixelateSize}
                onChange={(e) => setPixelateSize(parseInt(e.target.value, 10))}
                disabled={running}
                className="w-full accent-[#3794ff]"
              />
            </DialogField>
          )}
          <DialogField label="Reduce colors">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
              <input
                data-testid="gen-quantize-on"
                type="checkbox"
                checked={quantizeOn}
                onChange={(e) => setQuantizeOn(e.target.checked)}
                disabled={running}
              />
              Quantize palette (dither off for better dedup)
            </label>
          </DialogField>
          {quantizeOn && (
            <DialogField label={`Colors (${quantizeColors})`}>
              <input
                data-testid="gen-quantize-colors"
                type="range"
                min={2}
                max={256}
                value={quantizeColors}
                onChange={(e) => setQuantizeColors(parseInt(e.target.value, 10))}
                disabled={running}
                className="w-full accent-[#3794ff]"
              />
            </DialogField>
          )}
          <DialogField label="Commit">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
              <input
                type="checkbox"
                checked={commitPreprocess}
                onChange={(e) => setCommitPreprocess(e.target.checked)}
                disabled={running}
              />
              Apply preprocessing to source layer (so you can see it)
            </label>
          </DialogField>

          <div className="pt-1 border-t border-border/60" />
          <div className="text-[10px] uppercase tracking-wider text-ink/50">Tileset</div>

          <DialogField label="Name">
            <input
              data-testid="gen-name"
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={running}
            />
          </DialogField>
          <DialogField label="Tile width">
            <NumberInput value={tw} onChange={setTw} min={1} max={256} />
          </DialogField>
          <DialogField label="Tile height">
            <NumberInput value={th} onChange={setTh} min={1} max={256} />
          </DialogField>
          <DialogField label="Offset X">
            <NumberInput value={offX} onChange={setOffX} min={0} max={1024} />
          </DialogField>
          <DialogField label="Offset Y">
            <NumberInput value={offY} onChange={setOffY} min={0} max={1024} />
          </DialogField>
          <DialogField label="Match flips">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
              <input
                data-testid="gen-flips"
                type="checkbox"
                checked={matchFlips}
                onChange={(e) => setMatchFlips(e.target.checked)}
                disabled={running}
              />
              Dedupe H/V{tw === th ? '/D' : ''} flipped duplicates
            </label>
          </DialogField>
          <DialogField label="Hide source">
            <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
              <input
                data-testid="gen-hide-source"
                type="checkbox"
                checked={hideSource}
                onChange={(e) => setHideSource(e.target.checked)}
                disabled={running}
              />
              Hide source raster layer after generating
            </label>
          </DialogField>

          <div className="flex items-center gap-3 pt-1">
            <div className="rounded-md border border-border bg-panel2 p-1">
              <canvas
                ref={previewRef}
                data-testid="gen-preview"
                className="block"
                style={{ imageRendering: 'pixelated', width: 128, height: 'auto' }}
              />
            </div>
            <div className="flex flex-col gap-0.5 text-[10px] font-mono text-ink/60">
              <span>Preview</span>
              {previewStats && (
                <>
                  <span data-testid="gen-preview-unique">~{previewStats.estUnique} unique tiles</span>
                  <span>{previewStats.estPct.toFixed(1)}% dedup (sampled)</span>
                </>
              )}
            </div>
          </div>

          {running && (
            <div className="flex flex-col gap-1.5 mt-1" data-testid="gen-progress">
              <div className="h-1.5 w-full bg-panel2 rounded overflow-hidden">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="text-[10px] text-ink/60 font-mono">
                {Math.round(progress * 100)}%
              </span>
            </div>
          )}
        </>
      )}
      <DialogActions>
        {running ? (
          <Button testId="gen-cancel" onClick={cancel}>Cancel</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" testId="gen-submit" onClick={submit}>Generate</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

// --- Preview pipeline (sync, downscaled for latency) ---

function runPipelinePreview(src: ImageRGBA, o: {
  pixelateOn: boolean; pixelateSize: number;
  quantizeOn: boolean; quantizeColors: number;
  tw: number; th: number; matchFlips: boolean;
}): { w: number; h: number; data: Uint32Array; estUnique: number; estDedupPct: number } {
  // Downscale the source to ≤ 256px wide for the preview; run same pipeline proportionally.
  const previewW = Math.min(256, src.w);
  const ratio = previewW / src.w;
  const previewH = Math.max(1, Math.round(src.h * ratio));

  // Use the full pixelate helper by routing through a small intermediate.
  let img: ImageRGBA;
  {
    const s = document.createElement('canvas');
    s.width = src.w; s.height = src.h;
    const sid = new ImageData(src.w, src.h);
    new Uint32Array(sid.data.buffer).set(src.data);
    s.getContext('2d')!.putImageData(sid, 0, 0);

    const d = document.createElement('canvas');
    d.width = previewW; d.height = previewH;
    const dctx = d.getContext('2d')!;
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(s, 0, 0, previewW, previewH);
    const did = dctx.getImageData(0, 0, previewW, previewH);
    img = { colorMode: 'rgba', w: previewW, h: previewH, data: new Uint32Array(did.data.buffer.slice(0)) };
  }

  if (o.pixelateOn) {
    // Scale pixelate target proportionally.
    img = pixelate(img, Math.max(2, Math.round(o.pixelateSize * ratio)));
  }
  if (o.quantizeOn) {
    const q = quantize(img, { maxColors: o.quantizeColors, dither: false });
    img = { colorMode: 'rgba', w: img.w, h: img.h, data: q.remappedRGBA };
  }

  // Rough dedup estimate on the preview at a scaled tile size.
  const tw = Math.max(1, Math.round(o.tw * ratio));
  const th = Math.max(1, Math.round(o.th * ratio));
  const cols = Math.floor(img.w / tw);
  const rows = Math.floor(img.h / th);
  const total = cols * rows;
  const seen = new Set<string>();
  const buf = new Int32Array(tw * th); // used as cheap string key source
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          buf[y * tw + x] = img.data[(ty * th + y) * img.w + (tx * tw + x)];
        }
      }
      // String from the typed array is cheap enough for preview-scale data.
      seen.add(String.fromCharCode(...new Uint8Array(buf.buffer)));
    }
  }
  const estUnique = seen.size;
  const estDedupPct = total === 0 ? 0 : ((total - estUnique) / total) * 100;
  return { w: img.w, h: img.h, data: img.data, estUnique, estDedupPct };
}
