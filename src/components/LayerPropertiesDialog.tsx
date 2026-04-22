import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';
import type { BlendMode } from '../model/types';

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'darken', 'lighten', 'add', 'subtract', 'difference', 'overlay'];

export function LayerPropertiesDialog({ open, layerId, onClose }: { open: boolean; layerId: string | null; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const rename = useEditorStore((s) => s.renameLayer);
  const setOpacity = useEditorStore((s) => s.setLayerOpacity);
  const setVisible = useEditorStore((s) => s.setLayerVisible);
  const setTileset = useEditorStore((s) => s.setTilemapLayerTileset);
  const setBlendMode = useEditorStore((s) => s.setLayerBlendMode);

  const layer = sprite.layers.find((l) => l.id === layerId);
  const [name, setName] = useState('');
  const [opacity, setOpacityLocal] = useState(255);
  const [visible, setVisibleLocal] = useState(true);
  const [tilesetId, setTilesetId] = useState<string>('');
  const [blendMode, setBlendModeLocal] = useState<BlendMode>('normal');

  useEffect(() => {
    if (!open || !layer) return;
    setName(layer.name);
    setOpacityLocal(layer.opacity);
    setVisibleLocal(layer.visible);
    setTilesetId(layer.type === 'tilemap' ? layer.tilesetId : '');
    setBlendModeLocal(layer.blendMode ?? 'normal');
  }, [open, layer]);

  if (!layer) {
    return (
      <Dialog open={open} onClose={onClose} title="Layer Properties">
        <p className="text-xs text-ink/70">No layer selected.</p>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  function apply() {
    if (!layer) return;
    rename(layer.id, name);
    setOpacity(layer.id, opacity);
    setVisible(layer.id, visible);
    setBlendMode(layer.id, blendMode);
    if (layer.type === 'tilemap' && tilesetId && tilesetId !== layer.tilesetId) {
      setTileset(layer.id, tilesetId);
      toast.success(`Switched ${name} to tileset ${sprite.tilesets.find((t) => t.id === tilesetId)?.name}`);
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Layer — ${layer.name}`}>
      <DialogField label="Name">
        <input
          data-testid="lp-name"
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </DialogField>
      <DialogField label={`Opacity (${opacity})`}>
        <input
          data-testid="lp-opacity"
          type="range"
          min={0}
          max={255}
          value={opacity}
          onChange={(e) => setOpacityLocal(parseInt(e.target.value, 10))}
          className="w-full accent-[#3794ff]"
        />
      </DialogField>
      <DialogField label="Visible">
        <label className="inline-flex items-center gap-2 text-[11px] text-ink/80">
          <input
            data-testid="lp-visible"
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisibleLocal(e.target.checked)}
          />
          Layer is visible
        </label>
      </DialogField>
      <DialogField label="Blend mode">
        <select
          data-testid="lp-blend"
          value={blendMode}
          onChange={(e) => setBlendModeLocal(e.target.value as BlendMode)}
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
        >
          {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </DialogField>
      <DialogField label="Type">
        <span className="text-[11px] text-ink/60 uppercase tracking-wider">{layer.type}</span>
      </DialogField>
      {layer.type === 'tilemap' && (
        <DialogField label="Tileset">
          <select
            data-testid="lp-tileset"
            value={tilesetId}
            onChange={(e) => setTilesetId(e.target.value)}
            className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          >
            {sprite.tilesets.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.grid.tw}×{t.grid.th}, {t.tiles.length} tiles)</option>
            ))}
          </select>
        </DialogField>
      )}
      <DialogField label="Tile count">
        <NumberInput value={sprite.cels.filter((c) => c.layerId === layer.id).length} onChange={() => {}} min={0} max={9999} />
      </DialogField>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="lp-apply" onClick={apply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
