import { useEffect } from 'react';
import { useEditorStore } from '../store/editor';

// Global keyboard shortcuts. Called once at app root.
export function useShortcuts() {
  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    }

    function onKey(e: KeyboardEvent) {
      if (isEditable(e.target)) return;
      const s = useEditorStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); s.undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); s.redo(); return; }

      // Project save / open — dispatched as a DOM event that MenuBar listens for.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('tile-studio:action', { detail: 'save-project' }));
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('tile-studio:action', { detail: 'open-project' }));
        return;
      }

      // Selection shortcuts.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); s.selectAll(); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); s.deselect(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); s.invertSelection(); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); s.cutSelection(); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); s.copySelection(); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); s.pasteSelection(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
        e.preventDefault(); s.deleteSelectionContent(); return;
      }
      if (e.key === 'Escape' && s.selection) { e.preventDefault(); s.deselect(); return; }

      // Playback & frame navigation. When a selection exists, arrow keys nudge the
      // selection content instead (Aseprite convention). Shift = 10 px.
      if (!mod && !e.altKey) {
        if (e.key === ' ') { e.preventDefault(); s.togglePlay(); return; }
        if (e.key.startsWith('Arrow')) {
          if (s.selection) {
            const step = e.shiftKey ? 10 : 1;
            e.preventDefault();
            if (e.key === 'ArrowLeft') s.nudgeSelection(-step, 0);
            else if (e.key === 'ArrowRight') s.nudgeSelection(step, 0);
            else if (e.key === 'ArrowUp') s.nudgeSelection(0, -step);
            else if (e.key === 'ArrowDown') s.nudgeSelection(0, step);
            return;
          }
          if (e.key === 'ArrowLeft') { e.preventDefault(); s.prevFrame(); return; }
          if (e.key === 'ArrowRight') { e.preventDefault(); s.nextFrame(); return; }
        }
      }

      if (!mod && !e.altKey) {
        if (e.key === '[') { e.preventDefault(); s.setBrushSize(s.brushSize - 1); return; }
        if (e.key === ']') { e.preventDefault(); s.setBrushSize(s.brushSize + 1); return; }
        // Zoom presets.
        if (e.key === '0') {
          e.preventDefault();
          const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
          if (vp) s.resetView(vp.clientWidth, vp.clientHeight);
          return;
        }
        if (e.key === '1') { e.preventDefault(); s.setZoom(1); return; }
        if (e.key === '2') { e.preventDefault(); s.setZoom(2); return; }
        if (e.key === '4') { e.preventDefault(); s.setZoom(4); return; }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); s.setZoom(s.viewport.zoom * 2); return; }
        if (e.key === '-') { e.preventDefault(); s.setZoom(s.viewport.zoom / 2); return; }
        switch (e.key.toLowerCase()) {
          case 'b': s.setTool('pencil'); break;
          case 'e': s.setTool('eraser'); break;
          case 'g': s.setTool('bucket'); break;
          case 'i': s.setTool('eyedropper'); break;
          case 'l': s.setTool('line'); break;
          case 'u': s.setTool(e.shiftKey ? 'rectfill' : 'rect'); break;
          case 'x': s.swapColors(); break;
          case 'f': if (s.mode === 'tilemap') s.toggleBrushFlip('x'); break;
          case 'v': if (s.mode === 'tilemap') s.toggleBrushFlip('y'); break;
          case 'r': if (s.mode === 'tilemap') s.toggleBrushFlip('d'); break;
          case 'n': s.toggleShowTileNumbers(); break;
          case 'o': s.toggleOnionSkin(); break;
          case 'p': s.togglePixelPerfect(); break;
          case 'm': s.setTool(e.shiftKey ? 'select-ellipse' : 'select-rect'); break;
          case 'q': s.setTool('select-lasso'); break;
          case 'w': s.setTool('select-wand'); break;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
