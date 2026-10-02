import React, { useMemo, useState } from 'react';
import { Swords, Share2, Check, FileText, LogIn, X, Crown, Layers, Coins } from 'lucide-react';
import type { AppSettings, DeckItem, ScryfallCard } from '../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { DECK_CATEGORIES, DeckStatsBar, useDeckStats } from './deck-builder';
import { DeckAnalysis } from './deck-builder/DeckAnalysis';
import { deckToText } from './deck-builder/DeckShareModal';
import { useBackToClose } from '../hooks/useBackButton';

interface PublicDeckViewProps {
  deck: DeckItem;
  owner: { username: string };
  settings: AppSettings;
  isLoggedIn?: boolean;
  onOpenLogin: () => void;
  showToast?: (msg: string) => void;
}

/** Publiczny podgląd talii (link ?talia=id) — dostępny bez logowania. */
export const PublicDeckView: React.FC<PublicDeckViewProps> = ({ deck, owner, settings, isLoggedIn = false, onOpenLogin, showToast }) => {
  const { totalCardsCount, totalDeckValue, categorizedCards, manaCurve, colorIdentity } = useDeckStats({ deck, settings });
  const [preview, setPreview] = useState<ScryfallCard | null>(null);
  const [copied, setCopied] = useState<'link' | 'txt' | null>(null);
  useBackToClose(Boolean(preview), () => setPreview(null));

  const categories = useMemo(
    () =>
      DECK_CATEGORIES.map((c) => ({ ...c, entries: categorizedCards.get(c.id) || [] }))
        .filter((c) => c.entries.length > 0)
        .sort((a, b) => b.entries.reduce((n, e) => n + e.quantity, 0) - a.entries.reduce((n, e) => n + e.quantity, 0)),
    [categorizedCards]
  );

  const copy = async (what: 'link' | 'txt') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? window.location.href : deckToText(deck));
      setCopied(what);
      showToast?.(what === 'link' ? 'Skopiowano link do talii.' : 'Skopiowano listę kart.');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast?.('Nie udało się skopiować do schowka.');
    }
  };

  const commanderImg = deck.commander ? getCardImageUri(deck.commander, 'normal') : '';

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100 font-sans pb-16">
      <header className="bg-stone-900 border-b border-stone-800 sticky top-0 z-30 shadow-md pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 to-amber-600 flex items-center justify-center shrink-0 ring-1 ring-purple-400/30">
              <Swords className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black tracking-tight truncate">
                <span className="hidden sm:inline text-stone-400 font-bold">Mana Screw • </span>Talia
              </h1>
              <p className="text-xs text-stone-400 truncate">
                Autor: <strong className="text-purple-300">@{owner.username}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copy('link')}
              aria-label="Kopiuj link do talii"
              className="h-10 px-3 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              {copied === 'link' ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-purple-300" />}
              <span className="hidden sm:inline">{copied === 'link' ? 'Skopiowano!' : 'Udostępnij'}</span>
            </button>
            {!isLoggedIn && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="h-10 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-black text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Zaloguj się
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-6 space-y-5">
        {/* Nagłówek talii */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row gap-5 md:items-center">
          {deck.commander && (
            <button
              type="button"
              onClick={() => setPreview(deck.commander!)}
              className="w-40 sm:w-48 shrink-0 self-center md:self-auto rounded-2xl overflow-hidden border border-amber-500/40 shadow-xl cursor-pointer aspect-[63/88] bg-stone-950"
              title={deck.commander.name}
            >
              {commanderImg && (
                <img src={commanderImg} alt={deck.commander.name} referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, commanderImg)} className="w-full h-full object-cover" />
              )}
            </button>
          )}
          <div className="space-y-3 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                {deck.format || 'EDH Commander'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight break-words">{deck.name}</h2>
            {deck.commander && (
              <p className="text-sm text-stone-300 flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-400" /> Dowódca: <strong className="text-stone-100">{deck.commander.name}</strong>
              </p>
            )}
            {deck.description && <p className="text-sm text-stone-400 whitespace-pre-line">{deck.description}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-stone-950/80 px-3.5 py-2 rounded-xl border border-stone-800 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" /> <strong>{totalCardsCount}</strong> kart
              </span>
              <span className="bg-stone-950/80 px-3.5 py-2 rounded-xl border border-stone-800 text-sm flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" /> <strong className="text-emerald-300">{formatCurrency(totalDeckValue, settings.currency)}</strong>
              </span>
              <button
                type="button"
                onClick={() => copy('txt')}
                className="h-10 px-3.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
              >
                {copied === 'txt' ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-purple-300" />}
                Kopiuj listę kart
              </button>
            </div>
          </div>
        </div>

        <DeckStatsBar manaCurve={manaCurve} colorIdentity={colorIdentity} />

        {/* Lista kart według typów */}
        <div className="columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 gap-4 [&>*]:break-inside-avoid">
          {categories.map((cat) => (
            <section key={cat.id} className={`mb-4 bg-stone-900 border ${cat.border} rounded-2xl p-3.5`}>
              <h3 className="flex items-center justify-between text-sm font-bold text-stone-100 mb-2">
                <span>{cat.icon} {cat.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${cat.badge}`}>{cat.entries.reduce((n, e) => n + e.quantity, 0)}</span>
              </h3>
              <ul className="space-y-0.5">
                {cat.entries
                  .slice()
                  .sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0) || a.card.name.localeCompare(b.card.name))
                  .map((e) => (
                    <li key={e.card.id}>
                      <button
                        type="button"
                        onClick={() => setPreview(e.card)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-800 text-left cursor-pointer"
                      >
                        <span className="text-xs font-mono text-stone-400 w-5 shrink-0">{e.quantity}</span>
                        <span className="text-sm text-stone-200 truncate flex-1">{e.card.name}</span>
                        <ManaSymbol cost={e.card.mana_cost || e.card.card_faces?.[0]?.mana_cost} size="sm" />
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>

        <DeckAnalysis deck={deck} onViewCardDetails={setPreview} />

        {!isLoggedIn && (
          <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-stone-300">Chcesz zbudować własną talię i sprawdzić, które karty już masz? Załóż darmowe konto w Mana Screw.</p>
            <button type="button" onClick={onOpenLogin} className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-black shrink-0 cursor-pointer">
              Załóż konto
            </button>
          </div>
        )}
      </main>

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
        >
          <div className="relative w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="Zamknij"
              className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-stone-800 text-stone-200 flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="rounded-2xl overflow-hidden border border-stone-700 shadow-2xl aspect-[63/88] bg-stone-900">
              <img
                src={getCardImageUri(preview, 'large') || getCardImageUri(preview, 'normal')}
                alt={preview.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="mt-3 text-center text-sm text-stone-200 font-semibold">{preview.name}</p>
            <p className="text-center text-xs text-stone-400">
              {preview.type_line} · {formatCurrency(getCardPrice(preview, false, settings), settings.currency)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
