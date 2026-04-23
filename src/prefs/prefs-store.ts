// User preferences store. Persisted to localStorage, independent from the
// sprite store to avoid unnecessary re-renders when prefs change.

import { create } from 'zustand';
import { DEFAULT_SHORTCUTS } from './shortcuts';

export interface PrefsState {
  shortcuts: Record<string, string>;   // actionId → key combo
  checkerSize: number;                 // background checker grid size (px)
  autosaveEnabled: boolean;
  autosaveIntervalSec: number;
  showGrid: boolean;                   // show pixel grid at high zoom
  pickerColorHistory: number[];        // most-recent color picker entries
  osClipboardEnabled: boolean;         // mirror selections to the OS clipboard

  setShortcut: (actionId: string, combo: string) => void;
  resetShortcut: (actionId: string) => void;
  resetAllShortcuts: () => void;
  setCheckerSize: (n: number) => void;
  setAutosaveEnabled: (b: boolean) => void;
  setAutosaveInterval: (sec: number) => void;
  setShowGrid: (b: boolean) => void;
  pushColorHistory: (color: number) => void;
  setOSClipboardEnabled: (b: boolean) => void;
}

const LS_KEY = 'tileStudio.prefs.v1';

function loadInitial(): Pick<PrefsState, 'shortcuts' | 'checkerSize' | 'autosaveEnabled' | 'autosaveIntervalSec' | 'showGrid' | 'pickerColorHistory' | 'osClipboardEnabled'> {
  const defaults = {
    shortcuts: { ...DEFAULT_SHORTCUTS },
    checkerSize: 8,
    autosaveEnabled: true,
    autosaveIntervalSec: 10,
    showGrid: true,
    pickerColorHistory: [] as number[],
    osClipboardEnabled: true,
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<typeof defaults>;
    return {
      ...defaults,
      ...parsed,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts ?? {}) },
    };
  } catch {
    return defaults;
  }
}

function persist(s: Pick<PrefsState, 'shortcuts' | 'checkerSize' | 'autosaveEnabled' | 'autosaveIntervalSec' | 'showGrid' | 'pickerColorHistory' | 'osClipboardEnabled'>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore quota */ }
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ...loadInitial(),

  setShortcut: (actionId, combo) => {
    const shortcuts = { ...get().shortcuts, [actionId]: combo };
    persist({ ...get(), shortcuts });
    set({ shortcuts });
  },
  resetShortcut: (actionId) => {
    const shortcuts = { ...get().shortcuts, [actionId]: DEFAULT_SHORTCUTS[actionId] ?? '' };
    persist({ ...get(), shortcuts });
    set({ shortcuts });
  },
  resetAllShortcuts: () => {
    const shortcuts = { ...DEFAULT_SHORTCUTS };
    persist({ ...get(), shortcuts });
    set({ shortcuts });
  },
  setCheckerSize: (n) => {
    const v = Math.max(1, Math.min(64, n | 0));
    persist({ ...get(), checkerSize: v });
    set({ checkerSize: v });
  },
  setAutosaveEnabled: (b) => {
    persist({ ...get(), autosaveEnabled: b });
    set({ autosaveEnabled: b });
  },
  setAutosaveInterval: (sec) => {
    const v = Math.max(2, Math.min(300, sec | 0));
    persist({ ...get(), autosaveIntervalSec: v });
    set({ autosaveIntervalSec: v });
  },
  setShowGrid: (b) => { persist({ ...get(), showGrid: b }); set({ showGrid: b }); },
  pushColorHistory: (color) => {
    const prev = get().pickerColorHistory;
    const next = [color, ...prev.filter((c) => c !== color)].slice(0, 16);
    persist({ ...get(), pickerColorHistory: next });
    set({ pickerColorHistory: next });
  },
  setOSClipboardEnabled: (b) => { persist({ ...get(), osClipboardEnabled: b }); set({ osClipboardEnabled: b }); },
}));
