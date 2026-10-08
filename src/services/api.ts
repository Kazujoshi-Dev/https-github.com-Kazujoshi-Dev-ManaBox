import { AdminUser, AdminStats, AdminAuditEntry, AuthUser, AppSettings, Catalog, CollectionItem, DeckItem, ScryfallCard, WishlistItem, SpellbookFindCombosResponse, SpellbookVariant, RegisteredUserSummary, UserMessage, UserProfile, CitySuggestion, MapCity, WishlistMatches } from '../types';
import { noteResponseVersion } from '../utils/appVersion';
import { t, tServer, tk } from '../i18n';

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
  noteResponseVersion(response);
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
    await jsonOrThrow(res, tk('Nie udało się usunąć konta.'));
  },
  changePassword: async (newPassword: string, currentPassword?: string): Promise<{ token: string; user: AuthUser }> => {
    const res = await fetchWithAuth('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, currentPassword })
    });
    return jsonOrThrow(res, tk('Nie udało się zmienić hasła.'));
  }
};

/** Zapytania bez logowania: linki z e-maili (potwierdzenie adresu, reset hasła). */
const publicAuthPost = async <T,>(url: string, body: unknown, fallback: string): Promise<T> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return jsonOrThrow<T>(res, fallback);
};

export const emailAuthApi = {
  resendVerification: (email: string) =>
    publicAuthPost<{ success: true }>('/api/auth/resend-verification', { email }, tk('Nie udało się wysłać linku.')),
  verifyEmail: (token: string) =>
    publicAuthPost<{ success: true; token?: string; user?: AuthUser }>('/api/auth/verify-email', { token }, tk('Nie udało się potwierdzić adresu.')),
  forgotPassword: (email: string) =>
    publicAuthPost<{ success: true }>('/api/auth/forgot-password', { email }, tk('Nie udało się wysłać linku.')),
  checkResetToken: (token: string) =>
    publicAuthPost<{ valid: boolean }>('/api/auth/reset-password/check', { token }, tk('Nie udało się sprawdzić linku.')),
  resetPassword: (token: string, newPassword: string) =>
    publicAuthPost<{ success: true; token?: string; user?: AuthUser }>('/api/auth/reset-password', { token, newPassword }, tk('Nie udało się zmienić hasła.'))
};

/** Panel administratora — serwer sprawdza uprawnienia przy każdym zapytaniu. */
const adminPost = async (url: string, body: unknown = {}, method = 'POST') => {
  const res = await fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return jsonOrThrow<any>(res, tk('Operacja nie powiodła się.'));
};
export const adminApi = {
  stats: async (): Promise<AdminStats> => jsonOrThrow(await fetchWithAuth('/api/admin/stats'), tk('Błąd pobierania statystyk.')),
  users: async (q: string, offset = 0, limit = 50): Promise<{ users: AdminUser[]; total: number }> =>
    jsonOrThrow(
      await fetchWithAuth(`/api/admin/users?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`),
      tk('Błąd pobierania użytkowników.')
    ),
  audit: async (): Promise<AdminAuditEntry[]> => jsonOrThrow(await fetchWithAuth('/api/admin/audit'), tk('Błąd pobierania dziennika.')),
  rename: (id: string, username: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/rename`, { username }),
  resetPassword: (id: string): Promise<{ tempPassword: string }> => adminPost(`/api/admin/users/${encodeURIComponent(id)}/reset-password`),
  ban: (id: string, body: { days?: number; until?: string; permanent?: boolean; reason?: string }) =>
    adminPost(`/api/admin/users/${encodeURIComponent(id)}/ban`, body),
  unban: (id: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/unban`),
  logoutAll: (id: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/logout-all`),
  verifyEmail: (id: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/verify-email`),
  setSaleHidden: (id: string, hidden: boolean) => adminPost(`/api/admin/users/${encodeURIComponent(id)}/sale-hidden`, { hidden }),
  remove: (id: string, confirmUsername: string) => adminPost(`/api/admin/users/${encodeURIComponent(id)}`, { confirmUsername }, 'DELETE')
};

export const collectionApi = {
  getAll: (onUnauthorized?: () => void) =>
    fetchWithAuth('/api/collection', {}, onUnauthorized),
  /** Dzienna historia wartości i liczby kart kolekcji. */
  history: async (days: number): Promise<{ currency: string; points: Array<{ day: string; value: number; cards: number; currency: string }> }> => {
    const res = await fetchWithAuth(`/api/collection/history?days=${days}`);
    if (!res.ok) throw new Error(t('Nie udało się pobrać historii kolekcji.'));
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
  empty: (id: string, onUnauthorized?: () => void) =>
    fetchWithAuth(`/api/catalogs/${encodeURIComponent(id)}/empty`, { method: 'POST' }, onUnauthorized),
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
    await jsonOrThrow(res, tk('Nie udało się zmienić udostępniania talii.'));
  }
};

export const publicDeckApi = {
  get: async (id: string): Promise<{ deck: DeckItem; owner: { username: string }; settings: AppSettings }> => {
    const res = await fetch(`/api/public/deck/${encodeURIComponent(id)}`);
    return jsonOrThrow(res, tk('Nie udało się pobrać talii.'));
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
      const err = await res.json().catch(() => ({ error: tk('Błąd pobierania combo') }));
      throw new Error(tServer(err.error) || t('Błąd serwera ({status})', { status: res.status }));
    }
    return res.json();
  },

  getCardCombos: async (cardName: string): Promise<{ results: SpellbookVariant[]; count: number }> => {
    const res = await fetch(`/api/spellbook/card-combos?cardName=${encodeURIComponent(cardName)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: tk('Błąd pobierania combosów dla karty') }));
      throw new Error(tServer(err.error) || t('Błąd serwera ({status})', { status: res.status }));
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
      throw new Error(tServer(err.error) || t('Błąd pobierania oferty ({status})', { status: res.status }));
    }
    return res.json();
  }
};

export const usersApi = {
  getAll: async (): Promise<RegisteredUserSummary[]> => {
    const res = await fetch('/api/users');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(tServer(err.error) || t('Błąd pobierania listy użytkowników ({status})', { status: res.status }));
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
      throw new Error(tServer(err.error) || t('Błąd pobierania listy życzeń ({status})', { status: res.status }));
    }
    return res.json();
  }
};

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(tServer(err.error) || `${t(fallback)} (${res.status})`);
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
    jsonOrThrow(await fetchWithAuth(`/api/edhrec/commander?name=${encodeURIComponent(name)}`), tk('Nie udało się pobrać rekomendacji EDHREC.'))
};

export const profileApi = {
  get: async (): Promise<UserProfile> =>
    jsonOrThrow(await fetchWithAuth('/api/profile'), tk('Błąd pobierania profilu')),
  /** Zapis miejscowości wybranej z podpowiedzi; null usuwa miejscowość. */
  saveCity: async (label: string | null): Promise<UserProfile> =>
    jsonOrThrow(
      await fetchWithAuth('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      }),
      tk('Błąd zapisu miejscowości')
    ),
  searchCities: async (q: string): Promise<CitySuggestion[]> =>
    jsonOrThrow(await fetchWithAuth(`/api/geo/cities?q=${encodeURIComponent(q)}`), tk('Błąd wyszukiwania miejscowości'))
};

export const sellersApi = {
  getMap: async (): Promise<{ cities: MapCity[]; myCity: string | null }> =>
    jsonOrThrow(await fetchWithAuth('/api/sellers/map'), tk('Błąd pobierania mapy sprzedawców')),
  getWishlistMatches: async (): Promise<WishlistMatches> =>
    jsonOrThrow(await fetchWithAuth('/api/users/wishlist-matches'), tk('Błąd pobierania dopasowań'))
};

export const messagesApi = {
  getInbox: async (): Promise<UserMessage[]> => {
    const res = await fetchWithAuth('/api/messages/inbox');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(tServer(err.error) || t('Błąd pobierania skrzynki odbiorczej ({status})', { status: res.status }));
    }
    return res.json();
  },

  getSent: async (): Promise<UserMessage[]> => {
    const res = await fetchWithAuth('/api/messages/sent');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(tServer(err.error) || t('Błąd pobierania skrzynki nadawczej ({status})', { status: res.status }));
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
      throw new Error(tServer(err.error) || t('Błąd wysyłania wiadomości ({status})', { status: res.status }));
    }
    return res.json();
  },

  markAsRead: async (id: string): Promise<{ success: boolean }> => {
    const res = await fetchWithAuth(`/api/messages/${id}/read`, {
      method: 'PUT'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(tServer(err.error) || t('Błąd aktualizacji statusu ({status})', { status: res.status }));
    }
    return res.json();
  },

  markAllAsRead: async (): Promise<{ success: boolean }> => {
    const res = await fetchWithAuth('/api/messages/mark-all-read', {
      method: 'PUT'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(tServer(err.error) || t('Błąd aktualizacji wiadomości ({status})', { status: res.status }));
    }
    return res.json();
  },

  deleteMessage: async (id: string): Promise<{ success: boolean }> => {
    const res = await fetchWithAuth(`/api/messages/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(tServer(err.error) || t('Błąd usuwania wiadomości ({status})', { status: res.status }));
    }
    return res.json();
  },

  /** Zablokowani użytkownicy (nie mogą do mnie pisać). */
  listBlocked: async (): Promise<Array<{ id: string; username: string; blockedAt: string }>> => {
    const res = await fetchWithAuth('/api/messages/blocked');
    if (!res.ok) throw new Error(t('Nie udało się pobrać listy zablokowanych.'));
    return res.json();
  },

  block: async (who: { userId?: string; username?: string }): Promise<{ id: string; username: string }> => {
    const res = await fetchWithAuth('/api/messages/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(who)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(tServer(data.error) || t('Nie udało się zablokować użytkownika.'));
    return data;
  },

  unblock: async (userId: string): Promise<void> => {
    const res = await fetchWithAuth(`/api/messages/block/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(t('Nie udało się odblokować użytkownika.'));
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
    return jsonOrThrow(res, tk('Nie udało się pobrać dziennika zmian.'));
  },
  pending: async (): Promise<{ drafts: ChangelogPendingDraft[]; cutoff: string }> =>
    jsonOrThrow(await fetchWithAuth('/api/admin/changelog/pending'), tk('Nie udało się pobrać zmian do publikacji.')),
  add: async (draft: { type: ChangelogType; area?: string; text: string; day?: string }): Promise<{ id: string }> =>
    jsonOrThrow(
      await fetchWithAuth('/api/admin/changelog/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }),
      tk('Nie udało się dodać zmiany.')
    ),
  remove: async (id: string): Promise<void> => {
    await jsonOrThrow(await fetchWithAuth(`/api/admin/changelog/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }), tk('Nie udało się usunąć wpisu.'));
  },
  publishNow: async (): Promise<{ published: number }> =>
    jsonOrThrow(await fetchWithAuth('/api/admin/changelog/publish', { method: 'POST' }), tk('Nie udało się opublikować zmian.'))
};

// --- Zgłoszenia błędów ---
export type BugReportStatus = 'new' | 'in_progress' | 'resolved' | 'rejected';
export interface BugReport {
  id: number;
  userId: string | null;
  username: string | null;
  description: string;
  page: string | null;
  userAgent: string | null;
  hasScreenshot: boolean;
  status: BugReportStatus;
  createdAt: string;
  updatedAt: string;
}

export const bugReportsApi = {
  send: async (data: { description: string; page?: string; screenshot?: string | null }): Promise<{ id: number }> =>
    jsonOrThrow(
      await fetchWithAuth('/api/bug-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
      tk('Nie udało się wysłać zgłoszenia.')
    ),
  list: async (status: BugReportStatus | 'open' | 'all' = 'open'): Promise<{ reports: BugReport[]; newCount: number }> =>
    jsonOrThrow(await fetchWithAuth(`/api/admin/bug-reports?status=${status}`), tk('Nie udało się pobrać zgłoszeń.')),
  setStatus: async (id: number, status: BugReportStatus): Promise<void> => {
    await jsonOrThrow(
      await fetchWithAuth(`/api/admin/bug-reports/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
      tk('Nie udało się zmienić statusu.')
    );
  },
  remove: async (id: number): Promise<void> => {
    await jsonOrThrow(await fetchWithAuth(`/api/admin/bug-reports/${id}`, { method: 'DELETE' }), tk('Nie udało się usunąć zgłoszenia.'));
  },
  /** Zrzut ekranu jako adres blob: (wymaga nagłówka autoryzacji, więc nie da się go podać wprost w <img>). */
  screenshotUrl: async (id: number): Promise<string> => {
    const res = await fetchWithAuth(`/api/admin/bug-reports/${id}/screenshot`);
    if (!res.ok) throw new Error(t('Nie udało się wczytać zrzutu ekranu.'));
    return URL.createObjectURL(await res.blob());
  }
};
