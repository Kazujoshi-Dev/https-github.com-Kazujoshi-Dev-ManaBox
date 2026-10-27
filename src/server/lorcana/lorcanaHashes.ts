/**
 * Odciski obrazów kart Disney Lorcana dla skanera (ten sam algorytm co dla MTG, src/server/cards/imageHash.ts).
 *
 * - Obrazy wzorcowe to małe grafiki z Lorcast (format AVIF, dekodowany biblioteką sharp).
 *   Pliki z *.lorcast.io nie mają limitu zapytań, ale pobieramy je spokojnie, po kilka naraz.
 * - Odciski zapisujemy w tabeli lorcana_card_hashes razem z adresem obrazu: po zmianie grafiki
 *   lub wersji algorytmu karta jest liczona od nowa. Kart jest ok. 3,5 tys., więc pierwsze
 *   liczenie trwa kilka minut, a przeszukanie całego indeksu w pamięci zajmuje ułamek milisekundy.
 * - Bez sharp (brak biblioteki na serwerze) moduł jest nieaktywny, a skaner Lorcany zgłasza brak indeksu.
 */
import { getPool, isPostgresActive } from '../db/storage';
import { APP_USER_AGENT } from '../userAgent';
import { HASH_BYTES, HASH_VERSION, HASH_WORDS, asWords, combinedDistance32, computeCardHash, rawToGray } from '../cards/imageHash';

const CONCURRENCY = 3;
const MIN_REQUEST_INTERVAL_MS = 120;
const FAILED_VERSION = -HASH_VERSION;
const RETRY_FAILED_MS = 24 * 60 * 60 * 1000;

interface Entry {
  id: string;
  image: string;
}

let ids: string[] = [];
let store32 = new Uint32Array(0);
let count = 0;
let building = false;
let progress = { done: 0, failed: 0, remaining: 0 };
let lastRetryAt = 0;
let sharpLoader: Promise<any | null> | null = null;

const pool = () => (isPostgresActive() ? getPool() : null);

/** sharp ładujemy dopiero, gdy jest potrzebny (i tylko raz); brak biblioteki wyłącza moduł. */
function loadSharp(): Promise<any | null> {
  if (!sharpLoader) {
    sharpLoader = import('sharp')
      .then((m: any) => m.default || m)
      .catch((err) => {
        console.warn('[Lorcana] Brak biblioteki sharp, skaner Lorcany nieaktywny:', err?.message || err);
        return null;
      });
  }
  return sharpLoader;
}

function append(id: string, hash: Uint8Array) {
  const words = asWords(hash);
  if ((count + 1) * HASH_WORDS > store32.length) {
    const bigger = new Uint32Array(Math.max(1024, (count + 1) * 2) * HASH_WORDS);
    bigger.set(store32.subarray(0, count * HASH_WORDS));
    store32 = bigger;
  }
  store32.set(words, count * HASH_WORDS);
  ids[count] = id;
  count++;
}

export function lorcanaHashStatus() {
  return { hashes: count, building, ...progress };
}

export const hasLorcanaHashes = () => count > 0;

async function ensureSchema() {
  const p = pool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS lorcana_card_hashes (
      id VARCHAR(64) PRIMARY KEY,
      image TEXT,
      card_hash BYTEA,
      hash_version SMALLINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function loadFromDb() {
  const p = pool();
  if (!p) return;
  const res = await p.query('SELECT id, card_hash FROM lorcana_card_hashes WHERE hash_version = $1', [HASH_VERSION]);
  ids = [];
  store32 = new Uint32Array(0);
  count = 0;
  for (const r of res.rows) if (r.card_hash?.length === HASH_BYTES) append(r.id, new Uint8Array(r.card_hash));
  if (count) console.log(`[Lorcana] Odciski obrazów w pamięci: ${count}.`);
}

let lastRequestAt = 0;
async function fetchImage(url: string): Promise<Uint8Array> {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  lastRequestAt = Math.max(Date.now(), lastRequestAt + MIN_REQUEST_INTERVAL_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: { 'User-Agent': APP_USER_AGENT, Accept: 'image/avif,image/*' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Odcisk obrazu dowolnego formatu obsługiwanego przez sharp (AVIF, WebP, PNG, JPEG). */
export async function hashImageBuffer(buf: Uint8Array): Promise<Uint8Array | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  // przezroczyste rogi grafiki: czarne tło, jak ciemny stół pod kartą
  const { data, info } = await sharp(Buffer.from(buf)).flatten({ background: '#000000' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return computeCardHash(rawToGray(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height, info.channels));
}

/**
 * Liczy brakujące odciski (nowe karty, zmienione grafiki, nowa wersja algorytmu). Wywoływane po każdej
 * synchronizacji kart z Lorcast; działa w tle, a postęp zapisuje na bieżąco.
 */
export async function buildLorcanaHashes(entries: Entry[]): Promise<void> {
  const p = pool();
  if (!p || building || !entries.length) return;
  if (!(await loadSharp())) return;
  building = true;
  try {
    await ensureSchema();
    if (Date.now() - lastRetryAt > RETRY_FAILED_MS) {
      lastRetryAt = Date.now();
      await p.query('UPDATE lorcana_card_hashes SET hash_version = NULL WHERE hash_version = $1', [FAILED_VERSION]);
    }
    const res = await p.query('SELECT id, image, hash_version FROM lorcana_card_hashes');
    const known = new Map(res.rows.map((r: any) => [String(r.id), r]));
    const todo = entries.filter((e) => {
      const k: any = known.get(e.id);
      return !k || k.image !== e.image || (k.hash_version !== HASH_VERSION && k.hash_version !== FAILED_VERSION);
    });
    progress = { done: 0, failed: 0, remaining: todo.length };
    if (!todo.length) return;
    console.log(`[Lorcana] Liczę odciski obrazów dla ${todo.length} kart...`);
    const started = Date.now();
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const e = todo[next++];
        try {
          const hash = await hashImageBuffer(await fetchImage(e.image));
          if (!hash) throw new Error('brak dekodera');
          await p.query(
            `INSERT INTO lorcana_card_hashes (id, image, card_hash, hash_version, updated_at) VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image, card_hash = EXCLUDED.card_hash, hash_version = EXCLUDED.hash_version, updated_at = NOW()`,
            [e.id, e.image, Buffer.from(hash), HASH_VERSION]
          );
          progress.done++;
        } catch {
          progress.failed++;
          await p
            .query(
              `INSERT INTO lorcana_card_hashes (id, image, hash_version, updated_at) VALUES ($1, $2, $3, NOW())
               ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image, hash_version = EXCLUDED.hash_version, updated_at = NOW()`,
              [e.id, e.image, FAILED_VERSION]
            )
            .catch(() => undefined);
        }
        progress.remaining = Math.max(0, progress.remaining - 1);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`[Lorcana] Odciski gotowe: ${progress.done} (${progress.failed} błędów) w ${Math.round((Date.now() - started) / 1000)} s.`);
  } catch (err: any) {
    console.warn('[Lorcana] Liczenie odcisków przerwane:', err?.message || err);
  } finally {
    building = false;
    await loadFromDb().catch(() => undefined);
  }
}

export async function startLorcanaHashes(): Promise<void> {
  await ensureSchema();
  await loadFromDb();
}

export interface LorcanaHashMatch {
  id: string;
  distance: number;
}

/** Najbliższe karty (cały indeks; kart jest mało, więc bez wstępnego zawężania). Odległość to minimum po wariantach kadru. */
export function searchLorcanaByHash(query: Uint8Array[], limit = 10, onlyIds?: Set<string>): LorcanaHashMatch[] {
  if (!count || !query.length) return [];
  const variants = query.map(asWords);
  const out: LorcanaHashMatch[] = [];
  for (let i = 0; i < count; i++) {
    if (onlyIds && !onlyIds.has(ids[i])) continue;
    let d = Infinity;
    for (const v of variants) {
      const dv = combinedDistance32(v, store32, i * HASH_WORDS);
      if (dv < d) d = dv;
    }
    out.push({ id: ids[i], distance: d });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
