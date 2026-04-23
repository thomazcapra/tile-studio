import { useEffect } from 'react';
import { useEditorStore } from '../store/editor';
import { usePrefsStore } from '../prefs/prefs-store';
import { ACTION_BY_ID, keyEventToShortcut } from '../prefs/shortcuts';

// Global keyboard shortcuts. Called once at app root.
// Reads bindings from the prefs store so user customizations take effect live.
export function useShortcuts() {
  const shortcuts = usePrefsStore((s) => s.shortcuts);

  useEffect(() => {
    // Build a combo→actionId lookup each time bindings change.
    const comboToAction = new Map<string, string>();
    for (const [actionId, combo] of Object.entries(shortcuts)) {
      if (!combo) continue;
      comboToAction.set(combo, actionId);
    }

    function isEditable(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    }

    function onKey(e: KeyboardEvent) {
      if (isEditable(e.target)) return;
      const s = useEditorStore.getState();

      // Arrow keys: selection nudge / frame navigation. Kept hard-coded because
      // they're context-sensitive and don't fit the "one combo → one action" model.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.startsWith('Arrow')) {
        if (s.selection) {
          const step = e.shiftKey ? 10 : 1;
          e.preventDefault();
          if (e.key === 'ArrowLeft') s.nudgeSelection(-step, 0);
          else if (e.key === 'ArrowRight') s.nudgeSelection(step, 0);
          else if (e.key === 'ArrowUp') s.nudgeSelection(0, -step);
          else if (e.key === 'ArrowDown') s.nudgeSelection(0, step);
          return;
        }
        if (s.tilemapRegion) {
          const step = e.shiftKey ? 10 : 1;
          e.preventDefault();
          if (e.key === 'ArrowLeft') s.nudgeTilemapRegion(-step, 0);
          else if (e.key === 'ArrowRight') s.nudgeTilemapRegion(step, 0);
          else if (e.key === 'ArrowUp') s.nudgeTilemapRegion(0, -step);
          else if (e.key === 'ArrowDown') s.nudgeTilemapRegion(0, step);
          return;
        }
        e.preventDefault();
        if (e.key === 'ArrowLeft') s.prevFrame();
        else if (e.key === 'ArrowRight') s.nextFrame();
        return;
      }

      if (e.key === 'Escape' && s.selection) { e.preventDefault(); s.deselect(); return; }
      if (e.key === 'Escape' && s.tilemapRegion) { e.preventDefault(); s.setTilemapRegion(null); return; }

      const combo = keyEventToShortcut(e);
      if (!combo) return;
      const actionId = comboToAction.get(combo);
      if (!actionId) return;
      const action = ACTION_BY_ID.get(actionId);
      if (!action) return;
      e.preventDefault();
      action.run();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts]);
}
