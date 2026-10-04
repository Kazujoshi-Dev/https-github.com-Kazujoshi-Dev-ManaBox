import React from 'react';
import { ScanLine, FolderOpen, Coins, Link2, MapPin, Swords } from 'lucide-react';
import type { ShowcaseCard } from './useShowcaseCards';

/**
 * Funkcje aplikacji jako siatka bento: sześć pól o różnych rozmiarach,
 * część z prawdziwymi grafikami kart (Scryfall) i fragmentem mapy (OpenStreetMap).
 */
export const FeatureBento: React.FC<{ cards: ShowcaseCard[] }> = ({ cards }) => {
  const legendary = cards.filter((c) => c.legendary).slice(0, 3);
  const others = cards.filter((c) => !c.legendary);
  const scanCard = others[9] || others[0];
  const binderArt = others.slice(10, 13).filter((c) => c.artCrop);

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 md:gap-4">
      {/* Skaner: duże pole z kartą w ramce celownika */}
      <article className="md:col-span-3 md:row-span-2 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 flex flex-col gap-6 min-h-[320px]">
        <div className="space-y-2 max-w-sm">
          <ScanLine className="w-6 h-6 text-amber-400" strokeWidth={1.75} aria-hidden="true" />
          <h3 className="text-xl font-bold text-stone-50">Skaner kart w telefonie</h3>
          <p className="text-sm text-stone-400 leading-relaxed">Nakieruj aparat na kartę. Aplikacja rozpozna nazwę, wydanie i cenę, także wersje japońskie. Bez limitu skanów.</p>
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

      {/* Klasery: pasek z grafikami kart */}
      <article className="md:col-span-3 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 flex flex-col sm:flex-row gap-5 sm:items-center">
        <div className="space-y-2 sm:flex-1">
          <FolderOpen className="w-6 h-6 text-amber-400" strokeWidth={1.75} aria-hidden="true" />
          <h3 className="text-lg font-bold text-stone-50">Klasery i filtry</h3>
          <p className="text-sm text-stone-400 leading-relaxed">Dziel kolekcję na klasery, oznaczaj foile i wersje językowe, filtruj po kolorze, secie i rzadkości.</p>
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
        <Coins className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold">Wycena w złotówkach</h3>
          <p className="text-sm text-stone-900/80 leading-relaxed">
            Ceny z Cardmarket i TCGPlayer po kursie NBP. Wykres pokazuje, jak zmieniają się wartość kolekcji i liczba kart: tydzień, miesiąc, rok.
          </p>
        </div>
      </article>

      {/* Link do oferty */}
      <article className="md:col-span-2 rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 flex flex-col gap-4">
        <Link2 className="w-6 h-6 text-amber-400" strokeWidth={1.75} aria-hidden="true" />
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-stone-50">Oferta jednym linkiem</h3>
          <p className="text-sm text-stone-400 leading-relaxed">Oznacz karty na sprzedaż i wyślij link. Kupujący przejrzy ofertę bez konta i napisze do Ciebie prosto z niej.</p>
        </div>
        <code className="mt-auto block truncate rounded-lg bg-stone-950 ring-1 ring-stone-800 px-3 py-2 text-xs text-amber-200">
          manascrew.eu/?sprzedam=twoja-nazwa
        </code>
      </article>

      {/* Mapa graczy: fragment mapy OpenStreetMap */}
      <article className="md:col-span-2 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-stone-800 min-h-[220px] flex flex-col justify-end">
        <img
          onError={(e) => (e.currentTarget.style.display = 'none')}
          src="https://tile.openstreetmap.org/5/17/10.png"
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover grayscale-[0.6] brightness-[0.45] contrast-125"
          aria-hidden="true"
        />
        <MapPin className="absolute top-[38%] left-[52%] w-8 h-8 text-amber-400 fill-amber-400/30 drop-shadow-lg" strokeWidth={1.75} aria-hidden="true" />
        <div className="relative p-6 space-y-1.5 bg-gradient-to-t from-stone-950 via-stone-950/85 to-transparent pt-16">
          <h3 className="text-lg font-bold text-stone-50">Gracze w okolicy</h3>
          <p className="text-sm text-stone-300 leading-relaxed">Mapa pokazuje, kto w Twoim mieście sprzedaje karty z Twojej listy życzeń.</p>
          <p className="text-[10px] text-stone-500">Mapa: © OpenStreetMap</p>
        </div>
      </article>

      {/* Talie Commander: grafiki legendarnych stworów */}
      <article className="md:col-span-2 relative overflow-hidden rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 flex flex-col gap-4">
        <Swords className="w-6 h-6 text-amber-400" strokeWidth={1.75} aria-hidden="true" />
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-stone-50">Talie Commander</h3>
          <p className="text-sm text-stone-400 leading-relaxed">Szacowany bracket i Game Changers, legalność kart, tokeny, losowa ręka, kolory many i podpowiedzi z EDHREC.</p>
        </div>
        {legendary.length >= 2 && (
          <div className="mt-auto flex -space-x-6" aria-hidden="true">
            {legendary.map((c, i) => (
              <img
                key={c.name}
                src={c.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-20 rounded-[6px] ring-2 ring-stone-900 shadow-xl"
                style={{ transform: `rotate(${(i - 1) * 6}deg) translateY(${Math.abs(i - 1) * 6}px)` }}
              />
            ))}
          </div>
        )}
      </article>
    </div>
  );
};
