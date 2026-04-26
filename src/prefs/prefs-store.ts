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
  // --- Pen / touch (Phase 2) ---
  penPressureSize: boolean;            // when on, pen pressure scales pencil/eraser brush size
  penPressureMin: number;              // floor for pressure scaling (0..1)

  setShortcut: (actionId: string, combo: string) => void;
  resetShortcut: (actionId: string) => void;
  resetAllShortcuts: () => void;
  setCheckerSize: (n: number) => void;
  setAutosaveEnabled: (b: boolean) => void;
  setAutosaveInterval: (sec: number) => void;
  setShowGrid: (b: boolean) => void;
  pushColorHistory: (color: number) => void;
  setOSClipboardEnabled: (b: boolean) => void;
  setPenPressureSize: (b: boolean) => void;
  setPenPressureMin: (n: number) => void;
}

const LS_KEY = 'tileStudio.prefs.v1';

type PersistedPrefs = Pick<PrefsState,
  'shortcuts' | 'checkerSize' | 'autosaveEnabled' | 'autosaveIntervalSec' | 'showGrid'
  | 'pickerColorHistory' | 'osClipboardEnabled' | 'penPressureSize' | 'penPressureMin'>;

function loadInitial(): PersistedPrefs {
  const defaults: PersistedPrefs = {
    shortcuts: { ...DEFAULT_SHORTCUTS },
    checkerSize: 8,
    autosaveEnabled: true,
    autosaveIntervalSec: 10,
    showGrid: true,
    pickerColorHistory: [] as number[],
    osClipboardEnabled: true,
    penPressureSize: true,
    penPressureMin: 0.1,
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedPrefs>;
    return {
      ...defaults,
      ...parsed,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts ?? {}) },
    };
  } catch {
    return defaults;
  }
}

function persist(s: PersistedPrefs) {
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
  setPenPressureSize: (b) => { persist({ ...get(), penPressureSize: b }); set({ penPressureSize: b }); },
  setPenPressureMin: (n) => {
    const v = Math.max(0, Math.min(1, n));
    persist({ ...get(), penPressureMin: v });
    set({ penPressureMin: v });
  },
}));
