import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogActions, DialogField, NumberInput } from './Dialog';
import { usePrefsStore } from '../prefs/prefs-store';
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, keyEventToShortcut, type ShortcutAction } from '../prefs/shortcuts';

type Tab = 'general' | 'shortcuts';

export function PreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefsStore();
  const [tab, setTab] = useState<Tab>('general');

  return (
    <Dialog open={open} onClose={onClose} title="Preferences">
      <div className="flex gap-1 text-[11px]">
        <TabBtn active={tab === 'general'} onClick={() => setTab('general')} testId="pref-tab-general">General</TabBtn>
        <TabBtn active={tab === 'shortcuts'} onClick={() => setTab('shortcuts')} testId="pref-tab-shortcuts">Shortcuts</TabBtn>
      </div>

      {tab === 'general' ? (
        <GeneralTab />
      ) : (
        <ShortcutsTab />
      )}

      <DialogActions>
        <Button variant="primary" testId="pref-close" onClick={onClose}>Done</Button>
      </DialogActions>

      {/* Hidden handle for tests to poke prefs without opening the tab */}
      <div className="hidden" data-testid="prefs-snapshot" data-autosave={String(prefs.autosaveEnabled)} data-checker={prefs.checkerSize} />
    </Dialog>
  );
}

function TabBtn({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md border transition-colors ${active ? 'bg-accent/25 text-white border-accent' : 'text-ink/70 border-border hover:text-white hover:bg-panel2'}`}
    >
      {children}
    </button>
  );
}

function GeneralTab() {
  const checkerSize = usePrefsStore((s) => s.checkerSize);
  const setCheckerSize = usePrefsStore((s) => s.setCheckerSize);
  const autosaveEnabled = usePrefsStore((s) => s.autosaveEnabled);
  const setAutosaveEnabled = usePrefsStore((s) => s.setAutosaveEnabled);
  const autosaveInterval = usePrefsStore((s) => s.autosaveIntervalSec);
  const setAutosaveInterval = usePrefsStore((s) => s.setAutosaveInterval);
  const showGrid = usePrefsStore((s) => s.showGrid);
  const setShowGrid = usePrefsStore((s) => s.setShowGrid);
  const osClipboard = usePrefsStore((s) => s.osClipboardEnabled);
  const setOSClipboard = usePrefsStore((s) => s.setOSClipboardEnabled);

  return (
    <>
      <DialogField label="Autosave">
        <label className="inline-flex items-center gap-2 text-[11px]">
          <input data-testid="pref-autosave" type="checkbox" checked={autosaveEnabled} onChange={(e) => setAutosaveEnabled(e.target.checked)} />
          Enabled
        </label>
      </DialogField>
      <DialogField label="Autosave every">
        <div className="flex items-center gap-1">
          <NumberInput value={autosaveInterval} onChange={setAutosaveInterval} min={2} max={300} />
          <span className="text-[10px] text-ink/60">sec</span>
        </div>
      </DialogField>
      <DialogField label="Checker size">
        <NumberInput value={checkerSize} onChange={setCheckerSize} min={1} max={64} />
      </DialogField>
      <DialogField label="Pixel grid">
        <label className="inline-flex items-center gap-2 text-[11px]">
          <input data-testid="pref-grid" type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show at high zoom
        </label>
      </DialogField>
      <DialogField label="OS clipboard">
        <label className="inline-flex items-center gap-2 text-[11px]">
          <input data-testid="pref-clipboard" type="checkbox" checked={osClipboard} onChange={(e) => setOSClipboard(e.target.checked)} />
          Mirror copy/paste
        </label>
      </DialogField>
    </>
  );
}

function ShortcutsTab() {
  const shortcuts = usePrefsStore((s) => s.shortcuts);
  const setShortcut = usePrefsStore((s) => s.setShortcut);
  const resetAll = usePrefsStore((s) => s.resetAllShortcuts);
  const [filter, setFilter] = useState('');
  const [capturing, setCapturing] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, ShortcutAction[]>();
    for (const a of SHORTCUT_ACTIONS) {
      if (filter && !a.label.toLowerCase().includes(filter.toLowerCase()) && !a.id.includes(filter.toLowerCase())) continue;
      const arr = map.get(a.group) ?? [];
      arr.push(a);
      map.set(a.group, arr);
    }
    return Array.from(map.entries());
  }, [filter]);

  // Global key capture while a row is listening for a new combo.
  useEffect(() => {
    if (!capturing) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setCapturing(null); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setShortcut(capturing!, '');
        setCapturing(null);
        return;
      }
      const combo = keyEventToShortcut(e);
      if (!combo) return;
      // Detect collisions.
      const existing = Object.entries(shortcuts).find(([id, k]) => k === combo && id !== capturing);
      if (existing) toast(`Note: ${combo} was bound to "${existing[0]}" — that binding has been cleared.`);
      // Clear the colliding action so the new one wins.
      const next = { ...shortcuts };
      if (existing) next[existing[0]] = '';
      next[capturing!] = combo;
      for (const [id, k] of Object.entries(next)) setShortcut(id, k);
      setCapturing(null);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, shortcuts, setShortcut]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          data-testid="pref-sc-filter"
          placeholder="Filter actions…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 bg-panel2 border border-border rounded px-2 py-1 text-[11px] outline-none focus:border-accent"
        />
        <button
          data-testid="pref-sc-reset-all"
          onClick={() => { resetAll(); toast('Shortcuts reset to defaults'); }}
          className="text-[11px] px-2 py-1 border border-border rounded hover:bg-panel2"
        >Reset all</button>
      </div>
      <div className="border border-border rounded max-h-[50vh] overflow-auto">
        {groups.map(([group, actions]) => (
          <div key={group}>
            <div className="sticky top-0 bg-panel2 text-[10px] uppercase tracking-wider text-ink/60 px-2 py-1 border-b border-border">{group}</div>
            {actions.map((a) => {
              const combo = shortcuts[a.id] ?? '';
              const listening = capturing === a.id;
              const def = DEFAULT_SHORTCUTS[a.id] ?? '';
              const changed = combo !== def;
              return (
                <div
                  key={a.id}
                  data-testid={`pref-sc-row-${a.id}`}
                  className="flex items-center gap-2 px-2 py-1 border-b border-border/40 last:border-0 hover:bg-panel2"
                >
                  <span className="flex-1 text-[11px] text-ink/85 truncate" title={a.id}>{a.label}</span>
                  <button
                    data-testid={`pref-sc-edit-${a.id}`}
                    onClick={() => setCapturing(a.id)}
                    className={`min-w-[110px] text-center text-[11px] font-mono px-2 py-0.5 rounded border ${listening ? 'bg-accent/30 border-accent text-white animate-pulse' : 'bg-panel border-border text-ink/80 hover:text-white'}`}
                  >
                    {listening ? 'Press keys…' : (combo || '—')}
                  </button>
                  {changed && !listening && (
                    <button
                      data-testid={`pref-sc-reset-${a.id}`}
                      onClick={() => usePrefsStore.getState().resetShortcut(a.id)}
                      className="text-[10px] text-ink/60 hover:text-white"
                      title={`Reset to ${def || 'unbound'}`}
                    >↺</button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-ink/50">Click a shortcut and press the desired key combo. Backspace clears. Esc cancels.</p>
    </div>
  );
}
