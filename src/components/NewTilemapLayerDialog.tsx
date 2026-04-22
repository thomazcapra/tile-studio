import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';

export function NewTilemapLayerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tilesets = useEditorStore((s) => s.sprite.tilesets);
  const [tilesetId, setTilesetId] = useState<string>(tilesets[0]?.id ?? '');
  const [tilesW, setTilesW] = useState(16);
  const [tilesH, setTilesH] = useState(16);
  const [name, setName] = useState('Tilemap');
  const addTilemapLayer = useEditorStore((s) => s.addTilemapLayer);

  const current = tilesets.find((t) => t.id === tilesetId) ?? tilesets[0];

  function submit() {
    if (!current) {
      toast.error('Create a tileset first');
      return;
    }
    addTilemapLayer(current.id, tilesW, tilesH, name || 'Tilemap');
    toast.success(`Created tilemap layer (${tilesW}×${tilesH} tiles)`);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Tilemap Layer">
      {tilesets.length === 0 ? (
        <p className="text-xs text-ink/70">Create a tileset first, then come back here.</p>
      ) : (
        <>
          <DialogField label="Name">
            <input
              data-testid="tml-name"
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </DialogField>
          <DialogField label="Tileset">
            <select
              data-testid="tml-tileset"
              value={current?.id ?? ''}
              onChange={(e) => setTilesetId(e.target.value)}
              className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
            >
              {tilesets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.grid.tw}×{t.grid.th}, {t.tiles.length} tiles)
                </option>
              ))}
            </select>
          </DialogField>
          <DialogField label="Width (tiles)">
            <NumberInput value={tilesW} onChange={setTilesW} min={1} max={512} />
          </DialogField>
          <DialogField label="Height (tiles)">
            <NumberInput value={tilesH} onChange={setTilesH} min={1} max={512} />
          </DialogField>
          {current && (
            <p className="text-[10px] text-ink/50 font-mono">
              Canvas: {current.grid.tw * tilesW}×{current.grid.th * tilesH} px
            </p>
          )}
        </>
      )}
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="tml-create" onClick={submit}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}
