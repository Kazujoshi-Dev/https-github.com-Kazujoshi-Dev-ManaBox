import React, { useCallback, useState } from 'react';
import { Swords, Share2, Check, FileText, LogIn, X, Crown, Layers, Coins } from 'lucide-react';
import type { AppSettings, DeckItem, ScryfallCard } from '../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { DeckCategoriesBoard, DeckStatsBar, FloatingCardPreview, useDeckStats } from './deck-builder';
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

  // Podgląd karty po najechaniu (jak w edytorze; na dotyku stuknięcie otwiera podgląd)
  const [hovered, setHovered] = useState<ScryfallCard | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const handleHover = useCallback((card: ScryfallCard, e: React.MouseEvent) => {
    if (window.matchMedia?.('(hover: none)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHovered(card);
    setHoverPos({ x: rect.right + 10, y: Math.max(20, rect.top - 60) });
  }, []);

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
            <div className="w-10 h-10 rounded-xl bg-amber-700 flex items-center justify-center shrink-0 ring-1 ring-amber-400/30">
              <Swords className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
                <span className="hidden sm:inline text-stone-400 font-bold">Mana Screw • </span>Talia
              </h1>
              <p className="text-xs text-stone-400 truncate">
                Autor: <strong className="text-amber-300">@{owner.username}</strong>
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
              {copied === 'link' ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-amber-300" />}
              <span className="hidden sm:inline">{copied === 'link' ? 'Skopiowano!' : 'Udostępnij'}</span>
            </button>
            {!isLoggedIn && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="h-10 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
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
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row gap-5 md:items-center">
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
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 tabular-nums">
                {deck.format || 'EDH Commander'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words">{deck.name}</h2>
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
                {copied === 'txt' ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-amber-300" />}
                Kopiuj listę kart
              </button>
            </div>
          </div>
        </div>

        <DeckStatsBar manaCurve={manaCurve} colorIdentity={colorIdentity} />

        {/* Karty według typów — ten sam wygląd co w edytorze talii (bez edycji) */}
        <DeckCategoriesBoard
          categorizedCards={categorizedCards}
          settings={settings}
          previewScale={100}
          onHoverCard={handleHover}
          onLeaveCard={() => setHovered(null)}
          onViewCardDetails={setPreview}
        />
        <FloatingCardPreview card={hovered} position={hoverPos} scale={100} />

        <DeckAnalysis deck={deck} onViewCardDetails={setPreview} />

        {!isLoggedIn && (
          <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-stone-300">Chcesz zbudować własną talię i sprawdzić, które karty już masz? Załóż darmowe konto w Mana Screw.</p>
            <button type="button" onClick={onOpenLogin} className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-bold shrink-0 cursor-pointer">
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
