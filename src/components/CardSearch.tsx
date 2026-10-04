import { PageHeader } from './ui/PageHeader';
import React, { useState, useEffect, useRef } from 'react';
import { ScryfallCard, AppSettings } from '../types';
import { formatCurrency, getCardImageUri, getCardPrice, getRarityColor, getRarityLabel, handleCardImageError, getCardEdhrecRank } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { 
  Search, 
  Plus, 
  ExternalLink, 
  Loader2, 
  Info, 
  SlidersHorizontal,
  Eye,
  Check,
  Trophy
} from 'lucide-react';

interface CardSearchProps {
  onSelectCard: (card: ScryfallCard) => void;
  settings?: AppSettings;
}

export const CardSearch: React.FC<CardSearchProps> = ({ onSelectCard, settings }) => {
  const [query, setQuery] = useState('');
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Search Debounce timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Handle autocomplete as user types
  useEffect(() => {
    if (query.trim().length < 2) {
      setAutocomplete([]);
      setShowAutocomplete(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scryfall/autocomplete?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) {
            setAutocomplete(data.data);
            setShowAutocomplete(true);
          }
        }
      } catch (err) {
        console.error('Autocomplete error:', err);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError(null);
    setShowAutocomplete(false);

    try {
      const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Nie znaleziono kart dla podanego zapytania');
      }

      if (data.data && Array.isArray(data.data)) {
        setSearchResults(data.data);
      } else {
        setSearchResults([]);
      }
    } catch (err: any) {
      setError(err.message || 'Wystąpił błąd podczas wyszukiwania kart w Scryfall API');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Search Header Banner */}
      <div className="space-y-4">
        <PageHeader
          title="Szukaj kart"
          description={
            <>
              Nazwa karty, dodatek albo zapytanie Scryfall, np. <code className="text-stone-200">c:blue t:instant</code> lub <code className="text-stone-200">rarity:mythic cmc&lt;3</code>.
            </>
          }
        />

        {/* Input Bar */}
        <div className="relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeSearch(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-400" />
              <input
                type="text"
                placeholder="Wpisz nazwę karty (np. Black Lotus, Counterspell, Ragavan)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  if (autocomplete.length > 0) setShowAutocomplete(true);
                }}
                className="w-full bg-stone-950 border border-stone-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Szukam...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 stroke-[2.5]" />
                  <span>Szukaj</span>
                </>
              )}
            </button>
          </form>

          {/* Autocomplete Dropdown */}
          {showAutocomplete && autocomplete.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl z-40 overflow-hidden divide-y divide-stone-800/60 max-h-60 overflow-y-auto">
              {autocomplete.map((cardName, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuery(cardName);
                    setShowAutocomplete(false);
                    executeSearch(cardName);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs text-stone-200 hover:bg-stone-800/80 hover:text-amber-300 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="font-semibold">{cardName}</span>
                  <span className="text-[11px] tabular-nums text-stone-500 ">Scryfall</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Error Notice */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 text-xs text-rose-300 flex items-center gap-3">
          <Info className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Section */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-stone-200">
              Wyniki wyszukiwania (<span className="text-amber-400 tabular-nums">{searchResults.length}</span>)
            </h3>
            <span className="text-xs text-stone-400">Kliknij kartę, aby dodać ją do kolekcji</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {searchResults.map((card) => {
              const imageUri = getCardImageUri(card, 'normal');
              const price = getCardPrice(card, false, settings || 'USD');
              const edhrecRank = getCardEdhrecRank(card);

              return (
                <div
                  key={card.id}
                  className="group relative bg-stone-900 rounded-xl border border-stone-800 hover:border-amber-500/60 transition-all duration-300 overflow-hidden flex flex-col shadow-md hover:shadow-xl hover:shadow-amber-900/10"
                >
                  <div 
                    onClick={() => onSelectCard(card)}
                    className="relative aspect-[2.5/3.5] w-full overflow-hidden bg-stone-950 cursor-pointer"
                  >
                    <img
                      src={imageUri}
                      alt={card.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => handleCardImageError(e, imageUri)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="px-3 py-1.5 rounded-full bg-amber-500 text-stone-950 font-bold text-xs flex items-center gap-1.5 shadow-lg">
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>Dodaj / Szczegóły</span>
                      </div>
                    </div>

                    {/* EDHREC Rank Banner on bottom-left corner */}
                    {edhrecRank != null && (
                      <div 
                        title={`Ranking EDHREC: #${edhrecRank.toLocaleString()} (popularność w formacie Commander)`}
                        className="absolute bottom-0 left-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-tr-lg shadow-sm flex items-center gap-1 select-none border-t border-r border-white/20"
                      >
                        <Trophy className="w-3 h-3 fill-stone-950 stroke-[1.5] shrink-0" />
                        <span>EDH #{edhrecRank.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="absolute bottom-2 right-2 bg-stone-950/90 backdrop-blur-md px-2 py-0.5 rounded border border-stone-800">
                      <p className="text-xs font-bold tabular-nums text-emerald-400">
                        {formatCurrency(price, settings ? settings.currency : 'USD')}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4 
                          onClick={() => onSelectCard(card)}
                          className="font-bold text-xs text-stone-100 hover:text-amber-300 transition-colors line-clamp-1 cursor-pointer"
                        >
                          {card.name}
                        </h4>
                        <ManaSymbol cost={card.mana_cost} size="sm" />
                      </div>

                      <p className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                        {card.type_line}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="tabular-nums text-[11px] font-bold bg-stone-800 text-stone-300 px-1.5 py-0.5 rounded border border-stone-700">
                          {card.set.toUpperCase()}
                        </span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${getRarityColor(card.rarity)}`}>
                          {getRarityLabel(card.rarity)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onSelectCard(card)}
                      className="w-full py-1.5 rounded-lg bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Dodaj do kolekcji</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
