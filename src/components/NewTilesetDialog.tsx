import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';

export function NewTilesetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tw, setTw] = useState(16);
  const [th, setTh] = useState(16);
  const [count, setCount] = useState(8);
  const [name, setName] = useState('Tileset');
  const create = useEditorStore((s) => s.createTileset);

  function submit() {
    create(tw, th, count, name || 'Tileset');
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Tileset">
      <DialogField label="Name">
        <input
          data-testid="ts-name"
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </DialogField>
      <DialogField label="Tile width">
        <NumberInput value={tw} onChange={setTw} />
      </DialogField>
      <DialogField label="Tile height">
        <NumberInput value={th} onChange={setTh} />
      </DialogField>
      <DialogField label="Initial tiles">
        <NumberInput value={count} onChange={setCount} min={0} max={1024} />
      </DialogField>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="ts-create" onClick={submit}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}
