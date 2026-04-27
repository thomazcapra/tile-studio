import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';
import { decodePNG, pickFile } from '../io/png';
import { newSprite, nextId } from '../model/factory';
import type { Cel, ImageRGBA, Tag } from '../model/types';
import { parseSheetJson, type ParsedSheetJson } from '../io/sheet-json';

const TAG_COLORS = ['#e11d48', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];

// Slices an imported sprite-sheet image into a new sprite with one frame per tile.
// Optionally reads a companion JSON (Phaser/PixiJS "hash", TexturePacker / Aseprite
// "array") so non-uniform frames, per-frame durations, and frame tags are restored.
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
  const [parsed, setParsed] = useState<ParsedSheetJson | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) { setSource(null); setParsed(null); return; }
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
    ctx.strokeStyle = '#3794ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (parsed) {
      for (const f of parsed.frames) {
        ctx.rect(
          f.rect.x * scale + 0.5,
          f.rect.y * scale + 0.5,
          f.rect.w * scale - 1,
          f.rect.h * scale - 1,
        );
      }
    } else {
      for (let r = 0; r < grid.rows; r++) {
        for (let col = 0; col < grid.cols; col++) {
          const sx = (offX + col * (tw + spacingX)) * scale;
          const sy = (offY + r * (th + spacingY)) * scale;
          ctx.rect(sx + 0.5, sy + 0.5, tw * scale - 1, th * scale - 1);
        }
      }
    }
    ctx.stroke();
  }, [source, grid, tw, th, offX, offY, spacingX, spacingY, parsed]);

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

  async function pickJson() {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      const result = parseSheetJson(json);
      if (!result) {
        toast.error('Unrecognized sprite-sheet JSON (expected Phaser hash, TexturePacker array, or Aseprite Array).');
        return;
      }
      setParsed(result);
      toast.success(`Loaded ${result.frames.length} frames from JSON (${result.format} layout)`);
    } catch (err) {
      toast.error(`Failed to read JSON: ${(err as Error).message}`);
    }
  }

  function clearJson() {
    setParsed(null);
  }

  function apply() {
    if (!source) { toast.error('Pick an image first'); return; }
    if (parsed) return applyFromJson();
    return applyFromGrid();
  }

  function applyFromGrid() {
    if (!source) return;
    const count = grid.cols * grid.rows;
    if (count <= 0) { toast.error('No frames fit with these dimensions'); return; }
    const sprite = newSprite(tw, th, fileName);
    const layer = sprite.layers[0];
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
    finish(sprite);
  }

  function applyFromJson() {
    if (!source || !parsed) return;
    const frames = parsed.frames;
    if (frames.length === 0) { toast.error('JSON had no frames'); return; }

    // Use the tightest rect as the canvas size so all frames fit. If all frames
    // share a size (grid sheets) this matches the grid cell; for packed sheets
    // we pad smaller frames onto the max rect so the timeline stays uniform.
    const spriteW = frames.reduce((m, f) => Math.max(m, f.rect.w), 0);
    const spriteH = frames.reduce((m, f) => Math.max(m, f.rect.h), 0);

    const sprite = newSprite(spriteW, spriteH, fileName);
    const layer = sprite.layers[0];
    sprite.cels = [];
    sprite.frames = [];

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const data = new Uint32Array(spriteW * spriteH);
      for (let y = 0; y < f.rect.h; y++) {
        for (let x = 0; x < f.rect.w; x++) {
          const gx = f.rect.x + x, gy = f.rect.y + y;
          if (gx < 0 || gy < 0 || gx >= source.w || gy >= source.h) continue;
          data[y * spriteW + x] = source.data[gy * source.w + gx];
        }
      }
      sprite.frames.push({ duration: f.duration });
      sprite.cels.push({
        id: nextId('cel'),
        layerId: layer.id,
        frame: i,
        x: 0,
        y: 0,
        opacity: 255,
        image: { colorMode: 'rgba', w: spriteW, h: spriteH, data },
      });
    }

    if (parsed.tags.length > 0) {
      const tags: Tag[] = parsed.tags
        .filter((t) => t.from >= 0 && t.to < sprite.frames.length && t.to >= t.from)
        .map((t, i) => ({
          id: nextId('tag'),
          name: t.name,
          from: t.from,
          to: t.to,
          direction: t.direction,
          color: TAG_COLORS[i % TAG_COLORS.length],
        }));
      sprite.tags = tags;
    }

    finish(sprite);
  }

  function finish(sprite: ReturnType<typeof newSprite>) {
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
          <div className="rounded-md border border-border bg-panel2 p-2 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] uppercase tracking-wider text-ink/60 flex-1">Companion JSON</span>
              {parsed ? (
                <button
                  data-testid="iss-json-clear"
                  onClick={clearJson}
                  className="text-[11px] text-ink/60 hover:text-white"
                >
                  Clear
                </button>
              ) : (
                <button
                  data-testid="iss-json-pick"
                  onClick={pickJson}
                  className="text-[11px] text-accent hover:underline"
                >
                  Attach JSON…
                </button>
              )}
            </div>
            <p className="text-[11px] text-ink/70" data-testid="iss-json-status">
              {parsed
                ? `${parsed.format === 'hash' ? 'Phaser / PixiJS' : 'TexturePacker / Aseprite Array'}: ${parsed.frames.length} frames${parsed.tags.length ? `, ${parsed.tags.length} tags` : ''}`
                : 'Auto-detects Phaser hash, TexturePacker array, or Aseprite JSON Array. Grid inputs are ignored when JSON is attached.'}
            </p>
          </div>

          {!parsed && (
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
            </>
          )}

          <div className="rounded-md border border-border bg-panel2 p-1 flex justify-center">
            <canvas ref={previewRef} data-testid="iss-preview" className="block" style={{ imageRendering: 'pixelated' }} />
          </div>
          <p className="text-[10px] text-ink/60 font-mono" data-testid="iss-summary">
            {parsed
              ? `${parsed.frames.length} frames from JSON`
              : `${grid.cols}×${grid.rows} = ${grid.cols * grid.rows} frames · ${tw}×${th} px each`}
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
