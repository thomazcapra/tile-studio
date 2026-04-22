import { useEditorStore } from '../store/editor';
import { unpackRGBA } from '../render/image-ops';

export function StatusBar() {
  const mode = useEditorStore((s) => s.mode);
  const tool = useEditorStore((s) => s.tool);
  const sprite = useEditorStore((s) => s.sprite);
  const cursor = useEditorStore((s) => s.cursor);
  const primary = useEditorStore((s) => s.primary);
  const brushSize = useEditorStore((s) => s.brushSize);
  const pixelPerfect = useEditorStore((s) => s.pixelPerfect);
  const [r, g, b, a] = unpackRGBA(primary);
  const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return (
    <div className="h-6 flex items-center px-3 gap-4 border-t border-border bg-panel2 text-[11px] font-mono text-ink/70" data-testid="status-bar">
      <span>Mode: <span className="text-ink">{mode}</span></span>
      <span>Tool: <span className="text-ink">{tool}</span></span>
      <span data-testid="status-brush">Brush: <span className="text-ink">{brushSize}px</span>{pixelPerfect && <span className="ml-1 text-accent/80">· PP</span>}</span>
      <span>Sprite: <span className="text-ink">{sprite.w}×{sprite.h}</span></span>
      {cursor.inside && (
        <span data-testid="status-cursor">
          Pixel: <span className="text-ink">{cursor.px},{cursor.py}</span>
        </span>
      )}
      <span className="flex-1" />
      <span className="flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-sm border border-black/50" style={{ background: `rgba(${r},${g},${b},${a / 255})` }} />
        <span>{hex}{a !== 255 && <span className="text-ink/40"> ·α{a}</span>}</span>
      </span>
    </div>
  );
}
