import path from 'path';
import { AppSettings } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
import { mapSettingsRow } from '../mappers';

const ROWS_PER_PAGE_OPTIONS = [12, 24, 48, 60];

/** Akceptujemy tylko dozwolone wartości; inne (lub brak) nie nadpisują zapisanej. */
function normalizeRowsPerPage(value: unknown): number | null {
  const n = Number(value);
  return ROWS_PER_PAGE_OPTIONS.includes(n) ? n : null;
}

/** Język interfejsu: tylko 'pl' lub 'en'; inna wartość nie nadpisuje zapisanej. */
function normalizeLanguage(value: unknown): 'pl' | 'en' | null {
  return value === 'pl' || value === 'en' ? value : null;
}

export async function getSettings(userId: string): Promise<AppSettings | null> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT pricing_source as "pricingSource", currency, eur_to_pln_rate as "eurToPlnRate",
                usd_to_pln_rate as "usdToPlnRate", auto_nbp_rate as "autoNbpRate",
                collection_rows_per_page as "collectionRowsPerPage", ui_language as "language"
         FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      return res.rows[0] ? mapSettingsRow(res.rows[0]) : null;
    },
    () => {
      const userDir = getUserDir(userId);
      return readJsonFile<AppSettings | null>(path.join(userDir, 'settings.json'), null);
    }
  );
}

export async function saveSettings(userId: string, settings: AppSettings): Promise<AppSettings> {
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO user_settings (user_id, pricing_source, currency, eur_to_pln_rate, usd_to_pln_rate, auto_nbp_rate, collection_rows_per_page, ui_language, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           pricing_source = EXCLUDED.pricing_source,
           currency = EXCLUDED.currency,
           eur_to_pln_rate = EXCLUDED.eur_to_pln_rate,
           usd_to_pln_rate = EXCLUDED.usd_to_pln_rate,
           auto_nbp_rate = EXCLUDED.auto_nbp_rate,
           collection_rows_per_page = COALESCE(EXCLUDED.collection_rows_per_page, user_settings.collection_rows_per_page),
           ui_language = COALESCE(EXCLUDED.ui_language, user_settings.ui_language),
           updated_at = NOW()`,
        [
          userId,
          settings.pricingSource,
          settings.currency,
          settings.eurToPlnRate,
          settings.usdToPlnRate,
          settings.autoNbpRate,
          normalizeRowsPerPage(settings.collectionRowsPerPage),
          normalizeLanguage(settings.language)
        ]
      );
      return settings;
    },
    () => {
      const userDir = getUserDir(userId);
      writeJsonAtomic(path.join(userDir, 'settings.json'), settings);
      return settings;
    }
  );
}
