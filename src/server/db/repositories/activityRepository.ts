/**
 * Statystyki logowań i aktywności użytkowników (panel administratora).
 *
 * Założenia: zero dodatkowych zapytań przy zwykłych żądaniach i minimum danych osobowych.
 * - Aktywność: najwyżej jeden wiersz na użytkownika na dzień (dzień + typ urządzenia), bez IP
 *   i bez listy odwiedzanych stron. Kto był już dziś zapisany, sprawdzamy w pamięci.
 * - Logowania, nieudane logowania, rejestracje i wylogowania: tylko dzienne liczniki.
 * - Wszystko zbieramy w pamięci i zapisujemy do bazy jednym zapytaniem co minutę.
 * - Dane starsze niż ACTIVITY_RETENTION_DAYS usuwamy przy codziennych porządkach.
 * Bez PostgreSQL moduł nic nie zapisuje, a panel pokazuje, że statystyki są niedostępne.
 */
import { getPool, isPostgresActive } from '../storage';

const TZ = 'Europe/Warsaw';
const FLUSH_INTERVAL_MS = 60_000;
export const ACTIVITY_RETENTION_DAYS = 400;
/** Ile pozycji czekających na zapis trzymamy najwyżej w pamięci (ochrona przed zalewem żądań). */
const MAX_PENDING = 50_000;

export type AuthEventKind = 'login' | 'login_failed' | 'register' | 'logout';
export type DeviceKind = 'mobile' | 'desktop';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Dzisiejsza data w czasie polskim (RRRR-MM-DD). */
export const warsawDay = (d = new Date()) => dayFmt.format(d);

export function deviceFromUserAgent(ua: string | null | undefined): DeviceKind {
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua || '') ? 'mobile' : 'desktop';
}

let seenDay = warsawDay();
const seenToday = new Set<string>(); // userId|device już zapisani dzisiaj (albo czekający na zapis)
const pendingActivity = new Map<string, { day: string; userId: string; device: DeviceKind }>();
const pendingEvents = new Map<string, { day: string; kind: AuthEventKind; n: number }>();
let flushing = false;
let schemaReady = false;

function active(): boolean {
  return schemaReady && isPostgresActive() && getPool() !== null;
}

function rollDay(today: string) {
  if (today !== seenDay) {
    seenDay = today;
    seenToday.clear();
  }
}

/** Zapamiętuje, że użytkownik był dziś aktywny. Wywoływane przy uwierzytelnionych żądaniach: tylko operacje w pamięci. */
export function recordUserActivity(userId: string, userAgent?: string | null): void {
  if (!active() || !userId) return;
  const today = warsawDay();
  rollDay(today);
  const device = deviceFromUserAgent(userAgent);
  const key = `${userId}|${device}`;
  if (seenToday.has(key) || pendingActivity.size >= MAX_PENDING) return;
  seenToday.add(key);
  pendingActivity.set(`${today}|${key}`, { day: today, userId, device });
}

/** Zwiększa dzienny licznik zdarzenia logowania. */
export function recordAuthEvent(kind: AuthEventKind): void {
  if (!active()) return;
  const day = warsawDay();
  const key = `${day}|${kind}`;
  const cur = pendingEvents.get(key);
  if (cur) cur.n++;
  else if (pendingEvents.size < MAX_PENDING) pendingEvents.set(key, { day, kind, n: 1 });
}

/** Zapisuje zebrane dane do bazy (dwa zapytania zbiorcze). */
export async function flushActivity(): Promise<void> {
  const p = getPool();
  if (!active() || !p || flushing || (!pendingActivity.size && !pendingEvents.size)) return;
  flushing = true;
  const acts = [...pendingActivity.values()];
  const events = [...pendingEvents.values()];
  pendingActivity.clear();
  pendingEvents.clear();
  try {
    if (acts.length) {
      // Konto mogło zostać usunięte w międzyczasie: wstawiamy tylko istniejących użytkowników
      await p.query(
        `INSERT INTO user_activity_daily (day, user_id, device)
         SELECT a.day, a.user_id, a.device
           FROM unnest($1::date[], $2::text[], $3::text[]) AS a(day, user_id, device)
           JOIN users u ON u.id = a.user_id
         ON CONFLICT DO NOTHING`,
        [acts.map((a) => a.day), acts.map((a) => a.userId), acts.map((a) => a.device)]
      );
    }
    if (events.length) {
      await p.query(
        `INSERT INTO auth_events_daily (day, kind, n)
         SELECT * FROM unnest($1::date[], $2::text[], $3::int[])
         ON CONFLICT (day, kind) DO UPDATE SET n = auth_events_daily.n + EXCLUDED.n`,
        [events.map((e) => e.day), events.map((e) => e.kind), events.map((e) => e.n)]
      );
    }
  } catch (err: any) {
    console.warn('[Aktywność] Zapis statystyk nieudany:', err?.message || err);
  } finally {
    flushing = false;
  }
}

export async function purgeOldActivity(): Promise<void> {
  const p = getPool();
  if (!active() || !p) return;
  await p.query(`DELETE FROM user_activity_daily WHERE day < CURRENT_DATE - $1::int`, [ACTIVITY_RETENTION_DAYS]);
  await p.query(`DELETE FROM auth_events_daily WHERE day < CURRENT_DATE - $1::int`, [ACTIVITY_RETENTION_DAYS]);
}

/** Tworzy tabele i uruchamia okresowy zapis. Przy pierwszym uruchomieniu uzupełnia aktywność z istniejących sesji. */
export async function startActivityTracking(): Promise<void> {
  const p = getPool();
  if (!isPostgresActive() || !p) return;
  const existed = await p.query(`SELECT to_regclass('public.user_activity_daily') AS t`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS user_activity_daily (
      day DATE NOT NULL,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device VARCHAR(8) NOT NULL DEFAULT 'desktop',
      PRIMARY KEY (day, user_id, device)
    );
    CREATE INDEX IF NOT EXISTS idx_user_activity_daily_user ON user_activity_daily(user_id);
    CREATE TABLE IF NOT EXISTS auth_events_daily (
      day DATE NOT NULL,
      kind VARCHAR(16) NOT NULL,
      n INT NOT NULL DEFAULT 0,
      PRIMARY KEY (day, kind)
    );
  `);
  if (!existed.rows[0]?.t) {
    // Start historii: dni ostatniego użycia i utworzenia istniejących sesji
    await p.query(`
      INSERT INTO user_activity_daily (day, user_id, device)
      SELECT DISTINCT d.day, s.user_id,
             CASE WHEN s.user_agent ~* '(Mobi|Android|iPhone|iPad|iPod|Windows Phone)' THEN 'mobile' ELSE 'desktop' END
        FROM user_sessions s
        CROSS JOIN LATERAL (VALUES ((s.last_used_at AT TIME ZONE '${TZ}')::date), ((s.created_at AT TIME ZONE '${TZ}')::date)) AS d(day)
      ON CONFLICT DO NOTHING`).catch((err) => console.warn('[Aktywność] Uzupełnianie z sesji nieudane:', err?.message || err));
  }
  schemaReady = true;
  setInterval(() => { flushActivity().catch(() => {}); }, FLUSH_INTERVAL_MS).unref();
  const purge = () => purgeOldActivity().catch((err) => console.warn('[Aktywność] Czyszczenie nieudane:', err?.message || err));
  purge();
  setInterval(purge, 24 * 60 * 60 * 1000).unref();
}

// ---------- Odczyt dla panelu administratora ----------

export interface ActivityDay {
  day: string;
  active: number;
  mobile: number;
  desktop: number;
  logins: number;
  failedLogins: number;
  registrations: number;
}

export interface ActivityStats {
  available: boolean;
  days: number;
  onlineNow: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  logins7d: number;
  failedLogins7d: number;
  registrations30d: number;
  /** Użytkownicy zarejestrowani 8–37 dni temu, którzy wrócili w ciągu ostatnich 7 dni (%). */
  returningPct: number | null;
  series: ActivityDay[];
  topUsers: { id: string; username: string; activeDays: number; lastActiveAt: string | null }[];
  generatedAt: string;
}

const EMPTY = (days: number): ActivityStats => ({
  available: false, days, onlineNow: 0, activeToday: 0, active7d: 0, active30d: 0, logins7d: 0, failedLogins7d: 0,
  registrations30d: 0, returningPct: null, series: [], topUsers: [], generatedAt: new Date().toISOString()
});

const statsCache = new Map<number, { at: number; data: ActivityStats }>();
const STATS_CACHE_MS = 60_000;

/** Statystyki z ostatnich `days` dni (7–365). Wynik trzymamy w pamięci przez minutę. */
export async function getActivityStats(days: number): Promise<ActivityStats> {
  const p = getPool();
  if (!active() || !p) return EMPTY(days);
  const cached = statsCache.get(days);
  if (cached && Date.now() - cached.at < STATS_CACHE_MS) return cached.data;
  await flushActivity(); // świeże dane z ostatniej minuty

  const today = `(NOW() AT TIME ZONE '${TZ}')::date`;
  const [summary, series, top] = await Promise.all([
    p.query(`
      SELECT
        (SELECT COUNT(DISTINCT user_id) FROM user_sessions
          WHERE revoked_at IS NULL AND expires_at > NOW() AND last_used_at > NOW() - INTERVAL '15 minutes')::int AS online,
        (SELECT COUNT(DISTINCT user_id) FROM user_activity_daily WHERE day = ${today})::int AS d1,
        (SELECT COUNT(DISTINCT user_id) FROM user_activity_daily WHERE day > ${today} - 7)::int AS d7,
        (SELECT COUNT(DISTINCT user_id) FROM user_activity_daily WHERE day > ${today} - 30)::int AS d30,
        (SELECT COALESCE(SUM(n), 0) FROM auth_events_daily WHERE kind = 'login' AND day > ${today} - 7)::int AS logins7,
        (SELECT COALESCE(SUM(n), 0) FROM auth_events_daily WHERE kind = 'login_failed' AND day > ${today} - 7)::int AS failed7,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days')::int AS reg30,
        (SELECT COUNT(*) FROM users WHERE created_at BETWEEN NOW() - INTERVAL '37 days' AND NOW() - INTERVAL '8 days')::int AS cohort,
        (SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_activity_daily a ON a.user_id = u.id
          WHERE u.created_at BETWEEN NOW() - INTERVAL '37 days' AND NOW() - INTERVAL '8 days'
            AND a.day > ${today} - 7)::int AS returned
    `),
    p.query(
      `WITH d AS (SELECT generate_series(${today} - ($1::int - 1), ${today}, INTERVAL '1 day')::date AS day)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(a.active, 0)::int AS active, COALESCE(a.mobile, 0)::int AS mobile, COALESCE(a.desktop, 0)::int AS desktop,
              COALESCE(e.logins, 0)::int AS logins, COALESCE(e.failed, 0)::int AS failed, COALESCE(r.n, 0)::int AS registrations
         FROM d
         LEFT JOIN (SELECT day, COUNT(DISTINCT user_id) AS active,
                           COUNT(DISTINCT user_id) FILTER (WHERE device = 'mobile') AS mobile,
                           COUNT(DISTINCT user_id) FILTER (WHERE device = 'desktop') AS desktop
                      FROM user_activity_daily WHERE day > ${today} - $1::int GROUP BY day) a ON a.day = d.day
         LEFT JOIN (SELECT day, SUM(n) FILTER (WHERE kind = 'login') AS logins, SUM(n) FILTER (WHERE kind = 'login_failed') AS failed
                      FROM auth_events_daily WHERE day > ${today} - $1::int GROUP BY day) e ON e.day = d.day
         LEFT JOIN (SELECT (created_at AT TIME ZONE '${TZ}')::date AS day, COUNT(*) AS n
                      FROM users WHERE created_at > NOW() - ($1::int + 1) * INTERVAL '1 day' GROUP BY 1) r ON r.day = d.day
        ORDER BY d.day`,
      [days]
    ),
    p.query(
      `SELECT u.id, u.username, a.days::int AS active_days, s.last_active
         FROM (SELECT user_id, COUNT(DISTINCT day) AS days FROM user_activity_daily
                WHERE day > ${today} - $1::int GROUP BY user_id ORDER BY days DESC LIMIT 10) a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN (SELECT user_id, MAX(last_used_at) AS last_active FROM user_sessions GROUP BY user_id) s ON s.user_id = u.id
        ORDER BY a.days DESC, s.last_active DESC NULLS LAST`,
      [days]
    )
  ]);

  const x = summary.rows[0];
  const data: ActivityStats = {
    available: true,
    days,
    onlineNow: x.online,
    activeToday: x.d1,
    active7d: x.d7,
    active30d: x.d30,
    logins7d: x.logins7,
    failedLogins7d: x.failed7,
    registrations30d: x.reg30,
    returningPct: x.cohort > 0 ? Math.round((x.returned / x.cohort) * 100) : null,
    series: series.rows.map((r: any) => ({
      day: r.day, active: r.active, mobile: r.mobile, desktop: r.desktop,
      logins: r.logins, failedLogins: r.failed, registrations: r.registrations
    })),
    topUsers: top.rows.map((r: any) => ({
      id: r.id, username: r.username, activeDays: r.active_days,
      lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null
    })),
    generatedAt: new Date().toISOString()
  };
  statsCache.set(days, { at: Date.now(), data });
  return data;
}
