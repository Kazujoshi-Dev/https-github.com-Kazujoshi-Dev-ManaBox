import React from 'react';
import { Coffee } from 'lucide-react';
import { useT } from '../../i18n';

/** Strona wsparcia autora na Ko-fi. */
export const SUPPORT_URL = 'https://ko-fi.com/G0N428GQNR';

/** Kolor przycisku Ko-fi (jak w widżecie Ko-fi). */
const KOFI_COLOR = '#72a4f2';

interface SupportButtonProps {
  /** pill: przycisk w nagłówku (napis od xl), icon: sama ikona, link: link tekstowy. */
  variant?: 'pill' | 'icon' | 'link';
  className?: string;
}

/** Ikona kubka (własna, bez wczytywania obrazka z serwerów Ko-fi). */
const KofiCup: React.FC<{ className?: string }> = ({ className = '' }) => (
  <Coffee aria-hidden="true" strokeWidth={2.25} className={`w-4 h-4 shrink-0 ${className}`} />
);

/**
 * Wsparcie autora przez Ko-fi (otwiera się w nowej karcie).
 * Odpowiednik widżetu Ko-fi bez jego skryptu: widżet używa document.write, który nie działa
 * w aplikacji React, a zewnętrzne skrypty i obrazki blokuje polityka CSP.
 */
export const SupportButton: React.FC<SupportButtonProps> = ({ variant = 'pill', className = '' }) => {
  const t = useT();
  const label = t('Wesprzyj mnie na Ko-fi');
  const common = {
    href: SUPPORT_URL,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: label
  };
  if (variant === 'link') {
    return (
      <a {...common} className={`inline-flex items-center gap-1.5 text-[#72a4f2] hover:brightness-110 ${className}`}>
        <KofiCup />
        {label}
      </a>
    );
  }
  if (variant === 'icon') {
    return (
      <a
        {...common}
        aria-label={label}
        style={{ backgroundColor: KOFI_COLOR }}
        className={`w-9 h-9 rounded-lg flex items-center justify-center text-white hover:brightness-110 active:brightness-95 ${className}`}
      >
        <KofiCup />
      </a>
    );
  }
  return (
    <a
      {...common}
      aria-label={label}
      style={{ backgroundColor: KOFI_COLOR }}
      className={`h-9 px-2.5 xl:px-3 rounded-lg flex items-center gap-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:brightness-95 ${className}`}
    >
      <KofiCup />
      <span className="hidden xl:inline whitespace-nowrap">{label}</span>
    </a>
  );
};
