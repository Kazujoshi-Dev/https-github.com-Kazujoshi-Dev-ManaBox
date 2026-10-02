import { CollectionItem, WishlistItem, Catalog, AppSettings, DeckItem, UserMessage } from '../../types';
import { DbUser } from './types';

export function mapUserRow(r: any): DbUser {
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    password_hash: r.password_hash,
    salt: r.salt,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    banned_until: r.banned_until ? new Date(r.banned_until).toISOString() : null,
    ban_permanent: Boolean(r.ban_permanent),
    ban_reason: r.ban_reason ?? null,
    must_change_password: Boolean(r.must_change_password),
    sale_hidden: Boolean(r.sale_hidden)
  };
}

const KNOWN_EDHREC_RANKS: Record<string, number> = {
  "sol ring": 1,
  "arcane signet": 2,
  "swords to plowshares": 3,
  "command tower": 4,
  "beast within": 7,
  "counterspell": 8,
  "cyclonic rift": 9,
  "cultivate": 11,
  "chaos warp": 12,
  "rhystic study": 14,
  "path to exile": 15,
  "kodama's reach": 18,
  "demonic tutor": 22,
  "heroic intervention": 28,
  "teferi's protection": 31,
  "esper sentinel": 42,
  "lightning bolt": 64,
  "the one ring": 124,
  "animar, soul of elements": 2371,
  "pestermite": 10922,
};

function ensureCardEdhrecRank(card: any): any {
  if (!card) return card;
  if (card.edhrec_rank === undefined || card.edhrec_rank === null) {
    const key = (card.name || '').toLowerCase().trim();
    if (KNOWN_EDHREC_RANKS[key]) {
      card.edhrec_rank = KNOWN_EDHREC_RANKS[key];
    }
  }
  return card;
}

export function mapCollectionRow(r: any): CollectionItem {
  const cardObj = typeof r.card === 'string' ? JSON.parse(r.card) : r.card;
  return {
    id: r.id,
    cardId: r.cardId || r.card_id,
    card: ensureCardEdhrecRank(cardObj),
    quantity: typeof r.quantity === 'number' ? r.quantity : parseInt(r.quantity || '1', 10),
    quantityFoil: typeof r.quantityFoil === 'number' ? r.quantityFoil : parseInt(r.quantity_foil || '0', 10),
    condition: r.condition || 'NM',
    language: r.language || 'EN',
    purchasePrice: r.purchasePrice !== null && r.purchasePrice !== undefined
      ? parseFloat(r.purchasePrice)
      : (r.purchase_price !== null && r.purchase_price !== undefined ? parseFloat(r.purchase_price) : null),
    notes: r.notes || '',
    binder: r.binder || 'Klaser Główny',
    addedAt: r.addedAt ? new Date(r.addedAt).toISOString() : (r.added_at ? new Date(r.added_at).toISOString() : new Date().toISOString()),
    lastUpdatedPriceAt: r.lastUpdatedPriceAt || r.last_updated_price_at || undefined,
    isForSale: Boolean(r.isForSale ?? r.is_for_sale),
    salePrice: r.salePrice !== undefined && r.salePrice !== null
      ? parseFloat(r.salePrice)
      : (r.sale_price !== null && r.sale_price !== undefined ? parseFloat(r.sale_price) : null),
    previousPrices: (() => {
      const v = r.previousPrices ?? r.previous_prices ?? null;
      return typeof v === 'string' ? JSON.parse(v) : v;
    })(),
    pricesChangedAt: (() => {
      const v = r.pricesChangedAt ?? r.prices_changed_at ?? null;
      return v ? new Date(v).toISOString() : null;
    })()
  };
}

export function mapCatalogRow(r: any): Catalog {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    color: r.color || 'amber',
    isDefault: Boolean(r.isDefault ?? r.is_default),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : (r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString())
  };
}

export function mapWishlistRow(r: any): WishlistItem {
  const cardObj = typeof r.card === 'string' ? JSON.parse(r.card) : r.card;
  return {
    id: r.id,
    cardId: r.cardId || r.card_id,
    card: ensureCardEdhrecRank(cardObj),
    targetQuantity: typeof r.targetQuantity === 'number' ? r.targetQuantity : parseInt(r.target_quantity || '1', 10),
    isFoil: Boolean(r.isFoil ?? r.is_foil),
    notes: r.notes || '',
    addedAt: r.addedAt ? new Date(r.addedAt).toISOString() : (r.added_at ? new Date(r.added_at).toISOString() : new Date().toISOString())
  };
}

export function mapSettingsRow(r: any): AppSettings {
  return {
    pricingSource: r.pricingSource || r.pricing_source || 'CARDMARKET',
    currency: r.currency || 'PLN',
    eurToPlnRate: parseFloat(r.eurToPlnRate ?? r.eur_to_pln_rate ?? '4.31'),
    usdToPlnRate: parseFloat(r.usdToPlnRate ?? r.usd_to_pln_rate ?? '3.96'),
    autoNbpRate: Boolean(r.autoNbpRate ?? r.auto_nbp_rate ?? true)
  };
}

export function mapDeckRow(r: any): DeckItem {
  return {
    id: r.id,
    name: r.name,
    format: r.format || 'EDH Commander',
    description: r.description || '',
    cardSource: (r.cardSource || r.card_source || 'collection') as 'all' | 'collection',
    commander: r.commander ? (typeof r.commander === 'string' ? JSON.parse(r.commander) : r.commander) : null,
    commanderIsFoil: Boolean(r.commanderIsFoil ?? r.commander_is_foil),
    cards: Array.isArray(r.cards)
      ? r.cards
      : (typeof r.cards === 'string' ? JSON.parse(r.cards) : []),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : (r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()),
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : (r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString())
  };
}

export function mapMessageRow(r: any): UserMessage {
  return {
    id: r.id,
    senderId: r.sender_id || r.senderId,
    senderUsername: r.sender_username || r.senderUsername,
    recipientId: r.recipient_id || r.recipientId,
    recipientUsername: r.recipient_username || r.recipientUsername,
    subject: r.subject || '',
    body: r.body || '',
    isRead: Boolean(r.is_read ?? r.isRead),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : (r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString())
  };
}

