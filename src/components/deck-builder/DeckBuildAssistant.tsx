import React, { useMemo, useState } from 'react';
import { Wand2, Plus, Loader2, AlertCircle, Check, Library, TrendingUp } from 'lucide-react';
import type { CollectionItem, DeckItem, ScryfallCard } from '../../types';
import type { EdhrecRecommendation } from '../../services/api';
import { computeCardAvailability, type CardAvailability } from '../../utils/cardAvailability';
import { useT, locale, binderName } from '../../i18n';
import { ManaSymbol } from '../ManaSymbol';
import { useEdhrecCommander } from './useEdhrecCommander';
import {
  COMMANDER_DECK_SIZE,
  ROLE_HINTS,
  ROLE_LABELS,
  collectionPicks,
  deckProgress,
  nextPicks,
  type AssistantPick,
} from './buildAssistant';
import { cardNameKey } from '../../utils/cardAvailability';

interface DeckBuildAssistantProps {
  deck: DeckItem;
  collection: CollectionItem[];
  decks?: DeckItem[];
  onAddCard: (rec: EdhrecRecommendation) => void | Promise<void>;
  onViewCardDetails: (card: ScryfallCard) => void;
  onDisable: () => void;
}

const PAGE = 6;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Pasek postępu: bursztynowy w trakcie, przygaszony po osiągnięciu celu. */
const Bar: React.FC<{ value: number; max: number }> = ({ value, max }) => (
  <div className="h-1.5 rounded-full bg-stone-800 overflow-hidden" aria-hidden="true">
    <div
      className={`h-full rounded-full ${value >= max ? 'bg-stone-500' : 'bg-amber-500'}`}
      style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }}
    />
  </div>
);

/** Asystent budowy talii Commander: postęp ról i kolejne karty do dodania. */
export const DeckBuildAssistant: React.FC<DeckBuildAssistantProps> = ({ deck, collection, decks, onAddCard, onViewCardDetails, onDisable }) => {
  const t = useT();
  const { data, error, loading } = useEdhrecCommander(deck.commander?.name || '');
  const collectionOnly = (deck.cardSource || 'collection') === 'collection';
  const [preferFree, setPreferFree] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [ownLimit, setOwnLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);

  const progress = useMemo(() => deckProgress(deck), [deck]);
  const availability = useMemo(() => computeCardAvailability(collection, decks || [], deck.id), [collection, decks, deck.id]);

  const picks = useMemo(
    () =>
      nextPicks({
        deck,
        progress,
        recommendations: data?.cards || [],
        availability,
        collectionOnly,
        preferFree,
        // o jedną więcej, żeby wiedzieć, czy pokazać „Pokaż więcej”
        limit: limit + 1,
      }),
    [deck, progress, data, availability, collectionOnly, preferFree, limit]
  );

  const ownPicks = useMemo(() => {
    // Karty z listy EDHREC pokazujemy wyżej, tu tylko pozostałe z kolekcji
    const exclude = new Set<string>((data?.cards || []).map((r) => cardNameKey(r.name)));
    return collectionPicks({ deck, progress, collection, availability, exclude, limit: ownLimit + 1 });
  }, [deck, progress, collection, availability, data, ownLimit]);

  const add = async (pick: AssistantPick) => {
    setBusy(pick.name);
    try {
      await onAddCard(pick.rec);
    } finally {
      setBusy(null);
    }
  };

  const freeNote = (avail?: CardAvailability) => {
    const first = avail?.freeBinders[0];
    if (!avail || avail.free === 0 || !first) return null;
    return avail.freeBinders.length > 1
      ? t('W klaserze „{name}” (+{n})', { name: binderName(first.binder), n: avail.freeBinders.length - 1 })
      : t('W klaserze „{name}”', { name: binderName(first.binder) });
  };

  const renderPick = (pick: AssistantPick, reason: string) => {
    const note = freeNote(availability.get(cardNameKey(pick.name)));
    const cost = pick.card?.mana_cost || pick.card?.card_faces?.[0]?.mana_cost;
    return (
      <li key={pick.name} className="py-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => pick.card && onViewCardDetails(pick.card)}
              className="text-sm font-semibold text-stone-100 hover:text-amber-300 truncate cursor-pointer text-left"
            >
              {pick.name}
            </button>
            {cost && <span className="shrink-0"><ManaSymbol cost={cost} size="sm" /></span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-stone-400">
            {pick.roles.map((r) => (
              <span key={r} className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300">{t(ROLE_LABELS[r])}</span>
            ))}
            <span className="tabular-nums">{reason}</span>
            {note && (
              <span className="flex items-center gap-1 text-amber-300">
                <Library className="w-3 h-3" /> {note}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => add(pick)}
          disabled={busy !== null}
          className="btn btn-secondary shrink-0"
          aria-label={t('Dodaj „{name}” do talii', { name: pick.name })}
        >
          {busy === pick.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t('Dodaj')}
        </button>
      </li>
    );
  };

  return (
    <section className="bg-stone-900 border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4" aria-label={t('Asystent budowy')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Wand2 className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-stone-50">{t('Asystent budowy')}</h2>
            <p className="text-xs text-stone-400">
              {data
                ? t('Podpowiedzi na podstawie {n} talii z EDHREC i wolnych kart z Twojej kolekcji.', { n: data.numDecks.toLocaleString(locale()) })
                : t('Podpowiedzi na podstawie talii z EDHREC i wolnych kart z Twojej kolekcji.')}
            </p>
          </div>
        </div>
        <button type="button" onClick={onDisable} className="btn btn-ghost">{t('Wyłącz asystenta')}</button>
      </div>

      {!deck.commander ? (
        <p className="text-sm text-stone-400">{t('Wybierz dowódcę, a asystent zaproponuje pierwsze karty do talii.')}</p>
      ) : (
        <>
          {/* Postęp: liczba kart i role */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-stone-200">{t('Karty w talii')}</span>
                <span className="tabular-nums text-stone-300">{progress.size} / {COMMANDER_DECK_SIZE}</span>
              </div>
              <Bar value={progress.size} max={COMMANDER_DECK_SIZE} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {progress.roles.map((r) => (
                <div key={r.role} className="p-2.5 rounded-xl bg-stone-950 border border-stone-800" title={t(ROLE_HINTS[r.role])}>
                  <div className="flex items-center justify-between gap-1 text-[11px] mb-1.5">
                    <span className="text-stone-400 truncate">{t(ROLE_LABELS[r.role])}</span>
                    {r.have >= r.target && <Check className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-label={t('Cel osiągnięty')} />}
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-stone-100 mb-1.5">
                    {r.have} <span className="text-stone-500 font-normal">/ {r.target}</span>
                  </div>
                  <Bar value={r.have} max={r.target} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-stone-500">{t('Role rozpoznajemy z tekstu kart, więc liczby są przybliżone. Cele to typowe proporcje talii Commander.')}</p>
          </div>

          {progress.full ? (
            <p className="text-sm text-stone-300 p-3 rounded-xl bg-stone-950 border border-stone-800">
              {t('Talia ma już 100 kart. Zamiany słabszych kart podpowiada sekcja „Lepsze odpowiedniki” niżej.')}
            </p>
          ) : (
            <>
              {/* Następne karty z EDHREC */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-stone-400" /> {t('Następne do dodania')}
                  </h3>
                  {!collectionOnly && (
                    <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                      <input type="checkbox" checked={preferFree} onChange={(e) => setPreferFree(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                      {t('Najpierw wolne z mojej kolekcji')}
                    </label>
                  )}
                </div>
                {loading && (
                  <p className="text-sm text-stone-400 flex items-center gap-2 py-2"><Loader2 className="w-4 h-4 animate-spin text-amber-400" /> {t('Pobieranie rekomendacji z EDHREC...')}</p>
                )}
                {error && !loading && (
                  <p className="text-sm text-stone-300 flex items-start gap-2 py-2"><AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> {error}</p>
                )}
                {data && !loading && (
                  picks.length === 0 ? (
                    <p className="text-sm text-stone-400 py-2">
                      {collectionOnly
                        ? t('Nie masz wolnych egzemplarzy kolejnych popularnych kart. Zajrzyj niżej do kart z Twojej kolekcji.')
                        : t('Brak kolejnych podpowiedzi z EDHREC.')}
                    </p>
                  ) : (
                    <>
                      <ul className="divide-y divide-stone-800">
                        {picks.slice(0, limit).map((p) => (
                          renderPick(p, t('Gra ją {pct} talii z tym dowódcą', { pct: pct(p.inclusion || 0) }))
                        ))}
                      </ul>
                      {picks.length > limit && (
                        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="btn btn-ghost mt-1">{t('Pokaż więcej')}</button>
                      )}
                    </>
                  )
                )}
              </div>

              {/* Wolne karty z kolekcji spoza rekomendacji */}
              {ownPicks.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-stone-100 flex items-center gap-2 mb-1">
                    <Library className="w-4 h-4 text-stone-400" /> {t('Wolne z Twojej kolekcji')}
                  </h3>
                  <p className="text-[11px] text-stone-500">{t('Karty w kolorach dowódcy, które uzupełniają brakujące role, choć nie ma ich wśród najczęściej granych.')}</p>
                  <ul className="divide-y divide-stone-800">
                    {ownPicks.slice(0, ownLimit).map((p) => (
                      renderPick(p, t('Uzupełnia: {roles}', { roles: p.roles.filter((r) => progress.need[r] > 0).map((r) => t(ROLE_LABELS[r])).join(', ') }))
                    ))}
                  </ul>
                  {ownPicks.length > ownLimit && (
                    <button type="button" onClick={() => setOwnLimit((l) => l + PAGE)} className="btn btn-ghost mt-1">{t('Pokaż więcej')}</button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};
