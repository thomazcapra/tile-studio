import clsx from 'clsx';
import { Lock, Unlock } from 'lucide-react';
import { useEditorStore } from '../store/editor';

/**
 * Floating Shift / Alt / Ctrl latches for keyboard-less devices (iPad without Magic
 * Keyboard, touchscreen laptops in tablet mode, etc.). Visible only when the device
 * reports a coarse pointer (`@media (pointer: coarse)`); on a desktop with a mouse
 * the bar is hidden via the same `coarse:` Tailwind variant.
 *
 * Tap a latch to arm it; the next pointerdown on the canvas treats that modifier as
 * pressed, and (unless `softLocked` is on) the latch clears after pointerup. The padlock
 * toggles persistent latching for multi-stroke selection workflows.
 */
export function SoftModifiersBar() {
  const softShift = useEditorStore((s) => s.softShift);
  const softAlt = useEditorStore((s) => s.softAlt);
  const softCtrl = useEditorStore((s) => s.softCtrl);
  const softLocked = useEditorStore((s) => s.softLocked);
  const setSoftModifier = useEditorStore((s) => s.setSoftModifier);
  const toggleSoftLocked = useEditorStore((s) => s.toggleSoftLocked);

  return (
    <div
      // hidden by default, shown on coarse pointer devices
      className="hidden coarse:flex absolute bottom-3 left-1/2 -translate-x-1/2 items-center gap-1 px-2 py-1.5 rounded-full bg-black/70 backdrop-blur border border-white/10 shadow-lg z-20 pointer-events-auto"
      data-testid="soft-modifiers"
    >
      <Latch label="⇧ Shift" active={softShift} onToggle={() => setSoftModifier('shift', !softShift)} testId="soft-shift" />
      <Latch label="⌥ Alt" active={softAlt} onToggle={() => setSoftModifier('alt', !softAlt)} testId="soft-alt" />
      <Latch label="⌃ Ctrl" active={softCtrl} onToggle={() => setSoftModifier('ctrl', !softCtrl)} testId="soft-ctrl" />
      <button
        data-testid="soft-lock"
        onClick={toggleSoftLocked}
        title={softLocked ? 'Tap latches clear after each stroke' : 'Tap latches stay on across strokes'}
        aria-label="Toggle modifier lock"
        className={clsx(
          'w-9 h-9 ml-1 flex items-center justify-center rounded-full transition-colors',
          softLocked ? 'bg-accent text-white' : 'text-ink/70 hover:text-white hover:bg-white/10',
        )}
      >
        {softLocked ? <Lock size={14} /> : <Unlock size={14} />}
      </button>
    </div>
  );
}

function Latch({ label, active, onToggle, testId }: {
  label: string; active: boolean; onToggle: () => void; testId: string;
}) {
  return (
    <button
      data-testid={testId}
      aria-pressed={active}
      onClick={onToggle}
      className={clsx(
        'min-w-[68px] h-9 px-3 rounded-full text-[12px] font-medium transition-colors',
        active
          ? 'bg-accent text-white shadow-inner'
          : 'text-ink/80 hover:text-white hover:bg-white/10',
      )}
    >
      {label}
    </button>
  );
}
