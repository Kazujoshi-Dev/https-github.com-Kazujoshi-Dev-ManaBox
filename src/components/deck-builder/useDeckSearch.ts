import { useState, useEffect, useCallback, useRef } from 'react';
import { DeckItem, CollectionItem, ScryfallCard } from '../../types';

interface UseDeckSearchProps {
  deck: DeckItem;
  collection: CollectionItem[];
}

export function useDeckSearch({ deck, collection }: UseDeckSearchProps) {
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchSource, setSearchSource] = useState<'collection' | 'all'>(deck.cardSource || 'collection');
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [isSearchingScryfall, setIsSearchingScryfall] = useState<boolean>(false);

  // Search Debounce timer & race-condition cancellation ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeSearchIdRef = useRef<number>(0);

  // Sync searchSource when deck cardSource changes
  useEffect(() => {
    if (deck.cardSource) {
      setSearchSource(deck.cardSource);
    }
  }, [deck.cardSource]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Helper to extract unique cards from collection matching query
  const getDeduplicatedLocalMatches = useCallback((queryStr: string): ScryfallCard[] => {
    const q = queryStr.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const map = new Map<string, ScryfallCard>();

    for (const item of collection) {
      const card = item.card;
      const nameLower = card.name.toLowerCase();
      if (nameLower.includes(q)) {
        // Use normalized lowercase name as key to prevent duplicates
        if (!map.has(nameLower)) {
          map.set(nameLower, card);
        }
      }
    }

    // Sort: items starting with the query first, then other substring matches
    return Array.from(map.values()).sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [collection]);

  // Search handler based on chosen card source ('collection' vs 'all')
  const handleSearchCards = useCallback((query: string, sourceOverride?: 'collection' | 'all') => {
    setSearchQuery(query);
    const activeSource = sourceOverride || searchSource;

    // Invalidate any pending search
    const searchId = ++activeSearchIdRef.current;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();

    // If query is empty or less than 2 characters, clear results immediately
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearchingScryfall(false);
      return;
    }

    // If source is 'collection', search local collection with short debounce
    if (activeSource === 'collection') {
      setIsSearchingScryfall(false);
      debounceTimerRef.current = setTimeout(() => {
        if (searchId !== activeSearchIdRef.current) return;
        const matches = getDeduplicatedLocalMatches(trimmed).slice(0, 20);
        setSearchResults(matches);
      }, 150);
      return;
    }

    // If source is 'all', show loading and search Scryfall with 280ms debounce
    setIsSearchingScryfall(true);
    debounceTimerRef.current = setTimeout(async () => {
      if (searchId !== activeSearchIdRef.current) return;

      const localStrictMatches = getDeduplicatedLocalMatches(trimmed).slice(0, 8);

      try {
        const res = await fetch(`/api/scryfall/search?q=${encodeURIComponent(trimmed)}`);
        if (searchId !== activeSearchIdRef.current) return;

        if (res.ok) {
          const data = await res.json();
          if (searchId !== activeSearchIdRef.current) return;

          if (data.data && Array.isArray(data.data)) {
            // Deduplicate: collection cards first, then Scryfall cards
            const seenNames = new Set<string>();
            const combined: ScryfallCard[] = [];

            for (const c of localStrictMatches) {
              const key = c.name.toLowerCase();
              if (!seenNames.has(key)) {
                seenNames.add(key);
                combined.push(c);
              }
            }

            for (const scryfallCard of (data.data as ScryfallCard[])) {
              const key = scryfallCard.name.toLowerCase();
              if (!seenNames.has(key)) {
                seenNames.add(key);
                combined.push(scryfallCard);
              }
            }

            setSearchResults(combined.slice(0, 25));
          } else {
            setSearchResults(localStrictMatches);
          }
        } else {
          setSearchResults(localStrictMatches);
        }
      } catch (err) {
        console.error('Scryfall search error in deck builder:', err);
        if (searchId === activeSearchIdRef.current) {
          setSearchResults(localStrictMatches);
        }
      } finally {
        if (searchId === activeSearchIdRef.current) {
          setIsSearchingScryfall(false);
        }
      }
    }, 280);
  }, [searchSource, getDeduplicatedLocalMatches]);

  const openSearchModal = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const closeSearchModal = useCallback(() => {
    setIsSearchOpen(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    isSearchOpen,
    searchQuery,
    searchSource,
    searchResults,
    isSearchingScryfall,
    setSearchSource,
    openSearchModal,
    closeSearchModal,
    handleSearchCards,
  };
}
