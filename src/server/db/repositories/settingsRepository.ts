import path from 'path';
import { AppSettings } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir } from '../storage';
import { mapSettingsRow } from '../mappers';
import { SALE_ADJUST_MIN, SALE_ADJUST_MAX } from '../../../utils/formatters';
import { isGameAvailable } from '../../../games';

const ROWS_PER_PAGE_OPTIONS = [12, 24, 48, 60];

/** Akceptujemy tylko dozwolone wartości; inne (lub brak) nie nadpisują zapisanej. */
function normalizeRowsPerPage(value: unknown): number | null {
  const n = Number(value);
  return ROWS_PER_PAGE_OPTIONS.includes(n) ? n : null;
}

/** Przełącznik tak/nie; brak wartości (np. ze starszej wersji aplikacji) nie nadpisuje zapisanej. */
function normalizeFlag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Język interfejsu: tylko 'pl' lub 'en'; inna wartość nie nadpisuje zapisanej. */
function normalizeLanguage(value: unknown): 'pl' | 'en' | null {
  return value === 'pl' || value === 'en' ? value : null;
}

/** Korekta ceny sprzedaży w %: liczba z dozwolonego zakresu (2 miejsca po przecinku); brak wartości nie nadpisuje zapisanej. */
function normalizeSaleAdjust(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(SALE_ADJUST_MAX, Math.max(SALE_ADJUST_MIN, n)) * 100) / 100;
}

export async function getSettings(userId: string): Promise<AppSettings | null> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT pricing_source as "pricingSource", currency, eur_to_pln_rate as "eurToPlnRate",
                usd_to_pln_rate as "usdToPlnRate", auto_nbp_rate as "autoNbpRate",
                collection_rows_per_page as "collectionRowsPerPage", ui_language as "language",
                show_binder_badge as "showBinderBadge", show_edhrec_rank as "showEdhrecRank",
                show_price_tag as "showPriceTag", show_foil_badge as "showFoilBadge",
                sale_trend_adjust_pct as "saleTrendAdjustPct", active_game as "activeGame"
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
        `INSERT INTO user_settings (user_id, pricing_source, currency, eur_to_pln_rate, usd_to_pln_rate, auto_nbp_rate, collection_rows_per_page, ui_language,
                                    show_binder_badge, show_edhrec_rank, show_price_tag, show_foil_badge, sale_trend_adjust_pct, active_game, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           pricing_source = EXCLUDED.pricing_source,
           currency = EXCLUDED.currency,
           eur_to_pln_rate = EXCLUDED.eur_to_pln_rate,
           usd_to_pln_rate = EXCLUDED.usd_to_pln_rate,
           auto_nbp_rate = EXCLUDED.auto_nbp_rate,
           collection_rows_per_page = COALESCE(EXCLUDED.collection_rows_per_page, user_settings.collection_rows_per_page),
           ui_language = COALESCE(EXCLUDED.ui_language, user_settings.ui_language),
           show_binder_badge = COALESCE(EXCLUDED.show_binder_badge, user_settings.show_binder_badge),
           show_edhrec_rank = COALESCE(EXCLUDED.show_edhrec_rank, user_settings.show_edhrec_rank),
           show_price_tag = COALESCE(EXCLUDED.show_price_tag, user_settings.show_price_tag),
           show_foil_badge = COALESCE(EXCLUDED.show_foil_badge, user_settings.show_foil_badge),
           sale_trend_adjust_pct = COALESCE(EXCLUDED.sale_trend_adjust_pct, user_settings.sale_trend_adjust_pct),
           active_game = COALESCE(EXCLUDED.active_game, user_settings.active_game),
           updated_at = NOW()`,
        [
          userId,
          settings.pricingSource,
          settings.currency,
          settings.eurToPlnRate,
          settings.usdToPlnRate,
          settings.autoNbpRate,
          normalizeRowsPerPage(settings.collectionRowsPerPage),
          normalizeLanguage(settings.language),
          normalizeFlag(settings.showBinderBadge),
          normalizeFlag(settings.showEdhrecRank),
          normalizeFlag(settings.showPriceTag),
          normalizeFlag(settings.showFoilBadge),
          normalizeSaleAdjust(settings.saleTrendAdjustPct),
          isGameAvailable(settings.activeGame) ? settings.activeGame : null
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
