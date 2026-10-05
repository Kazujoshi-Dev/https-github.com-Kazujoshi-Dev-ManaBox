import { withDb } from '../storage';

export type BugReportStatus = 'new' | 'in_progress' | 'resolved' | 'rejected';

export interface BugReport {
  id: number;
  userId: string | null;
  username: string | null;
  description: string;
  page: string | null;
  userAgent: string | null;
  hasScreenshot: boolean;
  status: BugReportStatus;
  createdAt: string;
  updatedAt: string;
}

const NO_DB = () => {
  throw new Error('Zgłoszenia błędów wymagają bazy PostgreSQL.');
};

const mapRow = (r: any): BugReport => ({
  id: r.id,
  userId: r.user_id,
  username: r.username,
  description: r.description,
  page: r.page,
  userAgent: r.user_agent,
  hasScreenshot: Boolean(r.has_screenshot),
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString()
});

export async function createBugReport(input: {
  userId: string;
  username: string;
  description: string;
  page: string | null;
  userAgent: string | null;
  screenshot: Buffer | null;
  screenshotType: string | null;
}): Promise<BugReport> {
  return withDb(async (p) => {
    const res = await p.query(
      `INSERT INTO bug_reports (user_id, username, description, page, user_agent, screenshot, screenshot_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, username, description, page, user_agent, screenshot IS NOT NULL AS has_screenshot, status, created_at, updated_at`,
      [input.userId, input.username, input.description, input.page, input.userAgent, input.screenshot, input.screenshotType]
    );
    return mapRow(res.rows[0]);
  }, NO_DB);
}

export async function listBugReports(status: BugReportStatus | 'open' | 'all', limit = 200): Promise<BugReport[]> {
  return withDb(async (p) => {
    const where = status === 'all' ? '' : status === 'open' ? `WHERE status IN ('new', 'in_progress')` : 'WHERE status = $2';
    const res = await p.query(
      `SELECT id, user_id, username, description, page, user_agent, screenshot IS NOT NULL AS has_screenshot, status, created_at, updated_at
         FROM bug_reports ${where}
        ORDER BY created_at DESC LIMIT $1`,
      status === 'all' || status === 'open' ? [limit] : [limit, status]
    );
    return res.rows.map(mapRow);
  }, () => []);
}

export async function countOpenBugReports(): Promise<number> {
  return withDb(async (p) => {
    const res = await p.query(`SELECT COUNT(*)::int AS n FROM bug_reports WHERE status = 'new'`);
    return res.rows[0]?.n || 0;
  }, () => 0);
}

export async function getBugReportScreenshot(id: number): Promise<{ data: Buffer; type: string } | null> {
  return withDb(async (p) => {
    const res = await p.query('SELECT screenshot, screenshot_type FROM bug_reports WHERE id = $1 AND screenshot IS NOT NULL', [id]);
    return res.rows[0] ? { data: res.rows[0].screenshot, type: res.rows[0].screenshot_type || 'image/jpeg' } : null;
  }, () => null);
}

export async function setBugReportStatus(id: number, status: BugReportStatus): Promise<boolean> {
  return withDb(async (p) => {
    const res = await p.query('UPDATE bug_reports SET status = $2, updated_at = NOW() WHERE id = $1', [id, status]);
    return (res.rowCount ?? 0) > 0;
  }, () => false);
}

export async function deleteBugReport(id: number): Promise<boolean> {
  return withDb(async (p) => {
    const res = await p.query('DELETE FROM bug_reports WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }, () => false);
}

/** Ile zgłoszeń wysłał użytkownik w ostatniej dobie (ochrona przed zalewem). */
export async function countUserBugReportsDay(userId: string): Promise<number> {
  return withDb(async (p) => {
    const res = await p.query(`SELECT COUNT(*)::int AS n FROM bug_reports WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [userId]);
    return res.rows[0]?.n || 0;
  }, () => 0);
}
