import React, { useState, useEffect } from 'react';
import { ScryfallCard, DeckItem, CollectionItem } from '../types';
import { Crown, Swords, X, Sparkles, Check, Search, Layers, Globe } from 'lucide-react';

import { useBackToClose } from '../hooks/useBackButton';
interface DeckCreateModalProps {
  isOpen: boolean;
  deckToEdit?: DeckItem | null;
  collection: CollectionItem[];
  onClose: () => void;
  onCreateDeck: (data: {
    name: string;
    format: string;
    description: string;
    cardSource?: 'all' | 'collection';
    commander?: ScryfallCard | null;
  }) => Promise<void>;
  onUpdateDeck?: (updated: DeckItem) => Promise<void> | void;
}

export const DeckCreateModal: React.FC<DeckCreateModalProps> = ({
  isOpen,
  deckToEdit,
  collection,
  onClose,
  onCreateDeck,
  onUpdateDeck,
}) => {
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('EDH Commander'); // Domyślnie zawsze EDH Commander
  const [cardSource, setCardSource] = useState<'collection' | 'all'>('collection');
  const [selectedCommander, setSelectedCommander] = useState<ScryfallCard | null>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [scryfallCommanders, setScryfallCommanders] = useState<ScryfallCard[]>([]);
  const [isSearchingScryfall, setIsSearchingScryfall] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when modal opens for create or edit mode
  useEffect(() => {
    if (isOpen) {
      if (deckToEdit) {
        setName(deckToEdit.name || '');
        setDescription(deckToEdit.description || '');
        setFormat(deckToEdit.format || 'EDH Commander');
        setCardSource(deckToEdit.cardSource || 'collection');
        setSelectedCommander(deckToEdit.commander || null);
        setCommanderSearch('');
      } else {
        setName('');
        setDescription('');
        setFormat('EDH Commander');
        setCardSource('collection');
        setSelectedCommander(null);
        setCommanderSearch('');
      }
      setError(null);
    }
  }, [isOpen, deckToEdit]);

  // Search commanders from Scryfall when 'all' is selected and search query is >= 3 chars
  useEffect(() => {
    if (cardSource !== 'all' || !commanderSearch.trim() || commanderSearch.trim().length < 3) {
      setScryfallCommanders([]);
      setIsSearchingScryfall(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingScryfall(true);
      try {
        const query = `${commanderSearch.trim()} (type:legendary and (type:creature or type:planeswalker))`;
        const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.data && Array.isArray(data.data)) {
            setScryfallCommanders(data.data.slice(0, 10));
          }
        }
      } catch (err) {
        console.error('Error searching commanders on Scryfall:', err);
      } finally {
        setIsSearchingScryfall(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [commanderSearch, cardSource]);

  if (!isOpen) return null;

  // Filter legendaries from collection for quick commander pick
  const potentialCommandersFromCollection = collection
    .filter(item => {
      const type = (item.card.type_line || '').toLowerCase();
      return type.includes('legendary') && (type.includes('creature') || type.includes('planeswalker'));
    })
    .map(item => item.card)
    .filter((card, idx, arr) => arr.findIndex(c => c.id === card.id) === idx)
    .filter(card => !commanderSearch || card.name.toLowerCase().includes(commanderSearch.toLowerCase()))
    .slice(0, 8);

  const potentialCommanders = cardSource === 'all' && scryfallCommanders.length > 0
    ? scryfallCommanders
    : potentialCommandersFromCollection;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Podaj nazwę talii.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (deckToEdit && onUpdateDeck) {
        await onUpdateDeck({
          ...deckToEdit,
          name: name.trim(),
          format: format || 'EDH Commander',
          description: description.trim(),
          cardSource,
          commander: selectedCommander,
        });
      } else {
        await onCreateDeck({
          name: name.trim(),
          format: format || 'EDH Commander',
          description: description.trim(),
          cardSource,
          commander: selectedCommander,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Wystąpił błąd podczas zapisywania talii.');
    } finally {
      setIsLoading(false);
    }
  };

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
        className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
      >
        
        {/* Modal Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-amber-950/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600/30 border border-amber-500/40 flex items-center justify-center">
              <Swords className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {deckToEdit ? 'Edytuj talię' : 'Utwórz nową talię'}
              </h3>
              <p className="text-xs text-stone-400">
                {deckToEdit ? 'Zmień nazwę, opis, dowódcę lub źródło kart' : 'Domyślny format: EDH Commander (100 kart)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Deck Name */}
          <div>
            <label className="block text-[11px] font-bold text-stone-400 mb-1.5">
              Nazwa talii *
            </label>
            <input
              type="text"
              required
              placeholder="np. Atraxa Praetors' Voice, Smoki Miirym..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none"
            />
          </div>

          {/* Format (Default EDH Commander) */}
          <div>
            <label className="block text-[11px] font-bold text-stone-400 mb-1.5">
              Format gry (Domyślnie EDH Commander)
            </label>
            <div className="flex items-center gap-2 p-2.5 bg-stone-950 border border-stone-800 rounded-xl">
              <Crown className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex-1">
                <span className="text-xs font-bold text-amber-300 block">
                  EDH Commander
                </span>
                <span className="text-[11px] text-stone-500">
                  100 kart singleton (1 Dowódca + 99 unikalnych kart)
                </span>
              </div>
              <span className="text-[11px] tabular-nums px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                Domyślny
              </span>
            </div>
          </div>

          {/* Card Source Selection: Collection vs All MTG Cards */}
          <div>
            <label className="block text-[11px] font-bold text-stone-400 mb-1.5">
              Zasób kart do budowy talii *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Tylko z mojej kolekcji */}
              <button
                type="button"
                onClick={() => setCardSource('collection')}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  cardSource === 'collection'
                    ? 'bg-amber-500/10 border-amber-500/80 ring-1 ring-amber-500/50 shadow-md'
                    : 'bg-stone-950 border-stone-800 hover:border-stone-700 opacity-75 hover:opacity-100'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  cardSource === 'collection' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-800 text-stone-400'
                }`}>
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${cardSource === 'collection' ? 'text-amber-300' : 'text-stone-200'}`}>
                      Tylko z mojej kolekcji
                    </span>
                    {cardSource === 'collection' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1 leading-snug">
                    Buduj talię wyłącznie z kart, które posiadasz fizycznie w swojej kolekcji ({collection.length} pozycji).
                  </p>
                </div>
              </button>

              {/* Option 2: Wszystkie karty MTG */}
              <button
                type="button"
                onClick={() => setCardSource('all')}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  cardSource === 'all'
                    ? 'bg-amber-500/10 border-amber-500/80 ring-1 ring-amber-500/50 shadow-md'
                    : 'bg-stone-950 border-stone-800 hover:border-stone-700 opacity-75 hover:opacity-100'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  cardSource === 'all' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400'
                }`}>
                  <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${cardSource === 'all' ? 'text-amber-300' : 'text-stone-200'}`}>
                      Wszystkie karty MTG
                    </span>
                    {cardSource === 'all' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1 leading-snug">
                    Dostęp do pełnej bazy Scryfall (ponad 30 000 kart) do projektowania talii marzeń.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Optional Commander Picker */}
          <div>
            <label className="block text-[11px] font-bold text-stone-400 mb-1.5">
              Wybierz Dowódcę (opcjonalnie, można wybrać później)
            </label>
            
            {selectedCommander ? (
              <div className="p-2.5 bg-stone-950 border border-amber-500/40 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-11 rounded overflow-hidden border border-amber-500/50">
                    <img
                      src={selectedCommander.image_uris?.art_crop || selectedCommander.image_uris?.small}
                      alt={selectedCommander.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {selectedCommander.name}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {selectedCommander.type_line}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCommander(null)}
                  className="text-stone-400 hover:text-rose-400 p-1 text-xs cursor-pointer"
                >
                  Zmień
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder={
                      cardSource === 'collection'
                        ? 'Szukaj Legendary Creature w kolekcji...'
                        : 'Szukaj Legendary Creature w kolekcji lub Scryfall...'
                    }
                    value={commanderSearch}
                    onChange={(e) => setCommanderSearch(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
                  />
                  {isSearchingScryfall && (
                    <span className="absolute right-3 top-2.5 text-[11px] text-amber-400 animate-pulse tabular-nums">
                      Szukam w Scryfall...
                    </span>
                  )}
                </div>

                {potentialCommanders.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                    {potentialCommanders.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCommander(c)}
                        className="p-1.5 bg-stone-950 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/50 rounded-lg flex items-center gap-2 text-left cursor-pointer transition-colors"
                      >
                        <div className="w-6 h-8 rounded overflow-hidden border border-stone-700 shrink-0">
                          <img
                            src={c.image_uris?.art_crop || c.image_uris?.small}
                            alt={c.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[11px] font-bold text-stone-200 truncate">
                          {c.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-stone-400 mb-1.5">
              Opis lub strategia talii
            </label>
            <textarea
              rows={2}
              placeholder="Główna strategia, combosy, zamierzone tempo gry..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-stone-100 placeholder-stone-600 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-400 hover:text-stone-200 cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading 
                ? (deckToEdit ? 'Zapisywanie...' : 'Tworzenie...') 
                : (deckToEdit ? 'Zapisz zmiany' : 'Utwórz talię')}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
