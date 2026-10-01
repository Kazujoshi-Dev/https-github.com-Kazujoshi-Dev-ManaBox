import { AppSettings, Catalog, CollectionItem, DeckItem, ScryfallCard, WishlistItem, SpellbookFindCombosResponse, SpellbookVariant, RegisteredUserSummary, UserMessage } from '../types';

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
    }, onUnauthorized),
  bulkAdd: (items: unknown[], onUnauthorized?: () => void) =>
    fetchWithAuth('/api/collection/bulk-add', {
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

export const spellbookApi = {
  findDeckCombos: async (
    commanders: string[],
    mainCards: string[]
  ): Promise<SpellbookFindCombosResponse> => {
    const res = await fetch('/api/spellbook/find-my-combos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commanders, main: mainCards })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Błąd pobierania combo' }));
      throw new Error(err.error || `Błąd serwera (${res.status})`);
    }
    return res.json();
  },

  getCardCombos: async (cardName: string): Promise<{ results: SpellbookVariant[]; count: number }> => {
    const res = await fetch(`/api/spellbook/card-combos?cardName=${encodeURIComponent(cardName)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Błąd pobierania combosów dla karty' }));
      throw new Error(err.error || `Błąd serwera (${res.status})`);
    }
    return res.json();
  },

  getStatus: async () => {
    const res = await fetch('/api/spellbook/status');
    return res.json();
  }
};

export const publicSaleApi = {
  getOffers: async (userRef: string): Promise<{
    seller: { id: string; username: string; email?: string; createdAt?: string };
    cards: CollectionItem[];
    settings: AppSettings;
  }> => {
    const res = await fetch(`/api/public/sale/${encodeURIComponent(userRef)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd pobierania oferty (${res.status})`);
    }
    return res.json();
  }
};

export const usersApi = {
  getAll: async (): Promise<RegisteredUserSummary[]> => {
    const res = await fetch('/api/users');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd pobierania listy użytkowników (${res.status})`);
    }
    return res.json();
  },

  getWishlist: async (userRef: string): Promise<{
    user: { id: string; username: string; email?: string; createdAt?: string };
    wishlist: WishlistItem[];
    settings: AppSettings;
  }> => {
    const res = await fetch(`/api/public/wishlist/${encodeURIComponent(userRef)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd pobierania listy życzeń (${res.status})`);
    }
    return res.json();
  }
};

export const messagesApi = {
  getInbox: async (): Promise<UserMessage[]> => {
    const res = await fetchWithAuth('/api/messages/inbox');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd pobierania skrzynki odbiorczej (${res.status})`);
    }
    return res.json();
  },

  getSent: async (): Promise<UserMessage[]> => {
    const res = await fetchWithAuth('/api/messages/sent');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd pobierania skrzynki nadawczej (${res.status})`);
    }
    return res.json();
  },

  getUnreadCount: async (): Promise<{ unreadCount: number }> => {
    const res = await fetchWithAuth('/api/messages/unread-count');
    if (!res.ok) {
      return { unreadCount: 0 };
    }
    return res.json();
  },

  sendMessage: async (data: { recipientId?: string; recipientUsername?: string; subject: string; body: string }): Promise<UserMessage> => {
    const res = await fetchWithAuth('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd wysyłania wiadomości (${res.status})`);
    }
    return res.json();
  },

  markAsRead: async (id: string): Promise<{ success: boolean }> => {
    const res = await fetchWithAuth(`/api/messages/${id}/read`, {
      method: 'PUT'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd aktualizacji statusu (${res.status})`);
    }
    return res.json();
  },

  markAllAsRead: async (): Promise<{ success: boolean }> => {
    const res = await fetchWithAuth('/api/messages/mark-all-read', {
      method: 'PUT'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd aktualizacji wiadomości (${res.status})`);
    }
    return res.json();
  },

  deleteMessage: async (id: string): Promise<{ success: boolean }> => {
    const res = await fetchWithAuth(`/api/messages/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Błąd usuwania wiadomości (${res.status})`);
    }
    return res.json();
  }
};


