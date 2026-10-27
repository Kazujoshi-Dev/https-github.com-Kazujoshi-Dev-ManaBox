/**
 * Zapasowe ceny kart Pokémon z Pokémon TCG API (https://pokemontcg.io), gdy TCGdex nie ma żadnej ceny
 * danej karty (zdarza się to głównie przy starszych dodatkach i promkach).
 *
 * - Ceny pobieramy całymi dodatkami (jedno zapytanie na 250 kart), więc nawet bez klucza API
 *   (limit 30 zapytań na minutę, 1000 na dobę) wystarcza to z zapasem; klucz z POKEMONTCG_API_KEY
 *   podnosi limit do 20 000 zapytań na dobę.
 * - Dodatek TCGdex łączymy z dodatkiem pokemontcg.io po identyfikatorze (np. xy8, sv03 → sv3),
 *   a gdy to nie wystarczy, po nazwie i dacie premiery. Kartę w dodatku po numerze.
 * - Ceny dodatku trzymamy w tabeli pokemon_fallback_sets i odświeżamy raz na dobę, przy pierwszym użyciu.
 */
import { getPool, isPostgresActive } from '../db/storage';
import { APP_USER_AGENT } from '../userAgent';
import { normalizeText } from '../cardText';

const API_BASE = (process.env.POKEMONTCG_API_URL || 'https://api.pokemontcg.io/v2').replace(/\/+$/, '');
const API_KEY = (process.env.POKEMONTCG_API_KEY || '').trim();
const REQUEST_GAP_MS = API_KEY ? 250 : 2100; // bez klucza: 30 zapytań na minutę
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
const PAGE_SIZE = 250;

export interface FallbackPrice {
  eur: string | null;
  eur_foil: string | null;
  usd: string | null;
  usd_foil: string | null;
}

interface PtcgSet {
  id: string;
  name: string;
  releaseDate?: string; // RRRR/MM/DD
}

interface SetPrices {
  ptcgSetId: string | null;
  byNumber: Map<string, FallbackPrice>;
  fetchedAt: number;
}

const pool = () => (isPostgresActive() ? getPool() : null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const memory = new Map<string, SetPrices>(); // id dodatku TCGdex → ceny
const loading = new Map<string, Promise<SetPrices | null>>();
const failedAt = new Map<string, number>();
let ptcgSets: { list: PtcgSet[]; fetchedAt: number } | null = null;
let schemaReady = false;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function ptcgGet<T>(path: string): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'User-Agent': APP_USER_AGENT,
        Accept: 'application/json',
        ...(API_KEY ? { 'X-Api-Key': API_KEY } : {})
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (!res.ok) throw new Error(`pokemontcg.io ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  });
  queue = run.catch(() => undefined);
  return run;
}

function price(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

const first = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    const p = price(v);
    if (p) return p;
  }
  return null;
};

/** Numer karty do porównań: małe litery, bez zer wiodących („062” = „62”). */
export const normNumber = (n: unknown): string => String(n ?? '').trim().toLowerCase().replace(/^0+(?=\d)/, '');
/** Identyfikator dodatku do porównań: „sv03” = „sv3”, „swsh3” bez zmian. */
const normSetId = (id: string): string => id.toLowerCase().replace(/(\D)0+(?=\d)/g, '$1');

async function ensureSchema() {
  const p = pool();
  if (!p || schemaReady) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS pokemon_fallback_sets (
      set_id VARCHAR(32) PRIMARY KEY,
      ptcg_set_id VARCHAR(32),
      prices JSONB NOT NULL DEFAULT '{}',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  schemaReady = true;
}

async function getPtcgSets(): Promise<PtcgSet[]> {
  if (ptcgSets && Date.now() - ptcgSets.fetchedAt < MAX_AGE_MS) return ptcgSets.list;
  const res = await ptcgGet<{ data?: PtcgSet[] }>(`/sets?pageSize=${PAGE_SIZE}&select=id,name,releaseDate`);
  const list = Array.isArray(res?.data) ? res.data : [];
  if (list.length) ptcgSets = { list, fetchedAt: Date.now() };
  return list;
}

function matchSet(list: PtcgSet[], tcgdexId: string, name: string, releaseDate: string | null): PtcgSet | null {
  const byId = list.find((s) => normSetId(s.id) === normSetId(tcgdexId));
  if (byId && (!name || normalizeText(byId.name) === normalizeText(name))) return byId;
  const sameName = list.filter((s) => normalizeText(s.name) === normalizeText(name));
  if (sameName.length === 1) return sameName[0];
  if (sameName.length > 1 && releaseDate) {
    const day = (d?: string) => (d ? new Date(d.replace(/\//g, '-')).getTime() : NaN);
    const target = day(releaseDate);
    return [...sameName].sort((a, b) => Math.abs(day(a.releaseDate) - target) - Math.abs(day(b.releaseDate) - target))[0];
  }
  return byId || null;
}

function toPrice(card: any): FallbackPrice {
  const cm = card?.cardmarket?.prices || {};
  const tp = card?.tcgplayer?.prices || {};
  const market = (k: string) => tp?.[k]?.market ?? tp?.[k]?.mid;
  return {
    eur: first(cm.trendPrice, cm.averageSellPrice, cm.avg7, cm.avg30),
    eur_foil: first(cm.reverseHoloTrend, cm.reverseHoloSell, cm.reverseHoloAvg7, cm.reverseHoloAvg30),
    usd: first(market('normal'), market('holofoil'), market('unlimitedHolofoil'), market('1stEditionHolofoil'), market('1stEditionNormal')),
    usd_foil: first(market('reverseHolofoil'))
  };
}

async function loadFromDb(setId: string): Promise<SetPrices | null> {
  const p = pool();
  if (!p) return null;
  await ensureSchema();
  const res = await p.query('SELECT ptcg_set_id, prices, fetched_at FROM pokemon_fallback_sets WHERE set_id = $1', [setId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    ptcgSetId: r.ptcg_set_id || null,
    byNumber: new Map(Object.entries((r.prices || {}) as Record<string, FallbackPrice>)),
    fetchedAt: new Date(r.fetched_at).getTime()
  };
}

async function fetchSet(setId: string, name: string, releaseDate: string | null): Promise<SetPrices> {
  const sets = await getPtcgSets();
  const match = matchSet(sets, setId, name, releaseDate);
  const byNumber = new Map<string, FallbackPrice>();
  if (match) {
    for (let page = 1; page <= 4; page++) {
      const res = await ptcgGet<{ data?: any[]; totalCount?: number }>(
        `/cards?q=${encodeURIComponent(`set.id:${match.id}`)}&page=${page}&pageSize=${PAGE_SIZE}&select=number,cardmarket,tcgplayer`
      );
      const data = Array.isArray(res?.data) ? res.data : [];
      for (const c of data) {
        const p = toPrice(c);
        if (p.eur || p.eur_foil || p.usd || p.usd_foil) byNumber.set(normNumber(c.number), p);
      }
      if (data.length < PAGE_SIZE || page * PAGE_SIZE >= (res.totalCount || 0)) break;
    }
  }
  const result: SetPrices = { ptcgSetId: match?.id || null, byNumber, fetchedAt: Date.now() };
  const p = pool();
  if (p) {
    await ensureSchema();
    await p.query(
      `INSERT INTO pokemon_fallback_sets (set_id, ptcg_set_id, prices, fetched_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (set_id) DO UPDATE SET ptcg_set_id = EXCLUDED.ptcg_set_id, prices = EXCLUDED.prices, fetched_at = NOW()`,
      [setId, result.ptcgSetId, JSON.stringify(Object.fromEntries(byNumber))]
    );
  }
  if (match) console.log(`[Pokémon] Ceny zapasowe dodatku ${setId} (pokemontcg.io ${match.id}): ${byNumber.size} kart`);
  return result;
}

/** Ceny dodatku z pamięci lub bazy; gdy ich brak albo są starsze niż doba, pobiera je z pokemontcg.io. */
async function getSetPrices(setId: string, name: string, releaseDate: string | null, allowFetch: boolean): Promise<SetPrices | null> {
  const key = setId.toLowerCase();
  let cur = memory.get(key) || null;
  if (!cur) {
    cur = await loadFromDb(key).catch(() => null);
    if (cur) memory.set(key, cur);
  }
  if (cur && Date.now() - cur.fetchedAt < MAX_AGE_MS) return cur;
  if (!allowFetch || Date.now() - (failedAt.get(key) || 0) < RETRY_AFTER_FAILURE_MS) return cur;

  let job = loading.get(key);
  if (!job) {
    job = fetchSet(key, name, releaseDate)
      .then((r) => {
        memory.set(key, r);
        return r;
      })
      .catch((err) => {
        failedAt.set(key, Date.now());
        console.warn(`[Pokémon] Ceny zapasowe dodatku ${key} nieudane:`, err?.message || err);
        return null;
      })
      .finally(() => loading.delete(key));
    loading.set(key, job);
  }
  return (await job) || cur;
}

export interface FallbackTarget {
  set: string;
  set_name: string;
  released_at?: string;
  collector_number: string;
}

/**
 * Zapasowe ceny dla kart bez żadnej ceny z TCGdex. Z `allowFetch = false` korzysta tylko z danych
 * już zapisanych (np. przy wyszukiwaniu), bez zapytań do pokemontcg.io.
 */
export async function lookupFallbackPrices<T extends FallbackTarget>(cards: T[], allowFetch: boolean): Promise<Map<T, FallbackPrice>> {
  const out = new Map<T, FallbackPrice>();
  const bySet = new Map<string, T[]>();
  for (const c of cards) {
    if (!c.set) continue;
    const list = bySet.get(c.set) || [];
    list.push(c);
    bySet.set(c.set, list);
  }
  for (const [setId, list] of bySet) {
    const sp = await getSetPrices(setId, list[0].set_name, list[0].released_at || null, allowFetch).catch(() => null);
    if (!sp) continue;
    for (const c of list) {
      const p = sp.byNumber.get(normNumber(c.collector_number));
      if (p) out.set(c, p);
    }
  }
  return out;
}

export const hasFallbackKey = () => Boolean(API_KEY);
