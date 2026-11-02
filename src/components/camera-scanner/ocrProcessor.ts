import { createWorker, Worker } from 'tesseract.js';
import { ScryfallCard } from '../../types';
import { t } from '../../i18n';

/**
 * Native Web Audio synthesizer for scanner audio feedback (like Delver Lens beep / chime)
 */
export function playScannerChime(type: 'success' | 'lock' | 'beep' = 'success'): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (type === 'lock') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else {
      // Pleasant double-chime (880Hz -> 1320Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(1320, now + 0.07);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.07);
      osc2.start(now + 0.07);
      osc2.stop(now + 0.22);
    }
  } catch (_) {
    // Ignore audio context block if user hasn't interacted
  }
}

let tesseractWorkerPromise: Promise<Worker> | null = null;

/**
 * Initializes or retrieves a cached Tesseract.js worker configured for MTG card OCR
 */
export async function getTesseractWorker(
  onProgress?: (progress: number, status: string) => void
): Promise<Worker> {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      onProgress?.(0.1, t('Inicjalizacja silnika OCR...'));
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            onProgress?.(0.3 + (m.progress || 0) * 0.5, t('Rozpoznawanie tekstu z kamery...'));
          } else if (m.status === 'loading tesseract core') {
            onProgress?.(0.15, t('Ładowanie modułu WebAssembly...'));
          } else if (m.status === 'loading language traineddata') {
            onProgress?.(0.25, t('Ładowanie bazy słowników MTG...'));
          }
        },
      });

      // Optimize Tesseract parameters for card titles:
      // PSM 7 treats the image as a single text line (drastically increases single-line title accuracy!)
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '7' as any,
          tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',.:/’—–!?()[]",
        });
      } catch (err) {
        console.warn('Nie udało się ustawić parametrów Tesseract:', err);
      }

      return worker;
    })();
    // Nieudane uruchomienie (np. chwilowy brak sieci przy pobieraniu słownika) nie blokuje OCR na stałe.
    const started = tesseractWorkerPromise;
    started.catch(() => {
      if (tesseractWorkerPromise === started) tesseractWorkerPromise = null;
    });
  }
  return tesseractWorkerPromise;
}

/**
 * Zamyka bieżący wątek OCR (np. zawieszony odczyt); następne wywołanie `getTesseractWorker` uruchomi nowy.
 */
export function resetTesseractWorker(): void {
  const old = tesseractWorkerPromise;
  tesseractWorkerPromise = null;
  old?.then((w) => w.terminate()).catch(() => {});
}

/**
 * Cleans extracted MTG Card Title from noise and symbols
 */
export function cleanCardTitle(rawText: string): string {
  if (!rawText) return '';

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Pick the line most likely to be the title (alphabetical characters with length > 2)
  let candidate = lines.find((l) => /[a-zA-Z]{3,}/.test(l)) || lines[0] || '';

  // Remove mana symbols like "{2}{U}", "(2)(U)", "{T}", "(T)", "[R]"
  candidate = candidate
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[|~_—–()[\]{}<>«»`"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing numbers/mana symbols at the end of the line (e.g. "Sol Ring 1", "Lightning Bolt R")
  candidate = candidate.replace(/\s+[0-9XYZWURGB]{1,3}$/i, '');

  // Strip leading numbers or bullets (e.g. "1. Sol Ring" -> "Sol Ring")
  candidate = candidate.replace(/^[\d\W_]+/, '');

  return candidate.trim();
}

/**
 * Computes Levenshtein distance for fuzzy string comparison
 */
function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b[i - 1].toLowerCase() === a[j - 1].toLowerCase()) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Searches Scryfall API with multiple robust fallback tiers:
 * 1. Direct Set + Collector number lookup
 * 2. Scryfall Fuzzy Named endpoint (`/api/scryfall/named?fuzzy=...`)
 * 3. Scryfall Autocomplete with Levenshtein similarity ranking
 * 4. Scryfall full-text search
 */
export async function searchCardInScryfall(
  cleanedTitle: string,
  detectedSet?: string,
  detectedNumber?: string
): Promise<{ matchedCard: ScryfallCard | null; possibleCards: ScryfallCard[] }> {
  // 1. Try exact set + collector number if detected
  if (detectedSet && detectedNumber) {
    try {
      const directRes = await fetch(
        `/api/scryfall/card-print/${encodeURIComponent(detectedSet)}/${encodeURIComponent(detectedNumber)}`
      );
      if (directRes.ok) {
        const exactCard: ScryfallCard = await directRes.json();
        if (exactCard && exactCard.name) {
          return {
            matchedCard: exactCard,
            possibleCards: [exactCard],
          };
        }
      }
    } catch (_) {
      // Continue to name search
    }
  }

  if (!cleanedTitle || cleanedTitle.length < 2) {
    return { matchedCard: null, possibleCards: [] };
  }

  // 2. Scryfall Fuzzy Named API (Scryfall's internal spellchecker for MTG cards)
  try {
    const fuzzyUrl = detectedSet
      ? `/api/scryfall/named?fuzzy=${encodeURIComponent(cleanedTitle)}&set=${encodeURIComponent(detectedSet)}`
      : `/api/scryfall/named?fuzzy=${encodeURIComponent(cleanedTitle)}`;

    const fuzzyRes = await fetch(fuzzyUrl);
    if (fuzzyRes.ok) {
      const fuzzyCard: ScryfallCard = await fuzzyRes.json();
      if (fuzzyCard && fuzzyCard.name) {
        return {
          matchedCard: fuzzyCard,
          possibleCards: [fuzzyCard],
        };
      }
    }
  } catch (_) {
    // Continue to autocomplete & search
  }

  // 3. Autocomplete + Levenshtein fuzzy distance matching
  try {
    // Search first 2-3 words or first 16 characters
    const queryStem = cleanedTitle.split(/\s+/).slice(0, 3).join(' ').slice(0, 16).trim();
    const autoRes = await fetch(`/api/scryfall/autocomplete?q=${encodeURIComponent(queryStem)}`);

    if (autoRes.ok) {
      const autoData = await autoRes.json();
      const suggestions: string[] = Array.isArray(autoData.data) ? autoData.data : [];

      if (suggestions.length > 0) {
        // Sort suggestions by similarity to cleanedTitle
        suggestions.sort((a, b) => {
          const distA = levenshteinDistance(cleanedTitle, a);
          const distB = levenshteinDistance(cleanedTitle, b);
          return distA - distB;
        });

        const bestCandidate = suggestions[0];
        // Fetch the best candidate card directly
        const cardRes = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(bestCandidate)}`);
        if (cardRes.ok) {
          const bestCard: ScryfallCard = await cardRes.json();
          if (bestCard && bestCard.name) {
            return {
              matchedCard: bestCard,
              possibleCards: [bestCard],
            };
          }
        }
      }
    }
  } catch (_) {
    // Continue
  }

  // 4. Standard Search
  try {
    const searchRes = await fetch(`/api/scryfall/search?q=${encodeURIComponent(cleanedTitle.trim())}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const cards: ScryfallCard[] = Array.isArray(searchData.data) ? searchData.data : [];

      if (cards.length > 0) {
        const exactMatch = cards.find(
          (c) => c.name.toLowerCase() === cleanedTitle.toLowerCase()
        );
        return {
          matchedCard: exactMatch || cards[0],
          possibleCards: cards.slice(0, 8),
        };
      }
    }
  } catch (_) {
    // Nothing found
  }

  return { matchedCard: null, possibleCards: [] };
}
