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
  /** Artysta ilustracji tej strony karty (karty dwustronne mają osobnych artystów). */
  artist?: string;
}

export interface ScryfallCard {
  /** Karta z listy Commander Game Changers (pole Scryfall). */
  game_changer?: boolean;
  /** Kod języka wydania Scryfall, np. "en", "ja". */
  lang?: string;
  printed_name?: string;
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
  /** Wydanie istnieje tylko w grze cyfrowej (MTG Arena / MTGO). */
  digital?: boolean;
  /** Gry, w których jest to wydanie: "paper", "arena", "mtgo". */
  games?: string[];
  layout?: string;
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
export type CardLanguage = 'EN' | 'PL' | 'DE' | 'FR' | 'JP' | 'IT' | 'ES' | 'PH' | 'OTHER';

export type PricingSource = 'CARDMARKET' | 'TCGPLAYER';
export type CurrencyCode = 'PLN' | 'EUR' | 'USD';

export interface AppSettings {
  pricingSource: PricingSource; // 'CARDMARKET' (Price Trend EUR) or 'TCGPLAYER' (Market USD)
  currency: CurrencyCode; // 'PLN' | 'EUR' | 'USD'
  eurToPlnRate: number; // e.g. 4.31
  usdToPlnRate: number; // e.g. 3.96
  autoNbpRate: boolean;
  lastNbpUpdate?: string;
  deckCardPreviewScale?: number; // e.g. 100 (for 100%), range 75 - 160
  /** Ile wierszy kart pokazuje jedna strona kolekcji (12, 24, 48 lub 60). */
  collectionRowsPerPage?: number;
  /** Język interfejsu zapisany na profilu. */
  language?: 'pl' | 'en';
  /** Plakietka z nazwą klasera na kartach kolekcji (domyślnie włączona). */
  showBinderBadge?: boolean;
  /** Oznaczenia rankingu EDHREC („EDH #123”) przy kartach (domyślnie włączone). */
  showEdhrecRank?: boolean;
}

export interface Catalog {
  id: string;
  name: string;
  description?: string;
  color?: string; // 'amber' | 'emerald' | 'blue' | 'purple' | 'rose' | 'indigo' | 'cyan' | 'orange'
  createdAt: string;
  isDefault?: boolean;
  /** Główny klaser („Klaser Główny”): nie można go usunąć ani zmienić mu nazwy. */
  isMain?: boolean;
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
  isForSale?: boolean;
  salePrice?: number | null; // Optional custom asking price in user's currency
  /** Ceny karty sprzed ostatniej zmiany rynkowej (do wskaźnika „zmiana wartości”). */
  previousPrices?: ScryfallCard['prices'] | null;
  /** Kiedy ceny ostatnio się zmieniły (względem previousPrices). */
  pricesChangedAt?: string | null;
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

export interface DeckCardEntry {
  collectionItemId?: string;
  card: ScryfallCard;
  quantity: number;
  isFoil?: boolean;
  isCommander?: boolean;
  isSideboard?: boolean;
}

export interface DeckItem {
  id: string;
  name: string;
  format: string; // 'EDH Commander'
  description?: string;
  cardSource?: 'all' | 'collection'; // 'collection' (tylko z kolekcji) lub 'all' (wszystkie karty MTG)
  commander?: ScryfallCard | null;
  commanderIsFoil?: boolean;
  /** Talia dostępna pod publicznym linkiem (?talia=id). */
  isPublic?: boolean;
  cards: DeckCardEntry[];
  createdAt: string;
  updatedAt?: string;
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
  isAdmin?: boolean;
  /** Hasło nadane przez administratora — trzeba je zmienić przed dalszym korzystaniem. */
  mustChangePassword?: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
  totalCards: number;
  forSaleCards: number;
  wishlistCount: number;
  city: string | null;
  bannedUntil: string | null;
  banPermanent: boolean;
  banReason: string | null;
  banned: boolean;
  mustChangePassword: boolean;
  saleHidden: boolean;
  /** Czy użytkownik kliknął link potwierdzający z maila. */
  emailVerified: boolean;
  isAdmin: boolean;
}

export interface AdminStats {
  users: number;
  newUsers7d: number;
  activeUsers7d: number;
  bannedUsers: number;
  totalCards: number;
  forSaleCards: number;
  wishlistItems: number;
  cardDb: { ready: boolean; cards: number; syncing: boolean; lastSyncAt: string | null; lastSyncError: string | null };
}

export interface AdminAuditEntry {
  id: string;
  adminUsername: string | null;
  action: string;
  targetId: string | null;
  targetUsername: string | null;
  details: Record<string, any> | null;
  createdAt: string;
}

export interface RegisteredUserSummary {
  id: string;
  username: string;
  createdAt: string;
  forSaleCount: number;
  forSaleItemsCount: number;
  wishlistCount?: number;
  totalCardsCount: number;
  currency?: CurrencyCode;
  /** Miejscowość podana przez użytkownika (opcjonalnie). */
  city?: string | null;
}

/** Profil zalogowanego użytkownika (opcjonalna miejscowość do mapy sprzedawców). */
export interface UserProfile {
  city: string | null;
  cityLabel: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
}

export interface CitySuggestion {
  city: string;
  label: string;
  countryCode: string | null;
  lat: number;
  lon: number;
}

export interface MapSeller {
  id: string;
  username: string;
  isMe: boolean;
  forSaleCount: number;
  forSaleItemsCount: number;
  /** Ile różnych kart z mojej listy życzeń ten sprzedawca ma na sprzedaż. */
  wishlistMatches: number;
}

export interface MapCity {
  label: string;
  city: string;
  lat: number;
  lon: number;
  sellers: MapSeller[];
}

/** Ile kart z mojej listy życzeń ma dany użytkownik: w kolekcji i na sprzedaż. */
export type WishlistMatches = Record<string, { collection: number; forSale: number }>;

export interface UserMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  recipientUsername: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

// Commander Spellbook API Types
export interface SpellbookCard {
  id: number;
  name: string;
  faces?: number;
  spoiler?: boolean;
  oracleId?: string;
  typeLine?: string;
  imageUriFrontNormal?: string | null;
  imageUriFrontSmall?: string | null;
  imageUriFrontLarge?: string | null;
  imageUriFrontArtCrop?: string | null;
}

export interface SpellbookCardInVariant {
  card: SpellbookCard;
  zoneLocations?: string[];
  battlefieldCardState?: string;
}

export interface SpellbookTemplateInVariant {
  template: {
    id?: number;
    name: string;
    scryfallQuery?: string;
  };
  zoneLocations?: string[];
}

export interface SpellbookFeatureProduced {
  feature: {
    id?: number;
    name: string;
    uncountable?: boolean;
  };
}

export interface SpellbookVariant {
  id: string;
  uses: SpellbookCardInVariant[];
  requires?: SpellbookTemplateInVariant[];
  produces: SpellbookFeatureProduced[];
  description: string;
  notes?: string;
  manaNeeded?: string;
  easyPrerequisites?: string;
  notablePrerequisites?: string;
  popularity?: number;
  bracketTag?: string;
  status?: string;
}

export interface SpellbookFindCombosResponse {
  results: {
    identity: string;
    included: SpellbookVariant[];
    almostIncluded: SpellbookVariant[];
  };
}

