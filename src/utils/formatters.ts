import React from 'react';
import { CardCondition, ScryfallCard, AppSettings, CurrencyCode } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  pricingSource: 'CARDMARKET',
  currency: 'PLN',
  eurToPlnRate: 4.31,
  usdToPlnRate: 3.96,
  autoNbpRate: true,
};

export function formatCurrency(
  amount: number | string | null | undefined, 
  currency: CurrencyCode = 'PLN'
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '—';

  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function getCardPrice(
  card: ScryfallCard, 
  preferFoil: boolean = false, 
  settingsOrCurrency: AppSettings | CurrencyCode = DEFAULT_SETTINGS
): number {
  if (!card || !card.prices) return 0;

  let settings: AppSettings;
  if (typeof settingsOrCurrency === 'string') {
    settings = {
      ...DEFAULT_SETTINGS,
      currency: settingsOrCurrency
    };
  } else {
    settings = settingsOrCurrency || DEFAULT_SETTINGS;
  }

  const { pricingSource, currency, eurToPlnRate, usdToPlnRate } = settings;

  let basePrice = 0;
  let baseCurrency: 'EUR' | 'USD' = 'EUR';

  if (pricingSource === 'CARDMARKET') {
    baseCurrency = 'EUR';
    if (preferFoil && card.prices.eur_foil) {
      basePrice = parseFloat(card.prices.eur_foil) || 0;
    } else if (card.prices.eur) {
      basePrice = parseFloat(card.prices.eur) || 0;
    } else if (card.prices.eur_foil) {
      basePrice = parseFloat(card.prices.eur_foil) || 0;
    } else if (card.prices.usd) {
      basePrice = parseFloat(card.prices.usd) || 0;
      baseCurrency = 'USD';
    }
  } else {
    // TCGPLAYER
    baseCurrency = 'USD';
    if (preferFoil && card.prices.usd_foil) {
      basePrice = parseFloat(card.prices.usd_foil) || 0;
    } else if (card.prices.usd) {
      basePrice = parseFloat(card.prices.usd) || 0;
    } else if (card.prices.usd_foil) {
      basePrice = parseFloat(card.prices.usd_foil) || 0;
    } else if (card.prices.eur) {
      basePrice = parseFloat(card.prices.eur) || 0;
      baseCurrency = 'EUR';
    }
  }

  if (basePrice === 0) return 0;

  // Convert base price according to display currency
  const eurRate = eurToPlnRate > 0 ? eurToPlnRate : 4.31;
  const usdRate = usdToPlnRate > 0 ? usdToPlnRate : 3.96;

  if (baseCurrency === 'EUR') {
    if (currency === 'PLN') return basePrice * eurRate;
    if (currency === 'EUR') return basePrice;
    if (currency === 'USD') return (basePrice * eurRate) / usdRate;
  } else {
    // baseCurrency === 'USD'
    if (currency === 'PLN') return basePrice * usdRate;
    if (currency === 'USD') return basePrice;
    if (currency === 'EUR') return (basePrice * usdRate) / eurRate;
  }

  return basePrice;
}

export function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'mythic':
      return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
    case 'rare':
      return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
    case 'uncommon':
      return 'text-slate-300 bg-slate-300/10 border-slate-300/30';
    case 'common':
      return 'text-stone-400 bg-stone-400/10 border-stone-400/30';
    default:
      return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
  }
}

export function getRarityLabel(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'mythic': return 'Mythic';
    case 'rare': return 'Rare';
    case 'uncommon': return 'Uncommon';
    case 'common': return 'Common';
    case 'special': return 'Special';
    case 'bonus': return 'Bonus';
    default: return rarity ? (rarity.charAt(0).toUpperCase() + rarity.slice(1)) : rarity;
  }
}

export function getConditionLabel(condition: CardCondition): string {
  switch (condition) {
    case 'NM': return 'Near Mint (NM)';
    case 'EX': return 'Excellent (EX)';
    case 'GD': return 'Good (GD)';
    case 'LP': return 'Lightly Played (LP)';
    case 'PL': return 'Played (PL)';
    default: return condition;
  }
}

export function getCardImageUri(card: ScryfallCard, size: 'small' | 'normal' | 'large' | 'art_crop' = 'normal'): string {
  if (!card) return 'https://svgs.scryfall.io/card-back.svg';

  if (card.image_uris) {
    if (card.image_uris[size]) return card.image_uris[size]!;
    if (card.image_uris.normal) return card.image_uris.normal;
    if (card.image_uris.small) return card.image_uris.small;
  }

  if (card.card_faces && card.card_faces.length > 0) {
    const face = card.card_faces[0];
    if (face && face.image_uris) {
      return face.image_uris[size] || face.image_uris.normal || face.image_uris.small || '';
    }
  }

  return 'https://svgs.scryfall.io/card-back.svg';
}

export function handleCardImageError(e: React.SyntheticEvent<HTMLImageElement, Event>, originalUri: string) {
  const target = e.currentTarget;
  if (!target.dataset.proxied && originalUri && originalUri.startsWith('http')) {
    target.dataset.proxied = 'true';
    target.src = `/api/scryfall/image-proxy?url=${encodeURIComponent(originalUri)}`;
  } else {
    target.src = 'https://svgs.scryfall.io/card-back.svg';
  }
}
