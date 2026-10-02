import path from 'path';
import fs from 'fs';
import { withDb, readJsonFile, writeJsonAtomic, getUserDir, DATA_DIR } from '../storage';

/**
 * Profil użytkownika: opcjonalna miejscowość (do mapy sprzedawców).
 * Przechowujemy tylko miasto i współrzędne jego centrum (zaokrąglone do ~1 km),
 * nigdy dokładny adres.
 */
export interface UserProfile {
  city: string | null; // krótka nazwa, np. "Kraków"
  cityLabel: string | null; // pełniejszy opis, np. "Kraków, małopolskie, Polska"
  countryCode: string | null; // np. "pl"
  lat: number | null;
  lon: number | null;
}

export interface UserLocation {
  userId: string;
  city: string;
  cityLabel: string;
  countryCode: string | null;
  lat: number;
  lon: number;
}

const EMPTY: UserProfile = { city: null, cityLabel: null, countryCode: null, lat: null, lon: null };

function mapRow(r: any): UserProfile {
  return {
    city: r.city ?? null,
    cityLabel: r.city_label ?? r.cityLabel ?? null,
    countryCode: r.country_code ?? r.countryCode ?? null,
    lat: r.lat === null || r.lat === undefined ? null : Number(r.lat),
    lon: r.lon === null || r.lon === undefined ? null : Number(r.lon)
  };
}

export async function getProfile(userId: string): Promise<UserProfile> {
  return withDb(
    async (p) => {
      const res = await p.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      return res.rows[0] ? mapRow(res.rows[0]) : { ...EMPTY };
    },
    () => readJsonFile<UserProfile>(path.join(getUserDir(userId), 'profile.json'), { ...EMPTY })
  );
}

export async function saveProfile(userId: string, profile: UserProfile): Promise<UserProfile> {
  return withDb(
    async (p) => {
      await p.query(
        `INSERT INTO user_profiles (user_id, city, city_label, country_code, lat, lon, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           city = EXCLUDED.city, city_label = EXCLUDED.city_label, country_code = EXCLUDED.country_code,
           lat = EXCLUDED.lat, lon = EXCLUDED.lon, updated_at = NOW()`,
        [userId, profile.city, profile.cityLabel, profile.countryCode, profile.lat, profile.lon]
      );
      return profile;
    },
    () => {
      writeJsonAtomic(path.join(getUserDir(userId), 'profile.json'), profile);
      return profile;
    }
  );
}

/** Wszyscy użytkownicy, którzy podali miejscowość. */
export async function getAllLocations(): Promise<UserLocation[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        'SELECT user_id, city, city_label, country_code, lat, lon FROM user_profiles WHERE lat IS NOT NULL AND lon IS NOT NULL AND city IS NOT NULL'
      );
      return res.rows.map((r) => ({ userId: r.user_id, ...(mapRow(r) as any) }));
    },
    () => {
      const usersDir = path.join(DATA_DIR, 'users');
      if (!fs.existsSync(usersDir)) return [];
      const out: UserLocation[] = [];
      for (const userId of fs.readdirSync(usersDir)) {
        const prof = readJsonFile<UserProfile | null>(path.join(usersDir, userId, 'profile.json'), null);
        if (prof?.city && prof.lat !== null && prof.lon !== null) out.push({ userId, ...(prof as any) });
      }
      return out;
    }
  );
}

/** Liczba kart na sprzedaż per użytkownik (sztuki i pozycje). */
export async function getForSaleCounts(): Promise<Map<string, { cards: number; items: number }>> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT user_id, COALESCE(SUM(quantity + quantity_foil), 0)::int AS cards, COUNT(*)::int AS items
         FROM user_collections WHERE is_for_sale = TRUE GROUP BY user_id`
      );
      return new Map(res.rows.map((r) => [r.user_id, { cards: r.cards, items: r.items }]));
    },
    () => new Map()
  );
}

/**
 * Ile różnych kart z listy życzeń `userId` ma każdy inny użytkownik —
 * w całej kolekcji i na sprzedaż. Porównujemy po nazwie karty (dowolne wydanie).
 */
export async function getWishlistMatches(
  userId: string,
  wishlistNames: string[]
): Promise<Record<string, { collection: number; forSale: number }>> {
  const names = [...new Set(wishlistNames.map((n) => n.toLowerCase().trim()).filter(Boolean))];
  if (names.length === 0) return {};
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT user_id,
                COUNT(DISTINCT lower(card->>'name'))::int AS collection,
                (COUNT(DISTINCT lower(card->>'name')) FILTER (WHERE is_for_sale = TRUE))::int AS for_sale
         FROM user_collections
         WHERE user_id <> $1 AND lower(card->>'name') = ANY($2::text[]) AND (quantity + quantity_foil) > 0
         GROUP BY user_id`,
        [userId, names]
      );
      const out: Record<string, { collection: number; forSale: number }> = {};
      for (const r of res.rows) out[r.user_id] = { collection: r.collection, forSale: r.for_sale };
      return out;
    },
    () => ({})
  );
}
