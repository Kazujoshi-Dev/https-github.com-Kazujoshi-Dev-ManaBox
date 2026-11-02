/**
 * Rozpoznawanie karty MTG ze skanera na podstawie lokalnej bazy kart i odcisków obrazów.
 *
 * Wspólne dla endpointu skanera i oceny skanera na zapisanych próbkach (panel admina),
 * żeby ocena mierzyła dokładnie tę samą logikę, która działa na produkcji.
 */
import * as cards from './cardStore';
import * as hashes from './hashIndex';
import { computeQueryHashes, decodeJpegToGray, jpegDimensions, type GrayImage } from './imageHash';
import { checkListMark, isListPrinting, isListTwinOf, listOrigin, type ListCheck } from './listMark';
import { normalizeName, nameSimilarity } from './nameMatch';

export interface IdentifyResult {
  matchedCard: any | null;
  possibleCards: any[];
  confidence: number;
  method?: 'set_number' | 'name' | 'name_image' | 'image' | 'none';
  imageDistance?: number;
  /** Do logu: odległość obrazu najbliższej wersji angielskiej, gdy wynik jest w innym języku (strojenie LANG_TIE_DISTANCE). */
  englishDistance?: number;
  /**
   * Ile innych wydań (inny set lub numer) ma obraz prawie tak samo podobny jak wybrane.
   * Większe od zera = edycji nie da się pewnie ustalić z samego obrazu (np. dodruk z tą samą
   * ilustracją); klient odczytuje wtedy stopkę karty i wybiera wydanie z listy.
   */
  editionTies?: number;
  /** Sprawdzenie symbolu The List (gdy karta ma takie wydanie), do logu. */
  listCheck?: ListCheck;
}

export const MAX_PRINTINGS = 40;
// Progi dla odległości odcisków (0..1024). Dobrane na danych testowych:
// ta sama karta zwykle < 270, różne karty zwykle > 330.
export const IMAGE_ACCEPT_DISTANCE = 300; // rozpoznanie wyłącznie po obrazie
export const IMAGE_MIN_MARGIN = 25; // wymagana przewaga nad najlepszą inną kartą
export const IMAGE_SET_TOLERANCE = 40; // set z OCR wygrywa, jeśli jego obraz jest niewiele gorszy
export const IMAGE_TITLE_BONUS = 40; // luźniejszy próg obrazu, gdy częściowo odczytana nazwa się zgadza

/** Ile gorszy może być obraz zwykłego wydania, żeby wygrało z promką o tej samej ilustracji. */
export const PROMO_TIE_DISTANCE = 15;

/** Ile gorszy może być obraz wersji angielskiej, żeby wygrała z inną wersją językową bez potwierdzenia nazwą. */
export const LANG_TIE_DISTANCE = 20;

/** Wydania z obrazem gorszym najwyżej o tyle traktujemy jako nierozróżnialne po obrazie. */
export const EDITION_TIE_DISTANCE = 30;

/** Wydanie promocyjne (prerelease, promo pack, Game Day itp.). */
export function isPromo(card: any): boolean {
  return Boolean(card?.promo) || card?.set_type === 'promo';
}

/**
 * Największe przyjmowane zdjęcie karty. Przeglądarka wysyła wyprostowany kadr 300×420, więc limit
 * ma spory zapas, a chroni serwer: dekodowanie i odciski dużego obrazu blokują go na sekundy.
 */
export const MAX_QUERY_WIDTH = 600;
export const MAX_QUERY_HEIGHT = 840;
/** Długość data URL (base64) — kadr 300×420 to zwykle 50–100 tys. znaków. */
export const MAX_QUERY_DATA_URL = 600_000;

/**
 * Przesłane zdjęcie karty (JPEG jako data URL) w skali szarości; null, gdy brak, niepoprawne albo za duże.
 */
export function decodeCardImage(dataUrl: unknown, rotate180 = false): GrayImage | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg;base64,')) return null;
  if (dataUrl.length > MAX_QUERY_DATA_URL) return null;
  try {
    const buf = Buffer.from(dataUrl.slice(23), 'base64');
    const size = jpegDimensions(buf);
    if (!size || !size.width || !size.height || size.width > MAX_QUERY_WIDTH || size.height > MAX_QUERY_HEIGHT) return null;
    const img = decodeJpegToGray(buf);
    if (img.width > MAX_QUERY_WIDTH || img.height > MAX_QUERY_HEIGHT) return null;
    return rotate180 ? rotateImage(img) : img;
  } catch {
    return null;
  }
}

/** Kopia obrazu obrócona o 180° (karta położona do góry nogami). */
export function rotateImage(img: GrayImage): GrayImage {
  return { width: img.width, height: img.height, data: img.data.slice().reverse() };
}

/** Klatki obrócone o 180° — bez ponownego dekodowania JPEG. */
export function rotateFrames(frames: GrayImage[] | null): GrayImage[] | null {
  return frames ? frames.map(rotateImage) : null;
}

/**
 * Odciski przesłanego zdjęcia karty. Kilka wariantów kadru, bo rogi wykryte na zdjęciu bywają
 * przesunięte o parę procent.
 */
export function hashCardImage(dataUrl: unknown, rotate180 = false): Uint8Array[] | null {
  const img = decodeCardImage(dataUrl, rotate180);
  return img ? computeQueryHashes(img) : null;
}

/**
 * Odciski kilku klatek tej samej karty: [0] to klatka główna, kolejne (opcjonalnie) to następne
 * klatki z kamery. Każda klatka to lista wariantów kadru z `hashCardImage`.
 */
export type FrameHashes = Uint8Array[][];

/** Do 2 dodatkowych klatek (więcej nic nie wnosi, a wydłuża przesyłanie). */
export const MAX_EXTRA_FRAMES = 2;

/** Wyprostowane klatki (główna + poprawne dodatkowe) w skali szarości; null, gdy klatka główna jest niepoprawna. */
export function decodeCardFrames(dataUrl: unknown, extra: unknown, rotate180 = false): GrayImage[] | null {
  const main = decodeCardImage(dataUrl, rotate180);
  if (!main) return null;
  const frames = [main];
  if (Array.isArray(extra)) {
    for (const e of extra.slice(0, MAX_EXTRA_FRAMES)) {
      const img = decodeCardImage(e, rotate180);
      if (img) frames.push(img);
    }
  }
  return frames;
}

/** Odciski klatki głównej i poprawnych klatek dodatkowych; null, gdy klatka główna jest niepoprawna. */
export function hashCardFrames(dataUrl: unknown, extra: unknown, rotate180 = false): FrameHashes | null {
  return hashFrames(decodeCardFrames(dataUrl, extra, rotate180));
}

export function hashFrames(frames: GrayImage[] | null): FrameHashes | null {
  return frames ? frames.map(computeQueryHashes) : null;
}

/** Sortuje wydania wg podobieństwa obrazu (gdy jest odcisk), zachowując resztę na końcu. */
export function rankByImage(ids: string[], queryHash: FrameHashes | null) {
  if (!queryHash || !hashes.hasHashes()) return { ordered: ids, distances: new Map<string, number>() };
  const ranked = hashes.searchByFrames(queryHash, ids.length, ids);
  const distances = new Map(ranked.map((r) => [r.id, r.distance]));
  const withHash = ranked.map((r) => r.id);
  return { ordered: [...withHash, ...ids.filter((id) => !distances.has(id))], distances };
}

/**
 * Czy obraz pewnie wskazuje inną kartę niż `card`: najlepsze dopasowanie w całej bazie to inna nazwa,
 * spełnia próg rozpoznania po samym obrazie, a wszystkie wydania `card` są wyraźnie gorsze.
 * Przy słabym obrazie (odblask, nieostrość) zwraca false, więc niczego nie blokuje.
 */
export function imageContradicts(card: any, queryHash: FrameHashes | null): boolean {
  if (!queryHash || !hashes.hasHashes()) return false;
  // nazwa pierwszej strony, jak w indeksie (karta dwustronna ma w `name` obie strony: „A // B”)
  const name = cards.nameOfId(card.id) ?? normalizeName(card.name);
  const best = hashes.searchByFrames(queryHash, 1)[0];
  if (!best || best.distance > IMAGE_ACCEPT_DISTANCE || cards.nameOfId(best.id) === name) return false;
  const own = hashes.searchByFrames(queryHash, 1, cards.printingsOfName(name))[0];
  return !own || own.distance >= best.distance + IMAGE_MIN_MARGIN;
}

export async function identifyWithLocalDb(
  title: string,
  set: string,
  collector: string,
  queryHash: FrameHashes | null,
  photos: GrayImage[] | null = null
): Promise<IdentifyResult> {
  const nameHits = title ? cards.findByName(title, 3) : [];
  const exactId = set && collector ? cards.findIdBySetNumber(set, collector) : null;

  let matchedId: string | null = null;
  let printings: string[] = [];
  let confidence = 0;
  let method: IdentifyResult['method'] = 'none';
  let distances = new Map<string, number>();
  let pickedBySet = false;
  // Nazwa odczytana przez OCR alfabetem łacińskim zgadza się z kartą, więc karta nie jest japońska ani fyrexiańska.
  let latinTitle = false;

  // 1. Kod setu + numer (najdokładniejsze), o ile zgadza się z odczytaną nazwą.
  if (exactId) {
    const [exactCard] = await cards.getCardsByIds([exactId]);
    const exactNames = exactCard ? [exactCard.name, ...(exactCard.card_faces || []).map((f: any) => f.name)] : [];
    const titleAgrees = !title || exactNames.some((n: string) => nameSimilarity(normalizeName(n), normalizeName(title)) >= 0.6);
    // Bez nazwy z OCR jedyną kontrolą jest obraz: odrzucamy kartę ze stopki, gdy obraz pewnie
    // wskazuje inną kartę (np. błędnie odczytany numer albo kod setu trafił w istniejącą kartę).
    const imageVeto = !title && exactCard ? imageContradicts(exactCard, queryHash) : false;
    if (exactCard && titleAgrees && !imageVeto) {
      matchedId = exactId;
      const ranked = rankByImage(cards.printingsOfName(cards.nameOfId(exactId) ?? normalizeName(exactCard.name)), queryHash);
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
    latinTitle = true;
    confidence = Math.round(best.score * 85);
    if (set) {
      const inSet = (await cards.getCardsByIds(best.ids)).find((c) => c.set === set);
      const bestD = distances.get(matchedId);
      const setD = inSet ? distances.get(inSet.id) : undefined;
      if (inSet && (bestD === undefined || setD === undefined || setD <= bestD + IMAGE_SET_TOLERANCE)) {
        matchedId = inSet.id;
        pickedBySet = true;
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
      latinTitle = titleAgrees;
      confidence = Math.round(Math.min(95, 60 + margin / 2));
      if (titleAgrees) confidence = Math.max(confidence, 90);
    }
  }

  if (!matchedId) {
    return { matchedCard: null, possibleCards: [], confidence: 0, method: 'none' };
  }

  const ids = [matchedId, ...printings.filter((id) => id !== matchedId)].slice(0, MAX_PRINTINGS);
  let possibleCards = await cards.getCardsByIds(ids);

  // Promka z tą samą ilustracją (np. prerelease z datownikiem) ma prawie taki sam odcisk jak zwykłe
  // wydanie, a różni się drobiazgiem, którego odcisk nie widzi. Gdy obraz nie rozstrzyga, podajemy
  // zwykłe wydanie (częstsze w kolekcjach); promka zostaje na liście wydań do wyboru.
  // Nie dotyczy wyboru po kodzie setu i numerze odczytanych ze stopki.
  const pick = (c: any) => {
    possibleCards = [c, ...possibleCards.filter((x) => x.id !== c.id)];
    matchedId = c.id;
  };
  const within = (c: any, ref: any, tol: number) => {
    const d0 = distances.get(ref.id);
    const d = distances.get(c.id);
    return d0 !== undefined && d !== undefined && d <= d0 + tol;
  };

  // Wersja japońska (lub inna językowa) ma tę samą ilustrację co angielska, a tekst różni się zbyt
  // drobno, żeby odcisk to zawsze rozstrzygnął. Angielską wybieramy, gdy nazwa odczytana alfabetem
  // łacińskim potwierdza kartę, albo gdy jej obraz jest prawie tak samo podobny. Przy wyborze po
  // kodzie setu z OCR szukamy angielskiej w tym samym secie i pod tym samym numerem.
  let top = possibleCards[0];
  if (top && top.lang && top.lang !== 'en' && method !== 'set_number') {
    const english = possibleCards.find(
      (c) =>
        c.lang === 'en' &&
        (!pickedBySet || (c.set === top.set && c.collector_number === top.collector_number)) &&
        (latinTitle || pickedBySet || within(c, top, LANG_TIE_DISTANCE))
    );
    if (english) pick(english);
  }

  top = possibleCards[0];
  if (top && isPromo(top) && method !== 'set_number' && !pickedBySet) {
    const regular = possibleCards.find((c) => !isPromo(c) && c.lang === top.lang && within(c, top, PROMO_TIE_DISTANCE));
    if (regular) pick(regular);
  }
  // The List: ten sam druk co zwykłe wydanie, różni się tylko symbolem w lewym dolnym rogu.
  // Rozstrzyga porównanie samego rogu; gdy ono nie rozstrzyga, zostaje zwykłe wydanie (jak przy promkach).
  const listCheck = await resolveListTwin(possibleCards, distances, method, photos, pick);
  const final = possibleCards[0];
  const editionTies = final
    ? possibleCards.filter(
        (c) => c.id !== final.id && (c.set !== final.set || c.collector_number !== final.collector_number) && within(c, final, EDITION_TIE_DISTANCE)
      ).length
    : 0;
  const englishAlt = final && final.lang !== 'en' ? possibleCards.find((c) => c.lang === 'en' && distances.has(c.id)) : undefined;
  return {
    matchedCard: final || null,
    possibleCards,
    confidence,
    method,
    imageDistance: distances.get(matchedId),
    englishDistance: englishAlt ? distances.get(englishAlt.id) : undefined,
    editionTies: method === 'set_number' || pickedBySet ? 0 : editionTies,
    listCheck
  };
}

/** Ile gorszy może być obraz zwykłego wydania, żeby wygrało z wydaniem z The List bez rozstrzygnięcia symbolem. */
export const LIST_TIE_DISTANCE = 30;

/**
 * Para „zwykłe wydanie + to samo wydanie z The List” dla wybranej karty i decyzja po symbolu.
 * Zmienia wybór (przez `pick`) tylko, gdy taka para istnieje; inne karty zostają bez zmian.
 */
async function resolveListTwin(
  possibleCards: any[],
  distances: Map<string, number>,
  method: IdentifyResult['method'],
  photos: GrayImage[] | null,
  pick: (c: any) => void
): Promise<ListCheck | undefined> {
  const top = possibleCards[0];
  if (!top || (top.lang && top.lang !== 'en')) return undefined;
  let regular: any;
  let list: any;
  if (isListPrinting(top)) {
    list = top;
    regular = possibleCards.find((c) => isListTwinOf(top, c));
    if (!regular) {
      const o = listOrigin(top);
      const id = o ? cards.findIdBySetNumber(o.set, o.number) : null;
      if (id) [regular] = await cards.getCardsByIds([id]);
    }
  } else {
    regular = top;
    list = possibleCards.find((c) => isListTwinOf(c, top));
    if (!list) {
      const id = cards.findIdBySetNumber('plst', `${top.set}-${top.collector_number}`);
      if (id) {
        const [c] = await cards.getCardsByIds([id]);
        if (c && isListTwinOf(c, top)) list = c;
      }
    }
  }
  if (!regular || !list || (regular.lang && regular.lang !== 'en')) return undefined;

  const check: ListCheck = photos?.length
    ? await checkListMark(photos, regular, list).catch(() => ({ verdict: null, score: null, reason: 'blad' }))
    : { verdict: null, score: null, reason: 'brak_zdjecia' };
  const ensure = (c: any) => {
    if (!possibleCards.some((x) => x.id === c.id)) possibleCards.push(c);
  };
  ensure(regular);
  ensure(list);
  if (check.verdict === 'list') pick(list);
  else if (check.verdict === 'regular') pick(regular);
  else if (top === list) {
    // Obraz całej karty nie widzi symbolu, więc wybór The List bez potwierdzenia to przypadek.
    const dl = distances.get(list.id);
    const dr = distances.get(regular.id);
    if (method === 'set_number' || dl === undefined || dr === undefined || dr <= dl + LIST_TIE_DISTANCE) pick(regular);
  }
  return check;
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
  const photos = decodeCardFrames(dataUrl, extraDataUrls);
  const queryHash = hashFrames(photos);
  let result = await identifyWithLocalDb(title, set, collector, queryHash, photos);
  if (!result.matchedCard && queryHash) {
    const rotatedPhotos = rotateFrames(photos);
    const rotated = hashFrames(rotatedPhotos);
    if (rotated) {
      const flipped = await identifyWithLocalDb('', '', '', rotated, rotatedPhotos);
      if (flipped.matchedCard) result = flipped;
    }
  }
  return result;
}
