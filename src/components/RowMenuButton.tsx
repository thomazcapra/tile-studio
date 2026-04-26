import { MoreVertical } from 'lucide-react';
import clsx from 'clsx';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Shared "kebab" menu button for list rows (layers, frames, tiles, palette swatches).
 * - Hidden on the desktop until the parent row is hovered (`group-hover:opacity-100`).
 * - Always visible on touch / pen devices via `coarse:opacity-100`.
 * Calls back with the click coords so the row's existing context-menu code can
 * position its popover at the kebab.
 */
export function RowMenuButton({
  onOpen,
  testId,
  className,
  ariaLabel = 'More actions',
}: {
  onOpen: (x: number, y: number) => void;
  testId?: string;
  className?: string;
  ariaLabel?: string;
}) {
  function handle(e: ReactPointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    onOpen(r.left + r.width / 2, r.bottom);
  }
  return (
    <button
      data-testid={testId}
      aria-label={ariaLabel}
      title={ariaLabel}
      onPointerDown={handle}
      onClick={(e) => { e.stopPropagation(); }}
      className={clsx(
        'flex items-center justify-center rounded text-ink/60 hover:text-white hover:bg-panel',
        // Desktop: only on row hover. Touch: always shown.
        'opacity-0 group-hover:opacity-100 coarse:opacity-100',
        // Default size; callers can override with className for tighter rows.
        'w-6 h-6 coarse:w-9 coarse:h-9',
        className,
      )}
    >
      <MoreVertical size={14} />
    </button>
  );
}
