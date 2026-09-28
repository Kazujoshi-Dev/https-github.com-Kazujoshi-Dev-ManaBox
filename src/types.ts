export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  image_uris?: ScryfallImageUris;
}

export interface ScryfallCard {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  mana_cost?: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus' | string;
  released_at?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  oracle_id?: string;
  prints_search_uri?: string;
  promo?: boolean;
  border_color?: string;
  frame_effects?: string[];
  finishes?: string[];
  prices: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
    eur?: string | null;
    eur_foil?: string | null;
    tix?: string | null;
  };
  legalities?: Record<string, string>;
  scryfall_uri?: string;
  edhrec_rank?: number;
  artist?: string;
}

export interface MTGSet {
  id: string;
  code: string;
  name: string;
  released_at?: string;
  set_type: string;
  card_count: number;
  icon_svg_uri?: string;
  scryfall_uri?: string;
}

export interface SetTopCardsResponse {
  set: MTGSet;
  topCards: {
    mythic: ScryfallCard[];
    rare: ScryfallCard[];
    uncommon: ScryfallCard[];
    common: ScryfallCard[];
  };
}

export type CardCondition = 'NM' | 'EX' | 'GD' | 'LP' | 'PL';
export type CardLanguage = 'EN' | 'PL' | 'DE' | 'FR' | 'JP' | 'IT' | 'ES' | 'OTHER';

export type PricingSource = 'CARDMARKET' | 'TCGPLAYER';
export type CurrencyCode = 'PLN' | 'EUR' | 'USD';

export interface AppSettings {
  pricingSource: PricingSource; // 'CARDMARKET' (Price Trend EUR) or 'TCGPLAYER' (Market USD)
  currency: CurrencyCode; // 'PLN' | 'EUR' | 'USD'
  eurToPlnRate: number; // e.g. 4.31
  usdToPlnRate: number; // e.g. 3.96
  autoNbpRate: boolean;
  lastNbpUpdate?: string;
}

export interface Catalog {
  id: string;
  name: string;
  description?: string;
  color?: string; // 'amber' | 'emerald' | 'blue' | 'purple' | 'rose' | 'indigo' | 'cyan' | 'orange'
  createdAt: string;
  isDefault?: boolean;
}

export interface CollectionItem {
  id: string;
  cardId: string;
  card: ScryfallCard;
  quantity: number;
  quantityFoil: number;
  condition: CardCondition;
  language: CardLanguage;
  purchasePrice?: number | null; // USD
  notes?: string;
  binder?: string; // name of album / deck
  addedAt: string;
  lastUpdatedPriceAt?: string;
}

export interface WishlistItem {
  id: string;
  cardId: string;
  card: ScryfallCard;
  targetQuantity: number;
  isFoil: boolean;
  notes?: string;
  addedAt: string;
}

export interface DeckItem {
  id: string;
  name: string;
  format: string; // Commander, Standard, Modern, Casual, etc.
  description?: string;
  cards: {
    collectionItemId?: string;
    card: ScryfallCard;
    quantity: number;
    isCommander?: boolean;
    isSideboard?: boolean;
  }[];
  createdAt: string;
}

export interface FilterOptions {
  searchQuery: string;
  color: string; // 'ALL', 'W', 'U', 'B', 'R', 'G', 'C', 'MULTI'
  type: string; // 'ALL', 'Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land'
  rarity: string; // 'ALL', 'common', 'uncommon', 'rare', 'mythic'
  set: string; // 'ALL' or set code
  binder: string; // 'ALL' or binder name
  sortBy: 'name' | 'price_desc' | 'price_asc' | 'cmc_desc' | 'cmc_asc' | 'added_desc' | 'rarity';
  onlyFoil: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt?: string;
}

