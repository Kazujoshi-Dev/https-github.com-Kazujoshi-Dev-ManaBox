import React from 'react';
import { Paintbrush } from 'lucide-react';
import { useT } from '../../i18n';

/** Prawa do ilustracji kart (zasady Wizards of the Coast i Scryfall). */
export const ART_COPYRIGHT = '™ & © Wizards of the Coast';

interface ArtistCreditProps {
  /** Nazwisko artysty z danych Scryfall (`artist`); bez niego pokazujemy samą informację o prawach. */
  artist?: string | null;
  /**
   * `inline`: wiersz tekstu obok lub pod grafiką,
   * `overlay`: pasek na dole grafiki (rodzic musi mieć `relative`).
   */
  variant?: 'inline' | 'overlay';
  className?: string;
}

/**
 * Podpis przy wykadrowanej ilustracji karty (Scryfall `art_crop`).
 * Kadr nie zawiera stopki karty z nazwiskiem artysty i ©, więc pokazujemy je obok grafiki.
 */
export const ArtistCredit: React.FC<ArtistCreditProps> = ({ artist, variant = 'inline', className = '' }) => {
  const t = useT();
  const name = artist?.trim();
  const label = name ? `${t('Ilustracja: {artist}', { artist: name })} · ${ART_COPYRIGHT}` : ART_COPYRIGHT;

  if (variant === 'overlay') {
    return (
      <span
        title={label}
        className={`absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 px-2 py-0.5 bg-stone-950/80 text-[11px] leading-4 text-stone-200 ${className}`}
      >
        <Paintbrush className="w-3 h-3 shrink-0 text-amber-300" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <span title={label} className={`flex items-center gap-1 min-w-0 text-[11px] leading-4 text-stone-400 ${className}`}>
      <Paintbrush className="w-3 h-3 shrink-0 text-amber-300/80" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
};
