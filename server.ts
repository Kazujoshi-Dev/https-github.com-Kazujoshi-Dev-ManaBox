import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import * as db from './src/server/db';
import { hashPassword, verifyPassword, generateToken, verifyToken } from './src/server/auth';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Allow camera access in headers
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*');
  res.setHeader('Feature-Policy', "camera '*'");
  next();
});

// Auth verification middleware
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Brak autoryzacji lub sesja wygasła. Zaloguj się ponownie.' });
  }
  (req as any).user = payload;
  (req as any).userId = payload.userId;
  next();
}

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- AUTHENTICATION ENDPOINTS ---

app.post(['/api/auth/register', '/api/auth/register/', '/api/register'], async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, nazwa gracza oraz hasło są wymagane.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Hasło musi mieć co najmniej 6 znaków.' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Użytkownik o takim adresie e-mail już istnieje.' });
    }

    const { hash, salt } = hashPassword(password);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const user = await db.createUser(userId, email, username, hash, salt);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username
    });

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
    res.status(500).json({ error: 'Błąd rejestracji konta: ' + err.message });
  }
});

app.post(['/api/auth/login', '/api/auth/login/', '/api/login'], async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email oraz hasło są wymagane.' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Nie znaleziono konta z takim adresem e-mail. Zarejestruj się lub zresetuj hasło.' });
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      return res.status(401).json({ error: 'Nieprawidłowe hasło do konta. Użyj opcji "Zresetuj hasło", aby nadać nowe.' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username
    });

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
    res.status(500).json({ error: 'Błąd logowania: ' + err.message });
  }
});

app.post(['/api/auth/reset-password', '/api/auth/recover', '/api/reset-password'], async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Adres e-mail i nowe hasło są wymagane.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Hasło musi mieć co najmniej 6 znaków.' });
    }

    const { hash, salt } = hashPassword(password);
    let user = await db.getUserByEmail(email);
    if (user) {
      user = await db.updateUserPassword(email, hash, salt);
    } else {
      const uname = username?.trim() || email.split('@')[0] || 'Planeswalker';
      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      user = await db.createUser(userId, email, uname, hash, salt);
    }

    if (!user) {
      return res.status(500).json({ error: 'Nie udało się zaktualizować hasła.' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username
    });

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
    res.status(500).json({ error: 'Błąd resetowania hasła: ' + err.message });
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
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

// --- GEMINI AI VISION SETUP ---
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// --- API ROUTES ---

// 0. AI Multimodal Card Identifier (Gemini 3.8 Flash)
app.post('/api/scanner/ai-identify', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Brak danych obrazu (imageBase64 jest wymagane)' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        message: 'Klucz Gemini API nie jest dostępny. Przełącz się na silnik lokalnego OCR.',
      });
    }

    // Strip data URI header if provided
    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: `You are an expert Magic: The Gathering card identification engine.
Analyze this image of a Magic: The Gathering card (it may be captured via webcam or smartphone, slightly angled, or in a sleeve with glare).
Determine:
1. cardName: Exact official English name of the MTG card (e.g. "Sol Ring", "Rhystic Study", "Black Lotus", "Sheoldred, the Apocalypse").
2. setCode: 3 or 4-letter set code if visible (e.g. from the expansion symbol on the right or the bottom-left text like "OTJ", "MH3", "BLB", "LTR", "CMM"). If not clearly readable, return empty string "".
3. collectorNumber: Collector number (digits only or alphanumeric) printed in the bottom-left corner. If not clearly readable, return empty string "".
4. confidence: 0 to 100 estimated confidence of your identification.
5. isFoil: Boolean, true if foil rainbow sheen, metallic star, or etched finish is visible.
6. printedLanguage: Language of the card printed on paper (e.g. "EN", "JA", "DE", "FR", "IT", "ES"). Default "EN".
Return strictly valid JSON conforming to the schema.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cardName: { type: Type.STRING, description: 'Official English card name' },
            setCode: { type: Type.STRING, description: '3-4 letter set code or empty string' },
            collectorNumber: { type: Type.STRING, description: 'Collector number or empty string' },
            confidence: { type: Type.NUMBER, description: 'Confidence 0-100' },
            isFoil: { type: Type.BOOLEAN, description: 'True if foil/holographic' },
            printedLanguage: { type: Type.STRING, description: 'Card language printed' },
          },
          required: ['cardName', 'confidence'],
        },
      },
    });

    const rawJson = response.text?.trim() || '{}';
    let aiParsed: any = {};
    try {
      aiParsed = JSON.parse(rawJson);
    } catch (parseErr) {
      console.warn('Błąd parsowania JSON z Gemini:', rawJson);
    }

    if (!aiParsed.cardName || aiParsed.confidence < 20) {
      return res.status(422).json({
        error: 'CARD_NOT_FOUND',
        message: 'Nie udało się jednoznacznie zidentyfikować karty na obrazie.',
      });
    }

    let matchedCard: any = null;
    let possibleCards: any[] = [];

    // Step A: If set code and collector number were found, try exact print lookup
    if (aiParsed.setCode && aiParsed.collectorNumber) {
      try {
        const cleanSet = aiParsed.setCode.toLowerCase().trim();
        const cleanNum = aiParsed.collectorNumber.trim().replace(/^0+/, '') || '1';
        const exactPrint = await fetchScryfall(`/cards/${encodeURIComponent(cleanSet)}/${encodeURIComponent(cleanNum)}`);
        if (exactPrint && exactPrint.name) {
          matchedCard = exactPrint;
          possibleCards = [exactPrint];
        }
      } catch (_) {}
    }

    // Step B: Scryfall Fuzzy Named Search
    if (!matchedCard) {
      try {
        const queryUrl = aiParsed.setCode
          ? `/cards/named?fuzzy=${encodeURIComponent(aiParsed.cardName)}&set=${encodeURIComponent(aiParsed.setCode.toLowerCase())}`
          : `/cards/named?fuzzy=${encodeURIComponent(aiParsed.cardName)}`;
        const fuzzyCard = await fetchScryfall(queryUrl);
        if (fuzzyCard && fuzzyCard.name) {
          matchedCard = fuzzyCard;
          possibleCards = [fuzzyCard];
        }
      } catch (_) {
        // Fallback without set
        try {
          const fallbackCard = await fetchScryfall(`/cards/named?fuzzy=${encodeURIComponent(aiParsed.cardName)}`);
          if (fallbackCard && fallbackCard.name) {
            matchedCard = fallbackCard;
            possibleCards = [fallbackCard];
          }
        } catch (_) {}
      }
    }

    // Step C: Fallback to full search if named was not found
    if (!matchedCard) {
      try {
        const searchResult = await fetchScryfall(`/cards/search?q=${encodeURIComponent(aiParsed.cardName)}`);
        if (searchResult && Array.isArray(searchResult.data) && searchResult.data.length > 0) {
          matchedCard = searchResult.data[0];
          possibleCards = searchResult.data.slice(0, 8);
        }
      } catch (_) {}
    }

    res.json({
      success: true,
      cardName: aiParsed.cardName,
      setCode: aiParsed.setCode || null,
      collectorNumber: aiParsed.collectorNumber || null,
      confidence: aiParsed.confidence || 90,
      isFoil: Boolean(aiParsed.isFoil),
      printedLanguage: aiParsed.printedLanguage || 'EN',
      matchedCard,
      possibleCards,
    });
  } catch (err: any) {
    console.error('Błąd w /api/scanner/ai-identify:', err?.message || err);
    const isQuota = err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('quota');
    res.status(isQuota ? 429 : 500).json({
      error: isQuota ? 'QUOTA_EXHAUSTED' : 'AI_SCAN_FAILED',
      message: isQuota
        ? 'Chwilowo wyczerpano limit zapytań AI Gemini. Przełącz na lokalny OCR w aparacie lub odczekaj chwilę.'
        : (err.message || 'Wystąpił błąd podczas analizy obrazu przez AI.'),
    });
  }
});

// 1. Scryfall Image Proxy (solves referrer / CORS / hotlink blocking)
app.get('/api/scryfall/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl || (!imageUrl.includes('scryfall.io') && !imageUrl.includes('scryfall.com'))) {
      return res.status(400).send('Nieprawidłowy adres obrazu');
    }

    const imgRes = await fetchScryfallThrottled(imageUrl, {
      headers: {
        'Accept': 'image/jpeg,image/webp,image/png,image/*,*/*'
      }
    });

    if (!imgRes.ok) {
      return res.status(imgRes.status).send('Błąd pobierania obrazu');
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).send(err.message);
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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collection', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const newItem = {
      id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      addedAt: new Date().toISOString(),
      ...req.body
    };
    const saved = await db.addCollectionItem(userId, newItem);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/collection/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.deleteCollectionItem(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collection/bulk-import', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const items = Array.isArray(req.body) ? req.body : [];
    await db.saveFullCollection(userId, items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// Batch price refresh from Scryfall using official POST /cards/collection Bulk API
app.post('/api/collection/refresh-prices', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const collection = await db.getCollection(userId);
    let updatedCount = 0;

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
                if (updatedCard.prices) item.card.prices = updatedCard.prices;
                if (updatedCard.image_uris) item.card.image_uris = updatedCard.image_uris;
                if (updatedCard.edhrec_rank !== undefined) item.card.edhrec_rank = updatedCard.edhrec_rank;
                item.lastUpdatedPriceAt = new Date().toISOString();
                updatedCount++;
              }
            });
          }
        }
      } catch (chunkErr) {
        console.warn(`Failed to update prices for chunk ${i}:`, chunkErr);
      }
    }

    await db.saveFullCollection(userId, collection);
    res.json({ success: true, updatedCount, collection });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CATALOGS ENDPOINTS (USER-ISOLATED) ---

app.get('/api/catalogs', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const catalogs = await db.getCatalogs(userId);
    res.json(catalogs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
      id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/catalogs/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const result = await db.deleteCatalog(userId, id);
    res.json({ success: true, id, reassignedTo: result.reassignedTo, catalogs: result.catalogs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- WISHLIST ENDPOINTS (USER-ISOLATED) ---

app.get('/api/wishlist', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const wishlist = await db.getWishlist(userId);
    res.json(wishlist);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wishlist', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const newItem = {
      id: `wish-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      addedAt: new Date().toISOString(),
      ...req.body
    };
    const saved = await db.addWishlistItem(userId, newItem);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/wishlist/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.deleteWishlistItem(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SETTINGS ENDPOINTS (USER-ISOLATED) ---

app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const settings = await db.getSettings(userId);
    res.json(settings || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const settings = await db.saveSettings(userId, req.body);
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- DECKS ENDPOINTS (USER-ISOLATED, DEFAULT EDH COMMANDER) ---

app.get('/api/decks', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const decks = await db.getDecks(userId);
    res.json(decks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
      id: `deck-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/decks/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const success = await db.deleteDeck(userId, id);
    res.json({ success, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- START SERVER ---

async function startServer() {
  await db.initDb();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server MTG App running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
