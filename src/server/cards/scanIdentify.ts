/**
 * Rozpoznawanie karty MTG ze skanera na podstawie lokalnej bazy kart i odcisków obrazów.
 *
 * Wspólne dla endpointu skanera i oceny skanera na zapisanych próbkach (panel admina),
 * żeby ocena mierzyła dokładnie tę samą logikę, która działa na produkcji.
 */
import * as cards from './cardStore';
import * as hashes from './hashIndex';
import { computeQueryHashes, decodeJpegToGray } from './imageHash';
import { normalizeName, nameSimilarity } from './nameMatch';

export interface IdentifyResult {
  matchedCard: any | null;
  possibleCards: any[];
  confidence: number;
  method?: 'set_number' | 'name' | 'name_image' | 'image' | 'none';
  imageDistance?: number;
}

export const MAX_PRINTINGS = 40;
// Progi dla odległości odcisków (0..1024). Dobrane na danych testowych:
// ta sama karta zwykle < 270, różne karty zwykle > 330.
export const IMAGE_ACCEPT_DISTANCE = 300; // rozpoznanie wyłącznie po obrazie
export const IMAGE_MIN_MARGIN = 25; // wymagana przewaga nad najlepszą inną kartą
export const IMAGE_SET_TOLERANCE = 40; // set z OCR wygrywa, jeśli jego obraz jest niewiele gorszy
export const IMAGE_TITLE_BONUS = 40; // luźniejszy próg obrazu, gdy częściowo odczytana nazwa się zgadza

/**
 * Odciski przesłanego zdjęcia karty (JPEG jako data URL); null, gdy brak lub niepoprawny.
 * Kilka wariantów kadru, bo rogi wykryte na zdjęciu bywają przesunięte o parę procent.
 */
export function hashCardImage(dataUrl: unknown, rotate180 = false): Uint8Array[] | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg;base64,')) return null;
  if (dataUrl.length > 2_000_000) return null;
  try {
    const img = decodeJpegToGray(Buffer.from(dataUrl.slice(23), 'base64'));
    if (rotate180) img.data.reverse();
    return computeQueryHashes(img);
  } catch {
    return null;
  }
}

/**
 * Odciski kilku klatek tej samej karty: [0] to klatka główna, kolejne (opcjonalnie) to następne
 * klatki z kamery. Każda klatka to lista wariantów kadru z `hashCardImage`.
 */
export type FrameHashes = Uint8Array[][];

/** Do 2 dodatkowych klatek (więcej nic nie wnosi, a wydłuża przesyłanie). */
export const MAX_EXTRA_FRAMES = 2;

/** Odciski klatki głównej i poprawnych klatek dodatkowych; null, gdy klatka główna jest niepoprawna. */
export function hashCardFrames(dataUrl: unknown, extra: unknown, rotate180 = false): FrameHashes | null {
  const main = hashCardImage(dataUrl, rotate180);
  if (!main) return null;
  const frames: FrameHashes = [main];
  if (Array.isArray(extra)) {
    for (const e of extra.slice(0, MAX_EXTRA_FRAMES)) {
      const h = hashCardImage(e, rotate180);
      if (h) frames.push(h);
    }
  }
  return frames;
}

/** Sortuje wydania wg podobieństwa obrazu (gdy jest odcisk), zachowując resztę na końcu. */
export function rankByImage(ids: string[], queryHash: FrameHashes | null) {
  if (!queryHash || !hashes.hasHashes()) return { ordered: ids, distances: new Map<string, number>() };
  const ranked = hashes.searchByFrames(queryHash, ids.length, ids);
  const distances = new Map(ranked.map((r) => [r.id, r.distance]));
  const withHash = ranked.map((r) => r.id);
  return { ordered: [...withHash, ...ids.filter((id) => !distances.has(id))], distances };
}

export async function identifyWithLocalDb(title: string, set: string, collector: string, queryHash: FrameHashes | null): Promise<IdentifyResult> {
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
    const top = hashes.searchByFrames(queryHash, 30);
    const best = top[0];
    const bestName = best ? cards.nameOfId(best.id) : null;
    const rival = top.find((m) => cards.nameOfId(m.id) !== bestName);
    const margin = rival ? rival.distance - best.distance : Infinity;
    // Częściowo odczytana nazwa (np. 2 błędne litery) potwierdza kartę wskazaną przez obraz.
    const titleAgrees = Boolean(title.length >= 4 && bestName && nameSimilarity(normalizeName(bestName), normalizeName(title)) >= 0.5);
    const imageSure = best && best.distance <= IMAGE_ACCEPT_DISTANCE && margin >= IMAGE_MIN_MARGIN;
    const imageWithTitle = best && titleAgrees && best.distance <= IMAGE_ACCEPT_DISTANCE + IMAGE_TITLE_BONUS;
    if (best && bestName && (imageSure || imageWithTitle)) {
      const ranked = rankByImage(cards.printingsOfName(bestName), queryHash);
      printings = ranked.ordered;
      distances = ranked.distances;
      matchedId = printings[0];
      method = 'image';
      confidence = Math.round(Math.min(95, 60 + margin / 2));
      if (titleAgrees) confidence = Math.max(confidence, 90);
    }
  }

  if (!matchedId) {
    return { matchedCard: null, possibleCards: [], confidence: 0, method: 'none' };
  }

  const ids = [matchedId, ...printings.filter((id) => id !== matchedId)].slice(0, MAX_PRINTINGS);
  const possibleCards = await cards.getCardsByIds(ids);
  return { matchedCard: possibleCards[0] || null, possibleCards, confidence, method, imageDistance: distances.get(matchedId) };
}

/** Pewność, od której klient przyjmuje wynik samego obrazu bez OCR (QUICK_IMAGE_CONFIDENCE w scanEngine.ts). */
export const QUICK_IMAGE_CONFIDENCE = 85;

/**
 * Pełne rozpoznanie z lokalnej bazy, łącznie z próbą obróconej karty (karta do góry nogami).
 * To samo, co robi endpoint skanera, gdy lokalna baza jest gotowa.
 */
export async function identifyMtgLocal(
  dataUrl: unknown,
  title: string,
  set: string,
  collector: string,
  extraDataUrls?: unknown
): Promise<IdentifyResult> {
  const queryHash = hashCardFrames(dataUrl, extraDataUrls);
  let result = await identifyWithLocalDb(title, set, collector, queryHash);
  if (!result.matchedCard && queryHash) {
    const rotated = hashCardFrames(dataUrl, extraDataUrls, true);
    if (rotated) {
      const flipped = await identifyWithLocalDb('', '', '', rotated);
      if (flipped.matchedCard) result = flipped;
    }
  }
  return result;
}
