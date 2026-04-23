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
import * as paletteIO from './io/palette-io';
import * as exporters from './io/export';
import * as nativeIO from './io/native';
import { usePrefsStore } from './prefs/prefs-store';
import { SHORTCUT_ACTIONS, keyEventToShortcut, DEFAULT_SHORTCUTS } from './prefs/shortcuts';
import { autoTileGrid, CANONICAL_WANG_16 } from './tileset/autotile';
import { WIKI_PAGES } from './wiki/content';

if (import.meta.env.DEV) {
  // Exposed for E2E tests + ad-hoc debugging. Never rely on this at runtime.
  (globalThis as unknown as { __tileStudio: unknown }).__tileStudio = {
    store: useEditorStore,
    prefs: usePrefsStore,
    generateTilesetFromImage,
    generateTilesetAsync,
    quantize,
    quantizeAsync,
    pixelate,
    tools: TOOLS,
    paletteIO,
    exporters,
    nativeIO,
    shortcuts: { SHORTCUT_ACTIONS, keyEventToShortcut, DEFAULT_SHORTCUTS },
    autotile: { autoTileGrid, CANONICAL_WANG_16 },
    wiki: { pages: WIKI_PAGES.map((page) => ({ slug: page.slug, title: page.title })) },
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
