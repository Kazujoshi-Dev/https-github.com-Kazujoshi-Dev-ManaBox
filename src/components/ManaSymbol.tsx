import React from 'react';
import { useT } from '../i18n';

interface ManaSymbolProps {
  cost?: string; // e.g. "{2}{W}{U}" or "{R}"
  size?: 'sm' | 'md' | 'lg';
  /** Opis dla czytników ekranu, gdy symbol nie jest kosztem (np. filtr koloru). */
  label?: string;
}

/** Rozmiar fontu tak dobrany, żeby kółko .ms-cost miało 16 / 20 / 24 px. */
const SIZE_CLASSES = {
  sm: 'text-[13px]',
  md: 'text-[16px]',
  lg: 'text-[19px]',
} as const;

const SPECIAL: Record<string, string> = {
  T: 'tap',
  Q: 'untap',
  '∞': 'infinity',
  '½': 'half',
  TK: 'ticket',
  CHAOS: 'chaos',
};

/** Symbole, które mamy w foncie Mana (src/styles/mana-font.css). */
const KNOWN = /^(\d+|[wubrgcxyzse]|[wubrg]{2}|2[wubrg]|c[wubrg]|[wubrg]p|[wubrg]{2}p|tap|untap|infinity|half|ticket|chaos)$/;

/** Notacja Scryfall ("W/U", "2/W", "G/U/P") → klasa fontu Mana ("wu", "2w", "gup") albo null. */
export function manaClass(sym: string): string | null {
  const upper = sym.toUpperCase();
  const cls = SPECIAL[upper] ?? upper.replace(/\//g, '').toLowerCase();
  return KNOWN.test(cls) ? cls : null;
}

const FALLBACK_BG: Record<string, string> = {
  W: 'bg-amber-100 text-stone-900 border-amber-300',
  U: 'bg-blue-600 text-white border-blue-400',
  B: 'bg-stone-950 text-stone-100 border-stone-500',
  R: 'bg-red-600 text-white border-red-400',
  G: 'bg-emerald-600 text-white border-emerald-400',
  C: 'bg-stone-400 text-stone-900 border-stone-300',
};

const FALLBACK_SIZE = {
  sm: 'w-4 h-4 text-[11px]',
  md: 'w-5 h-5 text-xs',
  lg: 'w-6 h-6 text-sm',
} as const;

export const ManaSymbol: React.FC<ManaSymbolProps> = ({ cost, size = 'md', label }) => {
  const t = useT();
  if (!cost) return null;

  // Symbole w nawiasach: {1}, {W}, {U/B}, {T}
  const symbols = Array.from(cost.matchAll(/\{([^}]+)\}/g), (m) => m[1]);

  if (symbols.length === 0) {
    return <span className="tabular-nums text-xs font-bold text-amber-300">{cost}</span>;
  }

  return (
    <span className="inline-flex items-center gap-0.5 flex-wrap" role="img" aria-label={label ?? `${t('Koszt many')}: ${cost}`} title={label ?? cost}>
      {symbols.map((sym, idx) => {
        const cls = manaClass(sym);
        if (cls) {
          return <i key={idx} aria-hidden="true" className={`ms ms-cost ms-${cls} ${SIZE_CLASSES[size]} select-none`} />;
        }
        // Symbol spoza fontu (np. z innej gry): dotychczasowe kółko z literą
        return (
          <span
            key={idx}
            aria-hidden="true"
            className={`${FALLBACK_SIZE[size]} ${FALLBACK_BG[sym.toUpperCase()] ?? 'bg-stone-700 text-amber-200 border-stone-500'} inline-flex items-center justify-center rounded-full font-bold tabular-nums border select-none`}
          >
            {sym}
          </span>
        );
      })}
    </span>
  );
};

/** Ikona „wielobarwne” do filtrów kolorów (to nie jest symbol many, więc osobny komponent). */
export const MulticolorSymbol: React.FC<{ size?: 'sm' | 'md' | 'lg'; label?: string }> = ({ size = 'md', label }) => (
  <i
    role="img"
    aria-label={label}
    className={`ms ms-cost ms-multicolor !bg-[#e3c36a] ${SIZE_CLASSES[size]} select-none`}
  />
);
