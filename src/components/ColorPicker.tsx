import { useEffect, useRef, useState } from 'react';
import { packRGBA, unpackRGBA } from '../render/image-ops';

// Lightweight HSV picker: SV square + hue strip + alpha + hex.
// Controlled by `value` (Uint32 AABBGGRR). Calls onChange live while dragging.
export function ColorPicker({ value, onChange, onClose }: { value: number; onChange: (c: number) => void; onClose?: () => void }) {
  const [h, s, v, a] = rgbaToHsva(value);
  const [H, setH] = useState(h);
  const [S, setS] = useState(s);
  const [V, setV] = useState(v);
  const [A, setA] = useState(a);

  useEffect(() => { const [nh, ns, nv, na] = rgbaToHsva(value); setH(nh); setS(ns); setV(nv); setA(na); }, [value]);

  function emit(nh = H, ns = S, nv = V, na = A) {
    const [r, g, b] = hsvToRgb(nh, ns, nv);
    onChange(packRGBA(r, g, b, Math.round(na * 255)));
  }

  const [r, g, b] = hsvToRgb(H, S, V);
  const hex = rgbToHex(r, g, b);

  return (
    <div className="absolute z-30 right-3 top-12 w-64 rounded-lg border border-border bg-panel shadow-2xl p-3 flex flex-col gap-3" data-testid="color-picker" onClick={(e) => e.stopPropagation()}>
      <SVSquare hue={H} s={S} v={V} onChange={(ns, nv) => { setS(ns); setV(nv); emit(H, ns, nv, A); }} />
      <HueStrip h={H} onChange={(nh) => { setH(nh); emit(nh, S, V, A); }} />
      <AlphaStrip r={r} g={g} b={b} a={A} onChange={(na) => { setA(na); emit(H, S, V, na); }} />
      <div className="flex items-center gap-2 text-xs">
        <div className="w-6 h-6 rounded border border-black/50" style={{ background: `rgba(${r},${g},${b},${A})` }} />
        <input
          data-testid="hex-input"
          className="flex-1 bg-panel2 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
          value={hex}
          onChange={(e) => {
            const rgb = hexToRgb(e.target.value);
            if (!rgb) return;
            const [nh, ns, nv] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
            setH(nh); setS(ns); setV(nv);
            emit(nh, ns, nv, A);
          }}
          spellCheck={false}
        />
        <button className="text-ink/60 hover:text-white text-xs" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function SVSquare({ hue, s, v, onChange }: { hue: number; s: number; v: number; onChange: (s: number, v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [r, g, b] = hsvToRgb(hue, 1, 1);
  function handle(e: React.PointerEvent) {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const rect = ref.current!.getBoundingClientRect();
    const ns = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const nv = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    onChange(ns, nv);
  }
  return (
    <div
      ref={ref}
      className="relative w-full h-40 rounded cursor-crosshair select-none"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, rgb(${r},${g},${b}))`,
      }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e); }}
      onPointerMove={handle}
    >
      <div
        className="absolute w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
        style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}

function HueStrip({ h, onChange }: { h: number; onChange: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  function handle(e: React.PointerEvent) {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const rect = ref.current!.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * 360);
  }
  return (
    <div
      ref={ref}
      className="relative w-full h-3 rounded cursor-pointer select-none"
      style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e); }}
      onPointerMove={handle}
    >
      <div
        className="absolute top-1/2 w-2 h-4 rounded-sm border-2 border-white shadow pointer-events-none"
        style={{ left: `${(h / 360) * 100}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}

function AlphaStrip({ r, g, b, a, onChange }: { r: number; g: number; b: number; a: number; onChange: (a: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  function handle(e: React.PointerEvent) {
    if (e.buttons !== 1 && e.type !== 'pointerdown') return;
    const rect = ref.current!.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  }
  return (
    <div
      ref={ref}
      className="relative w-full h-3 rounded cursor-pointer select-none"
      style={{
        background: `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b})), repeating-conic-gradient(#444 0 25%, #666 0 50%) 0 0 / 8px 8px`,
      }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e); }}
      onPointerMove={handle}
    >
      <div
        className="absolute top-1/2 w-2 h-4 rounded-sm border-2 border-white shadow pointer-events-none"
        style={{ left: `${a * 100}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}

// ---- Color math ----
function rgbaToHsva(c: number): [number, number, number, number] {
  const [r, g, b, a] = unpackRGBA(c);
  const [h, s, v] = rgbToHsv(r, g, b);
  return [h, s, v, a / 255];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}
function hexToRgb(s: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
