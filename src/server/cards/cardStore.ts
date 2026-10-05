/**
 * Lokalna baza kart Magic: The Gathering (dane zbiorcze Scryfall "default_cards").
 *
 * - Pełne obiekty kart trzymamy w PostgreSQL (tabela scryfall_cards).
 * - W pamięci trzymamy lekki indeks: set+numer → karta, nazwa → wydania.
 * - Synchronizacja z Scryfall raz na dobę, w tle; skaner nie odpytuje API Scryfall.
 *
 * Bez PostgreSQL moduł jest nieaktywny, a skaner korzysta z API Scryfall jak dotąd.
 */
import type pg from 'pg';
import { getPool, isPostgresActive } from '../db/storage';
import { iterateJsonArrayObjects } from './bulkParser';
import { NameIndex, normalizeName } from './nameMatch';
import { buildMissingHashes, ensureHashSchema, hashIndexStatus, loadHashIndex } from './hashIndex';

const SCRYFALL_HEADERS = {
  'User-Agent': 'ManaScrew/1.0 (https://manascrew.eu)',
  Accept: 'application/json'
};
// Adres można nadpisać (np. w testach), domyślnie oficjalne API Scryfall.
const BULK_META_URL = process.env.SCRYFALL_BULK_META_URL || 'https://api.scryfall.com/bulk-data/default-cards';
const ALL_CARDS_META_URL = process.env.SCRYFALL_ALL_CARDS_META_URL || 'https://api.scryfall.com/bulk-data/all-cards';
/**
 * Dodatkowe wersje językowe (kody Scryfall, np. "ja,de"). Plik default_cards ma tylko wydania
 * angielskie, więc te języki dobieramy z pełnego pliku all_cards (strumieniowo, bez zapisu na dysk).
 * Pusta wartość wyłącza pobieranie.
 */
export const EXTRA_LANGS = (process.env.CARD_EXTRA_LANGS ?? 'ja')
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter((x) => /^[a-z]{2,3}$/.test(x) && x !== 'en');
const SYNC_INTERVAL_MS = 20 * 60 * 60 * 1000; // nie częściej niż co 20 h
const BATCH_SIZE = 400;

interface IndexEntry {
  id: string;
  set: string;
  cn: string;
  released: string; // YYYY-MM-DD, do sortowania wydań
}

interface CardIndex {
  entries: IndexEntry[];
  nameById: Map<string, string>; // id wydania → znormalizowana główna nazwa
  bySetNumber: Map<string, number>;
  byName: Map<string, number[]>; // znormalizowana nazwa → indeksy wydań (najnowsze pierwsze)
  names: NameIndex;
}

let index: CardIndex | null = null;
let syncing = false;
let lastSyncAt: string | null = null;
let lastSyncError: string | null = null;

function pool(): pg.Pool | null {
  return isPostgresActive() ? getPool() : null;
}

export function isCardDbReady(): boolean {
  return index !== null && index.entries.length > 0;
}

export function cardDbStatus() {
  return {
    ready: isCardDbReady(),
    cards: index?.entries.length || 0,
    names: index?.names.size || 0,
    syncing,
    lastSyncAt,
    lastSyncError,
    images: hashIndexStatus()
  };
}

export async function ensureCardSchema(): Promise<void> {
  const p = pool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS scryfall_cards (
      id UUID PRIMARY KEY,
      oracle_id UUID,
      name TEXT NOT NULL,
      face_names TEXT[] NOT NULL DEFAULT '{}',
      lang VARCHAR(8) NOT NULL,
      set_code VARCHAR(12) NOT NULL,
      collector_number VARCHAR(24) NOT NULL,
      released_at DATE,
      layout VARCHAR(32),
      image_small TEXT,
      art_hash BYTEA,
      card_hash BYTEA,
      hash_version SMALLINT,
      data JSONB NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scryfall_cards_set_cn ON scryfall_cards(set_code, collector_number);
    CREATE INDEX IF NOT EXISTS idx_scryfall_cards_lname ON scryfall_cards (LOWER(name));
    CREATE INDEX IF NOT EXISTS idx_scryfall_cards_lface ON scryfall_cards (LOWER(face_names[1]));
    CREATE TABLE IF NOT EXISTS scryfall_sync (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
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

/** Karta nadaje się do skanowania: fizyczna (nie tylko cyfrowa) i ma obraz. */
function isScannable(card: any): boolean {
  if (!card || card.object !== 'card' || card.digital) return false;
  if (!card.id || !card.set || !card.collector_number || !card.name) return false;
  if (card.layout === 'art_series') return false;
  return true;
}

function faceNames(card: any): string[] {
  const names = new Set<string>([card.name]);
  if (Array.isArray(card.card_faces)) {
    for (const f of card.card_faces) if (f?.name) names.add(f.name);
  }
  if (card.printed_name) names.add(card.printed_name);
  if (card.flavor_name) names.add(card.flavor_name);
  return [...names];
}

function smallImage(card: any): string | null {
  return card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null;
}

async function upsertBatch(p: pg.Pool, cards: any[], syncStart: string): Promise<void> {
  const values: any[] = [];
  const rows: string[] = [];
  cards.forEach((c, i) => {
    const b = i * 12;
    rows.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11}::jsonb,$${b + 12})`);
    values.push(
      c.id,
      c.oracle_id || null,
      c.name,
      faceNames(c),
      c.lang || 'en',
      String(c.set).toLowerCase(),
      String(c.collector_number),
      c.released_at || null,
      c.layout || null,
      smallImage(c),
      JSON.stringify(c),
      syncStart
    );
  });
  await p.query(
    `INSERT INTO scryfall_cards
       (id, oracle_id, name, face_names, lang, set_code, collector_number, released_at, layout, image_small, data, synced_at)
     VALUES ${rows.join(',')}
     ON CONFLICT (id) DO UPDATE SET
       oracle_id = EXCLUDED.oracle_id,
       name = EXCLUDED.name,
       face_names = EXCLUDED.face_names,
       lang = EXCLUDED.lang,
       set_code = EXCLUDED.set_code,
       collector_number = EXCLUDED.collector_number,
       released_at = EXCLUDED.released_at,
       layout = EXCLUDED.layout,
       data = EXCLUDED.data,
       synced_at = EXCLUDED.synced_at,
       -- gdy zmienił się obraz karty, odcisk trzeba policzyć od nowa
       art_hash = CASE WHEN scryfall_cards.image_small IS DISTINCT FROM EXCLUDED.image_small THEN NULL ELSE scryfall_cards.art_hash END,
       card_hash = CASE WHEN scryfall_cards.image_small IS DISTINCT FROM EXCLUDED.image_small THEN NULL ELSE scryfall_cards.card_hash END,
       back_hash = CASE WHEN scryfall_cards.image_small IS DISTINCT FROM EXCLUDED.image_small THEN NULL ELSE scryfall_cards.back_hash END,
       hash_version = CASE WHEN scryfall_cards.image_small IS DISTINCT FROM EXCLUDED.image_small THEN NULL ELSE scryfall_cards.hash_version END,
       image_small = EXCLUDED.image_small`,
    values
  );
}

/**
 * Zamienia strumień bajtów na tekst. Jeśli dane są skompresowane gzipem
 * (Scryfall publikuje .jsonl.gz), rozpakowuje je w locie — rozpoznaje to
 * po sygnaturze 1f 8b, więc działa też, gdy serwer sam zdekompresował odpowiedź.
 */
async function* decodeStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const first = await reader.read();
  if (first.done) return;
  const isGzip = first.value.length >= 2 && first.value[0] === 0x1f && first.value[1] === 0x8b;

  // Odtwarzamy strumień razem z już przeczytaną pierwszą porcją.
  let raw: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first.value);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
  if (isGzip) raw = raw.pipeThrough(new DecompressionStream('gzip') as any);

  const decoder = new TextDecoder('utf-8');
  const textReader = raw.getReader();
  while (true) {
    const { done, value } = await textReader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
  const rest = decoder.decode();
  if (rest) yield rest;
}

/**
 * Adres pliku z opisu danych zbiorczych. Scryfall zmienił nazwy pól
 * (download_uri → jsonl_download_uri), więc sprawdzamy oba, a w ostateczności
 * pobieramy opis ponownie spod pola "uri".
 */
async function resolveDownloadUri(meta: any, allowRefetch = true): Promise<string> {
  const pick = (m: any) =>
    [m?.jsonl_download_uri, m?.download_uri].find((u) => typeof u === 'string' && u.trim().length > 0) as string | undefined;
  const direct = pick(meta);
  if (direct) return direct;
  if (allowRefetch && typeof meta?.uri === 'string' && meta.uri.startsWith('https://')) {
    const res = await fetch(meta.uri, { headers: SCRYFALL_HEADERS });
    if (res.ok) return resolveDownloadUri(await res.json(), false);
  }
  throw new Error(`brak adresu pliku w odpowiedzi Scryfall (pola: ${Object.keys(meta || {}).join(', ')})`);
}

/**
 * Pobiera dane zbiorcze Scryfall i aktualizuje tabelę scryfall_cards.
 * Pomija pobieranie, jeśli Scryfall nie opublikował nowej wersji od ostatniego importu.
 */
/**
 * Wersje językowe z EXTRA_LANGS (np. japońskie) z pliku all_cards. Plik jest duży (kilka GB
 * po rozpakowaniu), ale czytamy go strumieniowo i zapisujemy tylko karty w wybranych językach.
 * Zwraca true, gdy baza się zmieniła.
 */
async function syncExtraLanguages(p: pg.Pool, force: boolean): Promise<boolean> {
  if (!EXTRA_LANGS.length) return false;
  const metaRes = await fetch(ALL_CARDS_META_URL, { headers: SCRYFALL_HEADERS });
  if (!metaRes.ok) throw new Error(`all-cards HTTP ${metaRes.status}`);
  const meta: any = await metaRes.json();
  const remoteVersion = `${meta.updated_at || ''}|${EXTRA_LANGS.join(',')}`;
  const localVersion = await getMeta(p, 'extra_langs_version');
  if (!force && localVersion && localVersion === remoteVersion) return false;

  const started = Date.now();
  const downloadUri = await resolveDownloadUri(meta);
  const sizeMb = Math.round((meta.compressed_size || meta.size || 0) / 1e6);
  console.log(`[Karty] Pobieram wersje językowe (${EXTRA_LANGS.join(', ')}) z pełnych danych Scryfall${sizeMb ? ` (${sizeMb} MB)` : ''}...`);
  const dataRes = await fetch(downloadUri, { headers: { 'User-Agent': SCRYFALL_HEADERS['User-Agent'] } });
  if (!dataRes.ok || !dataRes.body) throw new Error(`all-cards download HTTP ${dataRes.status}`);

  const syncStart = new Date().toISOString();
  const langs = new Set(EXTRA_LANGS);
  let batch: any[] = [];
  let total = 0;
  for await (const card of iterateJsonArrayObjects(decodeStream(dataRes.body as any))) {
    if (!langs.has(String(card?.lang || '').toLowerCase()) || !isScannable(card)) continue;
    batch.push(card);
    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(p, batch, syncStart);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await upsertBatch(p, batch, syncStart);
    total += batch.length;
  }
  if (total < 500) throw new Error(`podejrzanie mało kart w wybranych językach (${total}), nie usuwam starych`);
  const removed = await p.query('DELETE FROM scryfall_cards WHERE synced_at < $1 AND lang = ANY($2)', [syncStart, EXTRA_LANGS]);
  // Scryfall zwykle nie podaje cen wydań nieangielskich: bierzemy ceny angielskiej karty
  // z tego samego dodatku i numeru (przybliżenie; oznaczone polem prices_from_en).
  await p.query(
    `UPDATE scryfall_cards j
        SET data = jsonb_set(j.data, '{prices}', e.data->'prices') || '{"prices_from_en": true}'::jsonb
       FROM scryfall_cards e
      WHERE j.lang = ANY($1) AND e.lang = 'en' AND jsonb_typeof(e.data->'prices') = 'object'
        AND e.set_code = j.set_code AND e.collector_number = j.collector_number
        AND COALESCE(j.data->'prices'->>'eur', j.data->'prices'->>'usd', j.data->'prices'->>'eur_foil', j.data->'prices'->>'usd_foil') IS NULL`,
    [EXTRA_LANGS]
  );
  await setMeta(p, 'extra_langs_version', remoteVersion);
  console.log(
    `[Karty] Wersje językowe: zaimportowano ${total} kart (usunięto ${removed.rowCount || 0}) w ${Math.round((Date.now() - started) / 1000)} s.`
  );
  return true;
}

export async function syncCardsFromScryfall(force = false): Promise<void> {
  const p = pool();
  if (!p || syncing) return;
  syncing = true;
  lastSyncError = null;
  const started = Date.now();
  try {
    const metaRes = await fetch(BULK_META_URL, { headers: SCRYFALL_HEADERS });
    if (!metaRes.ok) throw new Error(`bulk-data HTTP ${metaRes.status}`);
    const meta: any = await metaRes.json();
    const remoteVersion = String(meta.updated_at || '');
    const localVersion = await getMeta(p, 'default_cards_version');
    if (!force && localVersion && localVersion === remoteVersion) {
      lastSyncAt = new Date().toISOString();
      await setMeta(p, 'last_check', lastSyncAt);
      console.log('[Karty] Baza kart aktualna, pomijam pobieranie.');
      const changed = await syncExtraLanguages(p, force).catch((err) => {
        console.warn('[Karty] Wersje językowe: błąd synchronizacji:', err?.message || err);
        return false;
      });
      if (changed) {
        await loadCardIndex();
        await loadHashIndex();
        buildMissingHashes().catch(() => {});
      }
      return;
    }

    const downloadUri = await resolveDownloadUri(meta);
    const sizeMb = Math.round((meta.compressed_size || meta.size || 0) / 1e6);
    console.log(`[Karty] Pobieram dane zbiorcze Scryfall${sizeMb ? ` (${sizeMb} MB)` : ''}...`);
    const dataRes = await fetch(downloadUri, { headers: { 'User-Agent': SCRYFALL_HEADERS['User-Agent'] } });
    if (!dataRes.ok || !dataRes.body) throw new Error(`download HTTP ${dataRes.status}`);

    const syncStart = new Date().toISOString();
    let batch: any[] = [];
    let total = 0;
    for await (const card of iterateJsonArrayObjects(decodeStream(dataRes.body as any))) {
      if (!isScannable(card)) continue;
      batch.push(card);
      if (batch.length >= BATCH_SIZE) {
        await upsertBatch(p, batch, syncStart);
        total += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await upsertBatch(p, batch, syncStart);
      total += batch.length;
    }
    if (total < 10000) throw new Error(`podejrzanie mało kart w imporcie (${total}) — nie usuwam starych`);

    // Usuwamy karty, których nie ma już w danych Scryfall.
    const removed = await p.query('DELETE FROM scryfall_cards WHERE synced_at < $1 AND NOT (lang = ANY($2))', [syncStart, EXTRA_LANGS]);
    await setMeta(p, 'default_cards_version', remoteVersion);
    lastSyncAt = new Date().toISOString();
    await setMeta(p, 'last_check', lastSyncAt);
    console.log(`[Karty] Zaimportowano ${total} kart (usunięto ${removed.rowCount || 0}) w ${Math.round((Date.now() - started) / 1000)} s.`);
    await syncExtraLanguages(p, force).catch((err) => console.warn('[Karty] Wersje językowe: błąd synchronizacji:', err?.message || err));
    await loadCardIndex();
    await loadHashIndex();
    buildMissingHashes().catch(() => {});
  // karty na ekran logowania gotowe, zanim wejdzie pierwszy gość
  getShowcaseCards(16).catch(() => {});
  } catch (err: any) {
    lastSyncError = err?.message || String(err);
    console.warn('[Karty] Synchronizacja nieudana:', lastSyncError);
  } finally {
    syncing = false;
  }
}

/** Wczytuje lekki indeks kart do pamięci. */
export async function loadCardIndex(): Promise<void> {
  const p = pool();
  if (!p) return;
  const res = await p.query(
    `SELECT id, face_names, set_code, collector_number, COALESCE(to_char(released_at, 'YYYY-MM-DD'), '') AS released
     FROM scryfall_cards
     ORDER BY released_at DESC NULLS LAST, (lang = 'en') DESC`
  );
  const entries: IndexEntry[] = [];
  const nameById = new Map<string, string>();
  const bySetNumber = new Map<string, number>();
  const byName = new Map<string, number[]>();
  for (const r of res.rows) {
    const idx = entries.length;
    entries.push({ id: r.id, set: r.set_code, cn: r.collector_number, released: r.released });
    // Ten sam numer w dodatku ma też wersja japońska itp.: zostaje pierwsza (angielska)
    const setKey = `${r.set_code}/${r.collector_number.toLowerCase()}`;
    if (!bySetNumber.has(setKey)) bySetNumber.set(setKey, idx);
    nameById.set(r.id, normalizeName((r.face_names as string[])[0] || ''));
    const seen = new Set<string>();
    for (const n of r.face_names as string[]) {
      const norm = normalizeName(n);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      let list = byName.get(norm);
      if (!list) byName.set(norm, (list = []));
      list.push(idx);
    }
  }
  index = { entries, nameById, bySetNumber, byName, names: new NameIndex(byName.keys()) };
  console.log(`[Karty] Indeks w pamięci: ${entries.length} wydań, ${index.names.size} nazw.`);
}

/** Uruchamia moduł: schemat, indeks i synchronizacja w tle (przy starcie i co kilka godzin). */
export async function startCardDb(): Promise<void> {
  const p = pool();
  if (!p) {
    console.log('[Karty] Brak PostgreSQL — lokalna baza kart wyłączona (skaner użyje API Scryfall).');
    return;
  }
  await ensureCardSchema();
  await ensureHashSchema();
  await loadCardIndex();
  await loadHashIndex();
  buildMissingHashes().catch(() => {});
  lastSyncAt = await getMeta(p, 'last_check');

  // Nowe języki (np. po wdrożeniu albo zmianie CARD_EXTRA_LANGS) pobieramy od razu, bez czekania na dobową synchronizację
  const extraVersion = await getMeta(p, 'extra_langs_version');
  let extraPending = EXTRA_LANGS.length > 0 && !(extraVersion || '').endsWith(`|${EXTRA_LANGS.join(',')}`);
  const maybeSync = () => {
    const due = extraPending || !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > SYNC_INTERVAL_MS || !isCardDbReady();
    extraPending = false;
    if (due) syncCardsFromScryfall().catch(() => {});
  };
  maybeSync();
  setInterval(maybeSync, 6 * 60 * 60 * 1000).unref();
}

// ---------- Wyszukiwanie ----------

/** Pełne obiekty kart (dane Scryfall) w kolejności podanych identyfikatorów. */
export async function getCardsByIds(ids: string[]): Promise<any[]> {
  const p = pool();
  if (!p || ids.length === 0) return [];
  const res = await p.query('SELECT id, data FROM scryfall_cards WHERE id = ANY($1::uuid[])', [ids]);
  const byId = new Map(res.rows.map((r) => [r.id, r.data]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Wyszukiwanie po nazwie w lokalnej bazie (zapas, gdy Scryfall nie odpowiada):
 * nazwy zaczynające się od zapytania najpierw, po jednym (najnowszym) wydaniu na kartę.
 */
export async function searchCardsLocal(query: string, limit = 30): Promise<any[]> {
  if (!index) return [];
  const q = normalizeName(query);
  if (q.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of index.byName.keys()) {
    if (name.startsWith(q)) starts.push(name);
    else if (name.includes(q)) contains.push(name);
    if (starts.length >= limit) break;
  }
  const names = [...starts.sort(), ...contains.sort()].slice(0, limit);
  const ids = names.map((n) => index!.entries[index!.byName.get(n)![0]].id);
  return getCardsByIds(ids);
}

let setSizesCache: { at: number; sizes: Record<string, number> } | null = null;

/** Liczba różnych kart (numerów kolekcjonerskich, wersje angielskie) w każdym dodatku. */
export async function getSetSizes(): Promise<Record<string, number>> {
  if (setSizesCache && Date.now() - setSizesCache.at < 6 * 60 * 60 * 1000) return setSizesCache.sizes;
  const p = pool();
  if (!p) return {};
  const res = await p.query(
    `SELECT set_code, COUNT(DISTINCT collector_number)::int AS n FROM scryfall_cards WHERE lang = 'en' GROUP BY set_code`
  );
  const sizes: Record<string, number> = {};
  for (const r of res.rows) sizes[String(r.set_code).toLowerCase()] = r.n;
  if (Object.keys(sizes).length) setSizesCache = { at: Date.now(), sizes };
  return sizes;
}

export interface ShowcaseCard {
  name: string;
  image: string;
  artCrop: string | null;
  legendary: boolean;
}

let showcaseCache: { at: number; cards: ShowcaseCard[] } | null = null;

/**
 * Popularne karty (wg EDHREC) do ekranu logowania: angielskie, ze zwykłą ramką, bez lądów.
 * Wybór zmienia się raz na dobę; wynik w pamięci przez 6 h.
 */
export async function getShowcaseCards(limit = 12): Promise<ShowcaseCard[]> {
  if (showcaseCache && Date.now() - showcaseCache.at < 6 * 60 * 60 * 1000) return showcaseCache.cards;
  const p = pool();
  if (!p || !index || index.entries.length === 0) return [];

  // Pełny skan tabeli (ponad 100 tys. wierszy JSONB) na małym serwerze przekracza limit czasu,
  // więc losujemy wydania z indeksu w pamięci (inne każdego dnia) i pobieramy je po kluczu głównym.
  const day = Math.floor(Date.now() / 86_400_000);
  let seed = (day * 2654435761) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const ids = new Set<string>();
  const total = index.entries.length;
  for (let n = 0; n < 1500 && ids.size < 800; n++) ids.add(index.entries[Math.floor(rand() * total)].id);

  let rows: any[] = [];
  try {
    const res = await p.query(
      `SELECT name, data->'image_uris'->>'normal' AS image, data->'image_uris'->>'art_crop' AS art,
              COALESCE(data->>'type_line', '') AS type_line, data->>'rarity' AS rarity,
              data->>'border_color' AS border, data->>'full_art' AS full_art, data->>'promo' AS promo,
              data->>'digital' AS digital, data->>'edhrec_rank' AS rank, lang
         FROM scryfall_cards WHERE id = ANY($1::uuid[])`,
      [[...ids]]
    );
    rows = res.rows;
  } catch (err: any) {
    console.warn('[Karty] Nie udało się wybrać kart na ekran logowania:', err?.message || err);
    return [];
  }

  const seen = new Set<string>();
  const candidates = rows
    .filter(
      (r) =>
        r.lang === 'en' &&
        r.image &&
        !/land/i.test(r.type_line) &&
        (r.border || 'black') === 'black' &&
        r.full_art !== 'true' &&
        r.promo !== 'true' &&
        r.digital !== 'true' &&
        (r.rarity === 'rare' || r.rarity === 'mythic')
    )
    .map((r) => ({ ...r, rankNum: Number(r.rank) || 1e9, legendary: /legendary creature/i.test(r.type_line) }))
    // najpierw karty popularne w EDHREC
    .sort((a, b) => a.rankNum - b.rankNum)
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));

  const legendary = candidates.filter((r) => r.legendary).slice(0, 3);
  const others = candidates.filter((r) => !r.legendary).slice(0, Math.max(0, limit - legendary.length));
  // w klaserze karty w losowej (dziennej) kolejności, nie wg rankingu
  const mixed = others
    .map((r) => ({ r, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map(({ r }) => r);
  const cards = [...mixed, ...legendary].map((r) => ({ name: r.name, image: r.image, artCrop: r.art || null, legendary: Boolean(r.legendary) }));
  // Pustego wyniku nie zapamiętujemy (np. baza kart jeszcze się synchronizuje)
  if (cards.length) showcaseCache = { at: Date.now(), cards };
  else console.warn(`[Karty] Brak kart na ekran logowania (wylosowano ${rows.length} wydań, żadne nie pasuje).`);
  return cards;
}

/**
 * Karty po nazwach (dokładna nazwa lub nazwa pierwszej strony), po jednej — najnowsze
 * angielskie wydanie z obrazkiem. Klucz mapy: nazwa małymi literami (tak jak podana).
 */
export async function getCardsByNames(names: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const p = pool();
  const wanted = [...new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))];
  if (!p || wanted.length === 0) return out;
  const res = await p.query(
    `SELECT DISTINCT ON (key) key, data FROM (
       SELECT LOWER(name) AS key, data, lang, released_at, image_small FROM scryfall_cards WHERE LOWER(name) = ANY($1)
       UNION ALL
       SELECT LOWER(face_names[1]) AS key, data, lang, released_at, image_small FROM scryfall_cards WHERE LOWER(face_names[1]) = ANY($1)
     ) x
     ORDER BY key, (lang = 'en') DESC, (image_small IS NOT NULL) DESC, released_at DESC NULLS LAST`,
    [wanted]
  );
  for (const r of res.rows) out.set(r.key, r.data);
  return out;
}

/** Identyfikator karty po kodzie setu i numerze kolekcjonerskim (np. "mh3", "123"). */
export function findIdBySetNumber(set: string, collectorNumber: string): string | null {
  if (!index || !set || !collectorNumber) return null;
  const cn = collectorNumber.toLowerCase().trim();
  const cnVariants = [...new Set([cn, cn.replace(/^0+(?=\d)/, '')])];
  for (const s of setCodeVariants(set.toLowerCase().trim())) {
    for (const c of cnVariants) {
      const hit = index.bySetNumber.get(`${s}/${c}`);
      if (hit !== undefined) return index.entries[hit].id;
    }
  }
  return null;
}

// Znaki, które OCR często myli w kodach setów (np. "M19" ↔ "MI9", "MH3" ↔ "MHE").
const OCR_CONFUSIONS: Record<string, string[]> = {
  '0': ['o', 'd'], o: ['0'], d: ['0'],
  '1': ['i', 'l'], i: ['1', 'l'], l: ['1', 'i'],
  '5': ['s'], s: ['5'],
  '8': ['b'], b: ['8'],
  '2': ['z'], z: ['2'],
  '6': ['g'], g: ['6'],
  '3': ['e'], e: ['3']
};

/** Kod setu i warianty z najwyżej dwiema typowymi pomyłkami OCR (oryginał pierwszy). */
function setCodeVariants(code: string): string[] {
  const out = new Set<string>([code]);
  const chars = code.split('');
  chars.forEach((ch, i) => {
    for (const alt of OCR_CONFUSIONS[ch] || []) {
      const one = [...chars];
      one[i] = alt;
      out.add(one.join(''));
      one.forEach((ch2, j) => {
        if (j <= i) return;
        for (const alt2 of OCR_CONFUSIONS[ch2] || []) {
          const two = [...one];
          two[j] = alt2;
          out.add(two.join(''));
        }
      });
    }
  });
  return [...out];
}

export interface NameCandidates {
  name: string; // znormalizowana nazwa
  score: number;
  ids: string[]; // wydania, najnowsze pierwsze
}

/** Kandydaci po nazwie odczytanej przez OCR (z tolerancją na błędy). */
export function findByName(ocrTitle: string, limit = 3): NameCandidates[] {
  if (!index || !ocrTitle) return [];
  return index.names.search(ocrTitle, limit).map((m) => ({
    name: m.name,
    score: m.score,
    ids: (index!.byName.get(m.name) || []).map((i) => index!.entries[i].id)
  }));
}

/** Znormalizowana główna nazwa wydania (do grupowania wyników wyszukiwania po obrazie). */
export function nameOfId(id: string): string | null {
  return index?.nameById.get(id) ?? null;
}

/** Wszystkie wydania danej karty (po znormalizowanej nazwie). */
export function printingsOfName(normName: string): string[] {
  if (!index) return [];
  return (index.byName.get(normName) || []).map((i) => index!.entries[i].id);
}

export interface DeckToken {
  key: string;
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  oracleText?: string;
  colors: string[];
  image: string | null;
  /** Pełne dane karty tokenu (do okna szczegółów), jeśli są w lokalnej bazie. */
  card: any | null;
  /** Karty z talii, które tworzą ten token. */
  sources: string[];
}

// Popularne tokeny-artefakty tworzone przez wiele kart (gdy karta nie ma ich w all_parts).
const COMMON_TOKENS = ['Treasure', 'Food', 'Clue', 'Blood', 'Map', 'Powerstone', 'Incubator', 'Junk', 'Gold', 'Shard'];

/**
 * Tokeny, które może stworzyć talia: z pola all_parts kart Scryfall (component = token),
 * uzupełnione o popularne tokeny-artefakty wspomniane w tekście kart. Wyłącznie lokalna baza kart.
 */
export async function getDeckTokens(ids: string[], names: string[]): Promise<DeckToken[]> {
  const p = pool();
  if (!p) return [];
  const byId = new Map<string, any>();
  const validIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  for (const c of await getCardsByIds(validIds)) byId.set(c.id, c);
  // Karty bez dopasowania po id szukamy po nazwie
  const known = new Set([...byId.values()].map((c) => String(c.name).toLowerCase()));
  const missing = names.filter((n) => n && !known.has(n.toLowerCase()));
  const byName = missing.length ? await getCardsByNames(missing) : new Map<string, any>();
  const deckCards = [...byId.values(), ...byName.values()];

  const tokenRefs = new Map<string, { id: string; name: string; typeLine: string; sources: Set<string> }>();
  const textTokens = new Map<string, Set<string>>();
  for (const card of deckCards) {
    const parts: any[] = Array.isArray(card.all_parts) ? card.all_parts : [];
    let found = false;
    for (const part of parts) {
      if (part?.component !== 'token' || !part.id) continue;
      found = true;
      const ref = tokenRefs.get(part.id) || { id: part.id, name: part.name, typeLine: part.type_line || '', sources: new Set<string>() };
      ref.sources.add(card.name);
      tokenRefs.set(part.id, ref);
    }
    if (found) continue;
    const text = [card.oracle_text, ...(card.card_faces || []).map((f: any) => f?.oracle_text)].filter(Boolean).join('\n');
    for (const t of COMMON_TOKENS) {
      if (new RegExp(`\\b${t}\\b[^.]*\\btokens?\\b`, 'i').test(text)) {
        const set = textTokens.get(t) || new Set<string>();
        set.add(card.name);
        textTokens.set(t, set);
      }
    }
  }

  const tokenData = new Map<string, any>();
  for (const c of await getCardsByIds([...tokenRefs.keys()])) tokenData.set(c.id, c);
  const textData = textTokens.size
    ? await p
        .query(
          `SELECT DISTINCT ON (name) name, data FROM scryfall_cards
            WHERE name = ANY($1) AND layout = 'token' AND lang = 'en'
            ORDER BY name, released_at DESC NULLS LAST`,
          [[...textTokens.keys()]]
        )
        .then((r) => new Map(r.rows.map((row) => [row.name as string, row.data])))
        .catch(() => new Map<string, any>())
    : new Map<string, any>();

  const out = new Map<string, DeckToken>();
  const add = (data: any | null, fallbackName: string, fallbackType: string, sources: Set<string>) => {
    const face = data?.card_faces?.[0];
    const name = data?.name || fallbackName;
    const typeLine = data?.type_line || fallbackType;
    const power = data?.power ?? face?.power;
    const toughness = data?.toughness ?? face?.toughness;
    const oracleText = data?.oracle_text ?? face?.oracle_text ?? '';
    // Ten sam token z różnych wydań (np. 1/1 Soldier) liczymy raz
    const key = [name, typeLine, power, toughness, oracleText].join('|').toLowerCase();
    const prev = out.get(key);
    if (prev) {
      sources.forEach((s) => !prev.sources.includes(s) && prev.sources.push(s));
      return;
    }
    out.set(key, {
      key,
      name,
      typeLine,
      power,
      toughness,
      oracleText,
      colors: data?.colors || face?.colors || [],
      image: data?.image_uris?.normal || face?.image_uris?.normal || null,
      card: data || null,
      sources: [...sources]
    });
  };
  for (const ref of tokenRefs.values()) add(tokenData.get(ref.id) || null, ref.name, ref.typeLine, ref.sources);
  for (const [name, sources] of textTokens) add(textData.get(name) || null, name, `Token Artifact — ${name}`, sources);

  return [...out.values()].sort((a, b) => b.sources.length - a.sources.length || a.name.localeCompare(b.name));
}

/** Wszystkie wydania karty (po oracle_id albo dokładnej nazwie) z lokalnej bazy, od najnowszych. */
export async function getPrintsLocal(oracleId: string | null, name: string | null): Promise<any[] | null> {
  const p = pool();
  if (!p || (!oracleId && !name)) return null;
  const res = oracleId
    ? await p.query(
        `SELECT data FROM scryfall_cards WHERE oracle_id = $1 AND (lang = 'en' OR lang = ANY($2))
           AND COALESCE(data->>'digital', 'false') = 'false'
         ORDER BY released_at DESC NULLS LAST, set_code, collector_number, (lang = 'en') DESC LIMIT 600`,
        [oracleId, EXTRA_LANGS]
      )
    : await p.query(
        `SELECT data FROM scryfall_cards WHERE LOWER(name) = LOWER($1) AND (lang = 'en' OR lang = ANY($2))
           AND COALESCE(data->>'digital', 'false') = 'false'
         ORDER BY released_at DESC NULLS LAST, set_code, collector_number, (lang = 'en') DESC LIMIT 600`,
        [name, EXTRA_LANGS]
      );
  return res.rows.map((r) => r.data);
}
