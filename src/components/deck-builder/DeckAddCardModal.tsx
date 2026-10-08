import React, { useEffect, useState } from 'react';
import { getCardImageUri } from '../../utils/formatters';
import { AddCardVersionPicker } from './AddCardVersionPicker';
import { Plus, X, Layers, Globe, Search, Crown, Gamepad2 } from 'lucide-react';
import { DEFAULT_FORMAT, digitalLabel, isDigitalOnly } from '../../utils/mtgFormats';
import { DeckAddCardModalProps } from './types';

import { useBackToClose } from '../../hooks/useBackButton';
import { useT } from '../../i18n';
export const DeckAddCardModal: React.FC<DeckAddCardModalProps> = ({
  isOpen,
  deckName,
  collection,
  deckCards,
  deckFormat = DEFAULT_FORMAT,
  searchSource,
  searchQuery,
  searchResults,
  isSearchingScryfall,
  onClose,
  onSearchChange,
  onSourceChange,
  onAddCard,
  settings,
}) => {
  const t = useT();
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);
  // Drugi krok: wybór wydania i wersji foil dla klikniętej karty
  const [picking, setPicking] = useState<{ card: import('../../types').ScryfallCard; asCommander: boolean } | null>(null);
  useEffect(() => {
    if (!isOpen) setPicking(null);
  }, [isOpen]);

  if (!isOpen) return null;
  const isArena = deckFormat.platform === 'arena';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-base text-stone-50">
              {picking ? (picking.asCommander ? t('Wybierz wersję dowódcy') : t('Wybierz wersję: {name}', { name: picking.card.name })) : t('Dodaj kartę do talii „{deckName}”', { deckName })}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {picking ? (
          <AddCardVersionPicker
            card={picking.card}
            asCommander={picking.asCommander}
            collection={isArena ? [] : collection}
            deckCards={deckCards}
            settings={isArena ? undefined : settings}
            collectionOnly={searchSource === 'collection'}
            singleton={deckFormat.maxCopies === 1}
            game={isArena ? 'arena' : 'paper'}
            onBack={() => setPicking(null)}
            onConfirm={(card, isFoil, asCommander) => {
              onAddCard(card, asCommander, isFoil);
              setPicking(null);
              // Puste pole wyszukiwania, gotowe na następną kartę
              onSearchChange('');
            }}
          />
        ) : (
        <>
        {/* Search Input & Source Switcher */}
        <div className="p-4 border-b border-stone-800 space-y-3">
          {/* Segmented Source Switcher (talie MTG Arena: zawsze pełna baza kart Areny) */}
          {isArena ? (
            <p className="flex items-center gap-2 text-xs text-stone-400">
              <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
              {t('Format {format}: wyniki obejmują karty dostępne w MTG Arena, także karty cyfrowe.', { format: deckFormat.label })}
            </p>
          ) : (
          <div className="grid grid-cols-2 p-1 bg-stone-950 rounded-xl border border-stone-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                onSourceChange('collection');
                onSearchChange(searchQuery);
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                searchSource === 'collection'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('Tylko moja kolekcja')} ({collection.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSourceChange('all');
                onSearchChange(searchQuery);
              }}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                searchSource === 'all'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t('Wszystkie karty MTG (Scryfall)')}</span>
            </button>
          </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder={
                searchSource === 'collection'
                  ? t('Wyszukaj kartę wyłącznie w Twojej kolekcji...')
                  : isArena
                  ? t('Wyszukaj kartę dostępną w MTG Arena...')
                  : t('Wyszukaj kartę w kolekcji lub w bazie Scryfall...')
              }
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isSearchingScryfall && (
            <div className="text-center py-4 text-xs text-amber-400 animate-pulse tabular-nums">
              {t('Wyszukiwanie w pełnej bazie Scryfall API...')}
            </div>
          )}

          {searchResults.length === 0 && searchQuery.trim().length === 1 && !isSearchingScryfall && (
            <div className="text-center py-8 text-xs text-stone-400">
              {t('Wpisz co najmniej 2 znaki, aby rozpocząć dokładne wyszukiwanie kart...')}
            </div>
          )}

          {searchResults.length === 0 && searchQuery.trim().length >= 2 && !isSearchingScryfall && (
            <div className="text-center py-8 text-xs text-stone-500">
              {searchSource === 'collection'
                ? t('Nie znaleziono pasujących kart w Twojej kolekcji. Możesz przełączyć na "Wszystkie karty MTG (Scryfall)".')
                : t('Nie znaleziono pasujących kart w bazie Scryfall.')}
            </div>
          )}

          {searchResults.length === 0 && !searchQuery.trim() && (
            <div className="text-center py-8 text-xs text-stone-400">
              {searchSource === 'collection'
                ? t('Wpisz nazwę karty (min. 2 znaki), aby przeszukać Twoją kolekcję.')
                : t('Wpisz nazwę karty (min. 2 znaki), aby przeszukać pełną bazę Scryfall.')}
            </div>
          )}

          {searchResults.map(card => {
            const inDeck = deckCards.find(e => !e.isCommander && (e.card.id === card.id || e.card.name === card.name));
            const isLegendary = deckFormat.commander && (card.type_line || '').toLowerCase().includes('legendary');
            const digital = isDigitalOnly(card);
            // Talie MTGA nie korzystają z kolekcji papierowej
            const ownedItem = isArena ? undefined : collection.find(c => c.card.name.toLowerCase() === card.name.toLowerCase());

            return (
              <div
                key={card.id}
                className="p-3 bg-stone-950 hover:bg-stone-850 rounded-xl border border-stone-800 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-14 rounded overflow-hidden border border-stone-700 shrink-0">
                    <img
                      src={getCardImageUri(card, 'art_crop')}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-xs text-stone-100 truncate">
                        {card.name}
                      </h4>
                      {card.mana_cost && (
                        <span className="text-[11px] tabular-nums text-amber-300">
                          {card.mana_cost}
                        </span>
                      )}
                      {digital ? (
                        <span className="text-[11px] text-stone-200 bg-stone-800 px-1.5 py-0.5 rounded border border-stone-600 flex items-center gap-1">
                          <Gamepad2 className="w-3 h-3" />
                          {t(digitalLabel(card))}
                        </span>
                      ) : ownedItem ? (
                        <span className="text-[11px] tabular-nums text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                          {t('W kolekcji:')} {ownedItem.quantity} {t('szt.')}
                        </span>
                      ) : isArena ? null : (
                        <span className="text-[11px] tabular-nums text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                          {t('Scryfall')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-400 truncate mt-0.5">
                      {card.type_line} • {card.set_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isLegendary && (
                    <button
                      onClick={() => setPicking({ card, asCommander: true })}
                      className="px-2.5 py-1.5 bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-amber-500/40 cursor-pointer"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      <span>{t('Dowódca')}</span>
                    </button>
                  )}

                  <button
                    onClick={() => setPicking({ card, asCommander: false })}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{t('Dodaj')} ({inDeck?.quantity || 0})</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>
    </div>
  );
};
