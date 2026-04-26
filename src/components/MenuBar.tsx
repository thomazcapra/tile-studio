import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useEditorStore } from '../store/editor';
import { newSprite } from '../model/factory';
import { decodePNG, downloadBlob, pickFile, spriteFromImage } from '../io/png';
import { serializeSprite, deserializeSprite } from '../io/native';
import { clearAutosave } from '../io/autosave';
import { ExportDialog } from './ExportDialog';
import { GenerateTilesetDialog } from './GenerateTilesetDialog';
import { NewTilesetDialog } from './NewTilesetDialog';
import { NewTilemapLayerDialog } from './NewTilemapLayerDialog';
import { QuantizeDialog } from './QuantizeDialog';
import { LayerPropertiesDialog } from './LayerPropertiesDialog';
import { TilesetPropertiesDialog } from './TilesetPropertiesDialog';
import { ResizeCanvasDialog } from './ResizeCanvasDialog';
import { PaletteEditorDialog } from './PaletteEditorDialog';
import { SpriteSizeDialog } from './SpriteSizeDialog';
import { ImportSpriteSheetDialog } from './ImportSpriteSheetDialog';
import { PreferencesDialog } from './PreferencesDialog';

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  sep?: boolean;
  check?: boolean;
  testId?: string;
}

interface MenuProps {
  id: string;
  label: string;
  items: MenuItem[];
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
}

function Menu({ id, label, items, openMenu, setOpenMenu }: MenuProps) {
  const isOpen = openMenu === id;
  // Hover-to-switch when another menu is open: keep on fine pointers (mouse), but skip on
  // coarse / hover-none devices (touch / pen) where hover events are unreliable.
  const switchOnHover = () => {
    if (!openMenu || openMenu === id) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) return;
    setOpenMenu(id);
  };
  return (
    <div className="relative" onMouseEnter={switchOnHover}>
      <button
        data-testid={`menu-${id}`}
        onClick={() => setOpenMenu(isOpen ? null : id)}
        className={clsx(
          'px-2.5 h-7 coarse:h-10 coarse:px-3 text-[12px] rounded-md transition-colors',
          isOpen ? 'bg-panel2 text-white' : 'text-ink/80 hover:bg-panel2 hover:text-white'
        )}
      >
        {label}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full mt-0.5 min-w-[220px] rounded-md border border-border bg-panel2 shadow-2xl py-1 z-40">
          {items.map((it, i) => it.sep ? (
            <div key={`sep-${i}`} className="h-px bg-border my-1" />
          ) : (
            <button
              key={i}
              data-testid={it.testId}
              disabled={it.disabled}
              onClick={() => { it.onClick?.(); setOpenMenu(null); }}
              className={clsx(
                'w-full flex items-center gap-2 px-2.5 py-1 coarse:py-2 text-left text-[12px]',
                it.disabled
                  ? 'text-ink/35 cursor-not-allowed'
                  : 'text-ink/85 hover:text-white hover:bg-panel'
              )}
            >
              <span className="w-4 shrink-0 text-accent">{it.check ? '✓' : ''}</span>
              <span className="flex-1">{it.label}</span>
              {it.shortcut && <span className="text-ink/40 font-mono text-[10px]">{it.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [newTsOpen, setNewTsOpen] = useState(false);
  const [newTmlOpen, setNewTmlOpen] = useState(false);
  const [quantizeOpen, setQuantizeOpen] = useState(false);
  const [layerPropsOpen, setLayerPropsOpen] = useState(false);
  const [tsPropsOpen, setTsPropsOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [spriteSizeOpen, setSpriteSizeOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const sprite = useEditorStore((s) => s.sprite);
  const customBrush = useEditorStore((s) => s.customBrush);
  const distractionFree = useEditorStore((s) => s.distractionFree);
  const currentLayerId = useEditorStore((s) => s.currentLayerId);
  const selectedTile = useEditorStore((s) => s.selectedTile);
  const tiledMode = useEditorStore((s) => s.tiledMode);
  const showTileNumbers = useEditorStore((s) => s.showTileNumbers);
  const setTiledMode = useEditorStore((s) => s.setTiledMode);
  const toggleShowTileNumbers = useEditorStore((s) => s.toggleShowTileNumbers);
  const onionSkinEnabled = useEditorStore((s) => s.onionSkinEnabled);
  const toggleOnionSkin = useEditorStore((s) => s.toggleOnionSkin);
  const symmetryMode = useEditorStore((s) => s.symmetryMode);
  const setSymmetryMode = useEditorStore((s) => s.setSymmetryMode);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);
  const toggleSnapToGrid = useEditorStore((s) => s.toggleSnapToGrid);
  const replaceSprite = useEditorStore((s) => s.replaceSprite);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.undoStack.length > 0);
  const canRedo = useEditorStore((s) => s.redoStack.length > 0);
  const convertTilemapToRaster = useEditorStore((s) => s.convertTilemapToRaster);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const addRasterLayer = useEditorStore((s) => s.addRasterLayer);
  const addGroupLayer = useEditorStore((s) => s.addGroupLayer);
  const duplicateLayerAction = useEditorStore((s) => s.duplicateLayer);
  const moveLayerUp = useEditorStore((s) => s.moveLayerUp);
  const moveLayerDown = useEditorStore((s) => s.moveLayerDown);
  const mergeLayerDown = useEditorStore((s) => s.mergeLayerDown);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const addFrame = useEditorStore((s) => s.addFrame);
  const duplicateFrame = useEditorStore((s) => s.duplicateFrame);
  const deleteFrame = useEditorStore((s) => s.deleteFrame);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const nextFrame = useEditorStore((s) => s.nextFrame);
  const prevFrame = useEditorStore((s) => s.prevFrame);
  const frameCount = sprite.frames.length;

  const currentLayer = sprite.layers.find((l) => l.id === currentLayerId);
  const isRaster = currentLayer?.type === 'raster';
  const isTilemap = currentLayer?.type === 'tilemap';
  const tsIdForProps = selectedTile?.tilesetId
    ?? (isTilemap ? (currentLayer as { tilesetId: string }).tilesetId : sprite.tilesets[0]?.id)
    ?? null;

  // Close on outside click or Escape.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!barRef.current) return;
      if (!barRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Global action bus (keyboard shortcuts + command palette dispatch these).
  useEffect(() => {
    function handler(e: Event) {
      const action = (e as CustomEvent<string>).detail;
      if (action === 'save-project') onSaveProject();
      else if (action === 'open-project') onOpenProject();
      else if (action === 'file-new') onNew();
      else if (action === 'open-export') setExportOpen(true);
      else if (action === 'open-preferences') setPrefsOpen(true);
      else if (action === 'open-palette-editor') setPaletteOpen(true);
    }
    window.addEventListener('tile-studio:action', handler);
    return () => window.removeEventListener('tile-studio:action', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite]);

  function onNew() {
    replaceSprite(newSprite(64, 64));
    const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
    if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
    toast('New sprite');
  }

  async function onOpen() {
    const f = await pickFile('image/png,image/*');
    if (!f) return;
    try {
      const img = await decodePNG(f);
      replaceSprite(spriteFromImage(img, f.name.replace(/\.[^.]+$/, '')));
      const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
      if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
      toast.success(`Imported ${f.name} (${img.w}×${img.h})`);
    } catch (err) {
      toast.error(`Failed to import: ${(err as Error).message}`);
    }
  }

  function onSaveProject() {
    const name = sprite.name?.replace(/[^a-z0-9_-]/gi, '') || 'project';
    const bytes = serializeSprite(sprite);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
    downloadBlob(blob, `${name}.tstudio`);
    toast.success(`Saved ${name}.tstudio`);
  }

  async function onOpenProject() {
    const f = await pickFile('.tstudio,application/zip');
    if (!f) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const loaded = deserializeSprite(bytes);
      replaceSprite(loaded);
      const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
      if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
      toast.success(`Loaded project "${loaded.name}"`);
    } catch (err) {
      toast.error(`Failed to open: ${(err as Error).message}`);
    }
  }

  async function onDiscardAutosave() {
    try { await clearAutosave(); toast('Autosave cleared — reload for a blank sprite'); }
    catch (err) { toast.error(`Failed: ${(err as Error).message}`); }
  }

  function onFlatten() {
    if (!currentLayer || currentLayer.type !== 'tilemap') {
      toast.error('Active layer is not a tilemap');
      return;
    }
    if (convertTilemapToRaster(currentLayer.id)) {
      toast.success(`Flattened ${currentLayer.name}`);
    }
  }

  function onDeleteLayer() {
    if (!currentLayer) return;
    if (sprite.layers.length <= 1) { toast.error('Cannot delete the last layer'); return; }
    deleteLayer(currentLayer.id);
    toast(`Deleted ${currentLayer.name}`);
  }

  const fileMenu: MenuItem[] = [
    { label: 'New', shortcut: 'Ctrl+N', onClick: onNew, testId: 'm-file-new' },
    { sep: true, label: '' },
    { label: 'Save Project…', shortcut: 'Ctrl+S', onClick: onSaveProject, testId: 'm-file-save-project' },
    { label: 'Open Project…', shortcut: 'Ctrl+Shift+O', onClick: onOpenProject, testId: 'm-file-open-project' },
    { sep: true, label: '' },
    { label: 'Import PNG…', shortcut: 'Ctrl+O', onClick: onOpen, testId: 'm-file-open' },
    { label: 'Import Sprite Sheet…', onClick: () => setImportSheetOpen(true), testId: 'm-file-import-sheet' },
    { label: 'Export…', shortcut: 'Ctrl+Shift+E', onClick: () => setExportOpen(true), testId: 'm-file-export' },
    { sep: true, label: '' },
    { label: 'Discard Autosave', onClick: onDiscardAutosave, testId: 'm-file-discard-autosave' },
  ];
  const editMenu: MenuItem[] = [
    { label: 'Undo', shortcut: 'Ctrl+Z', onClick: undo, disabled: !canUndo, testId: 'm-edit-undo' },
    { label: 'Redo', shortcut: 'Ctrl+Shift+Z', onClick: redo, disabled: !canRedo, testId: 'm-edit-redo' },
    { sep: true, label: '' },
    { label: 'Preferences…', onClick: () => setPrefsOpen(true), testId: 'm-edit-prefs' },
  ];
  const viewMenu: MenuItem[] = [
    { label: 'Tiled Mode: None', check: tiledMode === 'none', onClick: () => setTiledMode('none'), testId: 'm-view-tiled-none' },
    { label: 'Tiled Mode: X Axis', check: tiledMode === 'x', onClick: () => setTiledMode('x'), testId: 'm-view-tiled-x' },
    { label: 'Tiled Mode: Y Axis', check: tiledMode === 'y', onClick: () => setTiledMode('y'), testId: 'm-view-tiled-y' },
    { label: 'Tiled Mode: Both', check: tiledMode === 'both', onClick: () => setTiledMode('both'), testId: 'm-view-tiled-both' },
    { sep: true, label: '' },
    { label: 'Show Tile Numbers', shortcut: 'N', check: showTileNumbers, onClick: toggleShowTileNumbers, testId: 'm-view-tile-numbers' },
    { label: 'Onion Skin', shortcut: 'O', check: onionSkinEnabled, onClick: toggleOnionSkin, testId: 'm-view-onion' },
    { sep: true, label: '' },
    { label: 'Symmetry: Off', check: symmetryMode === 'none', onClick: () => setSymmetryMode('none'), testId: 'm-view-sym-none' },
    { label: 'Symmetry: Horizontal', check: symmetryMode === 'h', onClick: () => setSymmetryMode('h'), testId: 'm-view-sym-h' },
    { label: 'Symmetry: Vertical', check: symmetryMode === 'v', onClick: () => setSymmetryMode('v'), testId: 'm-view-sym-v' },
    { label: 'Symmetry: Both', check: symmetryMode === 'both', onClick: () => setSymmetryMode('both'), testId: 'm-view-sym-both' },
    { sep: true, label: '' },
    { label: 'Snap to Grid', check: snapToGrid, onClick: toggleSnapToGrid, testId: 'm-view-snap' },
    { sep: true, label: '' },
    { label: 'Clear Guides', onClick: () => useEditorStore.getState().clearGuides(), testId: 'm-view-clear-guides' },
    { label: 'Distraction Free', shortcut: 'Tab', check: distractionFree, onClick: () => useEditorStore.getState().toggleDistractionFree(), testId: 'm-view-distraction' },
    { sep: true, label: '' },
    { label: 'Fit to Window', shortcut: '0', onClick: () => {
      const vp = document.querySelector<HTMLElement>('[data-testid="viewport-container"]');
      if (vp) useEditorStore.getState().resetView(vp.clientWidth, vp.clientHeight);
    }, testId: 'm-view-fit' },
    { label: 'Zoom 100%', shortcut: '1', onClick: () => useEditorStore.getState().setZoom(1), testId: 'm-view-zoom-100' },
    { label: 'Zoom 200%', shortcut: '2', onClick: () => useEditorStore.getState().setZoom(2), testId: 'm-view-zoom-200' },
    { label: 'Zoom 400%', shortcut: '4', onClick: () => useEditorStore.getState().setZoom(4), testId: 'm-view-zoom-400' },
    { label: 'Zoom 800%', onClick: () => useEditorStore.getState().setZoom(8), testId: 'm-view-zoom-800' },
    { label: 'Zoom 1600%', onClick: () => useEditorStore.getState().setZoom(16), testId: 'm-view-zoom-1600' },
  ];
  async function onNewReferenceLayer() {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      const img = await decodePNG(f);
      const id = useEditorStore.getState().addReferenceLayer(img, f.name.replace(/\.[^.]+$/, ''));
      if (id) toast.success(`Reference layer added from ${f.name}`);
    } catch (err) {
      toast.error(`Reference failed: ${(err as Error).message}`);
    }
  }
  const layerMenu: MenuItem[] = [
    { label: 'New Raster Layer', onClick: () => { addRasterLayer(); toast('New raster layer'); }, testId: 'm-layer-new-raster' },
    { label: 'New Tilemap Layer…', onClick: () => setNewTmlOpen(true), testId: 'm-layer-new-tilemap' },
    { label: 'New Group', onClick: () => { addGroupLayer(); toast('New group'); }, testId: 'm-layer-new-group' },
    { label: 'New Reference Layer…', onClick: onNewReferenceLayer, testId: 'm-layer-new-ref' },
    { label: 'Duplicate Layer', onClick: () => { if (currentLayer) { duplicateLayerAction(currentLayer.id); toast('Duplicated layer'); } }, disabled: !currentLayer, testId: 'm-layer-duplicate' },
    { sep: true, label: '' },
    { label: 'Layer Properties…', shortcut: 'Ctrl+L', onClick: () => setLayerPropsOpen(true), disabled: !currentLayer, testId: 'm-layer-props' },
    { sep: true, label: '' },
    { label: 'Move Up', onClick: () => currentLayer && moveLayerUp(currentLayer.id), disabled: !currentLayer, testId: 'm-layer-up' },
    { label: 'Move Down', onClick: () => currentLayer && moveLayerDown(currentLayer.id), disabled: !currentLayer, testId: 'm-layer-down' },
    { label: 'Merge Down', onClick: () => { if (currentLayer && mergeLayerDown(currentLayer.id)) toast('Merged down'); else toast.error('Cannot merge (needs raster layer below)'); }, disabled: !currentLayer, testId: 'm-layer-merge' },
    { sep: true, label: '' },
    { label: 'Convert to Tilemap…', onClick: () => setGenerateOpen(true), disabled: !isRaster, testId: 'm-layer-to-tilemap' },
    { label: 'Flatten to Raster', onClick: onFlatten, disabled: !isTilemap, testId: 'm-layer-to-raster' },
    { sep: true, label: '' },
    { label: 'Delete Layer', onClick: onDeleteLayer, disabled: !currentLayer || sprite.layers.length <= 1, testId: 'm-layer-delete' },
  ];
  const rotateCanvas = useEditorStore((s) => s.rotateCanvas);
  const flipCanvas = useEditorStore((s) => s.flipCanvas);
  const autocrop = useEditorStore((s) => s.autocrop);
  const selection = useEditorStore((s) => s.selection);
  const clipboard = useEditorStore((s) => s.clipboard);
  const selectAll = useEditorStore((s) => s.selectAll);
  const deselect = useEditorStore((s) => s.deselect);
  const invertSelection = useEditorStore((s) => s.invertSelection);
  const cutSelection = useEditorStore((s) => s.cutSelection);
  const copySelection = useEditorStore((s) => s.copySelection);
  const pasteSelection = useEditorStore((s) => s.pasteSelection);
  const deleteSelectionContent = useEditorStore((s) => s.deleteSelectionContent);
  const flipSelectionContent = useEditorStore((s) => s.flipSelectionContent);
  const rotateSelection180 = useEditorStore((s) => s.rotateSelection180);

  const tilemapRegion = useEditorStore((s) => s.tilemapRegion);
  const flipTilemapRegion = useEditorStore((s) => s.flipTilemapRegion);
  const rotateTilemapRegion180 = useEditorStore((s) => s.rotateTilemapRegion180);
  const clearTilemapRegionContent = useEditorStore((s) => s.clearTilemapRegionContent);
  const setTilemapRegion = useEditorStore((s) => s.setTilemapRegion);

  const spriteMenu: MenuItem[] = [
    { label: 'Canvas Size…', onClick: () => setResizeOpen(true), testId: 'm-sprite-canvas-size' },
    { label: 'Sprite Size (Scale)…', onClick: () => setSpriteSizeOpen(true), testId: 'm-sprite-size' },
    { label: 'Trim (Autocrop)', onClick: () => { if (!autocrop()) toast('Nothing to trim'); else toast.success('Trimmed sprite'); }, testId: 'm-sprite-autocrop' },
    { sep: true, label: '' },
    { label: 'Rotate 90° CW', onClick: () => { rotateCanvas('cw'); toast('Rotated 90° CW'); }, testId: 'm-sprite-rot-cw' },
    { label: 'Rotate 90° CCW', onClick: () => { rotateCanvas('ccw'); toast('Rotated 90° CCW'); }, testId: 'm-sprite-rot-ccw' },
    { label: 'Rotate 180°', onClick: () => { rotateCanvas('180'); toast('Rotated 180°'); }, testId: 'm-sprite-rot-180' },
    { sep: true, label: '' },
    { label: 'Flip Horizontal', onClick: () => { flipCanvas('h'); toast('Flipped horizontally'); }, testId: 'm-sprite-flip-h' },
    { label: 'Flip Vertical', onClick: () => { flipCanvas('v'); toast('Flipped vertically'); }, testId: 'm-sprite-flip-v' },
  ];

  const selectMenu: MenuItem[] = [
    { label: 'Select All', shortcut: 'Ctrl+A', onClick: selectAll, testId: 'm-select-all' },
    { label: 'Deselect', shortcut: 'Ctrl+D', onClick: deselect, disabled: !selection, testId: 'm-select-deselect' },
    { label: 'Invert', shortcut: 'Ctrl+Shift+I', onClick: invertSelection, testId: 'm-select-invert' },
    { sep: true, label: '' },
    { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => { cutSelection(); }, disabled: !selection, testId: 'm-select-cut' },
    { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => { copySelection(); }, disabled: !selection, testId: 'm-select-copy' },
    { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => { pasteSelection(); }, disabled: !clipboard, testId: 'm-select-paste' },
    { label: 'Delete Contents', shortcut: 'Del', onClick: () => { deleteSelectionContent(); }, disabled: !selection, testId: 'm-select-delete' },
    { sep: true, label: '' },
    { label: 'Flip Selection Horizontal', onClick: () => { flipSelectionContent('h'); }, disabled: !selection, testId: 'm-select-flip-h' },
    { label: 'Flip Selection Vertical', onClick: () => { flipSelectionContent('v'); }, disabled: !selection, testId: 'm-select-flip-v' },
    { label: 'Rotate Selection 180°', onClick: () => { rotateSelection180(); }, disabled: !selection, testId: 'm-select-rot-180' },
    { label: 'Rotate Selection 90° CW', onClick: () => { useEditorStore.getState().rotateSelectionContent(90); }, disabled: !selection, testId: 'm-select-rot-90' },
    { label: 'Scale Selection 2×', onClick: () => { useEditorStore.getState().scaleSelectionContent(2, 2); }, disabled: !selection, testId: 'm-select-scale-2x' },
    { label: 'Scale Selection ½', onClick: () => { useEditorStore.getState().scaleSelectionContent(0.5, 0.5); }, disabled: !selection, testId: 'm-select-scale-half' },
    { label: 'Capture as Custom Brush', onClick: () => { useEditorStore.getState().captureCustomBrush(); toast('Custom brush captured'); }, disabled: !selection && !clipboard, testId: 'm-select-capture-brush' },
    { label: 'Clear Custom Brush', onClick: () => { useEditorStore.getState().clearCustomBrush(); }, disabled: !customBrush, testId: 'm-select-clear-brush' },
    { sep: true, label: '' },
    { label: 'Flip Tile Region Horizontal', onClick: () => { flipTilemapRegion('h'); }, disabled: !tilemapRegion, testId: 'm-tmap-flip-h' },
    { label: 'Flip Tile Region Vertical', onClick: () => { flipTilemapRegion('v'); }, disabled: !tilemapRegion, testId: 'm-tmap-flip-v' },
    { label: 'Rotate Tile Region 180°', onClick: () => { rotateTilemapRegion180(); }, disabled: !tilemapRegion, testId: 'm-tmap-rot-180' },
    { label: 'Clear Tile Region', onClick: () => { clearTilemapRegionContent(); }, disabled: !tilemapRegion, testId: 'm-tmap-clear' },
    { label: 'Deselect Tile Region', onClick: () => { setTilemapRegion(null); }, disabled: !tilemapRegion, testId: 'm-tmap-deselect' },
  ];

  const frameMenu: MenuItem[] = [
    { label: 'New Frame', shortcut: '', onClick: () => addFrame(currentFrame, false), testId: 'm-frame-new' },
    { label: 'Duplicate Frame', onClick: () => duplicateFrame(currentFrame), testId: 'm-frame-dup' },
    { label: 'Delete Frame', onClick: () => deleteFrame(currentFrame), disabled: frameCount <= 1, testId: 'm-frame-del' },
    { sep: true, label: '' },
    { label: 'Play / Pause', shortcut: 'Space', onClick: togglePlay, testId: 'm-frame-play' },
    { label: 'Previous Frame', shortcut: '←', onClick: prevFrame, testId: 'm-frame-prev' },
    { label: 'Next Frame', shortcut: '→', onClick: nextFrame, testId: 'm-frame-next' },
  ];
  const tilesetMenu: MenuItem[] = [
    { label: 'New Empty Tileset…', onClick: () => setNewTsOpen(true), testId: 'm-ts-new' },
    { label: 'Generate from Layer…', onClick: () => setGenerateOpen(true), disabled: !isRaster, testId: 'm-ts-generate' },
    { sep: true, label: '' },
    { label: 'Tileset Properties…', onClick: () => setTsPropsOpen(true), disabled: !tsIdForProps, testId: 'm-ts-props' },
    { sep: true, label: '' },
    { label: 'Reduce Colors…', onClick: () => setQuantizeOpen(true), disabled: !isRaster, testId: 'm-ts-quantize' },
    { label: 'Palette Editor…', onClick: () => setPaletteOpen(true), testId: 'm-ts-palette' },
  ];

  return (
    <div
      ref={barRef}
      data-testid="menu-bar"
      className="h-8 flex items-center px-2 gap-0.5 border-b border-border bg-panel text-sm"
    >
      <span className="font-semibold tracking-tight mr-3 flex items-center gap-1.5 text-[12px]">
        <span className="w-2 h-2 bg-accent rounded-sm" />
        Tile Studio
      </span>
      <Menu id="file" label="File" items={fileMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <Menu id="edit" label="Edit" items={editMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <Menu id="select" label="Select" items={selectMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <Menu id="view" label="View" items={viewMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <Menu id="sprite" label="Sprite" items={spriteMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <Menu id="layer" label="Layer" items={layerMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <Menu id="frame" label="Frame" items={frameMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <Menu id="tileset" label="Tileset" items={tilesetMenu} openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <a
        href="/wiki"
        target="_blank"
        rel="noreferrer"
        data-testid="menu-docs"
        className="px-2.5 h-7 text-[12px] rounded-md transition-colors inline-flex items-center gap-1.5 text-ink/80 hover:bg-panel2 hover:text-white"
        title="Open documentation (new tab)"
      >
        <BookOpen size={12} />
        <span>Docs</span>
      </a>
      <span className="flex-1" />
      <span
        className="px-2 h-6 inline-flex items-center rounded-md border border-border bg-panel2 text-ink/70 font-mono text-[10.5px] tracking-tight"
        title={`Tile Studio v${__APP_VERSION__}`}
        data-testid="app-version"
      >
        v{__APP_VERSION__}
      </span>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <GenerateTilesetDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      <NewTilesetDialog open={newTsOpen} onClose={() => setNewTsOpen(false)} />
      <NewTilemapLayerDialog open={newTmlOpen} onClose={() => setNewTmlOpen(false)} />
      <QuantizeDialog open={quantizeOpen} onClose={() => setQuantizeOpen(false)} />
      <LayerPropertiesDialog open={layerPropsOpen} layerId={currentLayerId} onClose={() => setLayerPropsOpen(false)} />
      <TilesetPropertiesDialog open={tsPropsOpen} tilesetId={tsIdForProps} onClose={() => setTsPropsOpen(false)} />
      <ResizeCanvasDialog open={resizeOpen} onClose={() => setResizeOpen(false)} />
      <PaletteEditorDialog open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <SpriteSizeDialog open={spriteSizeOpen} onClose={() => setSpriteSizeOpen(false)} />
      <ImportSpriteSheetDialog open={importSheetOpen} onClose={() => setImportSheetOpen(false)} />
      <PreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}
