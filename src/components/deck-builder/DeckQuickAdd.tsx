import React, { useEffect, useRef, useState } from 'react';
import { Zap, Loader2, CornerDownLeft } from 'lucide-react';
import { ScryfallCard } from '../../types';
import { useT } from '../../i18n';

interface DeckQuickAddProps {
  /** Dodaje kartę do talii (bez wyboru wersji); false, gdy karty nie dodano. */
  onAdd: (card: ScryfallCard) => boolean;
  showToast?: (message: string) => void;
}

/** Najnowsze zwykłe wydanie karty o dokładnej nazwie, a gdy jej nie ma: wyszukiwanie przybliżone. */
async function resolveLatestPrinting(name: string): Promise<ScryfallCard | null> {
  try {
    const exact = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(name)}&prefer=regular`);
    if (exact.ok) return (await exact.json()) as ScryfallCard;
    const fuzzy = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(name)}`);
    if (!fuzzy.ok) return null;
    const card = (await fuzzy.json()) as ScryfallCard;
    // Nazwa poprawiona przez wyszukiwanie przybliżone: bierzemy jej najnowsze zwykłe wydanie
    if (card?.name && card.name.toLowerCase() !== name.toLowerCase()) {
      const again = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(card.name)}&prefer=regular`);
      if (again.ok) return (await again.json()) as ScryfallCard;
    }
    return card?.id ? card : null;
  } catch {
    return null;
  }
}

/**
 * Szybkie dodawanie karty do talii: wpisujesz nazwę (z podpowiedziami), Enter dodaje
 * najnowsze wydanie karty, bez okna wyboru wersji.
 */
export const DeckQuickAdd: React.FC<DeckQuickAddProps> = ({ onAdd, showToast }) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  // Podpowiedzi nazw z opóźnieniem, żeby nie pytać serwera przy każdym znaku
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scryfall/autocomplete?q=${encodeURIComponent(q)}`);
        const data = res.ok ? await res.json() : { data: [] };
        if (id !== requestId.current) return;
        setSuggestions(Array.isArray(data?.data) ? data.data.slice(0, 8) : []);
        setHighlighted(-1);
      } catch {
        if (id === requestId.current) setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const submit = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setOpen(false);
    const card = await resolveLatestPrinting(trimmed);
    setBusy(false);
    if (!card) {
      showToast?.(t('Nie znaleziono karty „{name}”.', { name: trimmed }));
      return;
    }
    if (!onAdd(card)) {
      inputRef.current?.focus();
      return;
    }
    showToast?.(t('Dodano "{name}" do talii.', { name: card.name }));
    requestId.current++;
    setQuery('');
    setSuggestions([]);
    setHighlighted(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      submit(open && highlighted >= 0 ? suggestions[highlighted] : query);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0 && !busy;

  return (
    <div className="relative w-full sm:flex-1 sm:max-w-md min-w-0">
      <div className="flex items-center gap-2 h-10 bg-stone-950 border border-stone-800 rounded-lg px-3 focus-within:border-stone-600">
        {busy ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" /> : <Zap className="w-4 h-4 text-amber-400 shrink-0" />}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          placeholder={t('Szybkie dodawanie: wpisz nazwę karty')}
          aria-label={t('Szybkie dodawanie karty do talii')}
          title={t('Enter dodaje najnowsze wydanie karty, bez wyboru wersji')}
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          className="flex-1 min-w-0 bg-transparent text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none disabled:opacity-60"
        />
        {query.trim() && !busy && (
          <button
            type="button"
            onClick={() => submit(query)}
            className="text-stone-400 hover:text-amber-300 cursor-pointer shrink-0"
            aria-label={t('Dodaj do talii')}
            title={t('Dodaj do talii')}
          >
            <CornerDownLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul role="listbox" className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-lg border border-stone-800 bg-stone-900 shadow-2xl py-1">
          {suggestions.map((name, i) => (
            <li key={name} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => submit(name)}
                className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer truncate ${
                  i === highlighted ? 'bg-stone-800 text-stone-50' : 'text-stone-300'
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DeckQuickAdd;
