import { CollectionItem, WishlistItem, Catalog, AppSettings, DeckItem } from '../../types';
import { DbUser } from './types';

export function mapUserRow(r: any): DbUser {
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    password_hash: r.password_hash,
    salt: r.salt,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
  };
}

export function mapCollectionRow(r: any): CollectionItem {
  return {
    id: r.id,
    cardId: r.cardId || r.card_id,
    card: typeof r.card === 'string' ? JSON.parse(r.card) : r.card,
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
    lastUpdatedPriceAt: r.lastUpdatedPriceAt || r.last_updated_price_at || undefined
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
  return {
    id: r.id,
    cardId: r.cardId || r.card_id,
    card: typeof r.card === 'string' ? JSON.parse(r.card) : r.card,
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
    cards: Array.isArray(r.cards)
      ? r.cards
      : (typeof r.cards === 'string' ? JSON.parse(r.cards) : []),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : (r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()),
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : (r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString())
  };
}
