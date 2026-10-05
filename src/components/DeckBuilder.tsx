import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ZoomIn, ZoomOut, Sliders, ArrowDownWideNarrow } from 'lucide-react';
import { ScryfallCard, DeckCardEntry, DeckItem } from '../types';
import {
  DeckBuilderProps,
  DECK_CATEGORIES,
  getCardCategory,
  DeckHeader,
  CommanderShowcase,
  DeckStatsBar,
  DeckCategoriesBoard,
  FloatingCardPreview,
  DeckAddCardModal,
  useDeckStats,
  useDeckSearch,
} from './deck-builder';
import { DeckImportExportModal } from './DeckImportExportModal';
import { DeckCombosModal } from './deck-builder/DeckCombosModal';
import { DeckAnalysis } from './deck-builder/DeckAnalysis';
import { DeckTokens } from './deck-builder/DeckTokens';
import { DeckLegalityNotice } from './deck-builder/DeckLegalityNotice';
import { checkCommanderLegality } from './deck-builder/legality';
import { DeckBracketPanel, useDeckBracket } from './deck-builder/DeckBracket';
import { DECK_SORT_OPTIONS, loadDeckSort, saveDeckSort, type DeckCardSort } from './deck-builder/cardSort';
import { DeckSuggestions } from './deck-builder/DeckSuggestions';
import { DeckShareModal } from './deck-builder/DeckShareModal';
import type { EdhrecRecommendation } from '../services/api';
import { wishlistApi } from '../services/api';

// Re-export constants for external consumers if needed
export { DECK_CATEGORIES, getCardCategory };

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  deck,
  collection,
  settings,
  onUpdateDeck,
  onBack,
  onViewCardDetails,
  onUpdateSettings,
  showToast = (_msg: string) => {},
  wishlist = [],
  onAddToWishlist,
}) => {
  // Hover preview state
  const [hoveredCard, setHoveredCard] = useState<ScryfallCard | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // Deck Import / Export Modal state
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importExportTab, setImportExportTab] = useState<'export' | 'import'>('export');

  // Commander Spellbook Combos Modal state
  const [isCombosModalOpen, setIsCombosModalOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // User adjustable card preview scale (persisted in user AppSettings)
  const [previewScale, setPreviewScale] = useState<number>(settings.deckCardPreviewScale || 100);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (settings.deckCardPreviewScale && settings.deckCardPreviewScale !== previewScale) {
      setPreviewScale(settings.deckCardPreviewScale);
    }
  }, [settings.deckCardPreviewScale]);

  const handleScaleChange = useCallback((newScale: number) => {
    const clamped = Math.max(75, Math.min(160, Math.round(newScale)));
    setPreviewScale(clamped);

    if (onUpdateSettings) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        onUpdateSettings({
          ...settings,
          deckCardPreviewScale: clamped,
        });
      }, 400);
    }
  }, [settings, onUpdateSettings]);

  // Deck statistics hook (curve, counts, valuations, categories)
  const {
    totalCardsCount,
    totalDeckValue,
    categorizedCards,
    manaCurve,
    colorIdentity,
  } = useDeckStats({ deck, settings });

  // Search & add card modal hook
  const {
    isSearchOpen,
    searchQuery,
    searchSource,
    searchResults,
    isSearchingScryfall,
    setSearchSource,
    openSearchModal,
    closeSearchModal,
    handleSearchCards,
  } = useDeckSearch({ deck, collection });

  // Hover triggers
  const handleHoverCard = useCallback((card: ScryfallCard, e: React.MouseEvent) => {
    // Na dotyku podgląd „po najechaniu” zostawałby na ekranie po stuknięciu — tam stuknięcie otwiera szczegóły.
    if (window.matchMedia?.('(hover: none)').matches) return;
    setHoveredCard(card);
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPosition({ x: rect.right + 10, y: Math.max(20, rect.top - 60) });
  }, []);

  const handleLeaveCard = useCallback(() => {
    setHoveredCard(null);
  }, []);

  // Card Operations
  const handleAddCardToDeck = useCallback((card: ScryfallCard, asCommander = false, isFoil?: boolean) => {
    if (asCommander) {
      onUpdateDeck({
        ...deck,
        commander: card,
        commanderIsFoil: Boolean(isFoil),
        // dowódca nie może być jednocześnie wśród 99 kart
        cards: deck.cards.filter((e) => e.card.name !== card.name),
      });
      closeSearchModal();
      return;
    }

    const isBasic = (card.type_line || '').toLowerCase().includes('basic');
    const singleton = /commander|edh/i.test(deck.format || '') || Boolean(deck.commander);
    const updatedCards = deck.cards.map((e) => ({ ...e }));
    const sameName = updatedCards.findIndex((e) => !e.isSideboard && e.card.name === card.name);
    const samePrint = updatedCards.findIndex((e) => !e.isSideboard && e.card.id === card.id);

    if (singleton && !isBasic && sameName >= 0) {
      // Karta już jest w talii: zmieniamy jej wydanie / wersję foil zamiast dodawać kopię
      const prev = updatedCards[sameName];
      updatedCards[sameName] = { ...prev, card, isFoil: isFoil ?? prev.isFoil };
      if (prev.card.id !== card.id || Boolean(prev.isFoil) !== Boolean(isFoil ?? prev.isFoil)) {
        showToast(`Zmieniono wersję „${card.name}” w talii.`);
      }
    } else if (samePrint >= 0) {
      updatedCards[samePrint].quantity += 1;
      if (isFoil !== undefined) updatedCards[samePrint].isFoil = isFoil;
    } else {
      updatedCards.push({ card, quantity: 1, isCommander: false, ...(isFoil ? { isFoil: true } : {}) });
    }

    onUpdateDeck({
      ...deck,
      cards: updatedCards,
    });
  }, [deck, onUpdateDeck, closeSearchModal, showToast]);

  const handleUpdateQuantity = useCallback((cardId: string, delta: number) => {
    let updatedCards = [...deck.cards];
    const idx = updatedCards.findIndex(e => e.card.id === cardId);
    if (idx === -1) return;

    const newQty = updatedCards[idx].quantity + delta;
    if (newQty <= 0) {
      updatedCards = updatedCards.filter(e => e.card.id !== cardId);
    } else {
      updatedCards[idx].quantity = newQty;
    }

    onUpdateDeck({
      ...deck,
      cards: updatedCards,
    });
  }, [deck, onUpdateDeck]);

  // Karta z rekomendacji EDHREC: mamy jej dane z lokalnej bazy albo szukamy po nazwie w Scryfall
  const resolveRecommendedCard = useCallback(async (rec: EdhrecRecommendation): Promise<ScryfallCard | null> => {
    if (rec.card) return rec.card;
    try {
      const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(rec.name)}`);
      return res.ok ? ((await res.json()) as ScryfallCard) : null;
    } catch {
      return null;
    }
  }, []);

  const handleAddRecommended = useCallback(async (rec: EdhrecRecommendation) => {
    const card = await resolveRecommendedCard(rec);
    if (!card) {
      showToast(`Nie udało się pobrać karty "${rec.name}".`);
      return;
    }
    handleAddCardToDeck(card);
    showToast(`Dodano "${card.name}" do talii.`);
  }, [resolveRecommendedCard, handleAddCardToDeck, showToast]);

  const wishlistNames = useMemo(
    () => new Set(wishlist.map((w) => (w.card?.name || '').split('//')[0].trim().toLowerCase()).filter(Boolean)),
    [wishlist]
  );

  const handleWishlistRecommended = useCallback(async (rec: EdhrecRecommendation) => {
    if (!onAddToWishlist) return;
    const card = await resolveRecommendedCard(rec);
    if (!card) {
      showToast(`Nie udało się pobrać karty "${rec.name}".`);
      return;
    }
    await onAddToWishlist(card);
  }, [resolveRecommendedCard, onAddToWishlist, showToast]);

  const handleReplaceWithRecommended = useCallback(async (oldCard: ScryfallCard, rec: EdhrecRecommendation) => {
    const card = await resolveRecommendedCard(rec);
    if (!card) {
      showToast(`Nie udało się pobrać karty "${rec.name}".`);
      return;
    }
    const cards = deck.cards
      .map((e) => (e.card.id === oldCard.id ? { ...e, quantity: e.quantity - 1 } : e))
      .filter((e) => e.quantity > 0);
    if (!cards.some((e) => e.card.id === card.id || e.card.name === card.name)) {
      cards.push({ card, quantity: 1, isCommander: false });
    }
    onUpdateDeck({ ...deck, cards });
    showToast(`Zamieniono "${oldCard.name}" na "${card.name}".`);
  }, [deck, onUpdateDeck, resolveRecommendedCard, showToast]);

  // Basic Lands w kolorach dowódcy (bezbarwny dowódca: Wastes)
  const BASIC_NAMES: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes' };
  const basicColors = deck.commander
    ? deck.commander.color_identity?.length
      ? ['W', 'U', 'B', 'R', 'G'].filter((c) => deck.commander!.color_identity!.includes(c))
      : ['C']
    : ['W', 'U', 'B', 'R', 'G'].filter((c) => colorIdentity.includes(c));
  const basics = basicColors.map((color) => {
    const name = BASIC_NAMES[color];
    const count = deck.cards.filter((e) => !e.isSideboard && e.card.name === name).reduce((sum, e) => sum + e.quantity, 0);
    return { color, name, count };
  });
  const [basicsBusy, setBasicsBusy] = useState<string | null>(null);
  const legality = React.useMemo(() => checkCommanderLegality(deck), [deck]);
  const bracket = useDeckBracket(deck);
  const [sortMode, setSortMode] = useState<DeckCardSort>(loadDeckSort);
  const handleSortChange = useCallback((mode: DeckCardSort) => {
    setSortMode(mode);
    saveDeckSort(mode);
  }, []);

  const handleSetBasicCount = useCallback(
    async (name: string, rawTarget: number) => {
      const target = Math.max(0, Math.min(99, Math.floor(rawTarget)));
      const current = deck.cards.filter((e) => !e.isSideboard && e.card.name === name).reduce((sum, e) => sum + e.quantity, 0);
      if (target === current) return;
      let cards = deck.cards.map((e) => ({ ...e }));
      if (target < current) {
        let remove = current - target;
        cards = cards
          .map((e) => {
            if (remove > 0 && !e.isSideboard && e.card.name === name) {
              const r = Math.min(remove, e.quantity);
              remove -= r;
              return { ...e, quantity: e.quantity - r };
            }
            return e;
          })
          .filter((e) => e.quantity > 0);
      } else {
        const add = target - current;
        const idx = cards.findIndex((e) => !e.isSideboard && e.card.name === name);
        if (idx >= 0) {
          cards[idx].quantity += add;
        } else {
          setBasicsBusy(name);
          let card: ScryfallCard | null = null;
          try {
            const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(name)}`);
            card = res.ok ? ((await res.json()) as ScryfallCard) : null;
          } catch {
            card = null;
          } finally {
            setBasicsBusy(null);
          }
          if (!card) {
            showToast(`Nie udało się pobrać karty ${name}. Spróbuj ponownie.`);
            return;
          }
          cards.push({ card, quantity: add, isCommander: false });
        }
      }
      onUpdateDeck({ ...deck, cards });
    },
    [deck, onUpdateDeck, showToast]
  );

  const handleSetCommander = useCallback((card: ScryfallCard) => {
    // Remove from the main 99 if it was in the deck
    const filteredCards = deck.cards.filter(e => e.card.id !== card.id && e.card.name !== card.name);
    onUpdateDeck({
      ...deck,
      commander: card,
      cards: filteredCards,
    });
  }, [deck, onUpdateDeck]);

  const handleRemoveCommander = useCallback(() => {
    onUpdateDeck({
      ...deck,
      commander: null,
    });
  }, [deck, onUpdateDeck]);

  const handleToggleCardSource = useCallback(() => {
    const nextSource = (deck.cardSource || 'collection') === 'collection' ? 'all' : 'collection';
    onUpdateDeck({
      ...deck,
      cardSource: nextSource,
    });
    setSearchSource(nextSource);
  }, [deck, onUpdateDeck, setSearchSource]);

  // Spellbook combo quick actions
  const handleAddCardByName = useCallback(async (cardName: string) => {
    try {
      const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(cardName)}`);
      if (res.ok) {
        const card: ScryfallCard = await res.json();
        handleAddCardToDeck(card);
        showToast(`Dodano kartę "${card.name}" do talii!`);
      } else {
        const fuzzyRes = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(cardName)}`);
        if (fuzzyRes.ok) {
          const card: ScryfallCard = await fuzzyRes.json();
          handleAddCardToDeck(card);
          showToast(`Dodano kartę "${card.name}" do talii!`);
        } else {
          showToast(`Nie znaleziono karty "${cardName}" w bazie Scryfall.`);
        }
      }
    } catch (err: any) {
      showToast(`Błąd dodawania karty: ${err.message}`);
    }
  }, [handleAddCardToDeck, showToast]);

  const handleAddToWishlistByName = useCallback(async (cardName: string) => {
    try {
      let card: ScryfallCard | null = null;
      const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(cardName)}`);
      if (res.ok) {
        card = await res.json();
      } else {
        const fuzzyRes = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(cardName)}`);
        if (fuzzyRes.ok) {
          card = await fuzzyRes.json();
        }
      }

      if (!card) {
        showToast(`Nie znaleziono karty "${cardName}".`);
        return;
      }

      await wishlistApi.create({
        cardId: card.id,
        card,
        targetQuantity: 1,
        isFoil: false
      });
      showToast(`Dodano "${card.name}" do Twojej Wishlisty!`);
    } catch (err: any) {
      showToast(`Błąd dodawania do Wishlisty: ${err.message}`);
    }
  }, [showToast]);

  const handleViewCardDetailsByName = useCallback(async (cardName: string) => {
    try {
      const res = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(cardName)}`);
      if (res.ok) {
        const card: ScryfallCard = await res.json();
        onViewCardDetails(card);
      } else {
        const fuzzy = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(cardName)}`);
        if (fuzzy.ok) {
          const card: ScryfallCard = await fuzzy.json();
          onViewCardDetails(card);
        }
      }
    } catch (_) {}
  }, [onViewCardDetails]);

  const handleUpdateDeckCards = useCallback(
    async (
      newCards: DeckCardEntry[],
      newCommander?: ScryfallCard | null,
      mode: 'append' | 'replace' = 'append'
    ) => {
      let finalCards: DeckCardEntry[] = [];
      if (mode === 'replace') {
        finalCards = newCards;
      } else {
        finalCards = [...deck.cards];
        for (const item of newCards) {
          const idx = finalCards.findIndex(
            (c) =>
              c.card.id === item.card.id ||
              c.card.name.toLowerCase() === item.card.name.toLowerCase()
          );
          const isBasic = (item.card.type_line || '').toLowerCase().includes('basic');
          if (idx >= 0) {
            if (isBasic) {
              finalCards[idx].quantity += item.quantity;
            }
          } else {
            finalCards.push(item);
          }
        }
      }

      const updatedDeck: DeckItem = {
        ...deck,
        commander: newCommander !== undefined ? newCommander : deck.commander,
        cards: finalCards,
      };

      onUpdateDeck(updatedDeck);
    },
    [deck, onUpdateDeck]
  );

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Top Deck Info & Actions Bar */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-xl">
        <DeckHeader
          name={deck.name}
          format={deck.format}
          description={deck.description}
          cardSource={deck.cardSource || 'collection'}
          totalCardsCount={totalCardsCount}
          totalDeckValue={totalDeckValue}
          currency={settings.currency}
          onBack={onBack}
          onToggleCardSource={handleToggleCardSource}
          onOpenAddModal={openSearchModal}
          onOpenImportExport={() => {
            setImportExportTab('export');
            setIsImportExportOpen(true);
          }}
          onOpenCombos={() => setIsCombosModalOpen(true)}
          onOpenShare={() => setIsShareOpen(true)}
          isPublic={Boolean(deck.isPublic)}
        />

        {/* Commander Featured Showcase / Select Placeholder */}
        <CommanderShowcase
          commander={deck.commander}
          commanderIsFoil={deck.commanderIsFoil}
          settings={settings}
          onViewDetails={onViewCardDetails}
          onRemoveCommander={handleRemoveCommander}
          onOpenSearch={openSearchModal}
        />
      </div>

      {/* 2. Mana Curve & Color Identity Bar */}
      <DeckStatsBar
        manaCurve={manaCurve}
        colorIdentity={colorIdentity}
        basics={basics}
        onSetBasicCount={handleSetBasicCount}
        basicsBusy={basicsBusy}
      />

      {/* Bracket talii i Game Changers */}
      <DeckBracketPanel deck={deck} bracket={bracket} onViewCardByName={handleViewCardDetailsByName} />

      {/* 2b. Board Toolbar: Categories Sorting Info & Card Preview Size Slider */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-sm text-stone-400 shrink-0">Sortuj karty</span>
          <div className="inline-grid grid-cols-3 p-1 rounded-lg bg-stone-950 ring-1 ring-stone-800" role="radiogroup" aria-label="Kolejność kart w kategoriach">
            {DECK_SORT_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={sortMode === o.id}
                title={o.title}
                onClick={() => handleSortChange(o.id)}
                className={`h-8 px-3.5 rounded-md text-sm cursor-pointer ${
                  sortMode === o.id ? 'bg-stone-800 text-stone-50 font-medium' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Card Preview Scale Slider */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-2.5 bg-stone-950 px-3.5 py-2 rounded-xl border border-stone-800 shadow-inner w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-xs text-stone-300 font-semibold flex items-center gap-1.5 shrink-0">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Podgląd kart:</span>
            </span>

            <button
              type="button"
              onClick={() => handleScaleChange(previewScale - 10)}
              className="p-1 text-stone-400 hover:text-amber-300 hover:bg-stone-900 rounded-md transition-colors cursor-pointer"
              title="Zmniejsz podgląd"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <input
              type="range"
              min="75"
              max="160"
              step="5"
              value={previewScale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="w-24 sm:w-32 accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded-lg"
              title={`Skala podglądu kart: ${previewScale}%`}
            />

            <button
              type="button"
              onClick={() => handleScaleChange(previewScale + 10)}
              className="p-1 text-stone-400 hover:text-amber-300 hover:bg-stone-900 rounded-md transition-colors cursor-pointer"
              title="Powiększ podgląd"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <span className="text-xs tabular-nums font-bold text-amber-300 min-w-[2.8rem] text-right">
              {previewScale}%
            </span>

            {previewScale !== 100 && (
              <button
                type="button"
                onClick={() => handleScaleChange(100)}
                className="text-[11px] font-semibold text-stone-500 hover:text-amber-300 ml-1 underline transition-colors cursor-pointer"
                title="Przywróć domyślne 100%"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zgodność z zasadami Commandera */}
      <DeckLegalityNotice deck={deck} report={legality} onViewCardDetails={onViewCardDetails} />

      {/* 3. Main Stacked Categories Board */}
      <DeckCategoriesBoard
        gameChangers={bracket.gameChangers}
        issuesById={legality.byCardId}
        sortMode={sortMode}
        categorizedCards={categorizedCards}
        settings={settings}
        previewScale={previewScale}
        onHoverCard={handleHoverCard}
        onLeaveCard={handleLeaveCard}
        onUpdateQuantity={handleUpdateQuantity}
        onSetCommander={handleSetCommander}
        onViewCardDetails={onViewCardDetails}
      />

      {/* 3b. Statystyki talii: losowa ręka, szanse, wymagania kolorów */}
      <DeckAnalysis deck={deck} onViewCardDetails={onViewCardDetails} />

      {/* 3b'. Tokeny tworzone przez karty talii */}
      <DeckTokens deck={deck} onViewCardDetails={onViewCardDetails} />

      {/* 3c. Sugestie z EDHREC (format Commander) */}
      {(deck.commander || /commander|edh/i.test(deck.format || '')) && (
      <DeckSuggestions
        deck={deck}
        collection={collection}
        onViewCardDetails={onViewCardDetails}
        onAddCard={handleAddRecommended}
        onReplaceCard={handleReplaceWithRecommended}
        wishlistNames={wishlistNames}
        onAddToWishlist={onAddToWishlist ? handleWishlistRecommended : undefined}
      />
      )}

      {isShareOpen && (
        <DeckShareModal
          deck={deck}
          onClose={() => setIsShareOpen(false)}
          onChanged={(isPublic) => onUpdateDeck({ ...deck, isPublic })}
          showToast={showToast}
        />
      )}

      {/* 4. Floating Card Preview on Hover */}
      <FloatingCardPreview
        card={hoveredCard}
        position={hoverPosition}
        scale={previewScale}
      />

      {/* 5. Add Card to Deck Modal */}
      <DeckAddCardModal
        isOpen={isSearchOpen}
        deckName={deck.name}
        collection={collection}
        deckCards={deck.cards}
        searchSource={searchSource}
        searchQuery={searchQuery}
        searchResults={searchResults}
        isSearchingScryfall={isSearchingScryfall}
        settings={settings}
        onClose={closeSearchModal}
        onSearchChange={handleSearchCards}
        onSourceChange={setSearchSource}
        onAddCard={handleAddCardToDeck}
      />

      {/* 6. Deck Import / Export (.txt) Modal */}
      {isImportExportOpen && (
        <DeckImportExportModal
          isOpen={isImportExportOpen}
          deck={deck}
          initialTab={importExportTab}
          onClose={() => setIsImportExportOpen(false)}
          onUpdateDeckCards={handleUpdateDeckCards}
          showToast={showToast}
        />
      )}

      {/* 7. Commander Spellbook Combos Modal */}
      {isCombosModalOpen && (
        <DeckCombosModal
          isOpen={isCombosModalOpen}
          deck={deck}
          onClose={() => setIsCombosModalOpen(false)}
          onAddCardToDeck={handleAddCardByName}
          onAddToWishlist={handleAddToWishlistByName}
          onViewCardDetails={handleViewCardDetailsByName}
        />
      )}
    </div>
  );
};

export default DeckBuilder;
