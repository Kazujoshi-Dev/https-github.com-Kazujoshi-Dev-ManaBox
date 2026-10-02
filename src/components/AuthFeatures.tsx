import React from 'react';
import { Camera, FolderOpen, Coins, Link2, MapPin, Swords } from 'lucide-react';

/**
 * Funkcje aplikacji pokazane jako karty MTG: pasek nazwy, ilustracja, linia typu
 * i pole tekstu. Kolor ramki nawiązuje do kolorów many.
 */
type Frame = 'green' | 'blue' | 'white' | 'red' | 'gold' | 'black';

interface Feature {
  name: string;
  type: string;
  text: string;
  icon: React.ElementType;
  frame: Frame;
}

const FEATURES: Feature[] = [
  {
    name: 'Skaner kart',
    type: 'Artefakt — Aparat',
    text: 'Nakieruj telefon na kartę, a rozpozna nazwę, wydanie i cenę. Bez limitu skanów.',
    icon: Camera,
    frame: 'green'
  },
  {
    name: 'Klasery',
    type: 'Artefakt — Klaser',
    text: 'Dziel kolekcję na klasery i filtruj karty po kolorze, secie i rzadkości.',
    icon: FolderOpen,
    frame: 'blue'
  },
  {
    name: 'Wycena w PLN',
    type: 'Czar natychmiastowy',
    text: 'Ceny z Cardmarket i TCGPlayer po kursie NBP. Wiesz, ile warta jest kolekcja.',
    icon: Coins,
    frame: 'white'
  },
  {
    name: 'Link do oferty',
    type: 'Czarodziejstwo',
    text: 'Wyślij jeden link, a kupujący zobaczy Twoją ofertę bez zakładania konta.',
    icon: Link2,
    frame: 'red'
  },
  {
    name: 'Mapa sprzedawców',
    type: 'Kraina',
    text: 'Gracze z Twojej okolicy, którzy sprzedają karty z Twojej listy życzeń.',
    icon: MapPin,
    frame: 'gold'
  },
  {
    name: 'Talie Commander',
    type: 'Legendarny stwór',
    text: 'Buduj talie z własnych kart i sprawdzaj kombosy z Commander Spellbook.',
    icon: Swords,
    frame: 'black'
  }
];

const FRAMES: Record<Frame, { frame: string; art: string; pip: string; pipText: string }> = {
  green: { frame: 'bg-[#2c5a3a]', art: 'from-[#4f9a5e] to-[#1d3f28]', pip: 'bg-[#9bd3a6]', pipText: 'G' },
  blue: { frame: 'bg-[#25507a]', art: 'from-[#4f8fc7] to-[#173556]', pip: 'bg-[#a9d1f2]', pipText: 'U' },
  white: { frame: 'bg-[#a89a74]', art: 'from-[#efe4c2] to-[#9c8d63]', pip: 'bg-[#fbf6e3]', pipText: 'W' },
  red: { frame: 'bg-[#7d2f22]', art: 'from-[#d0613f] to-[#5a1c13]', pip: 'bg-[#f3a68c]', pipText: 'R' },
  gold: { frame: 'bg-[#8a6a28]', art: 'from-[#e3b54f] to-[#6b4d16]', pip: 'bg-[#f6d98b]', pipText: '★' },
  black: { frame: 'bg-[#2e2a2b]', art: 'from-[#6b5f66] to-[#1a1718]', pip: 'bg-[#cbbfc4]', pipText: 'B' }
};

// Lekki „rozrzut na stole” na dużym ekranie: obrót i przesunięcie każdej karty
const TABLE_SPREAD = [
  'lg:-rotate-3 lg:translate-y-2',
  'lg:rotate-[1.5deg]',
  'lg:-rotate-1 lg:translate-y-3',
  'lg:rotate-2 lg:-translate-y-1',
  'lg:-rotate-2 lg:translate-y-2',
  'lg:rotate-1'
];

const FeatureCard: React.FC<{ f: Feature; className?: string }> = ({ f, className = '' }) => {
  const c = FRAMES[f.frame];
  const Icon = f.icon;
  return (
    <article
      className={`aspect-[63/88] rounded-[14px] bg-[#0d0c0c] p-[5px] shadow-[0_10px_30px_rgba(0,0,0,0.55)] ring-1 ring-black/60 ${className}`}
      aria-label={`${f.name}: ${f.text}`}
    >
      <div className={`h-full rounded-[10px] ${c.frame} p-[7px] flex flex-col gap-[5px]`}>
        <div className="rounded-[5px] bg-[#f3eedf] text-stone-900 px-2 py-[3px] flex items-center justify-between gap-1 shadow-inner">
          <h3 className="text-[13px] lg:text-[12px] leading-tight font-bold truncate">{f.name}</h3>
          <span
            aria-hidden="true"
            className={`w-[18px] h-[18px] rounded-full ${c.pip} text-[10px] font-black text-stone-900 flex items-center justify-center shrink-0 ring-1 ring-black/30`}
          >
            {c.pipText}
          </span>
        </div>
        <div className={`flex-1 min-h-0 rounded-[3px] bg-gradient-to-br ${c.art} flex items-center justify-center ring-1 ring-black/40`}>
          <Icon className="w-1/3 h-1/3 max-w-12 max-h-12 text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" strokeWidth={1.6} aria-hidden="true" />
        </div>
        <p className="rounded-[5px] bg-[#f3eedf] text-stone-800 px-2 py-[2px] text-[11px] leading-snug font-semibold truncate">{f.type}</p>
        <p className="h-[37%] lg:h-[44%] rounded-[3px] bg-[#ece4cf] text-stone-800 px-2 py-1.5 lg:px-1.5 lg:py-1 text-[12px] leading-snug overflow-hidden">{f.text}</p>
      </div>
    </article>
  );
};

/** Duży ekran: karty rozłożone w siatce, lekko obrócone jak na stole. */
export const FeatureTable: React.FC = () => (
  <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-7 max-w-xl xl:max-w-none">
    {FEATURES.map((f, i) => (
      <FeatureCard key={f.name} f={f} className={TABLE_SPREAD[i % TABLE_SPREAD.length]} />
    ))}
  </div>
);

/** Telefon: karty przewijane palcem jak karty w ręce. */
export const FeatureHand: React.FC = () => (
  <div
    className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4 pb-3 pt-1"
    role="list"
    aria-label="Funkcje aplikacji"
  >
    {FEATURES.map((f) => (
      <div key={f.name} role="listitem" className="snap-center shrink-0 w-[64vw] max-w-[250px]">
        <FeatureCard f={f} />
      </div>
    ))}
  </div>
);
