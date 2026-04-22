import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';
import { buildExport, collectTilemapLayers, spriteFramePNG, tilesetAtlasPNG, zipFiles, type JsonFormat } from '../io/export';
import { downloadBlob } from '../io/png';
import { exportAnimatedGIF } from '../io/gif';

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const tilesets = sprite.tilesets;

  const [kind, setKind] = useState<'tileset' | 'sprite' | 'gif'>('tileset');
  const [tilesetId, setTilesetId] = useState<string>('');
  const [format, setFormat] = useState<JsonFormat>('tiled');
  const [columns, setColumns] = useState(16);
  const [base, setBase] = useState('export');
  const [bundle, setBundle] = useState(true);
  const [running, setRunning] = useState(false);

  // Re-sync defaults each time the dialog opens, since tilesets may have been
  // created between mount and open.
  useEffect(() => {
    if (!open) return;
    if (tilesets.length === 0) {
      setKind(sprite.frames.length > 1 ? 'gif' : 'sprite');
    } else {
      setKind('tileset');
      if (!tilesets.find((t) => t.id === tilesetId)) setTilesetId(tilesets[0].id);
    }
  }, [open, tilesets, tilesetId, sprite.frames.length]);

  const tileset = tilesets.find((t) => t.id === tilesetId);
  const layers = useMemo(
    () => (tileset ? collectTilemapLayers(sprite, tileset.id, currentFrame) : []),
    [sprite, tileset, currentFrame]
  );

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
      const png = await spriteFramePNG(sprite, currentFrame);
      downloadBlob(png, `${base}.png`);
      toast.success(`Exported ${base}.png`);
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

  return (
    <Dialog open={open} onClose={running ? () => {} : onClose} title="Export">
      <div className="flex gap-1 text-[11px]">
        <KindTab active={kind === 'tileset'} onClick={() => setKind('tileset')} disabled={tilesets.length === 0} testId="kind-tileset">
          Tileset + map
        </KindTab>
        <KindTab active={kind === 'sprite'} onClick={() => setKind('sprite')} testId="kind-sprite">
          Flat PNG
        </KindTab>
        <KindTab active={kind === 'gif'} onClick={() => setKind('gif')} disabled={sprite.frames.length < 2} testId="kind-gif">
          Animated GIF
        </KindTab>
      </div>

      {kind === 'tileset' ? (
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
          <DialogField label="Filename base">
            <input
              data-testid="ex-base"
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
              value={base}
              onChange={(e) => setBase(e.target.value.replace(/[^a-z0-9_\-]/gi, ''))}
              disabled={running}
            />
          </DialogField>
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
          <div className="text-[10px] text-ink/60 font-mono" data-testid="ex-summary">
            {tileset ? (
              <>
                {tileset.tiles.length} tiles · {columns}×{Math.ceil(tileset.tiles.length / columns)} atlas · {layers.length} map layer{layers.length !== 1 ? 's' : ''}
              </>
            ) : <>No tilesets available</>}
          </div>
        </>
      ) : kind === 'sprite' ? (
        <>
          <DialogField label="Filename base">
            <input
              data-testid="ex-base-sprite"
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
              value={base}
              onChange={(e) => setBase(e.target.value.replace(/[^a-z0-9_\-]/gi, ''))}
              disabled={running}
            />
          </DialogField>
          <div className="text-[10px] text-ink/60 font-mono">
            Exports current frame composited: {sprite.w}×{sprite.h} PNG
          </div>
        </>
      ) : (
        <>
          <DialogField label="Filename base">
            <input
              data-testid="ex-base-gif"
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent disabled:opacity-50"
              value={base}
              onChange={(e) => setBase(e.target.value.replace(/[^a-z0-9_\-]/gi, ''))}
              disabled={running}
            />
          </DialogField>
          <div className="text-[10px] text-ink/60 font-mono">
            {sprite.frames.length} frames · {sprite.w}×{sprite.h} · durations from timeline
          </div>
        </>
      )}

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {kind === 'tileset' && (
          <Button testId="ex-atlas" onClick={previewAtlas}>Atlas PNG only</Button>
        )}
        <Button variant="primary" testId="ex-submit" onClick={kind === 'tileset' ? runTileset : kind === 'gif' ? runGif : runSprite}>
          {running ? 'Exporting…' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KindTab({ active, onClick, disabled, testId, children }: { active: boolean; onClick: () => void; disabled?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'bg-accent/25 text-white border-accent' : 'text-ink/70 border-border hover:text-white hover:bg-panel2'}`}
    >
      {children}
    </button>
  );
}
