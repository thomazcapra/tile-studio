import { useEffect } from 'react';
import { useEditorStore } from '../store/editor';
import { serializeSprite } from '../io/native';
import { putAutosave } from '../io/autosave';
import { usePrefsStore } from '../prefs/prefs-store';

// Debounced autosave: serialize + write to IndexedDB ~1s after the last sprite change.
// Cheap side effect: exposes a numeric status tick for any UI that wants to react.
export function useAutosave() {
  const autosaveEnabled = usePrefsStore((s) => s.autosaveEnabled);
  const autosaveIntervalSec = usePrefsStore((s) => s.autosaveIntervalSec);

  useEffect(() => {
    if (!autosaveEnabled) return;

    let timer: number | null = null;
    let lastSig: string | null = null;
    const delayMs = Math.max(200, autosaveIntervalSec * 1000);

    const unsub = useEditorStore.subscribe((s) => {
      const sig = `${s.sprite.id}|${s.dirtyTick}|${s.sprite.layers.length}|${s.sprite.frames.length}|${s.sprite.tilesets.length}`;
      if (sig === lastSig) return;
      lastSig = sig;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        try {
          const bytes = serializeSprite(useEditorStore.getState().sprite);
          await putAutosave(bytes);
        } catch (err) {
          // Silent — autosave failures shouldn't interrupt the user.
          console.warn('[autosave]', err);
        }
      }, delayMs);
    });

    return () => {
      unsub();
      if (timer) window.clearTimeout(timer);
    };
  }, [autosaveEnabled, autosaveIntervalSec]);
}
