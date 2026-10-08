import React, { useEffect, useState } from 'react';
import { Library } from 'lucide-react';

interface CollectionLoadingOverlayProps {
  isLoading: boolean;
  loaded: number;
  total: number;
  /** Nagłówek nakładki, domyślnie „Trwa wczytywanie kolekcji”. */
  title?: string;
}

const FADE_MS = 280;

/** Nakładka z paskiem postępu, rozmywająca stronę na czas wczytywania dużej kolekcji. */
export const CollectionLoadingOverlay: React.FC<CollectionLoadingOverlayProps> = ({ isLoading, loaded, total, title = 'Trwa wczytywanie kolekcji' }) => {
  const [mounted, setMounted] = useState(isLoading);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const t = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(t);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Blokada przewijania strony pod nakładką
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  if (!mounted) return null;

  const pct = total > 0 ? Math.round(((leaving ? total : loaded) / total) * 100) : 100;
  const shown = leaving ? total : loaded;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-stone-950/45 backdrop-blur-md transition-opacity ease-out"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        animation: 'ms-fade-in 200ms cubic-bezier(0.2, 0, 0, 1)',
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-stone-800 bg-stone-900/90 p-6 shadow-2xl shadow-black/50"
        style={{ animation: 'ms-rise-in 260ms cubic-bezier(0.2, 0, 0, 1)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/25">
            <Library className="h-5 w-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-100">{title}</p>
            <p className="text-xs text-stone-400">Przygotowujemy Twoje karty, to potrwa chwilę.</p>
          </div>
        </div>

        <div
          className="mt-5 h-2 w-full overflow-hidden rounded-full bg-stone-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Postęp wczytywania kolekcji"
        >
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-[width] duration-150 ease-out"
            style={{ width: `${Math.max(pct, 4)}%` }}
          >
            <span className="ms-progress-shine absolute inset-0 rounded-full" />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-stone-400 tabular-nums">
          <span>{shown.toLocaleString('pl-PL')} z {total.toLocaleString('pl-PL')} kart</span>
          <span className="font-semibold text-amber-400">{pct}%</span>
        </div>
      </div>
    </div>
  );
};
