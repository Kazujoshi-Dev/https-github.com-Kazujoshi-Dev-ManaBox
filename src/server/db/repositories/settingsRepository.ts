import path from 'path';
import { AppSettings } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
import { mapSettingsRow } from '../mappers';

export async function getSettings(userId: string): Promise<AppSettings | null> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT pricing_source as "pricingSource", currency, eur_to_pln_rate as "eurToPlnRate",
                usd_to_pln_rate as "usdToPlnRate", auto_nbp_rate as "autoNbpRate"
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
        `INSERT INTO user_settings (user_id, pricing_source, currency, eur_to_pln_rate, usd_to_pln_rate, auto_nbp_rate, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           pricing_source = EXCLUDED.pricing_source,
           currency = EXCLUDED.currency,
           eur_to_pln_rate = EXCLUDED.eur_to_pln_rate,
           usd_to_pln_rate = EXCLUDED.usd_to_pln_rate,
           auto_nbp_rate = EXCLUDED.auto_nbp_rate,
           updated_at = NOW()`,
        [
          userId,
          settings.pricingSource,
          settings.currency,
          settings.eurToPlnRate,
          settings.usdToPlnRate,
          settings.autoNbpRate
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
