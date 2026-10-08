import React from 'react';
import type { ShowcaseCard } from './useShowcaseCards';
import { useT } from '../../i18n';

/**
 * Funkcje aplikacji jako siatka bento: siedem pól o różnych rozmiarach,
 * część z prawdziwymi grafikami kart (Scryfall) i fragmentem mapy (OpenStreetMap).
 * Nowe funkcje (talie we wszystkich formatach, widok dodatków) stoją obok skanera, z plakietką „Nowość”.
 */

/** Przykładowe dodatki do ilustracji widoku „Dodatki” (symbole z Scryfall). */
const DEMO_SETS = [
  { code: 'blb', name: 'Bloomburrow', owned: 212, total: 281 },
  { code: 'dsk', name: 'Duskmourn', owned: 143, total: 286 },
  { code: 'mh3', name: 'Modern Horizons 3', owned: 61, total: 303 }
];

const PAPER_FORMATS = ['Commander', 'Modern', 'Standard', 'Pioneer', 'Legacy', 'Pauper', 'Vintage', 'Premodern'];
const ARENA_FORMATS = ['Historic', 'Timeless', 'Alchemy', 'Brawl', 'Historic Brawl', 'Artisan'];

/** Kolory wildcardów jak w MTG Arena: pospolite, niepospolite, rzadkie, mityczne. */
const WILDCARD_DOTS = ['bg-stone-400', 'bg-sky-200', 'bg-amber-400', 'bg-orange-500'];

const NewBadge: React.FC = () => {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded-full bg-amber-400/15 ring-1 ring-amber-400/40 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
      {t('Nowość')}
    </span>
  );
};
export const FeatureBento: React.FC<{ cards: ShowcaseCard[] }> = ({ cards }) => {
  const t = useT();
  const legendary = cards.filter((c) => c.legendary).slice(0, 3);
  const others = cards.filter((c) => !c.legendary);
  const scanCard = others[9] || others[0];
  const binderArt = others.slice(10, 13).filter((c) => c.artCrop);

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 md:gap-4">
      {/* Skaner: duże pole z kartą w ramce celownika */}
      <article className="md:col-span-3 md:row-span-2 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 flex flex-col gap-6 min-h-[320px]">
        <div className="space-y-2 max-w-sm">
          <h3 className="text-xl font-bold text-stone-50">{t('Skaner kart w telefonie')}</h3>
          <p className="text-sm text-stone-400 leading-relaxed">{t('Nakieruj aparat na kartę. Aplikacja rozpozna nazwę, wydanie i cenę, także wersje japońskie. Bez limitu skanów.')}</p>
        </div>
        {scanCard && (
          <div className="relative mx-auto mt-auto w-44 sm:w-48">
            <span className="absolute -inset-4 rounded-2xl border-2 border-dashed border-amber-400/50" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[10px] shadow-2xl">
              <img src={scanCard.image} alt={scanCard.name} loading="lazy" referrerPolicy="no-referrer" className="w-full block" />
              <span className="auth-scanline pointer-events-none absolute inset-0" aria-hidden="true" />
            </div>
          </div>
        )}
      </article>

      {/* Nowość: talie we wszystkich formatach, także MTG Arena */}
      <article className="md:col-span-3 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-amber-400/30 p-6 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="space-y-2 sm:flex-1">
            <div>
              <NewBadge />
            </div>
            <h3 className="text-lg font-bold text-stone-50">{t('Talie w każdym formacie, także MTG Arena')}</h3>
            <p className="text-sm text-stone-400 leading-relaxed">
              {t('Commander z bracketem i podpowiedziami z EDHREC, ale też Modern, Standard czy Pauper. Talia sprawdza legalność kart i liczbę kopii. Talie do MTG Arena pokazują koszt w wildcardach i kopiują się jednym przyciskiem do gry.')}
            </p>
          </div>
          {legendary.length >= 2 && (
            <div className="hidden sm:flex shrink-0 -space-x-8 self-center pr-2" aria-hidden="true">
              {legendary.map((c, i) => (
                <img
                  key={c.name}
                  src={c.image}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-16 rounded-[5px] ring-2 ring-stone-900 shadow-xl"
                  style={{ transform: `rotate(${(i - 1) * 6}deg) translateY(${Math.abs(i - 1) * 5}px)` }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="mt-auto space-y-2">
          <ul className="flex flex-wrap gap-1.5" aria-label={t('Formaty papierowe')}>
            {PAPER_FORMATS.map((f) => (
              <li key={f} className="rounded-md bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-200">{f}</li>
            ))}
          </ul>
          <ul className="flex flex-wrap items-center gap-1.5" aria-label={t('Formaty MTG Arena')}>
            <li className="flex items-center gap-1 pr-1 text-[11px] font-semibold text-amber-300">
              MTGA
              <span className="flex gap-0.5" aria-hidden="true">
                {WILDCARD_DOTS.map((d) => (
                  <span key={d} className={`w-1.5 h-1.5 rounded-full ${d}`} />
                ))}
              </span>
            </li>
            {ARENA_FORMATS.map((f) => (
              <li key={f} className="rounded-md bg-amber-400/10 ring-1 ring-amber-400/25 px-2 py-1 text-[11px] font-medium text-amber-100">{f}</li>
            ))}
          </ul>
        </div>
      </article>

      {/* Nowość: kolekcja według dodatków z procentem skompletowania */}
      <article className="md:col-span-3 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-amber-400/30 p-6 flex flex-col sm:flex-row gap-5 sm:items-center">
        <div className="space-y-2 sm:flex-1">
          <div>
              <NewBadge />
            </div>
          <h3 className="text-lg font-bold text-stone-50">{t('Kolekcja według dodatków')}</h3>
          <p className="text-sm text-stone-400 leading-relaxed">
            {t('Zobacz symbole wszystkich dodatków, z których masz karty, i ile procent każdego już skompletowałeś. Kliknij dodatek, aby przejrzeć jego karty.')}
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-2 sm:w-56 shrink-0" aria-hidden="true">
          {DEMO_SETS.map((set) => {
            const pct = Math.floor((set.owned / set.total) * 100);
            return (
              <li key={set.code} className="flex flex-col items-center gap-1.5 rounded-xl bg-stone-950 ring-1 ring-stone-800 px-1.5 pt-3 pb-2">
                <img
                  src={`https://svgs.scryfall.io/sets/${set.code}.svg`}
                  alt=""
                  loading="lazy"
                  onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  className="h-7 w-7 object-contain invert opacity-90"
                />
                <span className="text-[11px] text-stone-500 tabular-nums">{set.code.toUpperCase()}</span>
                <span className="text-sm font-bold text-stone-100 tabular-nums">{pct}%</span>
                <span className="h-1 w-full rounded-full bg-stone-800 overflow-hidden">
                  <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </article>

      {/* Klasery: pasek z grafikami kart */}
      <article className="md:col-span-3 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 flex flex-col sm:flex-row gap-5 sm:items-center">
        <div className="space-y-2 sm:flex-1">
          <h3 className="text-lg font-bold text-stone-50">{t('Klasery i filtry')}</h3>
          <p className="text-sm text-stone-400 leading-relaxed">{t('Dziel kolekcję na klasery, oznaczaj foile i wersje językowe, filtruj po kolorze, secie i rzadkości.')}</p>
        </div>
        {binderArt.length === 3 && (
          <div className="flex sm:flex-col gap-2 sm:w-40 shrink-0" aria-hidden="true">
            {binderArt.map((c) => (
              <img key={c.name} src={c.artCrop!} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-14 sm:h-12 flex-1 sm:flex-none w-full object-cover rounded-lg ring-1 ring-white/10" />
            ))}
          </div>
        )}
      </article>

      {/* Wycena: pole z tłem w odcieniu akcentu */}
      <article className="md:col-span-3 rounded-2xl bg-amber-400 text-stone-950 p-6 flex flex-col justify-between gap-4">
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold">{t('Wycena w złotówkach')}</h3>
          <p className="text-sm text-stone-900/80 leading-relaxed">
            {t('Ceny z Cardmarket i TCGPlayer po kursie NBP. Wykres pokazuje, jak zmieniają się wartość kolekcji i liczba kart: tydzień, miesiąc, rok.')}
          </p>
        </div>
      </article>

      {/* Link do oferty */}
      <article className="md:col-span-3 rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 flex flex-col gap-4">
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-stone-50">{t('Oferta jednym linkiem')}</h3>
          <p className="text-sm text-stone-400 leading-relaxed">{t('Oznacz karty na sprzedaż i wyślij link. Kupujący przejrzy ofertę bez konta i napisze do Ciebie prosto z niej.')}</p>
        </div>
        <code className="mt-auto block truncate rounded-lg bg-stone-950 ring-1 ring-stone-800 px-3 py-2 text-xs text-amber-200">
          {t('manascrew.eu/sprzedam/twoja-nazwa')}
        </code>
      </article>

      {/* Mapa graczy: fragment mapy OpenStreetMap */}
      <article className="md:col-span-3 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-stone-800 min-h-[220px] flex flex-col justify-end">
        <img
          onError={(e) => (e.currentTarget.style.display = 'none')}
          src="https://tile.openstreetmap.org/5/17/10.png"
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover grayscale-[0.6] brightness-[0.45] contrast-125"
          aria-hidden="true"
        />
        <span className="absolute top-[42%] left-[54%] w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 ring-4 ring-amber-400/25" aria-hidden="true" />
        <div className="relative p-6 space-y-1.5 bg-gradient-to-t from-stone-950 via-stone-950/85 to-transparent pt-16">
          <h3 className="text-lg font-bold text-stone-50">{t('Gracze w okolicy')}</h3>
          <p className="text-sm text-stone-300 leading-relaxed">{t('Mapa pokazuje, kto w Twoim mieście sprzedaje karty z Twojej listy życzeń.')}</p>
          <p className="text-[11px] text-stone-500">{t('Mapa: © OpenStreetMap')}</p>
        </div>
      </article>
    </div>
  );
};
