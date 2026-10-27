/**
 * Karty Pokémon TCG z API TCGdex (https://tcgdex.dev), wersja angielska.
 *
 * TCGdex nie udostępnia jednego pliku z całą bazą, a kart jest kilkadziesiąt tysięcy, dlatego:
 * - raz na dobę pobieramy listę dodatków i karty każdego dodatku (id, numer, nazwa, obraz):
 *   to wystarcza do wyszukiwania i trzymamy to w PostgreSQL i w pamięci,
 * - pełne dane karty (rzadkość, typy, HP, ataki, warianty, ceny) pobieramy dopiero, gdy ktoś
 *   otwiera kartę albo ją zapisuje, i przechowujemy w tabeli pokemon_card_details,
 * - raz na dobę odświeżamy ceny tylko tych kart, które ktoś ma w kolekcji lub na liście życzeń.
 * Wszystkie zapytania do TCGdex idą jedną kolejką z przerwą między nimi (TCGdex prosi o umiar
 * i o przechowywanie danych u siebie). Dodatki TCG Pocket (gra cyfrowa) pomijamy.
 */
import { getPool, isPostgresActive } from '../db/storage';
import { APP_USER_AGENT } from '../userAgent';
import { normalizeText } from '../cardText';
import { briefToAppCard, tcgdexToAppCard, type TcgdexCard, type TcgdexSet, type TcgdexSetBrief } from './adapter';
import type { ScryfallCard } from '../../types';

const API_BASE = (process.env.TCGDEX_API_URL || 'https://api.tcgdex.net/v2/en').replace(/\/+$/, '');
const REQUEST_GAP_MS = 250; // najwyżej 4 zapytania na sekundę
const MAX_QUEUE = 600;
const INDEX_MAX_AGE_MS = 20 * 60 * 60 * 1000;
const DETAILS_MAX_AGE_MS = 20 * 60 * 60 * 1000; // ceny TCGdex zmieniają się raz na dobę
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MAX_RESULTS = 200;
const MAX_PRINTS = 300;
const MEMORY_DETAILS_MAX = 5000;
/** Serie pomijane: Pokémon TCG Pocket to gra wyłącznie cyfrowa. */
const SKIPPED_SERIES = new Set(['tcgp']);

interface SetInfo {
  id: string;
  name: string;
  serie: string;
  releaseDate: string | null;
  total: number;
}

interface Index {
  cards: ScryfallCard[]; // karty z list dodatków (partial), najnowsze dodatki pierwsze
  byId: Map<string, ScryfallCard>;
  sets: SetInfo[];
  setById: Map<string, SetInfo>;
}

let index: Index | null = null;
let syncing = false;
let lastSyncAt: string | null = null;
let lastSyncError: string | null = null;
let pricesRunning = false;
let lastPricesAt: string | null = null;

/** Pełne karty w pamięci (ostatnio używane): id → karta i czas pobrania. */
const details = new Map<string, { card: ScryfallCard; fetchedAt: number }>();
/** Pobieranie tej samej karty tylko raz naraz. */
const inflight = new Map<string, Promise<ScryfallCard | null>>();

const pool = () => (isPostgresActive() ? getPool() : null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- kolejka zapytań do TCGdex ---
let queue: Promise<unknown> = Promise.resolve();
let queued = 0;
let lastRequestAt = 0;

export class TcgdexBusyError extends Error {
  constructor() {
    super('Serwis kart Pokémon jest chwilowo przeciążony. Spróbuj ponownie za chwilę.');
  }
}

function tcgdexGet<T>(path: string): Promise<T | null> {
  if (queued >= MAX_QUEUE) return Promise.reject(new TcgdexBusyError());
  queued++;
  const run = queue.then(async () => {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'User-Agent': APP_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TCGdex ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  });
  queue = run.catch(() => undefined).finally(() => { queued--; });
  return run;
}

// --- baza danych ---
async function ensureSchema(): Promise<void> {
  const p = pool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS pokemon_sets (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      serie_id VARCHAR(32),
      release_date DATE,
      card_total INT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pokemon_cards (
      id VARCHAR(64) PRIMARY KEY,
      set_id VARCHAR(32) NOT NULL,
      local_id VARCHAR(32) NOT NULL,
      name VARCHAR(200) NOT NULL,
      image VARCHAR(300),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pokemon_cards_set ON pokemon_cards(set_id);
    CREATE TABLE IF NOT EXISTS pokemon_card_details (
      id VARCHAR(64) PRIMARY KEY,
      data JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function buildIndex(rows: Array<{ id: string; setId: string; localId: string; name: string; image: string | null }>, sets: SetInfo[]): Index {
  const setById = new Map(sets.map((s) => [s.id.toLowerCase(), s]));
  const cards: ScryfallCard[] = [];
  for (const r of rows) {
    const set = setById.get(r.setId.toLowerCase());
    if (!set || SKIPPED_SERIES.has(set.serie)) continue;
    cards.push(briefToAppCard({ id: r.id, localId: r.localId, name: r.name, image: r.image }, r.setId, { name: set.name, releaseDate: set.releaseDate }));
  }
  const num = (s: string) => parseInt(s, 10) || 0;
  cards.sort((a, b) => (b.released_at || '').localeCompare(a.released_at || '') || a.set.localeCompare(b.set) || num(a.collector_number) - num(b.collector_number));
  return {
    cards,
    byId: new Map(cards.map((c) => [c.id, c])),
    sets: [...sets].filter((s) => !SKIPPED_SERIES.has(s.serie)).sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '')),
    setById
  };
}

async function loadIndexFromDb(): Promise<boolean> {
  const p = pool();
  if (!p) return false;
  const [setsRes, cardsRes] = await Promise.all([
    p.query(`SELECT id, name, serie_id, to_char(release_date, 'YYYY-MM-DD') AS release_date, card_total, updated_at FROM pokemon_sets`),
    p.query({ text: `SELECT id, set_id, local_id, name, image FROM pokemon_cards`, query_timeout: 60_000 } as any)
  ]);
  if (!cardsRes.rows.length) return false;
  const sets: SetInfo[] = setsRes.rows.map((r: any) => ({
    id: String(r.id), name: String(r.name), serie: String(r.serie_id || ''), releaseDate: r.release_date || null, total: Number(r.card_total) || 0
  }));
  index = buildIndex(cardsRes.rows.map((r: any) => ({ id: r.id, setId: r.set_id, localId: r.local_id, name: r.name, image: r.image })), sets);
  const oldest = setsRes.rows.reduce((m: number, r: any) => Math.min(m, new Date(r.updated_at).getTime()), Date.now());
  lastSyncAt = new Date(oldest).toISOString();
  return true;
}

/** Lista dodatków i ich kart z TCGdex (bez szczegółów kart). */
export async function syncPokemonIndex(): Promise<void> {
  if (syncing) return;
  syncing = true;
  const started = Date.now();
  try {
    const list = await tcgdexGet<TcgdexSetBrief[]>('/sets');
    if (!Array.isArray(list) || !list.length) throw new Error('TCGdex nie zwrócił listy dodatków');

    const sets: SetInfo[] = [];
    const rows: Array<{ id: string; setId: string; localId: string; name: string; image: string | null }> = [];
    for (const brief of list) {
      if (!brief?.id) continue;
      const set = await tcgdexGet<TcgdexSet>(`/sets/${encodeURIComponent(brief.id)}`).catch((err) => {
        console.warn(`[Pokémon] Dodatek ${brief.id} pominięty:`, err?.message || err);
        return null;
      });
      if (!set) continue;
      const serie = String(set.serie?.id || '').toLowerCase();
      sets.push({ id: set.id, name: set.name, serie, releaseDate: set.releaseDate || null, total: Number(set.cardCount?.total) || 0 });
      if (SKIPPED_SERIES.has(serie)) continue;
      for (const c of set.cards || []) {
        if (c?.id && c?.name) rows.push({ id: c.id, setId: set.id, localId: String(c.localId ?? ''), name: c.name, image: c.image || null });
      }
    }
    if (!rows.length) throw new Error('TCGdex nie zwrócił kart');

    const p = pool();
    if (p) {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        for (const s of sets) {
          await client.query(
            `INSERT INTO pokemon_sets (id, name, serie_id, release_date, card_total, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, serie_id = EXCLUDED.serie_id, release_date = EXCLUDED.release_date,
               card_total = EXCLUDED.card_total, updated_at = NOW()`,
            [s.id, s.name, s.serie || null, s.releaseDate, s.total]
          );
        }
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const params: unknown[] = [];
          const values = chunk.map((r, k) => {
            params.push(r.id, r.setId, r.localId, r.name, r.image);
            const b = k * 5;
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, NOW())`;
          });
          await client.query(
            `INSERT INTO pokemon_cards (id, set_id, local_id, name, image, updated_at) VALUES ${values.join(', ')}
             ON CONFLICT (id) DO UPDATE SET set_id = EXCLUDED.set_id, local_id = EXCLUDED.local_id, name = EXCLUDED.name,
               image = EXCLUDED.image, updated_at = NOW()`,
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

    index = buildIndex(rows, sets);
    lastSyncAt = new Date().toISOString();
    lastSyncError = null;
    console.log(`[Pokémon] Zsynchronizowano ${index.cards.length} kart z ${index.sets.length} dodatków w ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (err: any) {
    lastSyncError = err?.message || String(err);
    console.warn('[Pokémon] Synchronizacja nieudana:', lastSyncError);
  } finally {
    syncing = false;
  }
}

// --- pełne karty ---
function remember(card: ScryfallCard, fetchedAt: number) {
  if (details.size >= MEMORY_DETAILS_MAX) {
    const oldest = details.keys().next().value;
    if (oldest !== undefined) details.delete(oldest);
  }
  details.delete(card.id);
  details.set(card.id, { card, fetchedAt });
}

function setContext(setId: string | undefined) {
  const s = setId ? index?.setById.get(setId.toLowerCase()) : undefined;
  return { name: s?.name, releaseDate: s?.releaseDate ?? null };
}

/** Pełne karty z pamięci i bazy (bez zapytań do TCGdex), także przeterminowane. */
async function readStoredDetails(ids: string[]): Promise<Map<string, { card: ScryfallCard; fetchedAt: number }>> {
  const out = new Map<string, { card: ScryfallCard; fetchedAt: number }>();
  const missing: string[] = [];
  for (const id of ids) {
    const d = details.get(id);
    if (d) out.set(id, d);
    else missing.push(id);
  }
  const p = pool();
  if (p && missing.length) {
    for (let i = 0; i < missing.length; i += 1000) {
      const res = await p.query(`SELECT id, data, fetched_at FROM pokemon_card_details WHERE id = ANY($1::varchar[])`, [missing.slice(i, i + 1000)]);
      for (const r of res.rows) {
        const raw = r.data as TcgdexCard;
        const entry = { card: tcgdexToAppCard(raw, setContext(raw.set?.id)), fetchedAt: new Date(r.fetched_at).getTime() };
        out.set(String(r.id), entry);
        remember(entry.card, entry.fetchedAt);
      }
    }
  }
  return out;
}

async function fetchAndStore(id: string): Promise<ScryfallCard | null> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const job = (async () => {
    const raw = await tcgdexGet<TcgdexCard>(`/cards/${encodeURIComponent(id)}`);
    if (!raw?.id) return null;
    const card = tcgdexToAppCard(raw, setContext(raw.set?.id));
    const now = Date.now();
    remember(card, now);
    const p = pool();
    if (p) {
      await p.query(
        `INSERT INTO pokemon_card_details (id, data, fetched_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW()`,
        [raw.id, JSON.stringify(raw)]
      );
    }
    return card;
  })();
  inflight.set(id, job);
  try {
    return await job;
  } finally {
    inflight.delete(id);
  }
}

/**
 * Pełna karta: z pamięci lub bazy, a gdy jej nie ma albo jest starsza niż doba, z TCGdex.
 * Przy błędzie TCGdex zwraca ostatnią zapisaną wersję albo kartę z listy dodatku.
 */
export async function getPokemonCard(id: string, maxAgeMs = DETAILS_MAX_AGE_MS): Promise<ScryfallCard | null> {
  const stored = (await readStoredDetails([id])).get(id);
  if (stored && Date.now() - stored.fetchedAt < maxAgeMs) return stored.card;
  try {
    const fresh = await fetchAndStore(id);
    if (fresh) return fresh;
  } catch (err: any) {
    console.warn(`[Pokémon] Karta ${id}:`, err?.message || err);
  }
  return stored?.card || index?.byId.get(id) || null;
}

/** Wiele pełnych kart (np. odświeżenie cen kolekcji); z TCGdex pobiera najwyżej `fetchLimit` brakujących lub starych. */
export async function getPokemonCards(ids: string[], fetchLimit = 0): Promise<Map<string, ScryfallCard>> {
  const unique = [...new Set(ids)];
  const stored = await readStoredDetails(unique);
  const out = new Map<string, ScryfallCard>();
  const stale: string[] = [];
  for (const id of unique) {
    const s = stored.get(id);
    if (s) out.set(id, s.card);
    if (!s || Date.now() - s.fetchedAt >= DETAILS_MAX_AGE_MS) stale.push(id);
  }
  for (const id of stale.slice(0, fetchLimit)) {
    try {
      const c = await fetchAndStore(id);
      if (c) out.set(id, c);
    } catch (err: any) {
      if (err instanceof TcgdexBusyError) break;
    }
  }
  return out;
}

/** Karty z wyników wyszukiwania: pełne dane tam, gdzie już je mamy (bez zapytań do TCGdex). */
async function withStoredDetails(cards: ScryfallCard[]): Promise<ScryfallCard[]> {
  if (!cards.length) return cards;
  const stored = await readStoredDetails(cards.map((c) => c.id)).catch(() => new Map());
  return cards.map((c) => stored.get(c.id)?.card || c);
}

/** Uzupełnia kartę zapisywaną w kolekcji lub na liście życzeń (karta z wyszukiwarki bywa niepełna). */
export async function completePokemonCard<T extends { id?: string; partial?: boolean } | null | undefined>(card: T): Promise<T> {
  if (!card || !card.id || !card.partial) return card;
  const full = await getPokemonCard(card.id).catch(() => null);
  return (full && !full.partial ? full : card) as T;
}

// --- dobowe odświeżanie cen posiadanych kart ---
async function refreshOwnedPrices(): Promise<void> {
  const p = pool();
  if (!p || pricesRunning) return;
  pricesRunning = true;
  let done = 0;
  try {
    const res = await p.query(
      `SELECT DISTINCT o.card_id FROM (
         SELECT card_id FROM user_collections WHERE game = 'pokemon'
         UNION SELECT card_id FROM user_wishlists WHERE game = 'pokemon'
       ) o
       LEFT JOIN pokemon_card_details d ON d.id = o.card_id
       WHERE d.id IS NULL OR d.fetched_at < NOW() - INTERVAL '20 hours'
       LIMIT 20000`
    );
    for (const r of res.rows) {
      try {
        if (await fetchAndStore(String(r.card_id))) done++;
      } catch (err: any) {
        if (err instanceof TcgdexBusyError) await sleep(30_000);
      }
    }
    lastPricesAt = new Date().toISOString();
    if (done) console.log(`[Pokémon] Odświeżono ceny ${done} kart z kolekcji graczy`);
  } catch (err: any) {
    console.warn('[Pokémon] Odświeżanie cen nieudane:', err?.message || err);
  } finally {
    pricesRunning = false;
  }
}

export async function startPokemonDb(): Promise<void> {
  await ensureSchema();
  const loaded = await loadIndexFromDb().catch((err) => {
    console.warn('[Pokémon] Odczyt z bazy nieudany:', err?.message || err);
    return false;
  });
  if (loaded) console.log(`[Pokémon] Wczytano ${index?.cards.length || 0} kart z bazy`);
  const isStale = () => !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > INDEX_MAX_AGE_MS;
  if (!loaded || isStale()) syncPokemonIndex().catch(() => undefined);
  setTimeout(() => refreshOwnedPrices().catch(() => undefined), 5 * 60_000).unref?.();
  setInterval(() => {
    if (isStale()) syncPokemonIndex().catch(() => undefined);
    refreshOwnedPrices().catch(() => undefined);
  }, CHECK_INTERVAL_MS).unref?.();
}

export function pokemonStatus() {
  return {
    ready: Boolean(index?.cards.length),
    cards: index?.cards.length || 0,
    sets: index?.sets.length || 0,
    syncing,
    lastSyncAt,
    lastSyncError,
    detailsInMemory: details.size,
    pricesRunning,
    lastPricesAt,
    queued
  };
}

export const isPokemonReady = (): boolean => Boolean(index?.cards.length);

export function getPokemonSets() {
  return (index?.sets || []).map((s) => ({ code: s.id.toLowerCase(), name: s.name, released_at: s.releaseDate, card_count: s.total }));
}

export function autocompletePokemon(q: string, limit = 12): string[] {
  if (!index) return [];
  const needle = normalizeText(q);
  if (needle.length < 2) return [];
  const starts = new Set<string>();
  const contains = new Set<string>();
  for (const c of index.cards) {
    const n = normalizeText(c.name);
    if (n.startsWith(needle)) starts.add(c.name);
    else if (n.includes(needle)) contains.add(c.name);
    if (starts.size >= limit) break;
  }
  return [...[...starts].sort(), ...[...contains].sort()].slice(0, limit);
}

/**
 * Wyszukiwanie po nazwie w lokalnej liście kart. Filtry: set:sv3 lub set:"obsidian flames",
 * number:125 (cn:), dokładna nazwa w cudzysłowie. Wyniki uzupełnione o zapisane szczegóły i ceny.
 */
export async function searchPokemon(query: string): Promise<ScryfallCard[]> {
  if (!index) return [];
  const filters: Array<(c: ScryfallCard) => boolean> = [];
  const words: string[] = [];
  let exact: string | null = null;
  const re = /(-?)([a-z]+):("([^"]*)"|\S+)|"([^"]*)"|(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    if (m[2]) {
      const key = m[2].toLowerCase();
      const val = normalizeText(m[4] ?? m[3] ?? '');
      const negate = m[1] === '-';
      let f: ((c: ScryfallCard) => boolean) | null = null;
      if (key === 'set' || key === 's' || key === 'e') f = (c) => c.set === val || normalizeText(c.set_name).includes(val);
      else if (key === 'number' || key === 'cn' || key === 'n') f = (c) => c.collector_number.toLowerCase().replace(/^0+/, '') === val.replace(/^0+/, '');
      if (f) {
        const ff = f;
        filters.push(negate ? (c) => !ff(c) : ff);
        continue;
      }
      words.push(normalizeText(m[0]));
    } else if (m[5] !== undefined) {
      exact = normalizeText(m[5]);
    } else if (m[6]) {
      words.push(normalizeText(m[6]));
    }
  }
  if (!filters.length && !words.length && !exact) return [];
  const phrase = exact || words.join(' ');
  const found = index.cards.filter((c) => {
    const name = normalizeText(c.name);
    if (exact && name !== exact) return false;
    if (words.length && !words.every((w) => name.includes(w))) return false;
    return filters.every((f) => f(c));
  });
  const ranked = found
    .map((c, i) => ({ c, i, rank: phrase && normalizeText(c.name) === phrase ? 0 : phrase && normalizeText(c.name).startsWith(phrase) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, MAX_RESULTS)
    .map((x) => x.c);
  return withStoredDetails(ranked);
}

/** Karty o tej samej nazwie we wszystkich dodatkach (najnowsze pierwsze) jako „wersje” karty. */
export async function getPokemonPrints(opts: { name?: string; id?: string }): Promise<ScryfallCard[]> {
  if (!index) return [];
  const name = opts.name || (opts.id ? index.byId.get(opts.id)?.name : '') || '';
  if (!name) return [];
  const key = normalizeText(name);
  return withStoredDetails(index.cards.filter((c) => normalizeText(c.name) === key).slice(0, MAX_PRINTS));
}
