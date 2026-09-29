import { AppSettings, Catalog, CollectionItem, DeckItem, ScryfallCard, WishlistItem } from '../types';

const TOKEN_KEY = 'mtg_auth_token';
const USER_KEY = 'mtg_auth_user';

export const tokenStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  removeToken: (): void => localStorage.removeItem(TOKEN_KEY),
  getUser: () => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  },
  setUser: (user: unknown): void => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  removeUser: (): void => localStorage.removeItem(USER_KEY),
  clear: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  onUnauthorized?: () => void
): Promise<Response> {
  const token = tokenStorage.getToken();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {})
  };

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    tokenStorage.clear();
    onUnauthorized?.();
  }
  return response;
}

export const authApi = {
  verifySession: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/auth/me', {}, onUnauthorized),
  logout: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/auth/logout', { method: 'POST' }, onUnauthorized)
};

export const collectionApi = {
  getAll: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/collection', {}, onUnauthorized),
  create: (data: unknown, onUnauthorized?: () => void) =>
    fetchWithAuth('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }, onUnauthorized),
  update: (id: string, data: unknown, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/collection/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }, onUnauthorized),
  delete: (id: string, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/collection/${id}`, { method: 'DELETE' }, onUnauthorized),
  refreshPrices: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/collection/refresh-prices', { method: 'POST' }, onUnauthorized),
  bulkImport: (items: unknown[], onUnauthorized?: () => void) =>
    fetchWithAuth('/api/collection/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    }, onUnauthorized)
};

export const wishlistApi = {
  getAll: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/wishlist', {}, onUnauthorized),
  create: (data: { cardId: string; card: ScryfallCard; targetQuantity: number; isFoil: boolean }, onUnauthorized?: () => void) =>
    fetchWithAuth('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }, onUnauthorized),
  delete: (id: string, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/wishlist/${id}`, { method: 'DELETE' }, onUnauthorized)
};

export const catalogsApi = {
  getAll: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/catalogs', {}, onUnauthorized),
  create: (data: { name: string; description?: string; color?: string; isDefault?: boolean }, onUnauthorized?: () => void) =>
    fetchWithAuth('/api/catalogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }, onUnauthorized),
  update: (id: string, updates: Partial<Catalog>, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/catalogs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }, onUnauthorized),
  setDefault: (id: string, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/catalogs/${id}/set-default`, { method: 'POST' }, onUnauthorized),
  delete: (id: string, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/catalogs/${id}`, { method: 'DELETE' }, onUnauthorized)
};

export const decksApi = {
  getAll: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/decks', {}, onUnauthorized),
  create: (data: { name: string; format: string; description: string; cardSource?: 'all' | 'collection'; commander?: ScryfallCard | null }, onUnauthorized?: () => void) =>
    fetchWithAuth('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }, onUnauthorized),
  update: (deck: DeckItem, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/decks/${deck.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deck)
    }, onUnauthorized),
  delete: (id: string, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/decks/${id}`, { method: 'DELETE' }, onUnauthorized)
};

export const settingsApi = {
  get: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/settings', {}, onUnauthorized),
  save: (settings: AppSettings, onUnauthorized?: () => void) =>
    fetchWithAuth('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }, onUnauthorized)
};

export const nbpApi = {
  fetchRates: async (): Promise<{ eur?: number; usd?: number }> => {
    const [eurData, usdData] = await Promise.all([
      fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json')
        .then(res => res.json())
        .catch(() => null),
      fetch('https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json')
        .then(res => res.json())
        .catch(() => null)
    ]);

    return {
      eur: eurData?.rates?.[0]?.mid,
      usd: usdData?.rates?.[0]?.mid
    };
  }
};
