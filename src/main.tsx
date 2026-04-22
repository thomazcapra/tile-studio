import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useEditorStore } from './store/editor';
import { generateTilesetFromImage } from './tileset/generate';
import { generateTilesetAsync } from './tileset/generate-async';
import { quantize } from './color/quantize';
import { quantizeAsync } from './color/quantize-async';
import { pixelate } from './color/pixelate';
import { TOOLS } from './tools/tools';

if (import.meta.env.DEV) {
  // Exposed for E2E tests + ad-hoc debugging. Never rely on this at runtime.
  (globalThis as unknown as { __tileStudio: unknown }).__tileStudio = {
    store: useEditorStore,
    generateTilesetFromImage,
    generateTilesetAsync,
    quantize,
    quantizeAsync,
    pixelate,
    tools: TOOLS,
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
