import React from 'react';
import type { CardLanguage } from '../../types';
import { FlagGB, FlagPL } from './LanguageSwitcher';
import { tk, useT } from '../../i18n';

/**
 * Mała flaga języka wydania karty (SVG, bo emoji flag nie wyświetlają się na Windowsie).
 * Fyrexiański nie ma kraju, więc dostaje znak Φ zamiast flagi, a nieznany język krótki kod.
 */

const box = 'w-[18px] h-3 rounded-[2px] shrink-0 ring-1 ring-black/40';

const Stripes: React.FC<{ colors: string[]; vertical?: boolean; className?: string }> = ({ colors, vertical, className }) => (
  <svg viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true" className={className}>
    {colors.map((c, i) =>
      vertical ? <rect key={i} x={i} width="1" height="2" fill={c} /> : <rect key={i} y={(i * 2) / colors.length} width="3" height={2 / colors.length} fill={c} />
    )}
  </svg>
);

const FlagJP: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 3 2" aria-hidden="true" className={className}>
    <rect width="3" height="2" fill="#ffffff" />
    <circle cx="1.5" cy="1" r="0.6" fill="#bc002d" />
  </svg>
);

const FlagES: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 3 2" preserveAspectRatio="none" aria-hidden="true" className={className}>
    <rect width="3" height="2" fill="#aa151b" />
    <rect y="0.5" width="3" height="1" fill="#f1bf00" />
  </svg>
);

const LANG_NAMES: Record<CardLanguage, string> = {
  EN: tk('angielski'),
  PL: tk('polski'),
  DE: tk('niemiecki'),
  FR: tk('francuski'),
  JP: tk('japoński'),
  IT: tk('włoski'),
  ES: tk('hiszpański'),
  PH: tk('fyrexiański'),
  OTHER: tk('inny język')
};

function flagFor(lang: CardLanguage): React.ReactNode {
  switch (lang) {
    case 'EN':
      return <FlagGB className={box} />;
    case 'PL':
      return <FlagPL className={box} />;
    case 'JP':
      return <FlagJP className={box} />;
    case 'DE':
      return <Stripes className={box} colors={['#000000', '#dd0000', '#ffce00']} />;
    case 'FR':
      return <Stripes className={box} vertical colors={['#0055a4', '#ffffff', '#ef4135']} />;
    case 'IT':
      return <Stripes className={box} vertical colors={['#009246', '#ffffff', '#ce2b37']} />;
    case 'ES':
      return <FlagES className={box} />;
    case 'PH':
      return (
        <span className={`${box} bg-stone-200 text-stone-900 text-[11px] leading-3 font-bold flex items-center justify-center`} aria-hidden="true">
          Φ
        </span>
      );
    default:
      return (
        <span className={`${box} bg-stone-700 text-stone-100 text-[11px] leading-3 flex items-center justify-center`} aria-hidden="true">
          ?
        </span>
      );
  }
}

/** Flaga języka z podpisem dla czytników ekranu i podpowiedzią po najechaniu. */
export const CardLangFlag: React.FC<{ lang: CardLanguage }> = ({ lang }) => {
  const t = useT();
  const name = t(LANG_NAMES[lang] || LANG_NAMES.OTHER);
  return (
    <span title={t('Język karty: {lang}', { lang: name })} className="inline-flex items-center shrink-0">
      {flagFor(lang)}
      <span className="sr-only">{name}</span>
    </span>
  );
};
