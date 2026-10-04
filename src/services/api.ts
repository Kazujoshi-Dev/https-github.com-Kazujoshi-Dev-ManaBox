import { AdminUser, AdminStats, AdminAuditEntry, AuthUser, AppSettings, Catalog, CollectionItem, DeckItem, ScryfallCard, WishlistItem, SpellbookFindCombosResponse, SpellbookVariant, RegisteredUserSummary, UserMessage, UserProfile, CitySuggestion, MapCity, WishlistMatches } from '../types';

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
    fetchWithAuth('/api/auth/logout', { method: 'POST' }, onUnauthorized),
  logoutAll: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/auth/logout-all', { method: 'POST' }, onUnauthorized),
  deleteAccount: async (password: string): Promise<void> => {
    const res = await fetchWithAuth('/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, confirm: 'USUŃ' })
    });
    await jsonOrThrow(res, 'Nie udało się usunąć konta.');
  },
  changePassword: async (newPassword: string, currentPassword?: string): Promise<{ token: string; user: AuthUser }> => {
    const res = await fetchWithAuth('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, currentPassword })
    });
    return jsonOrThrow(res, 'Nie udało się zmienić hasła.');
  }
};

/** Panel administratora — serwer sprawdza uprawnienia przy każdym zapytaniu. */
const adminPost = async (url: string, body: unknown = {}, method = 'POST') => {
  const res = await fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return jsonOrThrow<any>(res, 'Operacja nie powiodła się.');
};
export const adminApi = {
  stats: async (): Promise<AdminStats> => jsonOrThrow(await fetchWithAuth('/api/admin/stats'), 'Błąd pobierania statystyk.'),
  users: async (q: string, offset = 0, limit = 50): Promise<{ users: AdminUser[]; total: number }> =>
    jsonOrThrow(
      await fetchWithAuth(`/api/admin/users?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`),
      'Błąd pobierania użytkowników.'
    ),
  audit: async (): Promise<AdminAuditEntry[]> => jsonOrThrow(await fetchWithAuth('/api/admin/audit'), 'Błąd pobierania dziennika.'),
  rename: (id: string, username: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/rename`, { username }),
  resetPassword: (id: string): Promise<{ tempPassword: string }> => adminPost(`/api/admin/users/${encodeURIComponent(id)}/reset-password`),
  ban: (id: string, body: { days?: number; until?: string; permanent?: boolean; reason?: string }) =>
    adminPost(`/api/admin/users/${encodeURIComponent(id)}/ban`, body),
  unban: (id: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/unban`),
  logoutAll: (id: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/logout-all`),
  setSaleHidden: (id: string, hidden: boolean) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/sale-hidden`, { hidden }),
  remove: (id: string, confirmUsername: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}`, { confirmUsername }, 'DELETE')
};

export const collectionApi = {
  getAll: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/collection', {}, onUnauthorized),
  /** Dzienna historia wartości i liczby kart kolekcji. */
  history: async (days: number): Promise<{ currency: string; points: Array<{ day: string; value: number; cards: number; currency: string }> }> => {
    const res = await fetchWithAuth(`/api/collection/history?days=${days}`);
    if (!res.ok) throw new Error('Nie udało się pobrać historii kolekcji.');
    return res.json();
  },
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
  update: (id: string, data: { card?: ScryfallCard; isFoil?: boolean; targetQuantity?: number; notes?: string }, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/wishlist/${encodeURIComponent(id)}`, {
      method: 'PUT',
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
    fetchWithAuth(`/api/decks/${id}`, { method: 'DELETE' }, onUnauthorized),
  setVisibility: async (id: string, isPublic: boolean): Promise<void> => {
    const res = await fetchWithAuth(`/api/decks/${encodeURIComponent(id)}/visibility`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic })
    });
    await jsonOrThrow(res, 'Nie udało się zmienić udostępniania talii.');
  }
};

export const publicDeckApi = {
  get: async (id: string): Promise<{ deck: DeckItem; owner: { username: string }; settings: AppSettings }> => {
    const res = await fetch(`/api/public/deck/${encodeURIComponent(id)}`);
    return jsonOrThrow(res, 'Nie udało się pobrać talii.');
  }
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

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${fallback} (${res.status})`);
  }
  return res.json();
}

export interface EdhrecRecommendation {
  name: string;
  inclusion: number;
  numDecks: number;
  synergy: number;
  list: string;
  card: ScryfallCard | null;
}
export interface EdhrecCommanderData {
  commander: string;
  url: string;
  numDecks: number;
  cards: EdhrecRecommendation[];
}
export const edhrecApi = {
  commander: async (name: string): Promise<EdhrecCommanderData> =>
    jsonOrThrow(await fetchWithAuth(`/api/edhrec/commander?name=${encodeURIComponent(name)}`), 'Nie udało się pobrać rekomendacji EDHREC.')
};

export const profileApi = {
  get: async (): Promise<UserProfile> =>
    jsonOrThrow(await fetchWithAuth('/api/profile'), 'Błąd pobierania profilu'),
  /** Zapis miejscowości wybranej z podpowiedzi; null usuwa miejscowość. */
  saveCity: async (label: string | null): Promise<UserProfile> =>
    jsonOrThrow(
      await fetchWithAuth('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      }),
      'Błąd zapisu miejscowości'
    ),
  searchCities: async (q: string): Promise<CitySuggestion[]> =>
    jsonOrThrow(await fetchWithAuth(`/api/geo/cities?q=${encodeURIComponent(q)}`), 'Błąd wyszukiwania miejscowości')
};

export const sellersApi = {
  getMap: async (): Promise<{ cities: MapCity[]; myCity: string | null }> =>
    jsonOrThrow(await fetchWithAuth('/api/sellers/map'), 'Błąd pobierania mapy sprzedawców'),
  getWishlistMatches: async (): Promise<WishlistMatches> =>
    jsonOrThrow(await fetchWithAuth('/api/users/wishlist-matches'), 'Błąd pobierania dopasowań')
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
  },

  /** Zablokowani użytkownicy (nie mogą do mnie pisać). */
  listBlocked: async (): Promise<Array<{ id: string; username: string; blockedAt: string }>> => {
    const res = await fetchWithAuth('/api/messages/blocked');
    if (!res.ok) throw new Error('Nie udało się pobrać listy zablokowanych.');
    return res.json();
  },

  block: async (who: { userId?: string; username?: string }): Promise<{ id: string; username: string }> => {
    const res = await fetchWithAuth('/api/messages/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(who)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Nie udało się zablokować użytkownika.');
    return data;
  },

  unblock: async (userId: string): Promise<void> => {
    const res = await fetchWithAuth(`/api/messages/block/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Nie udało się odblokować użytkownika.');
  }
};



// --- Dziennik zmian ---
export type ChangelogType = 'new' | 'improved' | 'fixed';
export interface ChangelogItem {
  id: string;
  type: ChangelogType;
  area: string | null;
  text: string;
}
export interface ChangelogRelease {
  day: string;
  publishedAt: string;
  items: ChangelogItem[];
}
export interface ChangelogPendingDraft extends ChangelogItem {
  day: string;
  source: string;
}

export const changelogApi = {
  list: async (limit = 60): Promise<{ releases: ChangelogRelease[]; publishTime: string }> => {
    const res = await fetch(`/api/changelog?limit=${limit}`);
    return jsonOrThrow(res, 'Nie udało się pobrać dziennika zmian.');
  },
  pending: async (): Promise<{ drafts: ChangelogPendingDraft[]; cutoff: string }> =>
    jsonOrThrow(await fetchWithAuth('/api/admin/changelog/pending'), 'Nie udało się pobrać zmian do publikacji.'),
  add: async (draft: { type: ChangelogType; area?: string; text: string; day?: string }): Promise<{ id: string }> =>
    jsonOrThrow(
      await fetchWithAuth('/api/admin/changelog/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }),
      'Nie udało się dodać zmiany.'
    ),
  remove: async (id: string): Promise<void> => {
    await jsonOrThrow(await fetchWithAuth(`/api/admin/changelog/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Nie udało się usunąć wpisu.');
  },
  publishNow: async (): Promise<{ published: number }> =>
    jsonOrThrow(await fetchWithAuth('/api/admin/changelog/publish', { method: 'POST' }), 'Nie udało się opublikować zmian.')
};
