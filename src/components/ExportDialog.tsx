import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';
import {
  buildExport,
  collectTilemapLayers,
  extFor,
  spriteFrameImage,
  spriteFrameSequence,
  spriteSheetWithMeta,
  tilesetAtlasPNG,
  zipFiles,
  type ImageFormat,
  type JsonFormat,
} from '../io/export';
import { downloadBlob } from '../io/png';
import { exportAnimatedGIF } from '../io/gif';

type Kind = 'tileset' | 'sprite' | 'sequence' | 'sheet' | 'gif';

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const tilesets = sprite.tilesets;

  const [kind, setKind] = useState<Kind>('tileset');
  const [tilesetId, setTilesetId] = useState<string>('');
  const [format, setFormat] = useState<JsonFormat>('tiled');
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png');
  const [columns, setColumns] = useState(16);
  const [sheetCols, setSheetCols] = useState(8);
  const [sheetLayout, setSheetLayout] = useState<'array' | 'hash'>('hash');
  const [base, setBase] = useState('export');
  const [bundle, setBundle] = useState(true);
  const [quality, setQuality] = useState(92);
  const [running, setRunning] = useState(false);

  const multiFrame = sprite.frames.length > 1;

  useEffect(() => {
    if (!open) return;
    if (tilesets.length === 0) {
      setKind(multiFrame ? 'sheet' : 'sprite');
    } else {
      setKind('tileset');
      if (!tilesets.find((t) => t.id === tilesetId)) setTilesetId(tilesets[0].id);
    }
  }, [open, tilesets, tilesetId, multiFrame]);

  const tileset = tilesets.find((t) => t.id === tilesetId);
  const layers = useMemo(
    () => (tileset ? collectTilemapLayers(sprite, tileset.id, currentFrame) : []),
    [sprite, tileset, currentFrame]
  );

  const qualityNorm = Math.max(0.01, Math.min(1, quality / 100));

  async function runTileset() {
    if (!tileset) { toast.error('Pick a tileset'); return; }
    setRunning(true);
    try {
      const files = await buildExport(sprite, { tilesetId: tileset.id, format, columns, filenameBase: base, frame: currentFrame });
      if (bundle && files.length > 1) {
        const zip = await zipFiles(files, `${base}.zip`);
        downloadBlob(zip, `${base}.zip`);
        toast.success(`Exported ${files.length} files as ${base}.zip`);
      } else {
        for (const f of files) downloadBlob(f.blob, f.name);
        toast.success(`Exported ${files.length} file${files.length !== 1 ? 's' : ''}`);
      }
      onClose();
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runSprite() {
    setRunning(true);
    try {
      const blob = await spriteFrameImage(sprite, currentFrame, imageFormat, qualityNorm);
      const name = `${base}.${extFor(imageFormat)}`;
      downloadBlob(blob, name);
      toast.success(`Exported ${name}`);
      onClose();
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runSequence() {
    setRunning(true);
    try {
      const files = await spriteFrameSequence(sprite, {
        format: imageFormat,
        filenameBase: base,
        quality: qualityNorm,
      });
      const zip = await zipFiles(files, `${base}.zip`);
      downloadBlob(zip, `${base}.zip`);
      toast.success(`Exported ${files.length} frames as ${base}.zip`);
      onClose();
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runSheet() {
    setRunning(true);
    try {
      const files = await spriteSheetWithMeta(sprite, sheetCols, {
        format: imageFormat,
        filenameBase: base,
        layout: sheetLayout,
        quality: qualityNorm,
      });
      if (bundle) {
        const zip = await zipFiles(files, `${base}.zip`);
        downloadBlob(zip, `${base}.zip`);
        toast.success(`Exported sprite sheet as ${base}.zip`);
      } else {
        for (const f of files) downloadBlob(f.blob, f.name);
        toast.success(`Exported sprite sheet (${files.length} files)`);
      }
      onClose();
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runGif() {
    setRunning(true);
    try {
      const blob = exportAnimatedGIF(sprite);
      downloadBlob(blob, `${base}.gif`);
      toast.success(`Exported ${base}.gif (${sprite.frames.length} frames)`);
      onClose();
    } catch (err) {
      toast.error(`GIF export failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function previewAtlas() {
    if (!tileset) return;
    const atlas = await tilesetAtlasPNG(tileset, columns);
    downloadBlob(atlas.blob, `${base}-atlas.png`);
    toast.success(`Saved atlas preview`);
  }

  function doRun() {
    switch (kind) {
      case 'tileset': return runTileset();
      case 'sprite': return runSprite();
      case 'sequence': return runSequence();
      case 'sheet': return runSheet();
      case 'gif': return runGif();
    }
  }

  const showImageFormat = kind === 'sprite' || kind === 'sequence' || kind === 'sheet';
  const showQuality = showImageFormat && imageFormat !== 'png';

  return (
    <Dialog open={open} onClose={running ? () => {} : onClose} title="Export">
      <div className="flex gap-1 flex-wrap text-[11px]">
        <KindTab
          active={kind === 'tileset'}
          onClick={() => setKind('tileset')}
          disabled={tilesets.length === 0}
          title={tilesets.length === 0 ? 'Create a tileset first' : undefined}
          testId="kind-tileset"
        >
          Tileset + map
        </KindTab>
        <KindTab active={kind === 'sprite'} onClick={() => setKind('sprite')} testId="kind-sprite">
          Flat image
        </KindTab>
        <KindTab
          active={kind === 'sequence'}
          onClick={() => setKind('sequence')}
          disabled={!multiFrame}
          title={!multiFrame ? 'Add a second frame to enable frame sequence export' : undefined}
          testId="kind-sequence"
        >
          Frame sequence
        </KindTab>
        <KindTab
          active={kind === 'sheet'}
          onClick={() => setKind('sheet')}
          testId="kind-sheet"
          disabled={!multiFrame}
          title={!multiFrame ? 'Add a second frame to enable sprite-sheet export' : undefined}
        >
          Sprite sheet
        </KindTab>
        <KindTab
          active={kind === 'gif'}
          onClick={() => setKind('gif')}
          disabled={!multiFrame}
          title={!multiFrame ? 'Add a second frame to enable animated GIF export' : undefined}
          testId="kind-gif"
        >
          Animated GIF
        </KindTab>
      </div>

      {kind === 'tileset' && (
        <>
          <DialogField label="Tileset">
            <select
              data-testid="ex-tileset"
              value={tileset?.id ?? ''}
              onChange={(e) => setTilesetId(e.target.value)}
              disabled={running}
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
            >
              {tilesets.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.tiles.length} tiles)</option>
              ))}
            </select>
          </DialogField>
          <DialogField label="Format">
            <select
              data-testid="ex-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as JsonFormat)}
              disabled={running}
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="tiled">Tiled (TMJ + TSJ)</option>
              <option value="raw">Raw JSON (simple)</option>
              <option value="aseprite-array">Aseprite JSON Array</option>
            </select>
          </DialogField>
          <DialogField label="Atlas columns">
            <NumberInput value={columns} onChange={setColumns} min={1} max={64} />
          </DialogField>
          <div className="text-[10px] text-ink/60 font-mono" data-testid="ex-summary">
            {tileset ? (
              <>
                {tileset.tiles.length} tiles · {columns}×{Math.ceil(tileset.tiles.length / columns)} atlas · {layers.length} map layer{layers.length !== 1 ? 's' : ''}
              </>
            ) : <>No tilesets available</>}
          </div>
        </>
      )}

      {kind === 'sheet' && (
        <>
          <DialogField label="Columns">
            <NumberInput value={sheetCols} onChange={setSheetCols} min={1} max={sprite.frames.length} />
          </DialogField>
          <DialogField label="JSON layout">
            <select
              data-testid="ex-sheet-layout"
              value={sheetLayout}
              onChange={(e) => setSheetLayout(e.target.value as 'array' | 'hash')}
              disabled={running}
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="hash">Aseprite JSON Hash (Phaser, PixiJS)</option>
              <option value="array">Aseprite JSON Array (TexturePacker-style)</option>
            </select>
          </DialogField>
          <div className="text-[10px] text-ink/60 font-mono">
            {sprite.frames.length} frames · {sheetCols}×{Math.ceil(sprite.frames.length / sheetCols)} grid
          </div>
        </>
      )}

      {showImageFormat && (
        <DialogField label="Image format">
          <select
            data-testid="ex-image-format"
            value={imageFormat}
            onChange={(e) => setImageFormat(e.target.value as ImageFormat)}
            disabled={running}
            className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="png">PNG (lossless)</option>
            <option value="webp">WebP</option>
            <option value="jpeg">JPEG (no alpha)</option>
          </select>
        </DialogField>
      )}

      {showQuality && (
        <DialogField label="Quality (1–100)">
          <NumberInput value={quality} onChange={setQuality} min={1} max={100} />
        </DialogField>
      )}

      {kind !== 'tileset' && kind !== 'gif' && kind !== 'sprite' && (
        <DialogField label="Bundle as ZIP">
          <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
            <input
              data-testid="ex-zip"
              type="checkbox"
              checked={bundle}
              onChange={(e) => setBundle(e.target.checked)}
              disabled={running || kind === 'sequence'}
            />
            {kind === 'sequence' ? 'Always zipped' : 'Single download'}
          </label>
        </DialogField>
      )}

      {kind === 'tileset' && (
        <DialogField label="Bundle as ZIP">
          <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
            <input
              data-testid="ex-zip"
              type="checkbox"
              checked={bundle}
              onChange={(e) => setBundle(e.target.checked)}
              disabled={running}
            />
            Single download
          </label>
        </DialogField>
      )}

      <DialogField label="Filename base">
        <input
          data-testid="ex-base"
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
          value={base}
          onChange={(e) => setBase(e.target.value.replace(/[^a-z0-9_-]/gi, ''))}
          disabled={running}
        />
      </DialogField>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {kind === 'tileset' && (
          <Button testId="ex-atlas" onClick={previewAtlas}>Atlas PNG only</Button>
        )}
        <Button variant="primary" testId="ex-submit" onClick={doRun}>
          {running ? 'Exporting…' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KindTab({ active, onClick, disabled, testId, title, children }: { active: boolean; onClick: () => void; disabled?: boolean; testId?: string; title?: string; children: React.ReactNode }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        'px-2.5 py-1 rounded-md border text-[13px] transition-colors ' +
        (disabled
          ? 'text-ink/45 border-border bg-panel/60 cursor-not-allowed'
          : active
            ? 'bg-accent/25 text-white border-accent'
            : 'text-ink/80 border-border hover:text-white hover:bg-panel2')
      }
    >
      {children}
    </button>
  );
}
