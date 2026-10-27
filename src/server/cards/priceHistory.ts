/**
 * Historia cen kart (Cardmarket Trend, EUR) i „alerty cenowe”: karty, które w ostatnich dniach
 * najmocniej zdrożały lub potaniały w danym formacie.
 *
 * - Źródło bieżących cen: lokalna baza Scryfall (ceny `eur` i `eur_foil` to Cardmarket Trend).
 *   Po każdej dobowej synchronizacji zapisujemy migawkę cen angielskich, papierowych wydań.
 * - Start z historią: jednorazowy import ostatnich ~90 dni z MTGJSON (AllPrices + AllIdentifiers
 *   do zamiany identyfikatorów MTGJSON na Scryfall). Pliki czytamy strumieniowo, bez zapisu na dysk.
 * - Zapis: jeden wiersz na wydanie karty z tablicami cen dziennych (indeks = dzień od start_day),
 *   więc 100 dni historii dla dziesiątek tysięcy kart zajmuje kilkadziesiąt MB.
 * - Obliczenia robimy w pamięci; wynik dla danego zestawu filtrów jest buforowany do następnej migawki.
 *
 * Bez PostgreSQL moduł jest nieaktywny.
 */
import type pg from 'pg';
import { getPool, isPostgresActive } from '../db/storage';
import { iterateDataEntries } from './bulkParser';
import { decodeStream } from './cardStore';
import { APP_USER_AGENT } from '../userAgent';

/** Formaty w zakładce „Alerty cenowe” (klucze `legalities` w danych Scryfall). */
export const PRICE_ALERT_FORMATS = [
  'standard',
  'pioneer',
  'modern',
  'pauper',
  'legacy',
  'vintage',
  'commander',
  'historic',
  'brawl',
  'premodern'
] as const;
export type PriceAlertFormat = (typeof PRICE_ALERT_FORMATS)[number];

const KEEP_DAYS = 100; // ile dni historii trzymamy
const MIN_STORE_EUR = 0.1; // tańszych kart (bez historii) nie zapisujemy
const DAY_TOLERANCE = 2; // brak notowania w danym dniu: bierzemy najbliższe wcześniejsze (do 2 dni)
const MIN_ABS_CHANGE_EUR = 0.2; // zmiany o kilka centów to szum
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const BOOTSTRAP_RETRY_MS = 12 * 60 * 60 * 1000;
const FLUSH_BATCH = 1000;
const MTGJSON_BASE = (process.env.MTGJSON_BASE_URL || 'https://mtgjson.com/api/v5').replace(/\/+$/, '');
const BOOTSTRAP_ENABLED = process.env.PRICE_HISTORY_BOOTSTRAP !== '0';

interface Series {
  start: number; // dzień (liczba dni od 1970-01-01) odpowiadający indeksowi 0
  eur: (number | null)[];
  foil: (number | null)[];
}

interface CardInfo {
  oracle: string;
  formats: number; // maska bitowa PRICE_ALERT_FORMATS
}

const store = new Map<string, Series>();
const dirty = new Set<string>();
let info = new Map<string, CardInfo>();
let lastDay = -1; // dzień ostatniego notowania
let storeVersion = 0; // zmienia się przy każdej aktualizacji danych (unieważnia bufor wyników)
let busy = false;
let bootstrapping = false;
let lastError: string | null = null;
const resultCache = new Map<string, { version: number; value: PriceMoversResult }>();

function pool(): pg.Pool | null {
  return isPostgresActive() ? getPool() : null;
}

const DAY_MS = 86_400_000;
export function dayFromYmd(ymd: string): number {
  const t = Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : -1;
}
export function ymdFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parsePrice(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

/** Ustawia cenę w danym dniu (rozszerza serię w razie potrzeby). `keepExisting` nie nadpisuje zapisanej wartości. */
export function setSeriesValue(s: Series, day: number, kind: 'eur' | 'foil', value: number | null, keepExisting = false): boolean {
  if (value === null) return false;
  if (s.eur.length === 0 && s.foil.length === 0) s.start = day;
  if (day < s.start) {
    const pad = new Array(s.start - day).fill(null);
    s.eur = pad.concat(s.eur);
    s.foil = pad.concat(s.foil);
    s.start = day;
  }
  const idx = day - s.start;
  const arr = kind === 'eur' ? s.eur : s.foil;
  while (arr.length <= idx) arr.push(null);
  if (keepExisting && arr[idx] != null) return false;
  if (arr[idx] === value) return false;
  arr[idx] = value;
  return true;
}

/** Usuwa dni starsze niż `minDay`. */
function trimSeries(s: Series, minDay: number): boolean {
  if (s.start >= minDay) return false;
  const k = minDay - s.start;
  s.eur = s.eur.slice(k);
  s.foil = s.foil.slice(k);
  s.start = minDay;
  return true;
}

/** Cena w dniu `day` albo najbliższa wcześniejsza (do DAY_TOLERANCE dni wstecz). */
export function valueAt(arr: (number | null)[], start: number, day: number, tolerance = DAY_TOLERANCE): number | null {
  for (let d = day; d >= day - tolerance; d--) {
    const v = arr[d - start];
    if (v != null && v > 0) return v;
  }
  return null;
}

/**
 * Cena na początku okresu: w dniu `day` lub najbliższa wcześniejsza, a gdy historia zaczyna się
 * odrobinę później (np. MTGJSON daje 89 pełnych dni zamiast 90), najbliższa późniejsza (do DAY_TOLERANCE dni).
 */
export function valueAtStart(arr: (number | null)[], start: number, day: number, tolerance = DAY_TOLERANCE): number | null {
  const before = valueAt(arr, start, day, tolerance);
  if (before != null) return before;
  for (let d = day + 1; d <= day + tolerance; d++) {
    const v = arr[d - start];
    if (v != null && v > 0) return v;
  }
  return null;
}

function pgArray(arr: (number | null)[]): string {
  return `{${arr.map((v) => (v == null ? 'NULL' : String(v))).join(',')}}`;
}

async function getMeta(p: pg.Pool, key: string): Promise<string | null> {
  const r = await p.query('SELECT value FROM scryfall_sync WHERE key = $1', [key]);
  return r.rows[0]?.value ?? null;
}

async function setMeta(p: pg.Pool, key: string, value: string): Promise<void> {
  await p.query(
    `INSERT INTO scryfall_sync (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

/**
 * Pula połączeń ma krótki limit czasu zapytania (kilka sekund), a tabele kart mają ~100 tys. wierszy.
 * Duże odczyty robimy więc porcjami po kluczu głównym, każdą z własnym, dłuższym limitem.
 */
const SCAN_BATCH = 5000;
const SCAN_TIMEOUT_MS = 60_000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function* scanRows(p: pg.Pool, table: string, key: string, columns: string, where = 'TRUE'): AsyncGenerator<any[]> {
  let last = ZERO_UUID;
  while (true) {
    const res = await p.query({
      text: `SELECT ${key}::text AS id, ${columns} FROM ${table} WHERE ${where} AND ${key} > $1::uuid ORDER BY ${key} LIMIT ${SCAN_BATCH}`,
      values: [last],
      query_timeout: SCAN_TIMEOUT_MS
    } as any);
    if (!res.rows.length) return;
    yield res.rows;
    if (res.rows.length < SCAN_BATCH) return;
    last = res.rows[res.rows.length - 1].id;
  }
}

/** Wydania angielskie, papierowe z lokalnej bazy Scryfall (porcjami). */
const scanCards = (p: pg.Pool, columns: string) => scanRows(p, 'scryfall_cards', 'id', columns, `lang = 'en' AND NOT digital`);

async function ensureSchema(p: pg.Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS card_price_history (
      card_id UUID PRIMARY KEY,
      start_day DATE NOT NULL,
      eur REAL[] NOT NULL DEFAULT '{}',
      eur_foil REAL[] NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function loadStore(p: pg.Pool): Promise<void> {
  store.clear();
  for await (const rows of scanRows(p, 'card_price_history', 'card_id', `(start_day - DATE '1970-01-01') AS start, eur, eur_foil`)) {
    for (const r of rows) {
      store.set(r.id, {
        start: Number(r.start),
        eur: (r.eur || []).map((v: any) => (v == null ? null : round2(Number(v)))),
        foil: (r.eur_foil || []).map((v: any) => (v == null ? null : round2(Number(v))))
      });
    }
  }
  const saved = await getMeta(p, 'price_history_last_day');
  lastDay = saved ? dayFromYmd(saved) : -1;
  storeVersion++;
}

/** Zapisuje zmienione serie do bazy. */
async function flush(p: pg.Pool): Promise<void> {
  const ids = [...dirty];
  dirty.clear();
  for (let i = 0; i < ids.length; i += FLUSH_BATCH) {
    const part = ids.slice(i, i + FLUSH_BATCH);
    const cols: [string[], string[], string[], string[]] = [[], [], [], []];
    const removed: string[] = [];
    for (const id of part) {
      const s = store.get(id);
      if (!s || (s.eur.every((v) => v == null) && s.foil.every((v) => v == null))) {
        removed.push(id);
        continue;
      }
      cols[0].push(id);
      cols[1].push(ymdFromDay(s.start));
      cols[2].push(pgArray(s.eur));
      cols[3].push(pgArray(s.foil));
    }
    if (cols[0].length) {
      await p.query({
        text: `INSERT INTO card_price_history (card_id, start_day, eur, eur_foil, updated_at)
         SELECT u.id::uuid, u.sd::date, u.e::real[], u.f::real[], NOW()
         FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[]) AS u(id, sd, e, f)
         ON CONFLICT (card_id) DO UPDATE SET
           start_day = EXCLUDED.start_day, eur = EXCLUDED.eur, eur_foil = EXCLUDED.eur_foil, updated_at = NOW()`,
        values: cols,
        query_timeout: SCAN_TIMEOUT_MS
      } as any);
    }
    if (removed.length) {
      await p.query('DELETE FROM card_price_history WHERE card_id = ANY($1::uuid[])', [removed]);
      for (const id of removed) store.delete(id);
    }
  }
}

/** Formaty i oracle_id kart z historią (z lokalnej bazy Scryfall). */
async function loadCardInfo(p: pg.Pool): Promise<void> {
  const next = new Map<string, CardInfo>();
  for await (const rows of scanCards(p, `COALESCE(oracle_id::text, id::text) AS oracle, data->'legalities' AS leg`)) {
    for (const r of rows) {
      if (!store.has(r.id)) continue;
      let mask = 0;
      const leg = r.leg || {};
      PRICE_ALERT_FORMATS.forEach((f, i) => {
        if (leg[f] === 'legal' || leg[f] === 'restricted') mask |= 1 << i;
      });
      if (mask) next.set(r.id, { oracle: r.oracle, formats: mask });
    }
  }
  info = next;
  storeVersion++;
}

/** Migawka bieżących cen z lokalnej bazy Scryfall dla dnia `day`. */
async function snapshot(p: pg.Pool, day: number): Promise<number> {
  const rowsAll: any[] = [];
  for await (const rows of scanCards(p, `data->'prices'->>'eur' AS eur, data->'prices'->>'eur_foil' AS foil`)) rowsAll.push(...rows);
  let changed = 0;
  for (const r of rowsAll) {
    const eur = parsePrice(r.eur);
    const foil = parsePrice(r.foil);
    if (eur === null && foil === null) continue;
    let s = store.get(r.id);
    if (!s) {
      if (Math.max(eur || 0, foil || 0) < MIN_STORE_EUR) continue;
      s = { start: day, eur: [], foil: [] };
      store.set(r.id, s);
    }
    const a = setSeriesValue(s, day, 'eur', eur);
    const b = setSeriesValue(s, day, 'foil', foil);
    if (a || b) {
      dirty.add(r.id);
      changed++;
    }
  }
  const minDay = day - KEEP_DAYS + 1;
  for (const [id, s] of store) if (trimSeries(s, minDay)) dirty.add(id);
  if (day > lastDay) lastDay = day;
  await flush(p);
  await setMeta(p, 'price_history_last_day', ymdFromDay(lastDay));
  storeVersion++;
  return changed;
}

/** Dzień, którego dotyczą ceny w lokalnej bazie Scryfall (data publikacji danych zbiorczych). */
async function scryfallDataDay(p: pg.Pool): Promise<number> {
  const version = await getMeta(p, 'default_cards_version');
  return version ? dayFromYmd(version) : -1;
}

async function fetchStream(url: string): Promise<AsyncGenerator<string>> {
  const res = await fetch(url, { headers: { 'User-Agent': APP_USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  return decodeStream(res.body as any);
}

/**
 * Jednorazowy import ~90 dni cen Cardmarket z MTGJSON.
 * Nie nadpisuje notowań z własnych migawek.
 */
export async function bootstrapFromMtgjson(p: pg.Pool, base = MTGJSON_BASE): Promise<{ cards: number; days: number }> {
  const started = Date.now();
  // Wydania, które mamy w lokalnej bazie (angielskie, papierowe)
  const ours = new Set<string>();
  for await (const rows of scanCards(p, '1 AS x')) for (const r of rows) ours.add(r.id);
  if (ours.size < 1000) throw new Error('lokalna baza kart jest jeszcze pusta');

  // 1) uuid MTGJSON → id Scryfall
  console.log('[Ceny] Import historii: pobieram identyfikatory MTGJSON...');
  const uuidToScryfall = new Map<string, string>();
  for await (const [uuid, card] of iterateDataEntries(await fetchStream(`${base}/AllIdentifiers.json.gz`))) {
    const sid = card?.identifiers?.scryfallId;
    if (typeof sid === 'string' && ours.has(sid)) uuidToScryfall.set(uuid, sid);
  }
  if (uuidToScryfall.size < 1000) throw new Error(`za mało dopasowanych kart (${uuidToScryfall.size})`);
  console.log(`[Ceny] Import historii: dopasowano ${uuidToScryfall.size} kart, pobieram ceny MTGJSON...`);

  // 2) ceny Cardmarket z ostatnich dni
  const today = Math.floor(Date.now() / DAY_MS);
  const minDay = today - KEEP_DAYS + 1;
  const seen = new Set<string>();
  let maxDay = -1;
  let minSeen = Infinity;
  for await (const [uuid, prices] of iterateDataEntries(await fetchStream(`${base}/AllPrices.json.gz`), (k) => uuidToScryfall.has(k))) {
    const sid = uuidToScryfall.get(uuid)!;
    if (seen.has(sid)) continue; // druga strona karty dwustronnej ma te same ceny
    const retail = prices?.paper?.cardmarket?.retail;
    if (!retail) continue;
    const normal = retail.normal || {};
    const foil = retail.foil || {};
    let best = 0;
    for (const v of Object.values(normal)) best = Math.max(best, Number(v) || 0);
    for (const v of Object.values(foil)) best = Math.max(best, Number(v) || 0);
    let s = store.get(sid);
    if (!s) {
      if (best < MIN_STORE_EUR) continue;
      s = { start: today, eur: [], foil: [] };
    }
    let changed = false;
    for (const [kind, series] of [['eur', normal], ['foil', foil]] as const) {
      for (const [ymd, v] of Object.entries(series)) {
        const day = dayFromYmd(ymd);
        if (day < minDay || day > today) continue;
        if (setSeriesValue(s, day, kind, parsePrice(v), true)) {
          changed = true;
          if (day > maxDay) maxDay = day;
          if (day < minSeen) minSeen = day;
        }
      }
    }
    if (changed) {
      store.set(sid, s);
      dirty.add(sid);
      seen.add(sid);
    }
  }
  if (maxDay > lastDay) lastDay = maxDay;
  await flush(p);
  if (lastDay >= 0) await setMeta(p, 'price_history_last_day', ymdFromDay(lastDay));
  storeVersion++;
  const days = maxDay >= 0 ? maxDay - (minSeen as number) + 1 : 0;
  console.log(`[Ceny] Import historii zakończony: ${seen.size} kart, ${days} dni, ${Math.round((Date.now() - started) / 1000)} s.`);
  return { cards: seen.size, days };
}

async function maybeBootstrap(p: pg.Pool): Promise<void> {
  if (!BOOTSTRAP_ENABLED || bootstrapping) return;
  if (await getMeta(p, 'price_history_bootstrap')) return;
  // historia jest już w bazie (np. import się udał, a nie zapisał się tylko znacznik): nie pobieramy jej drugi raz
  if (store.size > 1000 && coverageDays() >= 60) {
    await setMeta(p, 'price_history_bootstrap', JSON.stringify({ at: new Date().toISOString(), cards: store.size, days: coverageDays(), reused: true }));
    return;
  }
  const lastAttempt = await getMeta(p, 'price_history_bootstrap_attempt');
  if (lastAttempt && Date.now() - new Date(lastAttempt).getTime() < BOOTSTRAP_RETRY_MS) return;
  bootstrapping = true;
  await setMeta(p, 'price_history_bootstrap_attempt', new Date().toISOString());
  try {
    const r = await bootstrapFromMtgjson(p);
    await setMeta(p, 'price_history_bootstrap', JSON.stringify({ at: new Date().toISOString(), ...r }));
    await loadCardInfo(p);
  } catch (err: any) {
    lastError = err?.message || String(err);
    console.warn('[Ceny] Import historii z MTGJSON nieudany (ponowimy później):', lastError);
  } finally {
    bootstrapping = false;
  }
}

/** Sprawdza, czy są nowe ceny do zapisania, a przy pierwszym uruchomieniu importuje historię. */
export async function refreshPriceHistory(): Promise<void> {
  const p = pool();
  if (!p || busy) return;
  busy = true;
  try {
    const day = await scryfallDataDay(p);
    if (day >= 0 && day > lastDay) {
      const changed = await snapshot(p, day);
      await loadCardInfo(p);
      console.log(`[Ceny] Migawka cen z ${ymdFromDay(day)}: zmieniono ${changed} kart, w historii ${store.size}.`);
    } else if (info.size === 0 && store.size > 0) {
      await loadCardInfo(p);
    }
    lastError = null;
  } catch (err: any) {
    lastError = err?.message || String(err);
    console.warn('[Ceny] Błąd zapisu historii cen:', lastError);
  } finally {
    busy = false;
  }
  // import po migawce: lokalna baza kart musi już istnieć
  maybeBootstrap(p).catch(() => {});
}

/** Uruchamia moduł: schemat, wczytanie historii, migawki co godzinę (gdy Scryfall ma nowe dane). */
export async function startPriceHistory(): Promise<void> {
  const p = pool();
  if (!p) return;
  await ensureSchema(p);
  await loadStore(p);
  // formaty kart od razu (przy pierwszym wdrożeniu tabeli kart może jeszcze nie być: dociągnie je migawka)
  if (store.size) await loadCardInfo(p).catch(() => {});
  console.log(`[Ceny] Historia cen w pamięci: ${store.size} kart, ostatnie notowanie ${lastDay >= 0 ? ymdFromDay(lastDay) : 'brak'}.`);
  setTimeout(() => refreshPriceHistory().catch(() => {}), 30_000).unref?.();
  setInterval(() => refreshPriceHistory().catch(() => {}), CHECK_INTERVAL_MS).unref?.();
}

export function priceHistoryStatus() {
  return {
    cards: store.size,
    withFormats: info.size,
    lastDay: lastDay >= 0 ? ymdFromDay(lastDay) : null,
    bootstrapping,
    lastError
  };
}

// ---------- Wzrosty i spadki ----------

export interface PriceMover {
  id: string;
  /** Cena na początku okresu i teraz (EUR, Cardmarket Trend). */
  from: number;
  to: number;
  /** Zmiana w procentach. */
  pct: number;
  /** Notowania z okresu (najwyżej 31 punktów), braki uzupełnione poprzednią wartością. */
  series: number[];
}

export interface PriceMoversResult {
  ready: boolean;
  /** Dzień ostatniego notowania (RRRR-MM-DD). */
  day: string | null;
  /** Ile dni historii jest dostępne. */
  coverageDays: number;
  gainers: PriceMover[];
  losers: PriceMover[];
}

export interface PriceMoversQuery {
  format: PriceAlertFormat;
  days: number;
  foil: boolean;
  /** Minimalna cena (EUR) na początku lub na końcu okresu. */
  minEur: number;
  /** Minimalna zmiana w procentach. */
  minPct: number;
  limit?: number;
}

function coverageDays(): number {
  if (lastDay < 0 || store.size === 0) return 0;
  let minStart = Infinity;
  for (const s of store.values()) if (s.start < minStart) minStart = s.start;
  return Math.max(0, lastDay - (minStart as number));
}

function seriesFor(arr: (number | null)[], start: number, from: number, to: number): number[] {
  const step = Math.max(1, Math.ceil((to - from) / 30));
  const out: number[] = [];
  let last: number | null = null;
  for (let d = from - DAY_TOLERANCE; d < from; d++) {
    const v = arr[d - start];
    if (v != null) last = v;
  }
  for (let d = from; d <= to; d++) {
    const v = arr[d - start];
    if (v != null) last = v;
    if ((d - from) % step === 0 || d === to) out.push(last ?? 0);
  }
  return out;
}

/** Karty z największym wzrostem i spadkiem ceny w podanym formacie i okresie. */
export function getPriceMovers(q: PriceMoversQuery): PriceMoversResult {
  const limit = Math.min(Math.max(q.limit || 40, 1), 100);
  const key = `${q.format}|${q.days}|${q.foil ? 1 : 0}|${q.minEur}|${q.minPct}|${limit}`;
  const cached = resultCache.get(key);
  if (cached && cached.version === storeVersion) return cached.value;

  const empty: PriceMoversResult = { ready: false, day: lastDay >= 0 ? ymdFromDay(lastDay) : null, coverageDays: coverageDays(), gainers: [], losers: [] };
  const bit = PRICE_ALERT_FORMATS.indexOf(q.format);
  if (bit < 0 || lastDay < 0 || info.size === 0) return empty;

  const fromDay = lastDay - q.days;
  const bestUp = new Map<string, PriceMover>();
  const bestDown = new Map<string, PriceMover>();
  for (const [id, ci] of info) {
    if (!(ci.formats & (1 << bit))) continue;
    const s = store.get(id);
    if (!s) continue;
    const arr = q.foil ? s.foil : s.eur;
    const to = valueAt(arr, s.start, lastDay);
    const from = valueAtStart(arr, s.start, fromDay);
    if (to == null || from == null) continue;
    if (Math.max(from, to) < q.minEur) continue;
    const diff = to - from;
    if (Math.abs(diff) < MIN_ABS_CHANGE_EUR) continue;
    const pct = (diff / from) * 100;
    if (Math.abs(pct) < q.minPct) continue;
    const target = pct > 0 ? bestUp : bestDown;
    const prev = target.get(ci.oracle);
    // jedno wydanie na kartę: to z największą zmianą
    if (prev && Math.abs(prev.pct) >= Math.abs(pct)) continue;
    target.set(ci.oracle, { id, from, to, pct: Math.round(pct * 10) / 10, series: [] });
  }

  const finish = (m: Map<string, PriceMover>, dir: 1 | -1) =>
    [...m.values()]
      .sort((a, b) => dir * (b.pct - a.pct) || dir * (b.to - b.from - (a.to - a.from)))
      .slice(0, limit)
      .map((x) => {
        const s = store.get(x.id)!;
        return { ...x, series: seriesFor(q.foil ? s.foil : s.eur, s.start, fromDay, lastDay) };
      });

  const value: PriceMoversResult = {
    ready: true,
    day: ymdFromDay(lastDay),
    coverageDays: coverageDays(),
    gainers: finish(bestUp, 1),
    losers: finish(bestDown, -1)
  };
  if (resultCache.size > 300) resultCache.clear();
  resultCache.set(key, { version: storeVersion, value });
  return value;
}

/** Tylko do testów: stan modułu w pamięci. */
export const __test = {
  store,
  setInfo: (m: Map<string, CardInfo>) => {
    info = m;
    storeVersion++;
  },
  setLastDay: (d: number) => {
    lastDay = d;
    storeVersion++;
  }
};
