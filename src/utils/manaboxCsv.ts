/**
 * Import kolekcji z pliku CSV eksportowanego z aplikacji ManaBox
 * (https://www.manabox.app/guides/collection/import-export/).
 *
 * Typowy nagłówek eksportu:
 *   Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,
 *   ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency
 *
 * Parser jest wyrozumiały: kolejność kolumn nie ma znaczenia, nazwy kolumn porównujemy bez wielkości liter
 * i spacji (z kilkoma synonimami), separator może być przecinkiem, średnikiem lub tabulatorem,
 * a wartości foil, stanu i języka przyjmujemy zarówno w zapisie ManaBox (`near_mint`, `foil`, `en`),
 * jak i w skrótach (`NM`, `true`, `EN`).
 */
import type { CardCondition, CardLanguage } from '../types';
import type { ParsedCardLine } from './textCardList';

type Field =
  | 'name'
  | 'setCode'
  | 'setName'
  | 'collectorNumber'
  | 'quantity'
  | 'foil'
  | 'condition'
  | 'language'
  | 'scryfallId'
  | 'binderName'
  | 'binderType';

/** Nazwy kolumn (po normalizacji: małe litery, tylko litery i cyfry) → pole. */
const HEADER_ALIASES: Record<string, Field> = {
  name: 'name',
  cardname: 'name',
  setcode: 'setCode',
  set: 'setCode',
  edition: 'setName',
  setname: 'setName',
  collectornumber: 'collectorNumber',
  cardnumber: 'collectorNumber',
  number: 'collectorNumber',
  cn: 'collectorNumber',
  quantity: 'quantity',
  qty: 'quantity',
  count: 'quantity',
  foil: 'foil',
  finish: 'foil',
  printing: 'foil',
  condition: 'condition',
  language: 'language',
  lang: 'language',
  scryfallid: 'scryfallId',
  bindername: 'binderName',
  binder: 'binderName',
  listname: 'binderName',
  bindertype: 'binderType',
};

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stan karty z ManaBox (`mint`, `near_mint`, `excellent`, `good`, `light_played`, `played`, `poor`) lub skrót. */
const CONDITION_MAP: Record<string, CardCondition> = {
  mint: 'NM',
  m: 'NM',
  near_mint: 'NM',
  nearmint: 'NM',
  nm: 'NM',
  excellent: 'EX',
  ex: 'EX',
  slightly_played: 'EX',
  sp: 'EX',
  good: 'GD',
  gd: 'GD',
  light_played: 'LP',
  lightly_played: 'LP',
  lp: 'LP',
  played: 'PL',
  pl: 'PL',
  moderately_played: 'PL',
  mp: 'PL',
  heavily_played: 'PL',
  hp: 'PL',
  poor: 'PL',
  po: 'PL',
  damaged: 'PL',
  dmg: 'PL',
};

/** Język: kody Scryfall/ManaBox (`en`, `ja`…) oraz pełne angielskie nazwy. */
const LANGUAGE_MAP: Record<string, CardLanguage> = {
  en: 'EN',
  english: 'EN',
  pl: 'PL',
  polish: 'PL',
  de: 'DE',
  german: 'DE',
  fr: 'FR',
  french: 'FR',
  ja: 'JP',
  jp: 'JP',
  japanese: 'JP',
  it: 'IT',
  italian: 'IT',
  es: 'ES',
  sp: 'ES',
  spanish: 'ES',
  ph: 'PH',
  phyrexian: 'PH',
};

const FOIL_TRUE = new Set(['foil', 'etched', 'etched_foil', 'true', 'yes', 'y', '1', 'tak', 't', 'x']);

export function mapCondition(value: string | undefined): CardCondition | undefined {
  const v = (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return undefined;
  return CONDITION_MAP[v] ?? CONDITION_MAP[v.replace(/_/g, '')];
}

export function mapLanguage(value: string | undefined): CardLanguage | undefined {
  const v = (value || '').trim().toLowerCase();
  if (!v) return undefined;
  return LANGUAGE_MAP[v] ?? 'OTHER';
}

export function isFoilValue(value: string | undefined): boolean {
  return FOIL_TRUE.has((value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
}

/** Wybiera separator po liczbie wystąpień w pierwszej linii (poza cudzysłowami). */
function detectDelimiter(firstLine: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ',';
}

/** Parser CSV zgodny z RFC 4180: pola w cudzysłowach mogą zawierać separator, `""` i znaki nowej linii. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLineEnd = src.search(/\r?\n/);
  const delim = delimiter ?? detectDelimiter(firstLineEnd === -1 ? src : src.slice(0, firstLineEnd));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Puste linie (np. na końcu pliku) pomijamy
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function mapHeader(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((h, idx) => {
    const field = HEADER_ALIASES[normHeader(h)];
    if (field && map[field] === undefined) map[field] = idx;
  });
  return map;
}

/**
 * Czy tekst wygląda na plik CSV z kolekcją (ManaBox lub podobny):
 * pierwsza linia ma kolumnę z nazwą karty oraz dodatkiem albo Scryfall ID.
 */
export function looksLikeCollectionCsv(text: string): boolean {
  const src = text.replace(/^﻿/, '').trimStart();
  const end = src.search(/\r?\n/);
  const firstLine = end === -1 ? src : src.slice(0, end);
  if (!/[,;\t]/.test(firstLine)) return false;
  const header = parseCsv(firstLine)[0] || [];
  const map = mapHeader(header);
  return map.name !== undefined && (map.setCode !== undefined || map.setName !== undefined || map.scryfallId !== undefined);
}

export interface CollectionCsvResult {
  lines: ParsedCardLine[];
  /** Numery linii pliku (od 1), których nie dało się odczytać. */
  invalidLines: number[];
  /** Nazwy klaserów z pliku, w kolejności wystąpienia. */
  binders: string[];
  /** Liczba wierszy z list ManaBox (Binder Type = list), np. list życzeń. */
  listRows: number;
}

/** Odczytuje plik CSV z kolekcją (ManaBox) do postaci linii importu. */
export function parseCollectionCsv(text: string): CollectionCsvResult {
  const rows = parseCsv(text);
  const result: CollectionCsvResult = { lines: [], invalidLines: [], binders: [], listRows: 0 };
  if (rows.length < 2) return result;

  const map = mapHeader(rows[0]);
  const get = (row: string[], field: Field) => {
    const idx = map[field];
    return idx === undefined ? '' : (row[idx] ?? '').trim();
  };
  const seenBinders = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = get(row, 'name');
    const rawQty = get(row, 'quantity');
    const qty = rawQty === '' ? 1 : parseInt(rawQty, 10);
    const scryfallIdRaw = get(row, 'scryfallId');
    const scryfallId = UUID_RE.test(scryfallIdRaw) ? scryfallIdRaw.toLowerCase() : undefined;

    if ((!name && !scryfallId) || !Number.isFinite(qty) || qty <= 0) {
      result.invalidLines.push(r + 1);
      continue;
    }

    const setCode = get(row, 'setCode').toLowerCase() || undefined;
    const collectorNumber = get(row, 'collectorNumber') || undefined;
    const binder = get(row, 'binderName') || undefined;
    const binderType = get(row, 'binderType').toLowerCase() || undefined;
    if (binder && !seenBinders.has(binder.toLowerCase())) {
      seenBinders.add(binder.toLowerCase());
      result.binders.push(binder);
    }
    if (binderType === 'list') result.listRows++;

    result.lines.push({
      rawLine: rows[r].join(', '),
      quantity: qty,
      name,
      set: setCode && /^[a-z0-9]{2,6}$/.test(setCode) ? setCode : undefined,
      collectorNumber,
      isFoil: isFoilValue(get(row, 'foil')),
      isCommander: false,
      scryfallId,
      condition: mapCondition(get(row, 'condition')),
      language: mapLanguage(get(row, 'language')),
      binder,
      binderType,
    });
  }

  return result;
}
