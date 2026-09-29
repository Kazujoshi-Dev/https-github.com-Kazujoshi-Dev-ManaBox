import { useMemo } from 'react';
import { DeckItem, DeckCardEntry, AppSettings } from '../../types';
import { getCardPrice } from '../../utils/formatters';
import { DECK_CATEGORIES, getCardCategory } from './constants';

interface UseDeckStatsProps {
  deck: DeckItem;
  settings: AppSettings;
}

export function useDeckStats({ deck, settings }: UseDeckStatsProps) {
  // Total cards in deck (including commander)
  const totalCardsCount = useMemo(() => {
    let count = deck.commander ? 1 : 0;
    deck.cards.forEach(entry => {
      if (!entry.isCommander) {
        count += entry.quantity;
      }
    });
    return count;
  }, [deck]);

  // Total estimated value
  const totalDeckValue = useMemo(() => {
    let val = 0;
    if (deck.commander) {
      val += getCardPrice(deck.commander, false, settings);
    }
    deck.cards.forEach(entry => {
      if (!entry.isCommander) {
        val += getCardPrice(entry.card, false, settings) * entry.quantity;
      }
    });
    return val;
  }, [deck, settings]);

  // Group cards by category (excluding commander so it is never duplicated)
  const categorizedCards = useMemo(() => {
    const map = new Map<string, DeckCardEntry[]>();
    DECK_CATEGORIES.forEach(cat => map.set(cat.id, []));

    deck.cards.forEach(entry => {
      if (entry.isCommander) return;
      const cat = getCardCategory(entry.card);
      const list = map.get(cat) || [];
      list.push(entry);
      map.set(cat, list);
    });

    return map;
  }, [deck]);

  // Mana curve stats (CMC 0, 1, 2, 3, 4, 5, 6+) excluding lands and commander
  const manaCurve = useMemo(() => {
    const curve = [0, 0, 0, 0, 0, 0, 0];
    deck.cards.forEach(entry => {
      if (entry.isCommander) return;
      if ((entry.card.type_line || '').toLowerCase().includes('land')) return;
      const cmc = Math.floor(entry.card.cmc || 0);
      const index = Math.min(cmc, 6);
      curve[index] += entry.quantity;
    });
    return curve;
  }, [deck]);

  // Color identity derived from commander (or cards)
  const colorIdentity = useMemo(() => {
    if (deck.commander?.color_identity && deck.commander.color_identity.length > 0) {
      return deck.commander.color_identity;
    }
    const colors = new Set<string>();
    deck.cards.forEach(e => {
      if (!e.isCommander) {
        e.card.color_identity?.forEach(c => colors.add(c));
      }
    });
    return Array.from(colors);
  }, [deck]);

  return {
    totalCardsCount,
    totalDeckValue,
    categorizedCards,
    manaCurve,
    colorIdentity,
  };
}
