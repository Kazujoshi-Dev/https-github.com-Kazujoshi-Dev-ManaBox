import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import * as db from './src/server/db';
import type { PriceUpdate } from './src/server/db';
import { hashPassword, verifyPassword, generateToken, verifyToken } from './src/server/auth';
import { rateLimit } from './src/server/rateLimit';
import * as cards from './src/server/cards/cardStore';
import * as hashes from './src/server/cards/hashIndex';
import { computeCardHash, decodeJpegToGray } from './src/server/cards/imageHash';
import { normalizeName, nameSimilarity } from './src/server/cards/nameMatch';
import { searchCities, resolveSuggestion } from './src/server/geo';

const app = express();
const PORT = 3000;

// Aplikacja stoi za jednym reverse proxy (Caddy) — dzięki temu req.ip to prawdziwy adres klienta.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Mały limit dla logowania/rejestracji, większy dla reszty (skaner wysyła obrazy w base64).
app.use('/api/auth', express.json({ limit: '20kb' }));
app.use('/api/csp-report', express.json({
  limit: '10kb',
  type: ['application/csp-report', 'application/reports+json', 'application/json']
}));
app.use(express.json({ limit: '10mb' }));

// Content-Security-Policy (tylko produkcja — tryb deweloperski Vite wymaga skryptów inline).
// Dozwolone źródła wynikają z tego, czego używa frontend:
//  - cdn.jsdelivr.net: silnik OCR Tesseract.js (worker, WebAssembly, słownik),
//  - *.scryfall.io / api.scryfall.com: obrazy kart,
//  - api.nbp.pl: kursy walut,
//  - tile.openstreetmap.org: kafelki mapy sprzedawców.
// Naruszenia są raportowane do /api/csp-report i trafiają do logów serwera.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "connect-src 'self' https://api.nbp.pl https://cdn.jsdelivr.net blob: data:",
  "img-src 'self' data: blob: https://*.scryfall.io https://api.scryfall.com https://tile.openstreetmap.org",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/csp-report"
].join('; ');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Nagłówki bezpieczeństwa. Kamera tylko dla własnej domeny (skaner kart), mikrofon wyłączony.
app.use((req, res, next) => {
  if (IS_PRODUCTION) {
    res.setHeader('Content-Security-Policy', CSP);
  }
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// Auth verification middleware
function bearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
}

// Sprawdza podpis tokenu ORAZ sesję w bazie: token przestaje działać po wylogowaniu,
// po 7 dniach bezczynności i najpóźniej po 30 dniach od zalogowania.
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const payload = verifyToken(bearerToken(req));
    const session = payload ? await db.getSession(payload.sid) : null;
    if (!payload || !db.isSessionActive(session) || session.userId !== payload.userId) {
      return res.status(401).json({ error: 'Brak autoryzacji lub sesja wygasła. Zaloguj się ponownie.' });
    }
    db.touchSession(session).catch((err) => console.warn('[Sesje] Nie udało się odświeżyć sesji:', err?.message || err));
    (req as any).user = payload;
    (req as any).userId = payload.userId;
    (req as any).sessionId = session.id;
    next();
  } catch (err) {
    sendServerError(res, err, 'authMiddleware');
  }
}

async function issueSessionToken(req: express.Request, user: { id: string; email: string; username: string }) {
  const session = await db.createSession(user.id, req.get('user-agent') || undefined, req.ip);
  return generateToken(
    { userId: user.id, email: user.email, username: user.username, sid: session.id },
    new Date(session.expiresAt)
  );
}

// Błędy serwera logujemy w całości, ale klient dostaje tylko ogólny komunikat
// (szczegóły, np. z bazy danych, mogłyby ujawnić strukturę systemu).
function sendServerError(res: express.Response, err: unknown, where: string, message = 'Wystąpił błąd serwera. Spróbuj ponownie.') {
  console.error(`Błąd w ${where}:`, err);
  if (!res.headersSent) res.status(500).json({ error: message });
}

// --- LIMITY ZAPYTAŃ ---
const userKey = (req: express.Request) => (req as any).userId as string | undefined;

// Ogólny limit na API (bez proxy obrazków, które przy siatce kolekcji wysyła wiele zapytań).
const apiLimiter = rateLimit({ name: 'api', windowMs: 60_000, max: 300 });
app.use('/api', (req, res, next) => (req.path.startsWith('/scryfall/image-proxy') ? next() : apiLimiter(req, res, next)));

const loginIpLimiter = rateLimit({
  name: 'login-ip', windowMs: 15 * 60_000, max: 20,
  message: 'Zbyt wiele prób logowania. Spróbuj ponownie za kilkanaście minut.'
});
const loginEmailLimiter = rateLimit({
  name: 'login-email', windowMs: 15 * 60_000, max: 10,
  key: (req) => (typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : null),
  message: 'Zbyt wiele prób logowania na to konto. Spróbuj ponownie za kilkanaście minut.'
});
const registerLimiter = rateLimit({
  name: 'register', windowMs: 60 * 60_000, max: 5,
  message: 'Zbyt wiele rejestracji z tego adresu. Spróbuj ponownie później.'
});
// Skanowanie nie kosztuje (lokalna baza kart), więc limit tylko chroni przed nadużyciem: ~3 skany/s.
const scannerLimiter = rateLimit({
  name: 'scan', windowMs: 60_000, max: 180, key: userKey,
  message: 'Skanujesz zbyt szybko. Odczekaj chwilę.'
});
const messageLimiter = rateLimit({
  name: 'msg', windowMs: 10 * 60_000, max: 30, key: userKey,
  message: 'Wysyłasz zbyt wiele wiadomości. Spróbuj ponownie później.'
});

// Raporty naruszeń CSP z przeglądarek — tylko logujemy skrót, żeby wykryć zablokowane zasoby.
app.post('/api/csp-report', (req, res) => {
  try {
    const raw = req.body?.['csp-report'] || (Array.isArray(req.body) ? req.body[0]?.body : req.body) || {};
    const directive = String(raw['violated-directive'] || raw.effectiveDirective || raw['effective-directive'] || '?').slice(0, 100);
    const blocked = String(raw['blocked-uri'] || raw.blockedURL || '?').slice(0, 200);
    const page = String(raw['document-uri'] || raw.documentURL || '?').slice(0, 200);
    console.warn(`[CSP] zablokowano ${blocked} (${directive}) na ${page}`);
  } catch {
    // ignorujemy niepoprawne raporty
  }
  res.status(204).end();
});

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- AUTHENTICATION ENDPOINTS ---

app.post(['/api/auth/register', '/api/auth/register/', '/api/register'], registerLimiter, async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || typeof username !== 'string' ||
        !email.trim() || !password || !username.trim()) {
      return res.status(400).json({ error: 'Email, nazwa gracza oraz hasło są wymagane.' });
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Nieprawidłowy adres e-mail.' });
    }

    if (username.trim().length < 2 || username.trim().length > 32) {
      return res.status(400).json({ error: 'Nazwa gracza musi mieć od 2 do 32 znaków.' });
    }

    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Hasło musi mieć co najmniej 8 znaków.' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Użytkownik o takim adresie e-mail już istnieje.' });
    }

    // Nazwa gracza identyfikuje profil publiczny i odbiorcę wiadomości — musi być unikalna.
    const existingName = await db.getUserByIdOrUsername(username.trim());
    if (existingName) {
      return res.status(400).json({ error: 'Ta nazwa gracza jest już zajęta.' });
    }

    const { hash, salt } = hashPassword(password);
    const userId = `usr_${crypto.randomUUID()}`;
    const user = await db.createUser(userId, email, username.trim(), hash, salt);

    const token = await issueSessionToken(req, user);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (err: any) {
    console.error('Error during register:', err);
    sendServerError(res, err, '/api/auth/register', 'Błąd rejestracji konta.');
  }
});

app.post(['/api/auth/login', '/api/auth/login/', '/api/login'], loginIpLimiter, loginEmailLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || password.length > 200) {
      return res.status(400).json({ error: 'Email oraz hasło są wymagane.' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Nieprawidłowy adres e-mail lub hasło.' });
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      return res.status(401).json({ error: 'Nieprawidłowy adres e-mail lub hasło.' });
    }

    const token = await issueSessionToken(req, user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (err: any) {
    console.error('Error during login:', err);
    sendServerError(res, err, '/api/auth/login', 'Błąd logowania.');
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (err: any) {
    sendServerError(res, err, '/api/auth/me');
  }
});

app.post('/api/auth/logout', async (req, res) => {
  // Unieważnia bieżącą sesję. Zawsze zwraca sukces — klient i tak czyści token.
  try {
    const payload = verifyToken(bearerToken(req));
    if (payload) await db.revokeSession(payload.sid, payload.userId);
  } catch (err) {
    console.warn('[Sesje] Błąd podczas wylogowania:', (err as any)?.message || err);
  }
  res.json({ success: true });
});

app.post('/api/auth/logout-all', authMiddleware, async (req, res) => {
  try {
    const revoked = await db.revokeAllSessions((req as any).userId);
    res.json({ success: true, revoked });
  } catch (err: any) {
    sendServerError(res, err, '/api/auth/logout-all');
  }
});

const COLLECTION_FILE = path.join(DATA_DIR, 'collection.json');
const WISHLIST_FILE = path.join(DATA_DIR, 'wishlist.json');
const DECKS_FILE = path.join(DATA_DIR, 'decks.json');
const CATALOGS_FILE = path.join(DATA_DIR, 'catalogs.json');

const INITIAL_CATALOGS = [
  {
    id: "cat-main",
    name: "Klaser Główny",
    description: "Główny klaser całej kolekcji",
    color: "amber",
    createdAt: new Date().toISOString(),
    isDefault: true
  },
  {
    id: "cat-commander",
    name: "Talia Commander",
    description: "Karty i dodatki do talii Commander",
    color: "purple",
    createdAt: new Date().toISOString(),
    isDefault: false
  },
  {
    id: "cat-trade",
    name: "Na wymianę",
    description: "Karty przeznaczone na handel i wymianę z graczami",
    color: "emerald",
    createdAt: new Date().toISOString(),
    isDefault: false
  }
];

// Helper functions for reading/writing JSON files
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// Initial Sample Collection if empty
const INITIAL_COLLECTION = [
  {
    id: "col-1",
    cardId: "055db36d-0683-4318-ae78-a3f290d23a4a",
    quantity: 1,
    quantityFoil: 0,
    condition: "NM",
    language: "EN",
    purchasePrice: 1.50,
    notes: "Staple w Commanderze",
    binder: "Klaser Główny",
    addedAt: new Date().toISOString(),
    card: {
      id: "055db36d-0683-4318-ae78-a3f290d23a4a",
      name: "Sol Ring",
      cmc: 1,
      type_line: "Artifact",
      oracle_text: "{T}: Add {C}{C}.",
      colors: [],
      color_identity: [],
      mana_cost: "{1}",
      set: "cmm",
      set_name: "Commander Masters",
      collector_number: "410",
      rarity: "uncommon",
      released_at: "2023-08-04",
      image_uris: {
        small: "https://cards.scryfall.io/small/front/0/5/055db36d-0683-4318-ae78-a3f290d23a4a.jpg",
        normal: "https://cards.scryfall.io/normal/front/0/5/055db36d-0683-4318-ae78-a3f290d23a4a.jpg",
        large: "https://cards.scryfall.io/large/front/0/5/055db36d-0683-4318-ae78-a3f290d23a4a.jpg",
        art_crop: "https://cards.scryfall.io/art_crop/front/0/5/055db36d-0683-4318-ae78-a3f290d23a4a.jpg"
      },
      prices: {
        usd: "1.65",
        usd_foil: "3.20",
        eur: "1.45",
        eur_foil: "2.80"
      },
      edhrec_rank: 1,
      legalities: { commander: "legal", vintage: "restricted", legacy: "banned" },
      scryfall_uri: "https://scryfall.com/card/cmm/410/sol-ring"
    }
  },
  {
    id: "col-2",
    cardId: "dbe1ed1c-5154-4e78-81d3-433e4de6e43f",
    quantity: 1,
    quantityFoil: 1,
    condition: "NM",
    language: "EN",
    purchasePrice: 45.00,
    notes: "Karta Mythic z LTR setu",
    binder: "Klaser Główny",
    addedAt: new Date().toISOString(),
    card: {
      id: "dbe1ed1c-5154-4e78-81d3-433e4de6e43f",
      name: "The One Ring",
      cmc: 4,
      type_line: "Legendary Artifact",
      oracle_text: "Indestructible\nWhen The One Ring enters the battlefield, if you cast it, you gain protection from everything until your next turn.\nAt the beginning of your upkeep, you lose 1 life for each burden counter on The One Ring.\n{T}: Put a burden counter on The One Ring, then draw a card for each burden counter on it.",
      colors: [],
      color_identity: [],
      mana_cost: "{4}",
      set: "ltr",
      set_name: "The Lord of the Rings: Tales of Middle-earth",
      collector_number: "246",
      rarity: "mythic",
      released_at: "2023-06-23",
      edhrec_rank: 124,
      image_uris: {
        small: "https://cards.scryfall.io/small/front/d/b/dbe1ed1c-5154-4e78-81d3-433e4de6e43f.jpg",
        normal: "https://cards.scryfall.io/normal/front/d/b/dbe1ed1c-5154-4e78-81d3-433e4de6e43f.jpg",
        large: "https://cards.scryfall.io/large/front/d/b/dbe1ed1c-5154-4e78-81d3-433e4de6e43f.jpg",
        art_crop: "https://cards.scryfall.io/art_crop/front/d/b/dbe1ed1c-5154-4e78-81d3-433e4de6e43f.jpg"
      },
      prices: {
        usd: "88.50",
        usd_foil: "105.00",
        eur: "79.00",
        eur_foil: "95.00"
      },
      legalities: { modern: "legal", commander: "legal", legacy: "legal" },
      scryfall_uri: "https://scryfall.com/card/ltr/246/the-one-ring"
    }
  },
  {
    id: "col-3",
    cardId: "0005a794-7d2d-45ec-8a71-fbd2958022a1",
    quantity: 4,
    quantityFoil: 0,
    condition: "NM",
    language: "EN",
    purchasePrice: 0.50,
    notes: "Klasyczny klasyk w czerwieni",
    binder: "Klaser Główny",
    addedAt: new Date().toISOString(),
    card: {
      id: "0005a794-7d2d-45ec-8a71-fbd2958022a1",
      name: "Lightning Bolt",
      cmc: 1,
      type_line: "Instant",
      oracle_text: "Lightning Bolt deals 3 damage to any target.",
      colors: ["R"],
      color_identity: ["R"],
      mana_cost: "{R}",
      set: "2x2",
      set_name: "Double Masters 2022",
      collector_number: "117",
      rarity: "uncommon",
      released_at: "2022-07-08",
      edhrec_rank: 64,
      image_uris: {
        small: "https://cards.scryfall.io/small/front/f/5/f50328d5-3e3d-4078-8d7c-300188ef77a6.jpg",
        normal: "https://cards.scryfall.io/normal/front/f/5/f50328d5-3e3d-4078-8d7c-300188ef77a6.jpg",
        large: "https://cards.scryfall.io/large/front/f/5/f50328d5-3e3d-4078-8d7c-300188ef77a6.jpg",
        art_crop: "https://cards.scryfall.io/art_crop/front/f/5/f50328d5-3e3d-4078-8d7c-300188ef77a6.jpg"
      },
      prices: {
        usd: "0.80",
        usd_foil: "2.10",
        eur: "0.75",
        eur_foil: "1.90"
      },
      legalities: { modern: "legal", commander: "legal", legacy: "legal", pauper: "legal" },
      scryfall_uri: "https://scryfall.com/card/2x2/117/lightning-bolt"
    }
  },
  {
    id: "col-4",
    cardId: "dbe1ed1c-5154-4e78-81d3-433e4de6e43f-rhystic",
    quantity: 1,
    quantityFoil: 0,
    condition: "EX",
    language: "EN",
    purchasePrice: 30.00,
    notes: "Did you pay the 1?",
    binder: "Klaser Główny",
    addedAt: new Date().toISOString(),
    card: {
      id: "dbe1ed1c-5154-4e78-81d3-433e4de6e43f-rhystic",
      name: "Rhystic Study",
      cmc: 3,
      type_line: "Enchantment",
      oracle_text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
      colors: ["U"],
      color_identity: ["U"],
      mana_cost: "{2}{U}",
      set: "woe",
      set_name: "Wilds of Eldraine",
      collector_number: "15",
      rarity: "rare",
      released_at: "2023-09-08",
      edhrec_rank: 14,
      image_uris: {
        small: "https://cards.scryfall.io/small/front/d/6/d6635e26-3963-4f35-b0d3-3f0f665539a6.jpg",
        normal: "https://cards.scryfall.io/normal/front/d/6/d6635e26-3963-4f35-b0d3-3f0f665539a6.jpg",
        large: "https://cards.scryfall.io/large/front/d/6/d6635e26-3963-4f35-b0d3-3f0f665539a6.jpg",
        art_crop: "https://cards.scryfall.io/art_crop/front/d/6/d6635e26-3963-4f35-b0d3-3f0f665539a6.jpg"
      },
      prices: {
        usd: "38.50",
        usd_foil: "45.00",
        eur: "34.00",
        eur_foil: "41.00"
      },
      legalities: { commander: "legal", legacy: "legal", vintage: "legal" },
      scryfall_uri: "https://scryfall.com/card/woe/15/rhystic-study"
    }
  }
];

if (!fs.existsSync(COLLECTION_FILE)) {
  writeJsonFile(COLLECTION_FILE, INITIAL_COLLECTION);
}

const KNOWN_EDHREC_RANKS: Record<string, number> = {
  "sol ring": 1,
  "arcane signet": 2,
  "swords to plowshares": 3,
  "command tower": 4,
  "beast within": 7,
  "counterspell": 8,
  "cyclonic rift": 9,
  "cultivate": 11,
  "chaos warp": 12,
  "rhystic study": 14,
  "path to exile": 15,
  "kodama's reach": 18,
  "demonic tutor": 22,
  "heroic intervention": 28,
  "teferi's protection": 31,
  "esper sentinel": 42,
  "lightning bolt": 64,
  "the one ring": 124,
  "animar, soul of elements": 2371,
  "pestermite": 10922,
};

function backfillEdhrecRanks() {
  try {
    const filesToMigrate: string[] = [];
    if (fs.existsSync(COLLECTION_FILE)) filesToMigrate.push(COLLECTION_FILE);

    const usersDir = path.join(DATA_DIR, 'users');
    if (fs.existsSync(usersDir)) {
      const userFolders = fs.readdirSync(usersDir);
      for (const u of userFolders) {
        const userCol = path.join(usersDir, u, 'collection.json');
        if (fs.existsSync(userCol)) filesToMigrate.push(userCol);
      }
    }

    for (const filePath of filesToMigrate) {
      const items = readJsonFile<any[]>(filePath, []);
      let changed = false;
      items.forEach(item => {
        if (item.card && (item.card.edhrec_rank === undefined || item.card.edhrec_rank === null)) {
          const nameKey = (item.card.name || '').toLowerCase().trim();
          if (KNOWN_EDHREC_RANKS[nameKey]) {
            item.card.edhrec_rank = KNOWN_EDHREC_RANKS[nameKey];
            changed = true;
          }
        }
      });
      if (changed) {
        writeJsonFile(filePath, items);
        console.log(`[Migration] Backfilled edhrec_rank in ${filePath}`);
      }
    }
  } catch (err) {
    console.error('Error during backfillEdhrecRanks:', err);
  }
}
backfillEdhrecRanks();

// Scryfall API Proxy Helper with Rate Limiting (~100ms interval) & In-Memory Cache
const SCRYFALL_BASE = 'https://api.scryfall.com';

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 100; // 100 ms rate-limiting delay between Scryfall API calls

const scryfallCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour cache

async function fetchScryfallThrottled(url: string, options: RequestInit = {}) {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    const waitMs = MIN_REQUEST_INTERVAL_MS - timeSinceLast;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  lastRequestTime = Date.now();

  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'MTGCollectionApp/1.0 (Contact: collector@app.local)',
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  });

  return response;
}

async function fetchScryfall(endpoint: string) {
  const cached = scryfallCache.get(endpoint);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const url = `${SCRYFALL_BASE}${endpoint}`;
  const response = await fetchScryfallThrottled(url);

  if (response.status === 404) {
    if (endpoint.startsWith('/cards/search')) {
      return { object: 'list', total_cards: 0, data: [] };
    }
  }

  if (!response.ok) {
    const errorBody = await response.text();
    let details = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      details = parsed.details || parsed.message || errorBody;
    } catch (_) {}
    throw new Error(`Scryfall API error (${response.status}): ${details}`);
  }

  const data = await response.json();
  scryfallCache.set(endpoint, { data, timestamp: Date.now() });
  return data;
}

// --- API ROUTES ---

// Rozpoznawanie karty ze skanera.
// Najpierw lokalna baza kart (bez limitów i zapytań do Scryfall), a gdy jeszcze nie jest
// gotowa (pierwszy import) — awaryjnie API Scryfall.
app.post('/api/scanner/delver-identify', authMiddleware, scannerLimiter, async (req, res) => {
  try {
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const hintTitle = str(req.body?.hintTitle, 200);
    const hintSet = str(req.body?.hintSet, 12).toLowerCase();
    const hintCollector = str(req.body?.hintCollector, 24).replace(/^0+(?=\d)/, '');

    const queryHash = hashCardImage(req.body?.cardImageBase64);

    if (!hintTitle && !(hintSet && hintCollector) && !queryHash) {
      return res.status(400).json({ error: 'Brak obrazu karty, odczytanej nazwy ani kodu setu i numeru.' });
    }

    const result = cards.isCardDbReady()
      ? await identifyWithLocalDb(hintTitle, hintSet, hintCollector, queryHash)
      : await identifyWithScryfallApi(hintTitle, hintSet, hintCollector);

    const matched = result.matchedCard;
    // Jedna linia na skan — do strojenia progów na prawdziwych zdjęciach (bez danych użytkownika).
    console.log(
      `[Skan] metoda=${result.method || 'scryfall'} pewność=${result.confidence} obraz=${result.imageDistance ?? '-'} ` +
        `ocr="${hintTitle}" set=${hintSet || '-'}/${hintCollector || '-'} wynik=${matched ? `${matched.name} [${matched.set}/${matched.collector_number}]` : 'brak'}`
    );
    return res.json({
      success: true,
      source: cards.isCardDbReady() ? 'local' : 'scryfall',
      cardName: matched?.name || hintTitle,
      setCode: matched?.set || hintSet || null,
      collectorNumber: matched?.collector_number || hintCollector || null,
      confidence: result.confidence,
      isFoil: false,
      detectedRarity: matched?.rarity || null,
      method: result.method,
      imageDistance: result.imageDistance ?? null,
      matchedCard: matched,
      possibleCards: result.possibleCards
    });
  } catch (err: any) {
    console.error('Błąd w /api/scanner/delver-identify:', err);
    res.status(500).json({ error: 'DELVER_SCAN_FAILED', message: 'Nie udało się rozpoznać karty. Spróbuj ponownie.' });
  }
});

interface IdentifyResult {
  matchedCard: any | null;
  possibleCards: any[];
  confidence: number;
  method?: 'set_number' | 'name' | 'name_image' | 'image' | 'none';
  imageDistance?: number;
}

const MAX_PRINTINGS = 40;
// Progi dla odległości odcisków (0..1024). Dobrane na danych testowych:
// ta sama karta zwykle < 270, różne karty zwykle > 330.
const IMAGE_ACCEPT_DISTANCE = 300; // rozpoznanie wyłącznie po obrazie
const IMAGE_MIN_MARGIN = 25; // wymagana przewaga nad najlepszą inną kartą
const IMAGE_SET_TOLERANCE = 40; // set z OCR wygrywa, jeśli jego obraz jest niewiele gorszy

/** Odcisk przesłanego zdjęcia karty (JPEG jako data URL); null, gdy brak lub niepoprawny. */
function hashCardImage(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg;base64,')) return null;
  if (dataUrl.length > 2_000_000) return null;
  try {
    return computeCardHash(decodeJpegToGray(Buffer.from(dataUrl.slice(23), 'base64')));
  } catch {
    return null;
  }
}

/** Sortuje wydania wg podobieństwa obrazu (gdy jest odcisk), zachowując resztę na końcu. */
function rankByImage(ids: string[], queryHash: Uint8Array | null) {
  if (!queryHash || !hashes.hasHashes()) return { ordered: ids, distances: new Map<string, number>() };
  const ranked = hashes.searchByHash(queryHash, ids.length, ids);
  const distances = new Map(ranked.map((r) => [r.id, r.distance]));
  const withHash = ranked.map((r) => r.id);
  return { ordered: [...withHash, ...ids.filter((id) => !distances.has(id))], distances };
}

async function identifyWithLocalDb(title: string, set: string, collector: string, queryHash: Uint8Array | null): Promise<IdentifyResult> {
  const nameHits = title ? cards.findByName(title, 3) : [];
  const exactId = set && collector ? cards.findIdBySetNumber(set, collector) : null;

  let matchedId: string | null = null;
  let printings: string[] = [];
  let confidence = 0;
  let method: IdentifyResult['method'] = 'none';
  let distances = new Map<string, number>();

  // 1. Kod setu + numer (najdokładniejsze), o ile zgadza się z odczytaną nazwą.
  if (exactId) {
    const [exactCard] = await cards.getCardsByIds([exactId]);
    const exactNames = exactCard ? [exactCard.name, ...(exactCard.card_faces || []).map((f: any) => f.name)] : [];
    const titleAgrees = !title || exactNames.some((n: string) => nameSimilarity(normalizeName(n), normalizeName(title)) >= 0.6);
    if (exactCard && titleAgrees) {
      matchedId = exactId;
      const ranked = rankByImage(cards.printingsOfName(normalizeName(exactCard.name)), queryHash);
      printings = ranked.ordered;
      distances = ranked.distances;
      confidence = title ? 99 : 92;
      method = 'set_number';
    }
  }

  // 2. Nazwa z OCR; wydanie wybiera obraz (a set z OCR, jeśli obraz go nie wyklucza).
  if (!matchedId && nameHits.length > 0 && nameHits[0].score >= 0.7) {
    const best = nameHits[0];
    const ranked = rankByImage(best.ids, queryHash);
    printings = ranked.ordered;
    distances = ranked.distances;
    matchedId = printings[0];
    method = distances.size ? 'name_image' : 'name';
    confidence = Math.round(best.score * 85);
    if (set) {
      const inSet = (await cards.getCardsByIds(best.ids)).find((c) => c.set === set);
      const bestD = distances.get(matchedId);
      const setD = inSet ? distances.get(inSet.id) : undefined;
      if (inSet && (bestD === undefined || setD === undefined || setD <= bestD + IMAGE_SET_TOLERANCE)) {
        matchedId = inSet.id;
        confidence = Math.round(best.score * 95);
      }
    }
    const d = distances.get(matchedId);
    if (d !== undefined && d < IMAGE_ACCEPT_DISTANCE) confidence = Math.max(confidence, 90);
  }

  // 3. Sam obraz (OCR nic nie dał): najbliższy odcisk w całej bazie, jeśli wyraźnie lepszy od innych kart.
  if (!matchedId && queryHash && hashes.hasHashes()) {
    const top = hashes.searchByHash(queryHash, 30);
    const best = top[0];
    const bestName = best ? cards.nameOfId(best.id) : null;
    const rival = top.find((m) => cards.nameOfId(m.id) !== bestName);
    const margin = rival ? rival.distance - best.distance : Infinity;
    if (best && bestName && best.distance <= IMAGE_ACCEPT_DISTANCE && margin >= IMAGE_MIN_MARGIN) {
      const ranked = rankByImage(cards.printingsOfName(bestName), queryHash);
      printings = ranked.ordered;
      distances = ranked.distances;
      matchedId = printings[0];
      method = 'image';
      confidence = Math.round(Math.min(95, 60 + margin / 2));
    }
  }

  if (!matchedId) {
    return { matchedCard: null, possibleCards: [], confidence: 0, method: 'none' };
  }

  const ids = [matchedId, ...printings.filter((id) => id !== matchedId)].slice(0, MAX_PRINTINGS);
  const possibleCards = await cards.getCardsByIds(ids);
  return { matchedCard: possibleCards[0] || null, possibleCards, confidence, method, imageDistance: distances.get(matchedId) };
}

async function identifyWithScryfallApi(title: string, set: string, collector: string): Promise<IdentifyResult> {
  let matchedCard: any = null;
  let confidence = 0;
  if (set && collector) {
    try {
      matchedCard = await fetchScryfall(`/cards/${encodeURIComponent(set)}/${encodeURIComponent(collector)}`);
      if (matchedCard?.name) confidence = 95;
    } catch (_) {}
  }
  if (!matchedCard?.name && title) {
    try {
      const setParam = set ? `&set=${encodeURIComponent(set)}` : '';
      matchedCard = await fetchScryfall(`/cards/named?fuzzy=${encodeURIComponent(title)}${setParam}`);
    } catch (_) {
      try {
        matchedCard = await fetchScryfall(`/cards/named?fuzzy=${encodeURIComponent(title)}`);
      } catch (_) {
        matchedCard = null;
      }
    }
    if (matchedCard?.name) confidence = 80;
  }
  if (!matchedCard?.name) return { matchedCard: null, possibleCards: [], confidence: 0 };

  let possibleCards: any[] = [matchedCard];
  try {
    const prints = await fetchScryfall(`/cards/search?q=!"${encodeURIComponent(matchedCard.name)}"&unique=prints&order=released&dir=desc`);
    if (Array.isArray(prints?.data)) {
      possibleCards = [matchedCard, ...prints.data.filter((c: any) => c.id !== matchedCard.id)].slice(0, MAX_PRINTINGS);
    }
  } catch (_) {}
  return { matchedCard, possibleCards, confidence };
}

// Stan lokalnej bazy kart (do diagnostyki).
app.get('/api/scanner/status', authMiddleware, (_req, res) => {
  // zawiera też postęp budowania indeksu obrazów (images)
  res.json(cards.cardDbStatus());
});

// Proxy obrazków przyjmuje wyłącznie HTTPS do domen Scryfall (ochrona przed SSRF).
const ALLOWED_IMAGE_DOMAINS = ['scryfall.io', 'scryfall.com'];
function isAllowedScryfallImageUrl(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_IMAGE_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
}

// 1. Scryfall Image Proxy (solves referrer / CORS / hotlink blocking)
app.get('/api/scryfall/image-proxy', async (req, res) => {
  try {
    const imageUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!isAllowedScryfallImageUrl(imageUrl)) {
      return res.status(400).send('Nieprawidłowy adres obrazu');
    }

    const imgRes = await fetchScryfallThrottled(imageUrl, {
      redirect: 'error',
      headers: {
        'Accept': 'image/jpeg,image/webp,image/png,image/svg+xml,image/*'
      }
    });

    if (!imgRes.ok) {
      return res.status(502).send('Błąd pobierania obrazu');
    }

    const contentType = (imgRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      return res.status(502).send('Nieprawidłowy typ pliku');
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // SVG serwowany z naszej domeny nie może wykonać skryptów
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.send(buffer);
  } catch (err: any) {
    console.error('Błąd w /api/scryfall/image-proxy:', err?.message);
    res.status(502).send('Błąd pobierania obrazu');
  }
});

// 2. Scryfall Autocomplete
app.get('/api/scryfall/autocomplete', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      return res.json({ data: [] });
    }
    const data = await fetchScryfall(`/cards/autocomplete?q=${encodeURIComponent(query.trim())}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/favicon.ico', (_req, res) => res.status(204).end());

// 3. Scryfall Search (with fallback to fuzzy named search)
app.get(['/api/scryfall/search', '/api/scryfall/cards/search'], async (req, res) => {
  try {
    const query = (req.query.q as string || '').trim();
    const page = req.query.page || '1';
    if (!query) {
      return res.status(400).json({ error: 'Parametr wyszukiwania "q" jest wymagany' });
    }

    let data;
    try {
      data = await fetchScryfall(`/cards/search?q=${encodeURIComponent(query)}&page=${page}`);
    } catch (searchErr: any) {
      // Try fuzzy search fallback if search returned 404 or syntax error
      data = { object: 'list', total_cards: 0, data: [] };
    }

    // If search returned 0 results, try fuzzy lookup for card name
    if ((!data.data || data.data.length === 0) && query.length >= 3) {
      try {
        const fuzzyResult = await fetchScryfall(`/cards/named?fuzzy=${encodeURIComponent(query)}`);
        if (fuzzyResult && fuzzyResult.id) {
          data = {
            object: 'list',
            total_cards: 1,
            data: [fuzzyResult]
          };
        }
      } catch (_) {
        // Ignore fuzzy error and return empty list
      }
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Scryfall Named Card (Exact or Fuzzy lookup)
app.get('/api/scryfall/named', async (req, res) => {
  try {
    const fuzzy = (req.query.fuzzy as string || '').trim();
    const exact = (req.query.exact as string || '').trim();
    const set = (req.query.set as string || '').trim();

    let queryPath = '';
    if (exact) {
      queryPath = `/cards/named?exact=${encodeURIComponent(exact)}`;
    } else if (fuzzy) {
      queryPath = `/cards/named?fuzzy=${encodeURIComponent(fuzzy)}`;
    } else {
      return res.status(400).json({ error: 'Parametr "fuzzy" lub "exact" jest wymagany' });
    }

    if (set) {
      queryPath += `&set=${encodeURIComponent(set.toLowerCase())}`;
    }

    const data = await fetchScryfall(queryPath);
    res.json(data);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// 3c. Scryfall Batch Collection Lookup (/cards/collection)
app.post('/api/scryfall/collection', async (req, res) => {
  try {
    const { identifiers } = req.body;
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return res.status(400).json({ error: 'Lista "identifiers" jest wymagana' });
    }

    const BATCH_SIZE = 75; // Scryfall allows up to 75 identifiers per POST
    const allFound: any[] = [];
    const notFound: any[] = [];

    for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
      const chunk = identifiers.slice(i, i + BATCH_SIZE);
      const scryRes = await fetchScryfallThrottled(`${SCRYFALL_BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk }),
      });

      if (scryRes.ok) {
        const result = await scryRes.json();
        if (Array.isArray(result.data)) {
          allFound.push(...result.data);
        }
        if (Array.isArray(result.not_found)) {
          notFound.push(...result.not_found);
        }
      }
    }

    res.json({ object: 'list', data: allFound, not_found: notFound });
  } catch (err: any) {
    console.error('Error in /api/scryfall/collection:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Scryfall Single Card by ID
app.get('/api/scryfall/card/:id', async (req, res) => {
  try {
    const cardId = req.params.id;
    const data = await fetchScryfall(`/cards/${cardId}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Scryfall Card by Set and Collector Number
app.get('/api/scryfall/card-print/:set/:number', async (req, res) => {
  try {
    const { set, number } = req.params;
    const data = await fetchScryfall(`/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(number)}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Scryfall Random Card
app.get('/api/scryfall/random', async (req, res) => {
  try {
    const query = req.query.q as string;
    const endpoint = query ? `/cards/random?q=${encodeURIComponent(query)}` : '/cards/random';
    const data = await fetchScryfall(endpoint);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Scryfall All Sets
app.get('/api/scryfall/sets', async (req, res) => {
  try {
    const data = await fetchScryfall('/sets');
    if (!data || !Array.isArray(data.data)) {
      return res.json({ data: [] });
    }

    const filteredSets = data.data
      .filter((s: any) => !s.digital && s.card_count > 0)
      .map((s: any) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        released_at: s.released_at,
        set_type: s.set_type,
        card_count: s.card_count,
        icon_svg_uri: s.icon_svg_uri,
        scryfall_uri: s.scryfall_uri
      }))
      .sort((a: any, b: any) => {
        const dateA = a.released_at ? new Date(a.released_at).getTime() : 0;
        const dateB = b.released_at ? new Date(b.released_at).getTime() : 0;
        return dateB - dateA;
      });

    res.json({ data: filteredSets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Scryfall Top 5 Cards by Rarity for a Set
app.get('/api/scryfall/set-top/:setCode', async (req, res) => {
  try {
    const setCode = req.params.setCode.toLowerCase();
    
    // Get set details
    let setInfo: any = null;
    try {
      setInfo = await fetchScryfall(`/sets/${setCode}`);
    } catch (_) {}

    // Fetch cards for set ordered by Cardmarket EUR price
    const searchData = await fetchScryfall(`/cards/search?q=set:${setCode}+unique:cards&order=eur&dir=desc`);
    const cards: any[] = (searchData && Array.isArray(searchData.data)) ? searchData.data : [];

    const rarities = ['mythic', 'rare', 'uncommon', 'common'];
    const topByRarity: Record<string, any[]> = {
      mythic: [],
      rare: [],
      uncommon: [],
      common: []
    };

    cards.forEach(card => {
      const r = card.rarity;
      if (topByRarity[r]) {
        topByRarity[r].push(card);
      }
    });

    for (const r of rarities) {
      topByRarity[r].sort((a, b) => {
        const priceA = parseFloat(a.prices?.eur || a.prices?.eur_foil || '0');
        const priceB = parseFloat(b.prices?.eur || b.prices?.eur_foil || '0');
        return priceB - priceA;
      });

      // If fewer than 5 items, fetch specific rarity
      if (topByRarity[r].length < 5) {
        try {
          const raritySearch = await fetchScryfall(`/cards/search?q=set:${setCode}+r:${r}&order=eur&dir=desc`);
          if (raritySearch && Array.isArray(raritySearch.data)) {
            const existingIds = new Set(topByRarity[r].map(c => c.id));
            raritySearch.data.forEach((c: any) => {
              if (!existingIds.has(c.id)) {
                topByRarity[r].push(c);
                existingIds.add(c.id);
              }
            });
            topByRarity[r].sort((a, b) => {
              const priceA = parseFloat(a.prices?.eur || a.prices?.eur_foil || '0');
              const priceB = parseFloat(b.prices?.eur || b.prices?.eur_foil || '0');
              return priceB - priceA;
            });
          }
        } catch (_) {}
      }

      topByRarity[r] = topByRarity[r].slice(0, 5);
    }

    res.json({
      set: setInfo ? {
        id: setInfo.id,
        code: setInfo.code,
        name: setInfo.name,
        released_at: setInfo.released_at,
        set_type: setInfo.set_type,
        card_count: setInfo.card_count,
        icon_svg_uri: setInfo.icon_svg_uri,
        scryfall_uri: setInfo.scryfall_uri
      } : { code: setCode, name: setCode.toUpperCase() },
      topCards: topByRarity
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Scryfall Prints / Versions for a Card
app.get('/api/scryfall/prints', async (req, res) => {
  try {
    const cardId = req.query.cardId as string;
    const oracleId = req.query.oracle_id as string;
    const cardName = req.query.name as string;

    let targetOracleId = oracleId;
    let targetName = cardName;

    if (!targetOracleId && cardId) {
      try {
        const card = await fetchScryfall(`/cards/${cardId}`);
        if (card.oracle_id) targetOracleId = card.oracle_id;
        if (!targetName && card.name) targetName = card.name;
      } catch (_) {
        const collection = readJsonFile<any[]>(COLLECTION_FILE, []);
        const item = collection.find(c => c.cardId === cardId || c.card?.id === cardId);
        if (item && item.card) {
          if (item.card.oracle_id) targetOracleId = item.card.oracle_id;
          if (!targetName && item.card.name) targetName = item.card.name;
        }
      }
    }

    let searchUri = '';
    if (targetOracleId) {
      searchUri = `/cards/search?q=oracle_id:${encodeURIComponent(targetOracleId)}+unique:prints&order=released&dir=desc`;
    } else if (targetName) {
      searchUri = `/cards/search?q=!"${encodeURIComponent(targetName)}"+unique:prints&order=released&dir=desc`;
    } else {
      return res.status(400).json({ error: 'Wymagany parametr cardId, oracle_id lub name', data: [] });
    }

    const data = await fetchScryfall(searchUri);
    const prints = Array.isArray(data.data) ? data.data : [];
    res.json({ total_cards: prints.length, data: prints });
  } catch (err: any) {
    console.error('Error fetching card prints:', err);
    res.status(500).json({ error: err.message, data: [] });
  }
});

// --- COLLECTION ENDPOINTS (USER-ISOLATED) ---

app.get('/api/collection', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const collection = await db.getCollection(userId);
    res.json(collection);
  } catch (err: any) {
    sendServerError(res, err, '/api/collection');
  }
});

app.post('/api/collection', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const newItem = {
      id: `col-${crypto.randomUUID()}`,
      addedAt: new Date().toISOString(),
      ...req.body
    };
    const saved = await db.addCollectionItem(userId, newItem);
    res.status(201).json(saved);
  } catch (err: any) {
    sendServerError(res, err, '/api/collection');
  }
});

app.put('/api/collection/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const updated = await db.updateCollectionItem(userId, id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Nie znaleziono pozycji w Twojej kolekcji' });
    }
    res.json(updated);
  } catch (err: any) {
    sendServerError(res, err, '/api/collection/:id');
  }
});

app.delete('/api/collection/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.deleteCollectionItem(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    sendServerError(res, err, '/api/collection/:id');
  }
});

app.post('/api/collection/bulk-import', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const items = Array.isArray(req.body) ? req.body : [];
    await db.saveFullCollection(userId, items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    sendServerError(res, err, '/api/collection/bulk-import');
  }
});

app.post('/api/collection/bulk-add', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const items = Array.isArray(req.body) ? req.body : [];
    const added = await db.addCollectionItems(userId, items);
    res.json({ success: true, count: added.length, items: added });
  } catch (err: any) {
    console.error('Error in /api/collection/bulk-add:', err);
    sendServerError(res, err, '/api/collection/bulk-add');
  }
});

// Batch price refresh from Scryfall using official POST /cards/collection Bulk API
app.post('/api/collection/refresh-prices', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const collection = await db.getCollection(userId);
    let updatedCount = 0;
    let changedCount = 0;
    const now = new Date().toISOString();
    const updates: PriceUpdate[] = [];
    const PRICE_KEYS = ['eur', 'eur_foil', 'usd', 'usd_foil', 'usd_etched'];
    const pricesDiffer = (a: any, b: any) =>
      PRICE_KEYS.some(k => String(a?.[k] ?? '') !== String(b?.[k] ?? ''));

    const itemsWithCardId = collection.filter(item => item.card && item.card.id);
    const BATCH_SIZE = 75;

    for (let i = 0; i < itemsWithCardId.length; i += BATCH_SIZE) {
      const chunk = itemsWithCardId.slice(i, i + BATCH_SIZE);
      const identifiers = chunk.map(item => ({ id: item.card.id }));

      try {
        const batchResponse = await fetchScryfallThrottled(`${SCRYFALL_BASE}/cards/collection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers })
        });

        if (batchResponse.ok) {
          const batchData = await batchResponse.json();
          if (batchData.data && Array.isArray(batchData.data)) {
            const cardMap = new Map<string, any>(batchData.data.map((c: any) => [c.id, c]));

            chunk.forEach(item => {
              const updatedCard = cardMap.get(item.card.id);
              if (updatedCard) {
                const oldPrices = item.card.prices;
                let previousPrices = item.previousPrices ?? null;
                let pricesChangedAt = item.pricesChangedAt ?? null;
                // Zmiana wartości liczona jest względem cen sprzed ostatniej faktycznej zmiany
                if (updatedCard.prices && oldPrices && pricesDiffer(oldPrices, updatedCard.prices)) {
                  previousPrices = oldPrices;
                  pricesChangedAt = now;
                  changedCount++;
                }
                const card = { ...item.card };
                if (updatedCard.prices) card.prices = updatedCard.prices;
                if (updatedCard.image_uris) card.image_uris = updatedCard.image_uris;
                if (updatedCard.edhrec_rank !== undefined) card.edhrec_rank = updatedCard.edhrec_rank;
                updates.push({ id: item.id, card, previousPrices, pricesChangedAt, lastUpdatedPriceAt: now });
                updatedCount++;
              }
            });
          }
        }
      } catch (chunkErr) {
        console.warn(`Failed to update prices for chunk ${i}:`, chunkErr);
      }
    }

    // Tylko ceny — nie nadpisujemy reszty pozycji (np. oznaczeń „na sprzedaż”)
    await db.updateCollectionPrices(userId, updates);
    res.json({ success: true, updatedCount, changedCount, collection: await db.getCollection(userId) });
  } catch (err: any) {
    sendServerError(res, err, '/api/collection/refresh-prices');
  }
});

// --- CATALOGS ENDPOINTS (USER-ISOLATED) ---

app.get('/api/catalogs', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const catalogs = await db.getCatalogs(userId);
    res.json(catalogs);
  } catch (err: any) {
    sendServerError(res, err, '/api/catalogs');
  }
});

app.post('/api/catalogs', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { name, description, color, isDefault } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nazwa katalogu jest wymagana' });
    }

    const catalogs = await db.getCatalogs(userId);
    if (catalogs.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Katalog o takiej nazwie już istnieje' });
    }

    const newCatalog = {
      id: `cat-${crypto.randomUUID()}`,
      name: name.trim(),
      description: description ? description.trim() : '',
      color: color || 'amber',
      createdAt: new Date().toISOString(),
      isDefault: Boolean(isDefault) || catalogs.length === 0
    };

    const saved = await db.addCatalog(userId, newCatalog);
    if (newCatalog.isDefault) {
      await db.setDefaultCatalog(userId, saved.id);
    }
    res.status(201).json(saved);
  } catch (err: any) {
    sendServerError(res, err, '/api/catalogs');
  }
});

app.post('/api/catalogs/:id/set-default', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const catalogs = await db.setDefaultCatalog(userId, id);
    const target = catalogs.find(c => c.id === id);
    res.json({ success: true, defaultCatalog: target, catalogs });
  } catch (err: any) {
    sendServerError(res, err, '/api/catalogs/:id/set-default');
  }
});

app.delete('/api/catalogs/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const result = await db.deleteCatalog(userId, id);
    res.json({ success: true, id, reassignedTo: result.reassignedTo, catalogs: result.catalogs });
  } catch (err: any) {
    if (err?.message === 'Nie znaleziono katalogu do usunięcia.') {
      return res.status(404).json({ error: err.message });
    }
    sendServerError(res, err, '/api/catalogs/:id');
  }
});

// --- USERS LIST ENDPOINT (PUBLIC / REGISTERED USERS) ---

app.get('/api/users', async (req, res) => {
  try {
    const rawUsers = await db.getAllUsers();
    // Miejscowość jest opcjonalna i podawana świadomie przez użytkownika (pokazujemy tylko miasto).
    const locations = new Map<string, db.UserLocation>((await db.getAllLocations().catch(() => [] as db.UserLocation[])).map((l) => [l.userId, l] as const));
    const result = await Promise.all(
      rawUsers.map(async (u) => {
        try {
          const col = await db.getCollection(u.id);
          const wishlist = await db.getWishlist(u.id);
          const forSaleItems = col.filter((item) => Boolean(item.isForSale));
          const forSaleCount = forSaleItems.reduce((sum, item) => sum + (item.quantity || 0) + (item.quantityFoil || 0), 0);
          const totalCardsCount = col.reduce((sum, item) => sum + (item.quantity || 0) + (item.quantityFoil || 0), 0);
          const settings = await db.getSettings(u.id);

          return {
            id: u.id,
            username: u.username,
            createdAt: u.createdAt,
            forSaleCount,
            forSaleItemsCount: forSaleItems.length,
            wishlistCount: wishlist.length,
            totalCardsCount,
            currency: settings?.currency || 'PLN',
            city: locations.get(u.id)?.city || null
          };
        } catch {
          return {
            id: u.id,
            username: u.username,
            createdAt: u.createdAt,
            forSaleCount: 0,
            forSaleItemsCount: 0,
            wishlistCount: 0,
            totalCardsCount: 0,
            currency: 'PLN',
            city: locations.get(u.id)?.city || null
          };
        }
      })
    );
    res.json(result);
  } catch (err: any) {
    console.error('Error in /api/users:', err);
    sendServerError(res, err, '/api/users', 'Błąd pobierania listy użytkowników.');
  }
});

// --- PROFIL: MIEJSCOWOŚĆ, MAPA SPRZEDAWCÓW, DOPASOWANIA DO LISTY ŻYCZEŃ ---

const geoLimiter = rateLimit({
  name: 'geo', windowMs: 60_000, max: 40, key: userKey,
  message: 'Zbyt wiele wyszukiwań miejscowości. Odczekaj chwilę.'
});

// Podpowiedzi miejscowości (Nominatim/OpenStreetMap, z pamięcią podręczną)
app.get('/api/geo/cities', authMiddleware, geoLimiter, async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(await searchCities(q));
  } catch (err: any) {
    console.warn('[Geo] Wyszukiwanie nieudane:', err?.message || err);
    res.status(502).json({ error: 'Wyszukiwarka miejscowości jest chwilowo niedostępna. Spróbuj za chwilę.' });
  }
});

app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    res.json(await db.getProfile((req as any).userId));
  } catch (err: any) {
    sendServerError(res, err, '/api/profile');
  }
});

// Zapis miejscowości: przyjmujemy tylko etykietę podpowiedzi z geokodera (współrzędne bierzemy od siebie).
// { label: null } usuwa miejscowość.
app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const label = req.body?.label;
    if (label === null || label === '') {
      const cleared = { city: null, cityLabel: null, countryCode: null, lat: null, lon: null };
      return res.json(await db.saveProfile(userId, cleared));
    }
    let place;
    try {
      place = await resolveSuggestion(label);
    } catch (geoErr: any) {
      console.warn('[Geo] Weryfikacja miejscowości nieudana:', geoErr?.message || geoErr);
      return res.status(502).json({ error: 'Nie można teraz zweryfikować miejscowości. Spróbuj za chwilę.' });
    }
    if (!place) {
      return res.status(400).json({ error: 'Wybierz miejscowość z listy podpowiedzi.' });
    }
    res.json(await db.saveProfile(userId, {
      city: place.city,
      cityLabel: place.label,
      countryCode: place.countryCode,
      lat: place.lat,
      lon: place.lon
    }));
  } catch (err: any) {
    sendServerError(res, err, '/api/profile');
  }
});

/** Karty na sprzedaż per użytkownik (PostgreSQL jednym zapytaniem; tryb plikowy — pętla). */
async function forSaleCountsAll(): Promise<Map<string, { cards: number; items: number }>> {
  if (db.isPostgresActive()) return db.getForSaleCounts();
  const out = new Map<string, { cards: number; items: number }>();
  for (const u of await db.getAllUsers()) {
    const sale = (await db.getCollection(u.id)).filter((i) => i.isForSale);
    if (sale.length) out.set(u.id, { cards: sale.reduce((s, i) => s + (i.quantity || 0) + (i.quantityFoil || 0), 0), items: sale.length });
  }
  return out;
}

/** Ile różnych kart z mojej listy życzeń ma każdy inny użytkownik (w kolekcji / na sprzedaż). */
async function wishlistMatchesFor(userId: string): Promise<Record<string, { collection: number; forSale: number }>> {
  const names = (await db.getWishlist(userId)).map((w) => w.card?.name).filter(Boolean) as string[];
  if (names.length === 0) return {};
  if (db.isPostgresActive()) return db.getWishlistMatches(userId, names);
  const wanted = new Set(names.map((n) => n.toLowerCase().trim()));
  const out: Record<string, { collection: number; forSale: number }> = {};
  for (const u of await db.getAllUsers()) {
    if (u.id === userId) continue;
    const owned = new Set<string>();
    const selling = new Set<string>();
    for (const i of await db.getCollection(u.id)) {
      const n = (i.card?.name || '').toLowerCase().trim();
      if (!wanted.has(n) || (i.quantity || 0) + (i.quantityFoil || 0) <= 0) continue;
      owned.add(n);
      if (i.isForSale) selling.add(n);
    }
    if (owned.size) out[u.id] = { collection: owned.size, forSale: selling.size };
  }
  return out;
}

app.get('/api/users/wishlist-matches', authMiddleware, async (req, res) => {
  try {
    res.json(await wishlistMatchesFor((req as any).userId));
  } catch (err: any) {
    sendServerError(res, err, '/api/users/wishlist-matches');
  }
});

// Mapa sprzedawców: miasta z użytkownikami, którzy mają karty na sprzedaż
app.get('/api/sellers/map', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const [locations, saleCounts, users, matches, myProfile] = await Promise.all([
      db.getAllLocations(),
      forSaleCountsAll(),
      db.getAllUsers(),
      wishlistMatchesFor(userId),
      db.getProfile(userId)
    ]);
    const names = new Map(users.map((u) => [u.id, u.username]));
    const cities = new Map<string, { label: string; city: string; lat: number; lon: number; sellers: any[] }>();
    for (const loc of locations) {
      const sale = saleCounts.get(loc.userId);
      const username = names.get(loc.userId);
      if (!sale || sale.cards <= 0 || !username) continue;
      let group = cities.get(loc.cityLabel);
      if (!group) cities.set(loc.cityLabel, (group = { label: loc.cityLabel, city: loc.city, lat: loc.lat, lon: loc.lon, sellers: [] }));
      group.sellers.push({
        id: loc.userId,
        username,
        isMe: loc.userId === userId,
        forSaleCount: sale.cards,
        forSaleItemsCount: sale.items,
        wishlistMatches: matches[loc.userId]?.forSale || 0
      });
    }
    const result = [...cities.values()].map((c) => ({
      ...c,
      sellers: c.sellers.sort((a, b) => b.wishlistMatches - a.wishlistMatches || b.forSaleCount - a.forSaleCount)
    }));
    res.json({ cities: result, myCity: myProfile.city ? myProfile.cityLabel : null });
  } catch (err: any) {
    sendServerError(res, err, '/api/sellers/map');
  }
});

// --- PUBLIC SALE ENDPOINT (NO AUTH REQUIRED) ---

app.get('/api/public/sale/:userRef', async (req, res) => {
  try {
    const { userRef } = req.params;
    if (!userRef || !userRef.trim()) {
      return res.status(400).json({ error: 'Identyfikator lub nazwa użytkownika jest wymagana' });
    }

    const user = await db.getUserByIdOrUsername(userRef.trim());
    if (!user) {
      return res.status(404).json({ error: 'Nie znaleziono oferty dla tego użytkownika' });
    }

    const collection = await db.getCollection(user.id);
    const forSaleItems = collection.filter((item) => Boolean(item.isForSale));
    const settings = await db.getSettings(user.id);

    res.json({
      seller: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at
      },
      cards: forSaleItems,
      settings: settings || {
        currency: 'PLN',
        pricingSource: 'CARDMARKET',
        eurToPlnRate: 4.31,
        usdToPlnRate: 3.96,
        autoNbpRate: true,
      }
    });
  } catch (err: any) {
    console.error('Error in /api/public/sale:', err);
    sendServerError(res, err, '/api/public/sale/:userRef', 'Błąd pobierania oferty.');
  }
});

// --- PUBLIC USER WISHLIST ENDPOINT (NO AUTH REQUIRED) ---

app.get('/api/public/wishlist/:userRef', async (req, res) => {
  try {
    const { userRef } = req.params;
    if (!userRef || !userRef.trim()) {
      return res.status(400).json({ error: 'Identyfikator lub nazwa użytkownika jest wymagana' });
    }

    const user = await db.getUserByIdOrUsername(userRef.trim());
    if (!user) {
      return res.status(404).json({ error: 'Nie znaleziono profilu dla tego użytkownika' });
    }

    const wishlist = await db.getWishlist(user.id);
    const settings = await db.getSettings(user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at
      },
      wishlist,
      settings: settings || {
        currency: 'PLN',
        pricingSource: 'CARDMARKET',
        eurToPlnRate: 4.31,
        usdToPlnRate: 3.96,
        autoNbpRate: true,
      }
    });
  } catch (err: any) {
    console.error('Error in /api/public/wishlist:', err);
    sendServerError(res, err, '/api/public/wishlist/:userRef', 'Błąd pobierania listy życzeń użytkownika.');
  }
});

// --- WISHLIST ENDPOINTS (USER-ISOLATED) ---

app.get('/api/wishlist', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const wishlist = await db.getWishlist(userId);
    res.json(wishlist);
  } catch (err: any) {
    sendServerError(res, err, '/api/wishlist');
  }
});

app.post('/api/wishlist', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const newItem = {
      id: `wish-${crypto.randomUUID()}`,
      addedAt: new Date().toISOString(),
      ...req.body
    };
    const saved = await db.addWishlistItem(userId, newItem);
    res.status(201).json(saved);
  } catch (err: any) {
    sendServerError(res, err, '/api/wishlist');
  }
});

app.delete('/api/wishlist/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.deleteWishlistItem(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    sendServerError(res, err, '/api/wishlist/:id');
  }
});

// --- USER MESSAGES ENDPOINTS (COMMUNICATION / INBOX) ---

app.get('/api/messages/inbox', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const inbox = await db.getInbox(userId);
    res.json(inbox);
  } catch (err: any) {
    sendServerError(res, err, '/api/messages/inbox', 'Błąd pobierania skrzynki odbiorczej.');
  }
});

app.get('/api/messages/sent', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const sent = await db.getSent(userId);
    res.json(sent);
  } catch (err: any) {
    sendServerError(res, err, '/api/messages/sent', 'Błąd pobierania skrzynki nadawczej.');
  }
});

app.get('/api/messages/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const count = await db.getUnreadCount(userId);
    res.json({ unreadCount: count });
  } catch (err: any) {
    sendServerError(res, err, '/api/messages/unread-count', 'Błąd pobierania licznika wiadomości.');
  }
});

app.post('/api/messages', authMiddleware, messageLimiter, async (req, res) => {
  try {
    const senderId = (req as any).userId;
    const { recipientId, recipientUsername, subject, body } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Temat wiadomości jest wymagany' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Treść wiadomości nie może być pusta' });
    }

    const sender = await db.getUserById(senderId);
    if (!sender) {
      return res.status(401).json({ error: 'Nieprawidłowy nadawca' });
    }

    let recipient = null;
    if (recipientId) {
      recipient = await db.getUserById(recipientId);
    } else if (recipientUsername) {
      recipient = await db.getUserByIdOrUsername(recipientUsername);
    }

    if (!recipient) {
      return res.status(404).json({ error: 'Nie znaleziono wskazanego odbiorcy wiadomości' });
    }

    if (recipient.id === senderId) {
      return res.status(400).json({ error: 'Nie możesz wysłać wiadomości do samego siebie' });
    }

    const newMsg = {
      id: `msg-${crypto.randomUUID()}`,
      senderId: sender.id,
      senderUsername: sender.username,
      recipientId: recipient.id,
      recipientUsername: recipient.username,
      subject: subject.trim(),
      body: body.trim(),
      isRead: false,
      createdAt: new Date().toISOString()
    };

    const saved = await db.sendMessage(newMsg);
    res.status(201).json(saved);
  } catch (err: any) {
    sendServerError(res, err, '/api/messages', 'Błąd podczas wysyłania wiadomości.');
  }
});

app.put('/api/messages/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const success = await db.markAllAsRead(userId);
    res.json({ success });
  } catch (err: any) {
    sendServerError(res, err, '/api/messages/mark-all-read', 'Błąd oznaczania wiadomości.');
  }
});

app.put('/api/messages/:id/read', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.markAsRead(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    sendServerError(res, err, '/api/messages/:id/read', 'Błąd aktualizacji statusu.');
  }
});

app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.deleteMessage(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    sendServerError(res, err, '/api/messages/:id', 'Błąd usuwania wiadomości.');
  }
});

// --- SETTINGS ENDPOINTS (USER-ISOLATED) ---

app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const settings = await db.getSettings(userId);
    res.json(settings || {});
  } catch (err: any) {
    sendServerError(res, err, '/api/settings');
  }
});

app.post('/api/settings', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const settings = await db.saveSettings(userId, req.body);
    res.json(settings);
  } catch (err: any) {
    sendServerError(res, err, '/api/settings');
  }
});

// --- DECKS ENDPOINTS (USER-ISOLATED, DEFAULT EDH COMMANDER) ---

app.get('/api/decks', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const decks = await db.getDecks(userId);
    res.json(decks);
  } catch (err: any) {
    sendServerError(res, err, '/api/decks');
  }
});

app.post('/api/decks', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { name, format, description, commander, cards, cardSource } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nazwa talii jest wymagana.' });
    }

    const newDeck = {
      id: `deck-${crypto.randomUUID()}`,
      name: name.trim(),
      format: format || 'EDH Commander', // default always EDH Commander
      description: description || '',
      cardSource: (cardSource === 'all' ? 'all' : 'collection') as 'all' | 'collection',
      commander: commander || null,
      cards: Array.isArray(cards) ? cards : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await db.saveDeck(userId, newDeck);
    res.status(201).json(saved);
  } catch (err: any) {
    sendServerError(res, err, '/api/decks');
  }
});

app.put('/api/decks/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const deckToSave = {
      ...req.body,
      id,
      cardSource: req.body.cardSource === 'all' ? 'all' : 'collection',
      format: req.body.format || 'EDH Commander'
    };
    const saved = await db.saveDeck(userId, deckToSave);
    res.json(saved);
  } catch (err: any) {
    sendServerError(res, err, '/api/decks/:id');
  }
});

app.delete('/api/decks/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.deleteDeck(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    sendServerError(res, err, '/api/decks/:id');
  }
});

// --- COMMANDER SPELLBOOK API PROXY & CACHE ---
const SPELLBOOK_BASE = 'https://backend.commanderspellbook.com';
const spellbookCache = new Map<string, { data: any; timestamp: number }>();
const SPELLBOOK_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour cache
let lastSpellbookRequestTime = 0;
const SPELLBOOK_MIN_INTERVAL_MS = 250; // max ~4 req/s (safely below 80 req/min guidance)

async function fetchSpellbookThrottled(url: string, options: RequestInit = {}) {
  const now = Date.now();
  const timeSinceLast = now - lastSpellbookRequestTime;
  if (timeSinceLast < SPELLBOOK_MIN_INTERVAL_MS) {
    const waitMs = SPELLBOOK_MIN_INTERVAL_MS - timeSinceLast;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  lastSpellbookRequestTime = Date.now();

  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'MTGCollectionApp/1.0 (Contact: collector@mtg-app.local)',
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  });

  return response;
}

// 1. Find Combos in a Deck (Commander Spellbook /find-my-combos)
app.post('/api/spellbook/find-my-combos', async (req, res) => {
  try {
    const { commanders = [], main = [] } = req.body;

    const formattedCommanders = (Array.isArray(commanders) ? commanders : [])
      .map((c: any) => typeof c === 'string' ? { card: c.trim(), quantity: 1 } : { card: (c.card || c.name || '').trim(), quantity: c.quantity || 1 })
      .filter((c: any) => Boolean(c.card));

    const formattedMain = (Array.isArray(main) ? main : [])
      .map((c: any) => typeof c === 'string' ? { card: c.trim(), quantity: 1 } : { card: (c.card || c.name || '').trim(), quantity: c.quantity || 1 })
      .filter((c: any) => Boolean(c.card));

    if (formattedCommanders.length === 0 && formattedMain.length === 0) {
      return res.json({
        results: {
          identity: '',
          included: [],
          almostIncluded: []
        }
      });
    }

    // Cache key based on sorted cards
    const sortedComms = [...formattedCommanders].map(c => c.card).sort().join('|');
    const sortedMainNames = [...formattedMain].map(c => c.card).sort().join('|');
    const cacheKey = `deck_combos:${sortedComms}::${sortedMainNames}`;

    const cached = spellbookCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < SPELLBOOK_CACHE_TTL_MS)) {
      return res.json(cached.data);
    }

    const payload = {
      commanders: formattedCommanders,
      main: formattedMain
    };

    const spellbookRes = await fetchSpellbookThrottled(`${SPELLBOOK_BASE}/find-my-combos/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!spellbookRes.ok) {
      const errText = await spellbookRes.text();
      console.error('Commander Spellbook API error:', spellbookRes.status, errText);
      return res.status(spellbookRes.status).json({
        error: `Commander Spellbook API error (${spellbookRes.status}): ${errText}`
      });
    }

    const data = await spellbookRes.json();
    spellbookCache.set(cacheKey, { data, timestamp: Date.now() });

    res.json(data);
  } catch (err: any) {
    console.error('Error in /api/spellbook/find-my-combos:', err);
    res.status(500).json({ error: 'Nie udało się pobrać kombinacji: ' + err.message });
  }
});

// 2. Find Combos featuring a specific Card (Commander Spellbook /variants/?q=card:"...")
app.get('/api/spellbook/card-combos', async (req, res) => {
  try {
    const cardName = (req.query.cardName as string || '').trim();
    if (!cardName) {
      return res.status(400).json({ error: 'Parametr "cardName" jest wymagany' });
    }

    const cacheKey = `card_combos:${cardName.toLowerCase()}`;
    const cached = spellbookCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < SPELLBOOK_CACHE_TTL_MS)) {
      return res.json(cached.data);
    }

    const queryUrl = `${SPELLBOOK_BASE}/variants/?q=card:%22${encodeURIComponent(cardName)}%22&limit=20`;
    const spellbookRes = await fetchSpellbookThrottled(queryUrl);

    if (!spellbookRes.ok) {
      const errText = await spellbookRes.text();
      return res.status(spellbookRes.status).json({
        error: `Commander Spellbook API error (${spellbookRes.status}): ${errText}`
      });
    }

    const data = await spellbookRes.json();
    const resultPayload = {
      results: Array.isArray(data.results) ? data.results : [],
      count: data.count || (Array.isArray(data.results) ? data.results.length : 0)
    };

    spellbookCache.set(cacheKey, { data: resultPayload, timestamp: Date.now() });
    res.json(resultPayload);
  } catch (err: any) {
    console.error('Error in /api/spellbook/card-combos:', err);
    res.status(500).json({ error: 'Nie udało się pobrać kombinacji dla karty: ' + err.message });
  }
});

// 3. Spellbook Status & Stats
app.get('/api/spellbook/status', (_req, res) => {
  res.json({
    status: 'online',
    endpoint: SPELLBOOK_BASE,
    cachedEntries: spellbookCache.size,
    rateLimitIntervalMs: SPELLBOOK_MIN_INTERVAL_MS
  });
});

// --- START SERVER ---

async function startServer() {
  await db.initDb();
  // Lokalna baza kart dla skanera (import w tle, nie blokuje startu).
  cards.startCardDb().catch((err) => console.warn('[Karty] Start nieudany:', err?.message || err));
  // Porządki w tabeli sesji: przy starcie i raz na dobę.
  const purge = () => db.purgeOldSessions().catch((err) => console.warn('[Sesje] Czyszczenie nieudane:', err?.message || err));
  purge();
  setInterval(purge, 24 * 60 * 60 * 1000).unref();
  if (process.env.NODE_ENV !== 'production') {
    // Vite ładowany tylko w trybie deweloperskim — w produkcji nie jest potrzebny.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Pliki z hashem w nazwie (dist/assets) można cache'ować długo; index.html zawsze świeży.
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }));
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    // Nieznane ścieżki API zwracają 404 zamiast strony aplikacji.
    app.use('/api', (_req: express.Request, res: express.Response) => {
      res.status(404).json({ error: 'Nie znaleziono.' });
    });
    app.get('*', (_req: express.Request, res: express.Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server MTG App running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
