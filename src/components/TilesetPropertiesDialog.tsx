import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogField } from './Dialog';
import { useEditorStore } from '../store/editor';

export function TilesetPropertiesDialog({ open, tilesetId, onClose }: { open: boolean; tilesetId: string | null; onClose: () => void }) {
  const sprite = useEditorStore((s) => s.sprite);
  const setProps = useEditorStore((s) => s.setTilesetProps);
  const tileset = sprite.tilesets.find((t) => t.id === tilesetId);

  const [name, setName] = useState('');

  useEffect(() => {
    if (!open || !tileset) return;
    setName(tileset.name);
  }, [open, tileset]);

  if (!tileset) {
    return (
      <Dialog open={open} onClose={onClose} title="Tileset Properties">
        <p className="text-xs text-ink/70">No tileset selected.</p>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  function apply() {
    if (!tileset) return;
    setProps(tileset.id, { name });
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Tileset — ${tileset.name}`}>
      <DialogField label="Name">
        <input
          data-testid="tp-name"
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </DialogField>
      <DialogField label="Grid">
        <span className="text-[11px] text-ink/60 font-mono">{tileset.grid.tw}×{tileset.grid.th} px</span>
      </DialogField>
      <DialogField label="Tiles">
        <span className="text-[11px] text-ink/60 font-mono">{tileset.tiles.length}</span>
      </DialogField>
      <DialogField label="Used by">
        <span className="text-[11px] text-ink/60 font-mono">
          {sprite.layers.filter((l) => l.type === 'tilemap' && l.tilesetId === tileset.id).map((l) => l.name).join(', ') || '—'}
        </span>
      </DialogField>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="tp-apply" onClick={apply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
