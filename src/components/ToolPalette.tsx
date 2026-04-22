import { Pencil, Eraser, PaintBucket, Pipette, Minus, Square, SquareDashed, BoxSelect, Wand2, Circle, Lasso } from 'lucide-react';
import type { ToolId } from '../store/editor';
import { useEditorStore } from '../store/editor';
import clsx from 'clsx';

const ENTRIES: { id: ToolId; icon: React.ComponentType<{ size?: number }>; label: string; shortcut: string; sep?: boolean }[] = [
  { id: 'select-rect', icon: BoxSelect, label: 'Rectangle Select', shortcut: 'M' },
  { id: 'select-ellipse', icon: Circle, label: 'Ellipse Select', shortcut: '⇧M' },
  { id: 'select-lasso', icon: Lasso, label: 'Lasso', shortcut: 'Q' },
  { id: 'select-wand', icon: Wand2, label: 'Magic Wand', shortcut: 'W' },
  { id: 'pencil', icon: Pencil, label: 'Pencil', shortcut: 'B', sep: true },
  { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
  { id: 'bucket', icon: PaintBucket, label: 'Fill', shortcut: 'G' },
  { id: 'eyedropper', icon: Pipette, label: 'Eyedropper', shortcut: 'I' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
  { id: 'rect', icon: SquareDashed, label: 'Rectangle', shortcut: 'U' },
  { id: 'rectfill', icon: Square, label: 'Filled Rect', shortcut: '⇧U' },
];

export function ToolPalette() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  return (
    <div className="w-11 shrink-0 border-r border-border bg-panel flex flex-col items-center py-1 gap-0.5" data-testid="tool-palette">
      {ENTRIES.map((t) => {
        const active = tool === t.id;
        const Icon = t.icon;
        return (
          <div key={t.id} className="flex flex-col items-center">
            {t.sep && <div className="h-px w-6 bg-border my-1" />}
            <button
              data-testid={`tool-${t.id}`}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              className={clsx(
                'w-9 h-9 rounded-md flex items-center justify-center transition-colors',
                active
                  ? 'bg-accent/25 text-white ring-1 ring-accent/60'
                  : 'text-ink/70 hover:text-white hover:bg-panel2'
              )}
            >
              <Icon size={16} />
            </button>
          </div>
        );
      })}
      <div className="flex-1" />
      <ColorSwatch />
    </div>
  );
}

function ColorSwatch() {
  const primary = useEditorStore((s) => s.primary);
  const secondary = useEditorStore((s) => s.secondary);
  const swap = useEditorStore((s) => s.swapColors);
  return (
    <div className="relative w-9 h-9 mb-1" title="Click to swap (X)" onClick={swap}>
      <div
        data-testid="color-secondary"
        className="absolute bottom-0 right-0 w-6 h-6 rounded-sm border border-black/70 shadow-inner"
        style={{ background: u32ToCss(secondary) }}
      />
      <div
        data-testid="color-primary"
        className="absolute top-0 left-0 w-6 h-6 rounded-sm border border-black/70 shadow-md cursor-pointer"
        style={{ background: u32ToCss(primary) }}
      />
    </div>
  );
}

function u32ToCss(c: number): string {
  const r = c & 0xff, g = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff, a = (c >>> 24) & 0xff;
  return `rgba(${r},${g},${b},${a / 255})`;
}
