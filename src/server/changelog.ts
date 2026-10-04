/**
 * Dziennik zmian: wpisy „na brudno” z changelog/drafts.ts są wczytywane do bazy przy starcie,
 * a codziennie o 23:30 (Europe/Warsaw) publikowane jako wpis dnia.
 */
import crypto from 'crypto';
import type express from 'express';
import * as db from './db';
import { CHANGELOG_DRAFTS } from '../../changelog/drafts';
import type { ChangelogRelease } from './db';

const TZ = 'Europe/Warsaw';
const PUBLISH_HOUR = 23;
const PUBLISH_MINUTE = 30;
const TYPES = new Set(['new', 'improved', 'fixed']);

/** Dzień i godzina w Polsce. */
function warsawNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

const prevDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const afterPublishTime = (t: { hour: number; minute: number }) => t.hour > PUBLISH_HOUR || (t.hour === PUBLISH_HOUR && t.minute >= PUBLISH_MINUTE);

/** Ostatni dzień, który powinien już być opublikowany. */
export function publishCutoff(now = new Date()): string {
  const t = warsawNow(now);
  return afterPublishTime(t) ? t.day : prevDay(t.day);
}

let lastAutoPublishDay: string | null = null;

async function publishDue(reason: string) {
  const cutoff = publishCutoff();
  const n = await db.publishChangelogUpTo(cutoff);
  if (n > 0) console.log(`[Dziennik zmian] Opublikowano ${n} zmian (do ${cutoff}, ${reason}).`);
  return n;
}

/** Wczytuje wpisy z repozytorium, nadrabia zaległe publikacje i uruchamia codzienną publikację o 23:30. */
export async function startChangelog() {
  try {
    const valid = CHANGELOG_DRAFTS.filter((d) => d.id && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && TYPES.has(d.type) && d.text?.trim());
    await db.syncChangelogDrafts(valid);
    await publishDue('start');
  } catch (err: any) {
    console.warn('[Dziennik zmian] Start nieudany:', err?.message || err);
  }
  setInterval(() => {
    const t = warsawNow();
    if (!afterPublishTime(t) || lastAutoPublishDay === t.day) return;
    lastAutoPublishDay = t.day;
    publishDue('23:30').catch((err) => console.warn('[Dziennik zmian] Publikacja nieudana:', err?.message || err));
  }, 60_000).unref?.();
}

/** Bez PostgreSQL: dziennik liczony wprost z pliku (bez wpisów dodanych w panelu). */
function releasesFromFile(): ChangelogRelease[] {
  const cutoff = publishCutoff();
  const byDay = new Map<string, ChangelogRelease>();
  const order = { new: 0, improved: 1, fixed: 2 } as const;
  for (const d of CHANGELOG_DRAFTS) {
    if (d.day > cutoff) continue;
    if (!byDay.has(d.day)) byDay.set(d.day, { day: d.day, publishedAt: `${d.day}T21:30:00.000Z`, items: [] });
    byDay.get(d.day)!.items.push({ id: d.id, type: d.type, area: d.area || null, text: d.text });
  }
  return [...byDay.values()]
    .map((r) => ({ ...r, items: r.items.sort((a, b) => order[a.type] - order[b.type]) }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

export function registerChangelogRoutes(app: express.Express, admin: express.Router, sendServerError: (res: express.Response, err: unknown, where: string, msg?: string) => void) {
  app.get('/api/changelog', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 120);
      const releases = db.isPostgresActive() ? await db.listChangelogReleases(limit) : releasesFromFile().slice(0, limit);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ releases, publishTime: `${PUBLISH_HOUR}:${String(PUBLISH_MINUTE).padStart(2, '0')}` });
    } catch (err) {
      sendServerError(res, err, '/api/changelog');
    }
  });

  admin.get('/changelog/pending', async (_req, res) => {
    try {
      res.json({ drafts: await db.listPendingChangelogDrafts(), cutoff: publishCutoff() });
    } catch (err) {
      sendServerError(res, err, '/api/admin/changelog/pending');
    }
  });

  admin.post('/changelog/drafts', async (req, res) => {
    try {
      const type = String(req.body?.type || '');
      const text = String(req.body?.text || '').trim();
      const area = String(req.body?.area || '').trim().slice(0, 60) || null;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.day || '')) ? String(req.body.day) : warsawNow().day;
      if (!TYPES.has(type)) return res.status(400).json({ error: 'Nieprawidłowy rodzaj zmiany.' });
      if (text.length < 3 || text.length > 500) return res.status(400).json({ error: 'Opis zmiany musi mieć od 3 do 500 znaków.' });
      const id = `adm-${crypto.randomUUID()}`;
      await db.addChangelogDraft({ id, day, type: type as any, area, text });
      res.json({ success: true, id });
    } catch (err) {
      sendServerError(res, err, '/api/admin/changelog/drafts');
    }
  });

  admin.delete('/changelog/drafts/:id', async (req, res) => {
    try {
      const ok = await db.deleteChangelogDraft(String(req.params.id));
      if (!ok) return res.status(404).json({ error: 'Nie znaleziono wpisu.' });
      res.json({ success: true });
    } catch (err) {
      sendServerError(res, err, '/api/admin/changelog/drafts/:id');
    }
  });

  /** Publikacja od razu, bez czekania do 23:30 (wpisy do dzisiaj włącznie). */
  admin.post('/changelog/publish', async (_req, res) => {
    try {
      const n = await db.publishChangelogUpTo(warsawNow().day);
      res.json({ success: true, published: n });
    } catch (err) {
      sendServerError(res, err, '/api/admin/changelog/publish');
    }
  });
}
