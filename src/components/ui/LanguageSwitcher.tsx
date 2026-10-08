import React, { useId } from 'react';
import { useLang, setLang, type Lang } from '../../i18n';

/** Flaga Polski (SVG, bo emoji flag nie wyświetlają się na Windowsie). */
export const FlagPL: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 16 10" aria-hidden="true" className={className}>
    <rect width="16" height="5" fill="#ffffff" />
    <rect y="5" width="16" height="5" fill="#dc143c" />
  </svg>
);

/** Flaga Wielkiej Brytanii (uproszczona). */
export const FlagGB: React.FC<{ className?: string }> = ({ className = '' }) => {
  const clipId = `ms-flag-gb-${useId().replace(/:/g, '')}`;
  return (
  <svg viewBox="0 0 60 30" aria-hidden="true" className={className}>
    <clipPath id={clipId}>
      <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
    </clipPath>
    <rect width="60" height="30" fill="#012169" />
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
    <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clipId})`} stroke="#c8102e" strokeWidth="4" />
    <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
    <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
  </svg>
  );
};

export const LANGUAGE_OPTIONS: Array<{ lang: Lang; label: string; Flag: React.FC<{ className?: string }> }> = [
  { lang: 'pl', label: 'Polski', Flag: FlagPL },
  { lang: 'en', label: 'English', Flag: FlagGB }
];

interface LanguageSwitcherProps {
  /** Wywoływane po wybraniu języka (np. zapis na profilu). Bez niej język zapisuje się tylko na tym urządzeniu. */
  onChange?: (lang: Lang) => void;
  className?: string;
}

/** Przełącznik języka interfejsu: dwie flagi, aktywna wyróżniona. */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ onChange, className = '' }) => {
  const current = useLang();
  return (
    <div role="group" aria-label="Language / Język" className={`flex items-center gap-0.5 ${className}`}>
      {LANGUAGE_OPTIONS.map(({ lang, label, Flag }) => {
        const active = lang === current;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => (onChange ? onChange(lang) : setLang(lang))}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`w-7 h-9 rounded-md flex items-center justify-center cursor-pointer transition-opacity hover:bg-stone-800 ${
              active ? 'opacity-100' : 'opacity-40 hover:opacity-80'
            }`}
          >
            <Flag
              className={`w-5 h-[13px] rounded-[2px] shadow-sm ${active ? 'ring-1 ring-amber-400/70' : 'ring-1 ring-stone-700'}`}
            />
          </button>
        );
      })}
    </div>
  );
};
