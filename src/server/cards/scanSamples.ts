/**
 * Próbki skanera MTG: wyprostowane kadry kart, przy których skaner nie był pewny
 * (albo nic nie znalazł), plus niewielka losowa część pewnych wyników do kontroli pomyłek.
 *
 * Admin oznacza w panelu, jaka to naprawdę karta, a ocena puszcza oznaczone próbki
 * przez dokładnie tę samą logikę co endpoint skanera (scanIdentify.ts) i liczy trafienia.
 * Dzięki temu każdą zmianę w rozpoznawaniu można zmierzyć, zanim trafi do użytkowników.
 *
 * Zapisywany jest wyłącznie kadr samej karty (300×420 JPEG), bez reszty klatki z kamery.
 */
import type pg from 'pg';
import { getPool, isPostgresActive } from '../db/storage';
import * as cards from './cardStore';
import * as hashes from './hashIndex';
import { QUICK_IMAGE_CONFIDENCE, hashCardImage, identifyMtgLocal, type IdentifyResult } from './scanIdentify';

/** Wynik poniżej tej pewności zapisujemy jako „niepewny”. */
const UNCERTAIN_BELOW = 90;
/** Ułamek pewnych wyników zapisywanych losowo (do szacowania pomyłek przy wysokiej pewności). */
const RANDOM_CONTROL_RATE = 0.03;
/** Limit próbek od jednego użytkownika na dobę. */
const PER_USER_DAILY = 60;
/** Ile nieoznaczonych próbek trzymamy najwyżej (najstarsze ponad limit są usuwane). */
const MAX_PENDING = 3000;
/** Nieoznaczone próbki starsze niż tyle dni są usuwane. */
const PENDING_RETENTION_DAYS = 90;
/** Ile oznaczonych próbek bierze ocena (najnowsze). */
const EVAL_LIMIT = 2000;
/** Klient w trybie auto przyjmuje wynik od tej pewności (AUTO_ACCEPT_CONFIDENCE w CameraScannerModal.tsx). */
const AUTO_ACCEPT_CONFIDENCE = 80;
const MAX_IMAGE_BYTES = 400_000;

export type SampleStage = 'quick' | 'full';
export type SampleReason = 'none' | 'uncertain' | 'random';
export type LabelStatus = 'pending' | 'card' | 'not_card';

let ready = false;

function pool(): pg.Pool | null {
  return isPostgresActive() ? getPool() : null;
}

export async function startScanSamples(): Promise<void> {
  const p = pool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS scan_samples (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      image BYTEA NOT NULL,
      stage VARCHAR(8) NOT NULL,
      reason VARCHAR(12) NOT NULL,
      hint_title VARCHAR(200) NOT NULL DEFAULT '',
      hint_set VARCHAR(12) NOT NULL DEFAULT '',
      hint_collector VARCHAR(24) NOT NULL DEFAULT '',
      glare REAL,
      method VARCHAR(16),
      confidence SMALLINT NOT NULL DEFAULT 0,
      image_distance REAL,
      matched_id VARCHAR(64),
      candidates JSONB NOT NULL DEFAULT '[]',
      label_status VARCHAR(10) NOT NULL DEFAULT 'pending',
      label_id VARCHAR(64),
      labeled_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_scan_samples_label ON scan_samples(label_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scan_samples_user_day ON scan_samples(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS scan_eval_runs (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      summary JSONB NOT NULL
    );
  `);
  ready = true;
  const purge = () => purgeSamples().catch((err) => console.warn('[Próbki skanera] Czyszczenie nieudane:', err?.message || err));
  purge();
  setInterval(purge, 24 * 60 * 60 * 1000).unref();
}

async function purgeSamples(): Promise<void> {
  const p = pool();
  if (!p || !ready) return;
  await p.query(`DELETE FROM scan_samples WHERE label_status = 'pending' AND created_at < NOW() - make_interval(days => $1::int)`, [
    PENDING_RETENTION_DAYS
  ]);
  await p.query(
    `DELETE FROM scan_samples WHERE id IN (
       SELECT id FROM scan_samples WHERE label_status = 'pending' ORDER BY created_at DESC OFFSET $1
     )`,
    [MAX_PENDING]
  );
}

export interface RecordInput {
  userId: string | undefined;
  dataUrl: unknown;
  stage: unknown;
  glare: unknown;
  hintTitle: string;
  hintSet: string;
  hintCollector: string;
  result: IdentifyResult;
}

/** Decyduje, czy skan warto zapisać; null = nie zapisujemy. */
export function sampleReason(stage: SampleStage, result: IdentifyResult, rnd = Math.random()): SampleReason | null {
  const conf = result.matchedCard ? result.confidence || 0 : 0;
  if (stage === 'full') {
    if (!result.matchedCard) return 'none';
    if (conf < UNCERTAIN_BELOW) return 'uncertain';
    return rnd < RANDOM_CONTROL_RATE ? 'random' : null;
  }
  // Szybka ścieżka: niepewny wynik i tak trafi do pełnego rozpoznania (stage 'full'),
  // więc tu zapisujemy tylko losowe próbki wyników przyjętych od razu.
  return conf >= QUICK_IMAGE_CONFIDENCE && rnd < RANDOM_CONTROL_RATE ? 'random' : null;
}

/** Zapis próbki w tle (wywoływany po wysłaniu odpowiedzi; błędy tylko w logu). */
export async function recordScanSample(input: RecordInput): Promise<void> {
  const p = pool();
  if (!p || !ready || !input.userId) return;
  const stage = input.stage === 'quick' || input.stage === 'full' ? input.stage : null;
  if (!stage) return; // starszy klient bez oznaczenia etapu
  const reason = sampleReason(stage, input.result);
  if (!reason) return;
  if (typeof input.dataUrl !== 'string' || !input.dataUrl.startsWith('data:image/jpeg;base64,')) return;
  const image = Buffer.from(input.dataUrl.slice(23), 'base64');
  if (!image.length || image.length > MAX_IMAGE_BYTES) return;

  const recent = await p.query(
    `SELECT COUNT(*)::int AS n FROM scan_samples WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [input.userId]
  );
  if (recent.rows[0].n >= PER_USER_DAILY) return;

  // Najbliższe obrazy w całej bazie (niezależnie od OCR) — podpowiedzi przy oznaczaniu
  const queryHash = hashCardImage(input.dataUrl);
  const top = queryHash && hashes.hasHashes() ? hashes.searchByHash(queryHash, 6) : [];
  const glare = typeof input.glare === 'number' && Number.isFinite(input.glare) ? Math.min(1, Math.max(0, input.glare)) : null;
  const r = input.result;
  await p.query(
    `INSERT INTO scan_samples (user_id, image, stage, reason, hint_title, hint_set, hint_collector, glare, method, confidence, image_distance, matched_id, candidates)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      input.userId,
      image,
      stage,
      reason,
      input.hintTitle,
      input.hintSet,
      input.hintCollector,
      glare,
      r.method || null,
      Math.round(r.matchedCard ? r.confidence || 0 : 0),
      r.imageDistance ?? null,
      r.matchedCard?.id || null,
      JSON.stringify(top.map((m) => ({ id: m.id, d: Math.round(m.distance) })))
    ]
  );
}

// ---------- Panel admina ----------

export interface SampleCard {
  id: string;
  name: string;
  set: string;
  collectorNumber: string;
  image: string | null;
}

function toSampleCard(c: any): SampleCard {
  return {
    id: c.id,
    name: c.name,
    set: c.set,
    collectorNumber: c.collector_number,
    image: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null
  };
}

export async function listSamples(status: LabelStatus | 'labeled' | 'all', limit: number, offset: number) {
  const p = pool();
  if (!p || !ready) return { samples: [], counts: { pending: 0, card: 0, not_card: 0 } };
  const where =
    status === 'all' ? '' : status === 'labeled' ? `WHERE label_status <> 'pending'` : `WHERE label_status = '${status === 'card' ? 'card' : status === 'not_card' ? 'not_card' : 'pending'}'`;
  const rows = (
    await p.query(
      `SELECT s.id, s.created_at, s.stage, s.reason, s.hint_title, s.hint_set, s.hint_collector, s.glare, s.method,
              s.confidence, s.image_distance, s.matched_id, s.candidates, s.label_status, s.label_id, u.username
         FROM scan_samples s LEFT JOIN users u ON u.id = s.user_id
         ${where}
        ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
  ).rows;
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.matched_id) ids.add(r.matched_id);
    if (r.label_id) ids.add(r.label_id);
    for (const c of r.candidates || []) ids.add(c.id);
  }
  const byId = new Map((await cards.getCardsByIds([...ids])).map((c) => [c.id, toSampleCard(c)]));
  const counts = { pending: 0, card: 0, not_card: 0 } as Record<LabelStatus, number>;
  for (const r of (await p.query(`SELECT label_status, COUNT(*)::int AS n FROM scan_samples GROUP BY label_status`)).rows) {
    counts[r.label_status as LabelStatus] = r.n;
  }
  return {
    counts,
    samples: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      username: r.username || null,
      stage: r.stage,
      reason: r.reason,
      hintTitle: r.hint_title,
      hintSet: r.hint_set,
      hintCollector: r.hint_collector,
      glare: r.glare,
      method: r.method,
      confidence: r.confidence,
      imageDistance: r.image_distance,
      matched: r.matched_id ? byId.get(r.matched_id) || null : null,
      candidates: (r.candidates || []).map((c: any) => (byId.has(c.id) ? { ...byId.get(c.id)!, distance: c.d } : null)).filter(Boolean),
      labelStatus: r.label_status,
      label: r.label_id ? byId.get(r.label_id) || null : null
    }))
  };
}

export async function sampleImage(id: number): Promise<Buffer | null> {
  const p = pool();
  if (!p || !ready || !Number.isInteger(id)) return null;
  const res = await p.query('SELECT image FROM scan_samples WHERE id = $1', [id]);
  return res.rows[0]?.image || null;
}

/**
 * Oznaczenie próbki. Kartę można podać identyfikatorem Scryfall albo kodem setu i numerem („dmu 123”).
 * Zwraca błąd do pokazania adminowi albo null.
 */
export async function labelSample(
  id: number,
  body: { status?: unknown; cardId?: unknown; setNumber?: unknown }
): Promise<{ error: string } | { ok: true; label: SampleCard | null }> {
  const p = pool();
  if (!p || !ready || !Number.isInteger(id)) return { error: 'Nie znaleziono próbki.' };
  const status = body.status;
  if (status !== 'card' && status !== 'not_card' && status !== 'pending') return { error: 'Nieprawidłowy status.' };
  let labelId: string | null = null;
  let label: SampleCard | null = null;
  if (status === 'card') {
    if (typeof body.cardId === 'string' && body.cardId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.cardId)) return { error: 'Nie znaleziono karty.' };
      labelId = body.cardId.toLowerCase();
    } else if (typeof body.setNumber === 'string') {
      const m = body.setNumber.trim().toLowerCase().match(/^([a-z0-9]{2,6})[\s/#-]+0*([0-9a-z★-]{1,10})$/);
      labelId = m ? cards.findIdBySetNumber(m[1], m[2]) : null;
      if (!labelId) return { error: 'Nie znaleziono karty o takim kodzie setu i numerze.' };
    }
    const [card] = labelId ? await cards.getCardsByIds([labelId]) : [];
    if (!card) return { error: 'Nie znaleziono karty.' };
    label = toSampleCard(card);
  }
  const res = await p.query(
    `UPDATE scan_samples SET label_status = $1::varchar, label_id = $2, labeled_at = CASE WHEN $1::varchar = 'pending' THEN NULL ELSE NOW() END WHERE id = $3`,
    [status, labelId, id]
  );
  if (!res.rowCount) return { error: 'Nie znaleziono próbki.' };
  return { ok: true, label };
}

export async function deleteSample(id: number): Promise<boolean> {
  const p = pool();
  if (!p || !ready || !Number.isInteger(id)) return false;
  return Boolean((await p.query('DELETE FROM scan_samples WHERE id = $1', [id])).rowCount);
}

// ---------- Ocena skanera ----------

export type EvalOutcome = 'correct' | 'same_name' | 'wrong' | 'wrong_unsure' | 'none' | 'rejected' | 'false_alarm';

export interface EvalSummary {
  total: number;
  cards: number;
  notCards: number;
  /** Dokładnie to wydanie. */
  correct: number;
  /** Właściwa karta, inne wydanie. */
  sameName: number;
  /** Inna karta podana jako pewna (pomyłka, którą użytkownik mógł zapisać). */
  wrong: number;
  /** Inna karta, ale z niską pewnością (skaner pokazałby ją jako niepewną). */
  wrongUnsure: number;
  /** Brak wyniku dla prawdziwej karty. */
  none: number;
  /** Próbki „to nie karta”, dla których skaner słusznie nic nie zwrócił. */
  rejected: number;
  /** Próbki „to nie karta”, dla których skaner coś zwrócił. */
  falseAlarm: number;
  /** Ile wyników przyszło już z szybkiej ścieżki (sam obraz, bez OCR). */
  quickPath: number;
  ms: number;
}

export interface EvalFailure {
  id: number;
  outcome: EvalOutcome;
  expected: SampleCard | null;
  got: SampleCard | null;
  confidence: number;
  method: string | null;
}

let evaluating = false;

/** Klasyfikacja wyniku względem oznaczenia (czysta funkcja — łatwa do sprawdzenia). */
export function classify(
  expectedId: string | null,
  expectedName: string | null,
  gotId: string | null,
  gotName: string | null,
  confidence: number,
  method: string | null
): EvalOutcome {
  if (!expectedId) return gotId ? 'false_alarm' : 'rejected';
  if (!gotId) return 'none';
  if (gotId === expectedId) return 'correct';
  if (expectedName && gotName && expectedName === gotName) return 'same_name';
  return confidence >= AUTO_ACCEPT_CONFIDENCE || method === 'set_number' ? 'wrong' : 'wrong_unsure';
}

/**
 * Puszcza oznaczone próbki przez rozpoznawanie tak, jak robi to klient:
 * najpierw sam obraz (wynik przyjęty od pewności QUICK_IMAGE_CONFIDENCE),
 * a gdy to nie wystarczy — z nazwą i stopką odczytanymi wtedy przez OCR.
 */
export async function evaluateSamples(): Promise<{ error: string } | { summary: EvalSummary; previous: EvalSummary | null; failures: EvalFailure[] }> {
  const p = pool();
  if (!p || !ready) return { error: 'Brak bazy danych.' };
  if (!cards.isCardDbReady() || !hashes.hasHashes()) return { error: 'Lokalna baza kart lub indeks obrazów nie jest jeszcze gotowy.' };
  if (evaluating) return { error: 'Ocena już trwa.' };
  evaluating = true;
  const started = Date.now();
  try {
    const rows = (
      await p.query(
        `SELECT id, image, hint_title, hint_set, hint_collector, label_status, label_id
           FROM scan_samples WHERE label_status IN ('card', 'not_card') ORDER BY created_at DESC LIMIT $1`,
        [EVAL_LIMIT]
      )
    ).rows;
    const s: EvalSummary = {
      total: rows.length, cards: 0, notCards: 0, correct: 0, sameName: 0, wrong: 0, wrongUnsure: 0,
      none: 0, rejected: 0, falseAlarm: 0, quickPath: 0, ms: 0
    };
    const failures: { id: number; outcome: EvalOutcome; expectedId: string | null; gotId: string | null; confidence: number; method: string | null }[] = [];

    for (const r of rows) {
      await new Promise((resolve) => setImmediate(resolve)); // nie blokujemy serwera
      const dataUrl = 'data:image/jpeg;base64,' + Buffer.from(r.image).toString('base64');
      let result = await identifyMtgLocal(dataUrl, '', '', '');
      if (result.matchedCard && result.confidence >= QUICK_IMAGE_CONFIDENCE) {
        s.quickPath++;
      } else if (r.hint_title || (r.hint_set && r.hint_collector)) {
        result = await identifyMtgLocal(dataUrl, r.hint_title, r.hint_set, r.hint_collector);
      }
      const expectedId = r.label_status === 'card' ? r.label_id : null;
      const gotId = result.matchedCard?.id || null;
      const outcome = classify(
        expectedId,
        expectedId ? cards.nameOfId(expectedId) : null,
        gotId,
        gotId ? cards.nameOfId(gotId) : null,
        result.confidence || 0,
        result.method || null
      );
      if (expectedId) s.cards++;
      else s.notCards++;
      const key = ({ correct: 'correct', same_name: 'sameName', wrong: 'wrong', wrong_unsure: 'wrongUnsure', none: 'none', rejected: 'rejected', false_alarm: 'falseAlarm' } as const)[outcome];
      s[key]++;
      if (outcome !== 'correct' && outcome !== 'rejected') {
        failures.push({ id: r.id, outcome, expectedId, gotId, confidence: result.confidence || 0, method: result.method || null });
      }
    }
    s.ms = Date.now() - started;

    const prev = await p.query('SELECT summary FROM scan_eval_runs ORDER BY id DESC LIMIT 1');
    await p.query('INSERT INTO scan_eval_runs (summary) VALUES ($1)', [JSON.stringify(s)]);
    // najgorsze najpierw: pewne pomyłki, potem fałszywe alarmy, brak wyniku, reszta
    const order: EvalOutcome[] = ['wrong', 'false_alarm', 'none', 'wrong_unsure', 'same_name'];
    failures.sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome));
    const shown = failures.slice(0, 100);
    const ids = [...new Set(shown.flatMap((f) => [f.expectedId, f.gotId]).filter(Boolean) as string[])];
    const byId = new Map((await cards.getCardsByIds(ids)).map((c) => [c.id, toSampleCard(c)]));
    console.log(`[Próbki skanera] Ocena: ${JSON.stringify(s)}`);
    return {
      summary: s,
      previous: prev.rows[0]?.summary || null,
      failures: shown.map((f) => ({
        id: f.id,
        outcome: f.outcome,
        expected: f.expectedId ? byId.get(f.expectedId) || null : null,
        got: f.gotId ? byId.get(f.gotId) || null : null,
        confidence: f.confidence,
        method: f.method
      }))
    };
  } finally {
    evaluating = false;
  }
}

export async function lastEvaluation(): Promise<{ summary: EvalSummary; createdAt: string } | null> {
  const p = pool();
  if (!p || !ready) return null;
  const res = await p.query('SELECT summary, created_at FROM scan_eval_runs ORDER BY id DESC LIMIT 1');
  return res.rows[0] ? { summary: res.rows[0].summary, createdAt: res.rows[0].created_at } : null;
}
