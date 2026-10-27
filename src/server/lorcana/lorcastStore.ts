/**
 * Lokalna baza kart Disney Lorcana (dane z API Lorcast, https://lorcast.com/docs/api).
 *
 * - Kart jest kilka tysięcy, więc trzymamy je wszystkie: w PostgreSQL (tabela lorcana_cards,
 *   surowy JSON z Lorcast) i w pamięci (już przemapowane na kształt karty aplikacji).
 * - Synchronizacja raz na dobę, w tle: lista dodatków, potem karty każdego dodatku.
 *   Lorcast prosi o 50–100 ms przerwy między zapytaniami i o cache co najmniej na 24 h;
 *   ceny i tak aktualizuje raz dziennie.
 * - Wyszukiwanie, wersje karty i odświeżanie cen kolekcji działają wyłącznie na lokalnych danych,
 *   więc liczba graczy nie zwiększa liczby zapytań do Lorcast.
 * - Bez PostgreSQL karty są tylko w pamięci (pobierane przy starcie serwera).
 */
import { getPool, isPostgresActive } from '../db/storage';
import { APP_USER_AGENT } from '../userAgent';
import { normalizeText } from '../cardText';
import { lorcastToAppCard, type LorcastCard, type LorcastSet } from './adapter';
import type { ScryfallCard } from '../../types';

const API_BASE = (process.env.LORCAST_API_URL || 'https://api.lorcast.com/v0').replace(/\/+$/, '');
const REQUEST_GAP_MS = 120; // Lorcast: 50–100 ms przerwy między zapytaniami
const SYNC_INTERVAL_MS = 20 * 60 * 60 * 1000; // dane starsze niż 20 h pobieramy od nowa
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MAX_RESULTS = 200;

interface SetInfo {
  code: string;
  name: string;
  releasedAt: string | null;
}

interface Index {
  cards: ScryfallCard[];
  byId: Map<string, ScryfallCard>;
  byName: Map<string, ScryfallCard[]>; // znormalizowana pełna nazwa → wydania (najnowsze pierwsze)
  sets: SetInfo[];
}

let index: Index | null = null;
let syncing = false;
let lastSyncAt: string | null = null;
let lastSyncError: string | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export { normalizeText };

async function lorcastGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': APP_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) throw new Error(`Lorcast ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function buildIndex(raw: Array<{ card: LorcastCard; setReleasedAt: string | null }>, sets: SetInfo[]): Index {
  const cards = raw.map(({ card, setReleasedAt }) => lorcastToAppCard(card, setReleasedAt));
  // Najnowsze wydania pierwsze, w obrębie dodatku według numeru
  cards.sort((a, b) =>
    (b.released_at || '').localeCompare(a.released_at || '') ||
    a.set.localeCompare(b.set) ||
    (parseInt(a.collector_number, 10) || 0) - (parseInt(b.collector_number, 10) || 0)
  );
  const byId = new Map<string, ScryfallCard>();
  const byName = new Map<string, ScryfallCard[]>();
  for (const c of cards) {
    byId.set(c.id, c);
    const key = normalizeText(c.name);
    const list = byName.get(key);
    if (list) list.push(c);
    else byName.set(key, [c]);
  }
  return { cards, byId, byName, sets: [...sets].sort((a, b) => (b.releasedAt || '').localeCompare(a.releasedAt || '')) };
}

async function ensureSchema(): Promise<void> {
  const pool = isPostgresActive() ? getPool() : null;
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lorcana_sets (
      code VARCHAR(16) PRIMARY KEY,
      id VARCHAR(64),
      name VARCHAR(200) NOT NULL,
      released_at DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lorcana_cards (
      id VARCHAR(64) PRIMARY KEY,
      set_code VARCHAR(16) NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_lorcana_cards_set ON lorcana_cards(set_code);
  `);
}

async function loadFromDb(): Promise<{ loaded: boolean; syncedAt: Date | null }> {
  const pool = isPostgresActive() ? getPool() : null;
  if (!pool) return { loaded: false, syncedAt: null };
  const [setsRes, cardsRes, ageRes] = await Promise.all([
    pool.query(`SELECT code, name, to_char(released_at, 'YYYY-MM-DD') AS released_at FROM lorcana_sets`),
    pool.query({ text: `SELECT data, set_code FROM lorcana_cards`, query_timeout: 30_000 } as any),
    pool.query(`SELECT MIN(updated_at) AS oldest FROM lorcana_cards`)
  ]);
  if (!cardsRes.rows.length) return { loaded: false, syncedAt: null };
  const sets: SetInfo[] = setsRes.rows.map((r: any) => ({ code: String(r.code), name: String(r.name), releasedAt: r.released_at || null }));
  const released = new Map(sets.map((s) => [s.code.toLowerCase(), s.releasedAt]));
  index = buildIndex(
    cardsRes.rows.map((r: any) => ({ card: r.data as LorcastCard, setReleasedAt: released.get(String(r.set_code).toLowerCase()) ?? null })),
    sets
  );
  const oldest = ageRes.rows[0]?.oldest ? new Date(ageRes.rows[0].oldest) : null;
  lastSyncAt = oldest ? oldest.toISOString() : null;
  return { loaded: true, syncedAt: oldest };
}

/** Pobiera wszystkie dodatki i karty z Lorcast, zapisuje w bazie i przebudowuje indeks. */
export async function syncLorcana(): Promise<void> {
  if (syncing) return;
  syncing = true;
  const started = Date.now();
  try {
    const setsRes = await lorcastGet<{ results?: LorcastSet[] }>('/sets');
    const rawSets = Array.isArray(setsRes?.results) ? setsRes.results : [];
    if (!rawSets.length) throw new Error('Lorcast nie zwrócił listy dodatków');

    const all: Array<{ card: LorcastCard; setReleasedAt: string | null }> = [];
    const sets: SetInfo[] = [];
    for (const s of rawSets) {
      await sleep(REQUEST_GAP_MS);
      const key = s.id || s.code;
      const cards = await lorcastGet<LorcastCard[]>(`/sets/${encodeURIComponent(key)}/cards`);
      const releasedAt = s.released_at || s.prereleased_at || null;
      sets.push({ code: String(s.code), name: s.name, releasedAt });
      if (Array.isArray(cards)) {
        for (const c of cards) if (c?.id && c?.name) all.push({ card: c, setReleasedAt: releasedAt });
      }
    }
    if (!all.length) throw new Error('Lorcast nie zwrócił kart');

    const pool = isPostgresActive() ? getPool() : null;
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const s of rawSets) {
          await client.query(
            `INSERT INTO lorcana_sets (code, id, name, released_at, updated_at) VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (code) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, released_at = EXCLUDED.released_at, updated_at = NOW()`,
            [String(s.code), s.id || null, s.name, s.released_at || s.prereleased_at || null]
          );
        }
        const BATCH = 200;
        for (let i = 0; i < all.length; i += BATCH) {
          const chunk = all.slice(i, i + BATCH);
          const params: unknown[] = [];
          const rows = chunk.map(({ card }, k) => {
            params.push(card.id, String(card.set?.code ?? ''), JSON.stringify(card));
            return `($${k * 3 + 1}, $${k * 3 + 2}, $${k * 3 + 3}::jsonb, NOW())`;
          });
          await client.query(
            `INSERT INTO lorcana_cards (id, set_code, data, updated_at) VALUES ${rows.join(', ')}
             ON CONFLICT (id) DO UPDATE SET set_code = EXCLUDED.set_code, data = EXCLUDED.data, updated_at = NOW()`,
            params
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }

    index = buildIndex(all, sets);
    lastSyncAt = new Date().toISOString();
    lastSyncError = null;
    console.log(`[Lorcana] Zsynchronizowano ${all.length} kart z ${sets.length} dodatków w ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (err: any) {
    lastSyncError = err?.message || String(err);
    console.warn('[Lorcana] Synchronizacja nieudana:', lastSyncError);
  } finally {
    syncing = false;
  }
}

/** Start przy uruchomieniu serwera: wczytanie z bazy, a gdy danych brak lub są stare, pobranie w tle. */
export async function startLorcanaDb(): Promise<void> {
  await ensureSchema();
  const { loaded, syncedAt } = await loadFromDb().catch((err) => {
    console.warn('[Lorcana] Odczyt z bazy nieudany:', err?.message || err);
    return { loaded: false, syncedAt: null as Date | null };
  });
  if (loaded) console.log(`[Lorcana] Wczytano ${index?.cards.length || 0} kart z bazy`);
  const isStale = () => !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > SYNC_INTERVAL_MS;
  if (!loaded || !syncedAt || isStale()) syncLorcana().catch(() => undefined);
  setInterval(() => {
    if (isStale()) syncLorcana().catch(() => undefined);
  }, CHECK_INTERVAL_MS).unref?.();
}

export function lorcanaStatus() {
  return {
    ready: Boolean(index?.cards.length),
    cards: index?.cards.length || 0,
    sets: index?.sets.length || 0,
    syncing,
    lastSyncAt,
    lastSyncError
  };
}

export function isLorcanaReady(): boolean {
  return Boolean(index?.cards.length);
}

export function getLorcanaCard(id: string): ScryfallCard | null {
  return index?.byId.get(id) || null;
}

/** Wszystkie wydania karty o tej samej pełnej nazwie (np. wersja zwykła i Enchanted). */
export function getLorcanaPrints(nameOrId: { name?: string; id?: string }): ScryfallCard[] {
  if (!index) return [];
  const name = nameOrId.name || (nameOrId.id ? index.byId.get(nameOrId.id)?.name : '') || '';
  return name ? index.byName.get(normalizeText(name)) || [] : [];
}

export function getLorcanaSets(): Array<{ code: string; name: string; released_at: string | null; card_count: number }> {
  if (!index) return [];
  const counts = new Map<string, number>();
  for (const c of index.cards) counts.set(c.set, (counts.get(c.set) || 0) + 1);
  return index.sets.map((s) => ({ code: s.code.toLowerCase(), name: s.name, released_at: s.releasedAt, card_count: counts.get(s.code.toLowerCase()) || 0 }));
}

/** Podpowiedzi nazw (od początku nazwy, potem fragmentu). */
export function autocompleteLorcana(q: string, limit = 12): string[] {
  if (!index) return [];
  const needle = normalizeText(q);
  if (needle.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const [key, prints] of index.byName) {
    if (key.startsWith(needle)) starts.push(prints[0].name);
    else if (key.includes(needle)) contains.push(prints[0].name);
    if (starts.length >= limit) break;
  }
  return [...starts.sort(), ...contains.sort()].slice(0, limit);
}

/** Wydania specjalne: w wynikach wyszukiwania pokazujemy je tylko, gdy karta nie ma zwykłego wydania. */
const SPECIAL_RARITIES = new Set(['enchanted', 'promo', 'iconic', 'epic']);

const RARITY_ALIASES: Record<string, string> = {
  c: 'common', u: 'uncommon', r: 'rare', sr: 'super_rare', l: 'legendary', e: 'enchanted', p: 'promo',
  superrare: 'super_rare', 'super rare': 'super_rare', 'super-rare': 'super_rare'
};

type Op = ':' | '=' | '<' | '<=' | '>' | '>=';
const cmp = (value: number | null | undefined, op: Op, target: number) => {
  if (value === null || value === undefined) return false;
  switch (op) {
    case '<': return value < target;
    case '<=': return value <= target;
    case '>': return value > target;
    case '>=': return value >= target;
    default: return value === target;
  }
};

/**
 * Wyszukiwanie w lokalnej bazie. Wolny tekst szuka w nazwie, a filtry działają jak w Lorcast/Scryfall:
 * set:1 lub set:"first chapter", ink:amethyst, rarity:enchanted (r:sr), cost<=3, type:song,
 * lore>=2, strength:3, willpower>4, inkwell:no, text:"draw a card", a:artysta, cls:princess.
 * Wynik: jedna pozycja na kartę (najnowsze wydanie), chyba że unique = 'prints'.
 */
export function searchLorcana(query: string, unique: 'cards' | 'prints' = 'cards'): ScryfallCard[] {
  if (!index) return [];
  const filters: Array<(c: ScryfallCard) => boolean> = [];
  const words: string[] = [];
  const re = /(-?)([a-z]+)(<=|>=|:|=|<|>)("([^"]*)"|\S+)|"([^"]*)"|(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    if (m[2]) {
      const negate = m[1] === '-';
      const key = m[2].toLowerCase();
      const op = m[3] as Op;
      const val = normalizeText(m[5] ?? m[4] ?? '');
      const num = Number(val);
      let f: ((c: ScryfallCard) => boolean) | null = null;
      switch (key) {
        case 'set': case 's': case 'e':
          f = (c) => c.set === val || normalizeText(c.set_name).includes(val);
          break;
        case 'ink': case 'i': case 'c': case 'color':
          f = (c) => normalizeText(c.ink || '') === val || (val === 'none' && !c.ink);
          break;
        case 'rarity': case 'r': {
          const r = RARITY_ALIASES[val] || val.replace(/\s+/g, '_');
          f = (c) => c.rarity === r;
          break;
        }
        case 'cost': case 'cmc': case 'mv':
          if (Number.isFinite(num)) f = (c) => cmp(c.cmc, op, num);
          break;
        case 'lore':
          if (Number.isFinite(num)) f = (c) => cmp(c.lore, op, num);
          break;
        case 'strength': case 'str': case 'pow':
          if (Number.isFinite(num)) f = (c) => cmp(c.strength, op, num);
          break;
        case 'willpower': case 'will': case 'tou':
          if (Number.isFinite(num)) f = (c) => cmp(c.willpower, op, num);
          break;
        case 'type': case 't':
          f = (c) => normalizeText(c.type_line).includes(val);
          break;
        case 'cls': case 'classification':
          f = (c) => (c.classifications || []).some((x) => normalizeText(x) === val);
          break;
        case 'inkwell': case 'inkable':
          f = (c) => Boolean(c.inkwell) === !['no', 'false', '0', 'n'].includes(val);
          break;
        case 'text': case 'o': case 'oracle':
          f = (c) => normalizeText(c.oracle_text || '').includes(val);
          break;
        case 'a': case 'artist': case 'illustrator':
          f = (c) => normalizeText(c.artist || '').includes(val);
          break;
        case 'number': case 'cn':
          f = (c) => c.collector_number.toLowerCase() === val;
          break;
      }
      if (f) {
        const ff = f;
        filters.push(negate ? (c) => !ff(c) : ff);
        continue;
      }
      // nieznany filtr: traktujemy całość jak zwykły tekst
      words.push(normalizeText(m[0]));
    } else {
      const w = normalizeText(m[6] ?? m[7] ?? '');
      if (w) words.push(w);
    }
  }
  if (!filters.length && !words.length) return [];

  const matches = index.cards.filter((c) => {
    if (words.length) {
      const name = normalizeText(c.name);
      if (!words.every((w) => name.includes(w))) return false;
    }
    return filters.every((f) => f(c));
  });

  let result = matches;
  if (unique === 'cards') {
    // Jedna pozycja na kartę: najnowsze zwykłe wydanie, a gdy go nie ma, najnowsze specjalne (Enchanted, promo)
    const special = (c: ScryfallCard) => SPECIAL_RARITIES.has(c.rarity);
    const best = new Map<string, ScryfallCard>();
    for (const c of matches) {
      const key = normalizeText(c.name);
      const cur = best.get(key);
      if (!cur || (special(cur) && !special(c))) best.set(key, c);
    }
    result = matches.filter((c) => best.get(normalizeText(c.name)) === c);
  }
  const phrase = words.join(' ');
  return result
    .map((c, i) => ({ c, i, exact: phrase && normalizeText(c.name).startsWith(phrase) ? 0 : 1 }))
    .sort((a, b) => a.exact - b.exact || (phrase ? a.c.name.localeCompare(b.c.name) : a.i - b.i))
    .slice(0, MAX_RESULTS)
    .map((x) => x.c);
}

/** Karta po dodatku i numerze (np. import z pliku). */
export function getLorcanaByNumber(set: string, number: string): ScryfallCard | null {
  if (!index) return null;
  const s = set.toLowerCase();
  const n = number.toLowerCase();
  return index.cards.find((c) => c.set === s && c.collector_number.toLowerCase() === n) || null;
}

/** Karta na ekran wyboru gry: wydanie Enchanted (pełna ilustracja), inne każdego dnia. */
export function pickLorcanaShowcase(): { image: string; name: string; artist: string | null } | null {
  if (!index) return null;
  const pool = index.cards.filter((c) => c.rarity === 'enchanted' && c.image_uris?.large);
  const list = pool.length ? pool : index.cards.filter((c) => c.image_uris?.large);
  if (!list.length) return null;
  const c = list[Math.floor(Date.now() / 86_400_000) % list.length];
  return { image: c.image_uris!.large!, name: c.name, artist: c.artist || null };
}

/** Karty na stronę klasera na stronie głównej: rzadsze wydania z grafiką, inne każdego dnia. */
export function lorcanaBinderCards(limit = 12): Array<{ name: string; image: string; artCrop: null; artist: string | null; legendary: boolean }> {
  if (!index) return [];
  const pool = index.cards.filter(
    (c) => c.image_uris?.normal && ['rare', 'super_rare', 'legendary', 'enchanted'].includes(c.rarity)
  );
  return dailyPick(pool, limit).map((c) => ({ name: c.name, image: c.image_uris!.normal!, artCrop: null, artist: c.artist || null, legendary: false }));
}

/** Deterministyczny wybór `n` elementów na dany dzień (każdy dzień inny zestaw, bez powtórzeń nazw). */
function dailyPick<T extends { name: string }>(list: T[], n: number): T[] {
  let seed = ((Math.floor(Date.now() / 86_400_000) + 104729) * 2654435761) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: T[] = [];
  const seen = new Set<string>();
  for (let tries = 0; tries < n * 20 && out.length < n && list.length; tries++) {
    const c = list[Math.floor(rand() * list.length)];
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}
