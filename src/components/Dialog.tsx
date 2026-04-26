import { useEffect } from 'react';

export function Dialog({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="dialog-backdrop"
    >
      <div
        className="w-[340px] max-w-[calc(100vw-2rem)] max-h-[90vh] rounded-lg border border-border bg-panel shadow-2xl p-4 flex flex-col gap-3 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        data-testid="dialog"
      >
        <h2 className="text-sm font-semibold text-white -mt-4 pt-4 pb-2.5 -mx-4 px-4 mb-1 border-b border-border/60">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function DialogField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 text-ink/70">{label}</span>
      <div className="flex-1">{children}</div>
    </label>
  );
}

export function NumberInput({ value, onChange, min = 1, max = 256 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      className="w-full bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
    />
  );
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 mt-1">{children}</div>;
}

export function Button({ children, onClick, variant = 'secondary', testId }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary'; testId?: string }) {
  const base = 'px-3 py-1.5 coarse:py-2.5 coarse:px-4 rounded-md text-xs transition-colors';
  const cls = variant === 'primary'
    ? `${base} bg-accent text-white hover:bg-accent/90`
    : `${base} bg-panel2 text-ink/80 border border-border hover:text-white hover:bg-[#2d2d30]`;
  return <button data-testid={testId} onClick={onClick} className={cls}>{children}</button>;
}
