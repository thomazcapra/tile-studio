import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { SidePanel } from './components/SidePanel';
import { StatusBar } from './components/StatusBar';
import { Viewport } from './components/Viewport';
import { ToolPalette } from './components/ToolPalette';
import { Timeline } from './components/Timeline';
import { useShortcuts } from './hooks/useShortcuts';
import { usePlayback } from './hooks/usePlayback';
import { useAutosave } from './hooks/useAutosave';
import { useRestoreAutosave } from './hooks/useRestoreAutosave';
import { decodePNG, spriteFromImage } from './io/png';
import { useEditorStore } from './store/editor';

export default function App() {
  useShortcuts();
  usePlayback();
  useRestoreAutosave();
  useAutosave();
  useDragDrop();

  return (
    <div className="h-full flex flex-col" data-testid="app-root">
      <MenuBar />
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <ToolPalette />
        <Viewport />
        <SidePanel />
      </div>
      <Timeline />
      <StatusBar />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: { background: '#252526', border: '1px solid #3c3c3c', color: '#d4d4d4' },
        }}
      />
    </div>
  );
}

function useDragDrop() {
  const replaceSprite = useEditorStore((s) => s.replaceSprite);
  const [over, setOver] = useState(false);
  useEffect(() => {
    function prevent(e: DragEvent) { e.preventDefault(); }
    function onEnter(e: DragEvent) { prevent(e); setOver(true); }
    function onLeave(e: DragEvent) { prevent(e); setOver(false); }
    async function onDrop(e: DragEvent) {
      prevent(e); setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f || !f.type.startsWith('image/')) return;
      try {
        const img = await decodePNG(f);
        replaceSprite(spriteFromImage(img, f.name.replace(/\.[^.]+$/, '')));
        const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
        if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
        toast.success(`Imported ${f.name}`);
      } catch (err) {
        toast.error(`Import failed: ${(err as Error).message}`);
      }
    }
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', prevent);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [replaceSprite]);
  useEffect(() => {
    // Visual feedback via body class so the rest of the tree doesn't re-render.
    document.body.style.outline = over ? '3px dashed rgba(55,148,255,0.7)' : '';
    document.body.style.outlineOffset = over ? '-8px' : '';
  }, [over]);
}
