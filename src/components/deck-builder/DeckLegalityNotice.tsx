import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import type { DeckItem, ScryfallCard } from '../../types';
import type { LegalityReport } from './legality';

/** Podsumowanie zgodności talii z zasadami Commandera, z listą kart do poprawienia. */
export const DeckLegalityNotice: React.FC<{
  deck: DeckItem;
  report: LegalityReport;
  onViewCardDetails: (card: ScryfallCard) => void;
}> = ({ deck, report, onViewCardDetails }) => {
  const [open, setOpen] = useState(true);
  if (!report.active) return null;

  if (report.total === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-stone-400 px-1">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        Wszystkie karty są zgodne z zasadami Commandera.
      </p>
    );
  }

  const cardById = new Map(deck.cards.map((e) => [e.card.id, e.card]));
  const count = report.total;
  const label = count === 1 ? 'karta łamie' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'karty łamią' : 'kart łamie';

  return (
    <section className="rounded-xl border border-rose-500/40 bg-rose-950/30" role="alert">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer"
      >
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-rose-100">
          {count} {label} zasady Commandera
        </span>
        <ChevronDown className={`w-4 h-4 text-rose-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="px-4 pb-3 space-y-2">
          {report.commander.length > 0 && deck.commander && (
            <li className="text-sm">
              <button type="button" onClick={() => onViewCardDetails(deck.commander!)} className="text-rose-100 font-medium hover:underline cursor-pointer">
                {deck.commander.name} (dowódca)
              </button>
              <span className="text-rose-200/80">: {report.commander.join('; ')}</span>
            </li>
          )}
          {report.cards.map((i) => (
            <li key={i.cardId} className="text-sm">
              <button
                type="button"
                onClick={() => {
                  const c = cardById.get(i.cardId);
                  if (c) onViewCardDetails(c);
                }}
                className="text-rose-100 font-medium hover:underline cursor-pointer"
              >
                {i.name}
              </button>
              <span className="text-rose-200/80">: {i.reasons.join('; ')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
