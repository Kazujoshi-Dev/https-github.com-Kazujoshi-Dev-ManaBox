/**
 * Indeks odcisków obrazów wszystkich wydań kart.
 *
 * - Odciski liczymy w tle z małych obrazów Scryfall (146×204) i zapisujemy w bazie,
 *   więc pobieranie odbywa się tylko raz (potem tylko nowe karty / zmienione obrazy).
 * - W pamięci trzymamy jeden bufor ze wszystkimi odciskami — przeszukanie ~110 tys.
 *   wydań zajmuje kilkadziesiąt ms, a zawężenie do wydań jednej nazwy < 1 ms.
 * - Karty dwustronne mają osobny odcisk tylnej strony.
 */
import type pg from 'pg';
import { getPool, isPostgresActive } from '../db/storage';
import { HASH_BYTES, HASH_VERSION, combinedDistance, computeCardHash, decodeJpegToGray } from './imageHash';

const IMAGE_HEADERS = { 'User-Agent': 'ManaScrew/1.0 (https://manascrew.eu)', Accept: 'image/jpeg' };
const DOWNLOAD_CONCURRENCY = 4;
const MIN_REQUEST_INTERVAL_MS = 100; // ok. 10 obrazów/s łącznie — grzecznie wobec CDN Scryfall
const FAILED_VERSION = -HASH_VERSION;

let ids: string[] = [];
let store = new Uint8Array(0);
let count = 0;
let positions = new Map<string, number[]>(); // id wydania → pozycje w buforze (przód/tył)
let building = false;
let buildProgress = { done: 0, failed: 0, remaining: 0 };

function pool(): pg.Pool | null {
  return isPostgresActive() ? getPool() : null;
}

function append(id: string, hash: Uint8Array): void {
  if ((count + 1) * HASH_BYTES > store.length) {
    const bigger = new Uint8Array(Math.max(1024, (count + 1) * 2) * HASH_BYTES);
    bigger.set(store.subarray(0, count * HASH_BYTES));
    store = bigger;
  }
  store.set(hash, count * HASH_BYTES);
  ids[count] = id;
  let pos = positions.get(id);
  if (!pos) positions.set(id, (pos = []));
  pos.push(count);
  count++;
}

export function hashIndexStatus() {
  return { hashes: count, building, ...buildProgress };
}

export async function ensureHashSchema(): Promise<void> {
  const p = pool();
  if (!p) return;
  await p.query('ALTER TABLE scryfall_cards ADD COLUMN IF NOT EXISTS back_hash BYTEA');
}

/** Wczytuje do pamięci odciski policzone bieżącą wersją algorytmu. */
export async function loadHashIndex(): Promise<void> {
  const p = pool();
  if (!p) return;
  const res = await p.query('SELECT id, card_hash, back_hash FROM scryfall_cards WHERE hash_version = $1', [HASH_VERSION]);
  ids = [];
  store = new Uint8Array(0);
  count = 0;
  positions = new Map();
  for (const r of res.rows) {
    if (r.card_hash?.length === HASH_BYTES) append(r.id, new Uint8Array(r.card_hash));
    if (r.back_hash?.length === HASH_BYTES) append(r.id, new Uint8Array(r.back_hash));
  }
  console.log(`[Obrazy] Indeks odcisków w pamięci: ${count}.`);
}

let lastRequestAt = 0;
async function politeFetchImage(url: string): Promise<Uint8Array> {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  lastRequestAt = Math.max(Date.now(), lastRequestAt + MIN_REQUEST_INTERVAL_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: IMAGE_HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function hashFromUrl(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  return computeCardHash(decodeJpegToGray(await politeFetchImage(url)));
}

/**
 * Liczy brakujące odciski (nowe karty, zmienione obrazy, nowa wersja algorytmu).
 * Działa w tle partiami; postęp zapisywany na bieżąco, więc restart niczego nie traci.
 */
export async function buildMissingHashes(): Promise<void> {
  const p = pool();
  if (!p || building) return;
  building = true;
  buildProgress = { done: 0, failed: 0, remaining: 0 };
  const pendingWhere = 'image_small IS NOT NULL AND hash_version IS DISTINCT FROM $1 AND hash_version IS DISTINCT FROM $2';
  try {
    const countRes = await p.query(`SELECT COUNT(*)::int AS n FROM scryfall_cards WHERE ${pendingWhere}`, [HASH_VERSION, FAILED_VERSION]);
    buildProgress.remaining = countRes.rows[0].n;
    if (buildProgress.remaining === 0) return;
    console.log(`[Obrazy] Liczę odciski dla ${buildProgress.remaining} wydań (ok. ${Math.ceil(buildProgress.remaining / 600)} min)...`);
    const started = Date.now();
    let batches = 0;

    while (true) {
      const batch = await p.query(
        `SELECT id, image_small, data->'card_faces'->1->'image_uris'->>'small' AS back_small
         FROM scryfall_cards WHERE ${pendingWhere} LIMIT 200`,
        [HASH_VERSION, FAILED_VERSION]
      );
      if (batch.rows.length === 0) break;

      let next = 0;
      const worker = async () => {
        while (next < batch.rows.length) {
          const row = batch.rows[next++];
          try {
            const front = await hashFromUrl(row.image_small);
            const back = await hashFromUrl(row.back_small).catch(() => null);
            await p.query('UPDATE scryfall_cards SET card_hash = $1, back_hash = $2, hash_version = $3 WHERE id = $4', [
              front ? Buffer.from(front) : null,
              back ? Buffer.from(back) : null,
              HASH_VERSION,
              row.id
            ]);
            if (front) append(row.id, front);
            if (back) append(row.id, back);
            buildProgress.done++;
          } catch (err: any) {
            buildProgress.failed++;
            await p.query('UPDATE scryfall_cards SET hash_version = $1 WHERE id = $2', [FAILED_VERSION, row.id]).catch(() => {});
          }
          buildProgress.remaining = Math.max(0, buildProgress.remaining - 1);
        }
      };
      await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));

      if (++batches % 25 === 0) {
        console.log(`[Obrazy] Postęp: ${buildProgress.done} gotowe, ${buildProgress.failed} błędów, zostało ${buildProgress.remaining}.`);
      }
    }
    console.log(`[Obrazy] Gotowe: ${buildProgress.done} odcisków (${buildProgress.failed} błędów) w ${Math.round((Date.now() - started) / 60000)} min.`);
  } catch (err: any) {
    console.warn('[Obrazy] Budowanie indeksu przerwane:', err?.message || err);
  } finally {
    building = false;
  }
}

/** Ponowna próba dla obrazów, których nie udało się pobrać (np. chwilowy błąd sieci). */
export async function retryFailedHashes(): Promise<void> {
  const p = pool();
  if (!p) return;
  await p.query('UPDATE scryfall_cards SET hash_version = NULL WHERE hash_version = $1', [FAILED_VERSION]);
}

export interface HashMatch {
  id: string;
  distance: number; // 0..1024, mniej = bardziej podobne
}

/**
 * Najbliższe odciski. Z listą `candidateIds` porównuje tylko te wydania
 * (np. wszystkie wydania nazwy odczytanej przez OCR); bez niej — cały indeks.
 * Każda karta występuje w wyniku raz (lepsza ze stron karty dwustronnej).
 */
export function searchByHash(query: Uint8Array, limit = 10, candidateIds?: string[]): HashMatch[] {
  const best = new Map<string, number>();
  const consider = (i: number) => {
    const id = ids[i];
    const d = combinedDistance(query, store, i * HASH_BYTES);
    const prev = best.get(id);
    if (prev === undefined || d < prev) best.set(id, d);
  };
  if (candidateIds) {
    for (const id of candidateIds) for (const i of positions.get(id) || []) consider(i);
  } else {
    for (let i = 0; i < count; i++) consider(i);
  }
  return [...best.entries()]
    .map(([id, distance]) => ({ id, distance }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export function hasHashes(): boolean {
  return count > 0;
}
