import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getAutosave, clearAutosave } from '../io/autosave';
import { deserializeSprite } from '../io/native';
import { useEditorStore } from '../store/editor';

// On first mount, try to restore the latest autosaved sprite from IndexedDB.
// Shows a toast with Discard action so the user can opt back to a blank sprite.
export function useRestoreAutosave() {
  const didRun = useRef(false);
  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    (async () => {
      try {
        const bytes = await getAutosave();
        if (!bytes) return;
        const sprite = deserializeSprite(bytes);
        useEditorStore.getState().replaceSprite(sprite);
        // Re-center once layout has settled.
        requestAnimationFrame(() => {
          const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
          if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
        });
        toast.success(`Restored "${sprite.name}" from autosave`, {
          action: {
            label: 'Discard',
            onClick: () => {
              clearAutosave().catch(() => {});
              location.reload();
            },
          },
          duration: 5000,
        });
      } catch (err) {
        console.warn('[restore-autosave]', err);
      }
    })();
  }, []);
}
