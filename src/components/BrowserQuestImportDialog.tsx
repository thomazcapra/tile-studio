import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { useEditorStore } from '../store/editor';
import { decodePNG, pickFile } from '../io/png';
import { importBQ, type BQClient, type BQServer } from '../io/browser-quest';
import type { ImageRGBA } from '../model/types';

// Loads a BrowserQuest tilesheet (and optionally world_client.json + world_server.json)
// into a fresh tile-studio sprite. The tilesheet alone is enough to start authoring;
// the world JSONs reconstruct an existing map for editing.
export function BrowserQuestImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Inner component remounts every time `open` flips on, so its useState seeds
  // are always fresh — no reset effect needed.
  if (!open) return null;
  return <BQImportDialogInner onClose={onClose} />;
}

function BQImportDialogInner({ onClose }: { onClose: () => void }) {
  const replaceSprite = useEditorStore((s) => s.replaceSprite);
  const [tilesheet, setTilesheet] = useState<ImageRGBA | null>(null);
  const [tilesheetName, setTilesheetName] = useState('');
  const [client, setClient] = useState<BQClient | null>(null);
  const [server, setServer] = useState<BQServer | null>(null);
  const [tilesize, setTilesize] = useState(16);
  const [mapName, setMapName] = useState('world');

  async function pickTilesheet() {
    const f = await pickFile('image/png,image/*');
    if (!f) return;
    try {
      const img = await decodePNG(f);
      setTilesheet(img);
      setTilesheetName(f.name);
    } catch (err) {
      toast.error(`Failed to read tilesheet: ${(err as Error).message}`);
    }
  }

  async function pickClient() {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const json = JSON.parse(await f.text()) as BQClient;
      if (typeof json.width !== 'number' || typeof json.height !== 'number' || !Array.isArray(json.data)) {
        throw new Error('not a world_client.json (missing width/height/data)');
      }
      setClient(json);
      if (json.tilesize) setTilesize(json.tilesize);
      if (mapName === 'world') setMapName(f.name.replace(/_client\.json$|\.json$/i, ''));
      toast.success(`Loaded ${f.name} (${json.width}×${json.height})`);
    } catch (err) {
      toast.error(`Failed to read client JSON: ${(err as Error).message}`);
    }
  }

  async function pickServer() {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const json = JSON.parse(await f.text()) as BQServer;
      if (typeof json.width !== 'number' || typeof json.height !== 'number') {
        throw new Error('not a world_server.json (missing width/height)');
      }
      setServer(json);
      toast.success(`Loaded ${f.name}`);
    } catch (err) {
      toast.error(`Failed to read server JSON: ${(err as Error).message}`);
    }
  }

  function apply() {
    if (!tilesheet) {
      toast.error('Pick a tilesheet first');
      return;
    }
    if (!client) {
      // Tilesheet only — create an empty 32×32 starter map.
      const stub: BQClient = {
        width: 32,
        height: 32,
        tilesize,
        data: new Array(32 * 32).fill(0),
      };
      const { sprite, warnings } = importBQ(stub, null, tilesheet, { name: mapName, ensureRoleLayers: true });
      replaceSprite(sprite);
      const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
      if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
      for (const w of warnings) toast(w);
      toast.success(`Loaded tilesheet (${tilesheet.w}×${tilesheet.h}) — blank 32×32 map`);
      onClose();
      return;
    }
    const { sprite, warnings } = importBQ(client, server, tilesheet, { name: mapName });
    replaceSprite(sprite);
    const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
    if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
    for (const w of warnings.slice(0, 3)) toast(w);
    if (warnings.length > 3) toast(`(+${warnings.length - 3} more warnings — see console)`);
    toast.success(`Loaded ${mapName} (${client.width}×${client.height})`);
    onClose();
  }

  return (
    <Dialog open={true} onClose={onClose} title="Import BrowserQuest Map">
      <div className="rounded-md border border-border bg-panel2 p-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-wider text-ink/60 flex-1">Tilesheet (required)</span>
          <button
            data-testid="bq-pick-tilesheet"
            onClick={pickTilesheet}
            className="text-[11px] text-accent hover:underline"
          >
            {tilesheet ? 'Change…' : 'Choose PNG…'}
          </button>
        </div>
        <p className="text-[11px] text-ink/70" data-testid="bq-tilesheet-status">
          {tilesheet ? `${tilesheetName} — ${tilesheet.w}×${tilesheet.h}` : 'Pick the BrowserQuest tilesheet PNG (e.g. tilesheet.png).'}
        </p>
      </div>

      <div className="rounded-md border border-border bg-panel2 p-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-wider text-ink/60 flex-1">world_client.json (optional)</span>
          <button
            data-testid="bq-pick-client"
            onClick={pickClient}
            className="text-[11px] text-accent hover:underline"
          >
            {client ? 'Change…' : 'Choose…'}
          </button>
        </div>
        <p className="text-[11px] text-ink/70" data-testid="bq-client-status">
          {client ? `${client.width}×${client.height}, ${client.data.length} cells` : 'Skip to start a fresh blank map.'}
        </p>
      </div>

      <div className="rounded-md border border-border bg-panel2 p-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-wider text-ink/60 flex-1">world_server.json (optional)</span>
          <button
            data-testid="bq-pick-server"
            onClick={pickServer}
            className="text-[11px] text-accent hover:underline"
          >
            {server ? 'Change…' : 'Choose…'}
          </button>
        </div>
        <p className="text-[11px] text-ink/70" data-testid="bq-server-status">
          {server
            ? `roaming: ${server.roamingAreas?.length ?? 0}, chests: ${(server.staticChests?.length ?? 0) + (server.chestAreas?.length ?? 0)}, npcs: ${Object.keys(server.staticEntities ?? {}).length}`
            : 'Adds NPCs, roaming, and chest data when present.'}
        </p>
      </div>

      <DialogField label="Tile size">
        <NumberInput value={tilesize} onChange={setTilesize} min={1} max={256} />
      </DialogField>
      <DialogField label="Map name">
        <input
          type="text"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          data-testid="bq-map-name"
        />
      </DialogField>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" testId="bq-import-apply" onClick={apply}>Import</Button>
      </DialogActions>
    </Dialog>
  );
}
