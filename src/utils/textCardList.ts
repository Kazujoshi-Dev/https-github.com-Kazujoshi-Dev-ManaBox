import { CollectionItem, DeckItem, ScryfallCard } from '../types';
import { t } from '../i18n';

export interface ParsedCardLine {
  rawLine: string;
  quantity: number;
  name: string;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
  isCommander: boolean;
}

export interface ParsedTextList {
  commanderLines: ParsedCardLine[];
  deckLines: ParsedCardLine[];
  allLines: ParsedCardLine[];
  totalCardsCount: number;
  invalidLines: string[];
}

export interface ResolvedImportItem {
  parsed: ParsedCardLine;
  card: ScryfallCard | null;
  error?: string;
}

/**
 * Formats a card to the standard string line:
 * e.g. '1x Talisman of Impulse (tdc) 332'
 */
export function formatCardToTxtLine(item: {
  name: string;
  set: string;
  collector_number: string;
  quantity?: number;
  isFoil?: boolean;
  isCommander?: boolean;
}): string {
  const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const setCode = (item.set || '').toLowerCase().trim();
  const collNum = (item.collector_number || '').trim();
  const foilTag = item.isFoil ? ' *F*' : '';
  const cmdrTag = item.isCommander ? ' *CMDR*' : '';

  if (setCode && collNum) {
    return `${qty}x ${item.name} (${setCode}) ${collNum}${cmdrTag}${foilTag}`;
  }
  return `${qty}x ${item.name}${cmdrTag}${foilTag}`;
}

/**
 * Parses a single text line into structured card parameters:
 * Handles:
 * - '1x Talisman of Impulse (tdc) 332'
 * - '1x Talisman of Impulse (tdc) 332 *F*'
 * - '1 Talisman of Impulse (tdc) 332'
 * - '1x Sol Ring'
 * - '4 Counterspell'
 */
export function parseTxtCardLine(line: string): ParsedCardLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return null;
  }

  // Detect foil and commander indicators
  const isFoil = /\*F\*|\*FOIL\*|\[Foil\]|\(Foil\)|#Foil|★/i.test(trimmed);
  const isCommander = /\*CMDR\*|\*COMMANDER\*|\[Commander\]|\(Commander\)/i.test(trimmed);

  // Clean tags before regex matching
  const cleanLine = trimmed
    .replace(/\*F\*|\*FOIL\*|\[Foil\]|\(Foil\)|#Foil|★/gi, '')
    .replace(/\*CMDR\*|\*COMMANDER\*|\[Commander\]|\(Commander\)/gi, '')
    .trim();

  // Pattern with set and collector number:
  // e.g. "1x Talisman of Impulse (tdc) 332", "1 Talisman of Impulse (tdc) 332", or "Talisman of Impulse (tdc) 332"
  const withSetRegex = /^(\d+)?x?\s*(.+?)\s+\(([a-zA-Z0-9]{2,6})\)\s+([a-zA-Z0-9\-_★\/]+)$/;
  const withSetMatch = cleanLine.match(withSetRegex);

  if (withSetMatch) {
    const qty = withSetMatch[1] ? parseInt(withSetMatch[1], 10) : 1;
    return {
      rawLine: trimmed,
      quantity: Math.max(1, qty),
      name: withSetMatch[2].trim(),
      set: withSetMatch[3].toLowerCase().trim(),
      collectorNumber: withSetMatch[4].trim(),
      isFoil,
      isCommander,
    };
  }

  // Pattern without collector number (e.g. "1x Sol Ring (c21)" or "1 Sol Ring")
  const setOnlyRegex = /^(\d+)?x?\s*(.+?)\s+\(([a-zA-Z0-9]{2,6})\)$/;
  const setOnlyMatch = cleanLine.match(setOnlyRegex);
  if (setOnlyMatch) {
    const qty = setOnlyMatch[1] ? parseInt(setOnlyMatch[1], 10) : 1;
    return {
      rawLine: trimmed,
      quantity: Math.max(1, qty),
      name: setOnlyMatch[2].trim(),
      set: setOnlyMatch[3].toLowerCase().trim(),
      isFoil,
      isCommander,
    };
  }

  // Simple Name-only pattern (e.g. "1x Sol Ring", "4 Lightning Bolt", or simply "Sol Ring")
  const simpleRegex = /^(\d+)?x?\s*(.+)$/;
  const simpleMatch = cleanLine.match(simpleRegex);
  if (simpleMatch && simpleMatch[2].trim().length > 1) {
    const qty = simpleMatch[1] ? parseInt(simpleMatch[1], 10) : 1;
    return {
      rawLine: trimmed,
      quantity: Math.max(1, qty),
      name: simpleMatch[2].trim(),
      isFoil,
      isCommander,
    };
  }

  return null;
}

/**
 * Parses full deck or collection text content (supporting sections like // Commander)
 */
export function parseTxtDeckOrCollection(text: string): ParsedTextList {
  const lines = text.split(/\r?\n/);
  const commanderLines: ParsedCardLine[] = [];
  const deckLines: ParsedCardLine[] = [];
  const allLines: ParsedCardLine[] = [];
  const invalidLines: string[] = [];

  let currentSection: 'commander' | 'deck' = 'deck';

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Detect section headers (e.g. "// Commander", "// General", "// Sideboard", "// Main")
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      const lower = trimmed.toLowerCase();
      if (lower.includes('commander') || lower.includes('general') || lower.includes('dowódca')) {
        currentSection = 'commander';
      } else if (lower.includes('deck') || lower.includes('main') || lower.includes('karty') || lower.includes('talia')) {
        currentSection = 'deck';
      }
      continue;
    }

    // Nagłówki listy z MTG Arena („Commander”, „Deck”, „Sideboard”, „About”, „Name …”)
    if (/^(commander|deck|sideboard|companion|maybeboard|about)$/i.test(trimmed) || /^name\s+\S/i.test(trimmed)) {
      const lower = trimmed.toLowerCase();
      if (lower === 'commander') currentSection = 'commander';
      else if (lower === 'deck' || lower === 'sideboard' || lower === 'companion' || lower === 'maybeboard') currentSection = 'deck';
      continue;
    }

    const parsed = parseTxtCardLine(rawLine);
    if (!parsed) {
      invalidLines.push(rawLine);
      continue;
    }

    if (parsed.isCommander || currentSection === 'commander') {
      parsed.isCommander = true;
      commanderLines.push(parsed);
    } else {
      deckLines.push(parsed);
    }
    allLines.push(parsed);
  }

  const totalCardsCount = allLines.reduce((acc, item) => acc + item.quantity, 0);

  return {
    commanderLines,
    deckLines,
    allLines,
    totalCardsCount,
    invalidLines,
  };
}

/**
 * Resolves an array of parsed card lines with Scryfall via batch /cards/collection API
 */
export async function resolveCardsFromScryfall(
  parsedLines: ParsedCardLine[],
  onProgress?: (processed: number, total: number, status: string) => void
): Promise<ResolvedImportItem[]> {
  if (parsedLines.length === 0) return [];

  onProgress?.(0, parsedLines.length, t('Przygotowywanie zapytania do Scryfall...'));

  // Build identifiers for Scryfall
  const identifiers = parsedLines.map((p) => {
    if (p.set && p.collectorNumber) {
      return { set: p.set.toLowerCase(), collector_number: p.collectorNumber };
    }
    if (p.set && p.name) {
      return { name: p.name, set: p.set.toLowerCase() };
    }
    return { name: p.name };
  });

  const resolvedItems: ResolvedImportItem[] = [];
  const total = parsedLines.length;

  // Paczki po 500 linii: przy dużych importach widać postęp, a pojedyncze zapytanie nie trwa długo
  const CHUNK = 500;
  for (let start = 0; start < total; start += CHUNK) {
    const chunkLines = parsedLines.slice(start, start + CHUNK);
    const chunkIdents = identifiers.slice(start, start + CHUNK);
    onProgress?.(start, total, t('Dopasowywanie kart: {n} z {total}', { n: start, total }));

    let foundCards: ScryfallCard[] = [];
    try {
      const res = await fetch('/api/scryfall/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunkIdents }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ? t(data.error) : t('Za dużo importów w krótkim czasie. Spróbuj za kilka minut.'));
      }
      if (res.ok) {
        const data = await res.json();
        foundCards = Array.isArray(data.data) ? data.data : [];
      }
    } catch (err: any) {
      if (/Spróbuj|limit|Za dużo/i.test(String(err?.message))) throw err;
      console.error('Błąd pobierania zbiorczego ze Scryfall:', err);
    }

    for (const p of chunkLines) {
      let matched: ScryfallCard | undefined;
      const cleanPNum = (p.collectorNumber || '').toLowerCase().replace(/^0+/, '');
      const cleanPName = p.name.toLowerCase();

      // 1: dokładny set + numer kolekcjonerski (bez zer z przodu)
      if (p.set && p.collectorNumber) {
        matched = foundCards.find((c) => {
          const cleanCNum = (c.collector_number || '').toLowerCase().replace(/^0+/, '');
          return c.set?.toLowerCase() === p.set?.toLowerCase() && cleanCNum === cleanPNum;
        });
      }
      // 2: nazwa + set
      if (!matched && p.set) {
        matched = foundCards.find(
          (c) =>
            (c.name?.toLowerCase() === cleanPName || c.name?.toLowerCase().startsWith(cleanPName + ' //')) &&
            c.set?.toLowerCase() === p.set?.toLowerCase()
        );
      }
      // 3: sama nazwa
      if (!matched) {
        matched = foundCards.find(
          (c) => c.name?.toLowerCase() === cleanPName || c.name?.toLowerCase().startsWith(cleanPName + ' //')
        );
      }

      resolvedItems.push({
        parsed: p,
        card: matched || null,
        error: matched ? undefined : t('Nie znaleziono w Scryfall'),
      });
    }
  }

  // Fallback for any cards not found in batch collection: try fuzzy named lookup
  const missingItems = resolvedItems.filter((r) => !r.card);
  if (missingItems.length > 0) {
    onProgress?.(
      parsedLines.length - missingItems.length,
      parsedLines.length,
      t('Wyszukiwanie uzupełniające dla {n} kart...', { n: missingItems.length })
    );

    for (let i = 0; i < missingItems.length; i++) {
      const item = missingItems[i];
      if (i % 5 === 0) {
        onProgress?.(
          total - missingItems.length + i,
          total,
          t('Wyszukiwanie uzupełniające: {n} z {total} kart', { n: i, total: missingItems.length })
        );
      }
      try {
        const queryUrl = item.parsed.set
          ? `/api/scryfall/named?fuzzy=${encodeURIComponent(item.parsed.name)}&set=${encodeURIComponent(item.parsed.set)}`
          : `/api/scryfall/named?fuzzy=${encodeURIComponent(item.parsed.name)}`;

        const fuzzyRes = await fetch(queryUrl);
        if (fuzzyRes.ok) {
          const card: ScryfallCard = await fuzzyRes.json();
          item.card = card;
          item.error = undefined;
        } else {
          // Fallback without set
          const nameOnlyRes = await fetch(`/api/scryfall/named?fuzzy=${encodeURIComponent(item.parsed.name)}`);
          if (nameOnlyRes.ok) {
            item.card = await nameOnlyRes.json();
            item.error = undefined;
          }
        }
      } catch (_) {}
    }
  }

  onProgress?.(parsedLines.length, parsedLines.length, t('Gotowe'));
  return resolvedItems;
}

/**
 * Exports entire collection to .txt file content in format:
 * '1x Talisman of Impulse (tdc) 332'
 */
export function exportCollectionToTxt(collection: CollectionItem[]): string {
  const header = [
    `// ==========================================`,
    `// ${t('Mana Screw - Kolekcja Kart Magic: The Gathering')}`,
    `// ${t('Liczba pozycji:')} ${collection.length}`,
    `// ${t('Wygenerowano:')} ${new Date().toISOString().slice(0, 10)}`,
    `// ${t('Format: [ilość]x [nazwa] ([kod_dodatku]) [numer_karty]')}`,
    `// ==========================================`,
    ``,
  ].join('\n');

  const lines: string[] = [];

  for (const item of collection) {
    if (item.quantity > 0) {
      lines.push(
        formatCardToTxtLine({
          name: item.card.name,
          set: item.card.set,
          collector_number: item.card.collector_number,
          quantity: item.quantity,
          isFoil: false,
        })
      );
    }
    if (item.quantityFoil > 0) {
      lines.push(
        formatCardToTxtLine({
          name: item.card.name,
          set: item.card.set,
          collector_number: item.card.collector_number,
          quantity: item.quantityFoil,
          isFoil: true,
        })
      );
    }
    if (item.quantity === 0 && item.quantityFoil === 0) {
      lines.push(
        formatCardToTxtLine({
          name: item.card.name,
          set: item.card.set,
          collector_number: item.card.collector_number,
          quantity: 1,
          isFoil: false,
        })
      );
    }
  }

  return header + lines.join('\n');
}

/**
 * Exports an EDH Commander deck to .txt file content in format:
 * '1x Talisman of Impulse (tdc) 332'
 */
export function exportDeckToTxt(deck: DeckItem): string {
  const header = [
    `// ==========================================`,
    `// ${t('Talia:')} ${deck.name}`,
    `// Format: ${deck.format || 'EDH Commander'}`,
    `// ${t('Wygenerowano:')} ${new Date().toISOString().slice(0, 10)}`,
    `// ${t('Format: [ilość]x [nazwa] ([kod_dodatku]) [numer_karty]')}`,
    `// ==========================================`,
    ``,
  ];

  const lines: string[] = [...header];

  // Commander section
  if (deck.commander) {
    lines.push(`// Commander`);
    lines.push(
      formatCardToTxtLine({
        name: deck.commander.name,
        set: deck.commander.set,
        collector_number: deck.commander.collector_number,
        quantity: 1,
        isFoil: Boolean(deck.commanderIsFoil),
        isCommander: true,
      })
    );
    lines.push(``);
  }

  // Deck cards section
  const count = deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0;
  lines.push(`// Deck (${count} kart)`);
  if (Array.isArray(deck.cards)) {
    for (const entry of deck.cards) {
      lines.push(
        formatCardToTxtLine({
          name: entry.card.name,
          set: entry.card.set,
          collector_number: entry.card.collector_number,
          quantity: entry.quantity,
          isFoil: Boolean(entry.isFoil),
        })
      );
    }
  }

  return lines.join('\n');
}

/**
 * Triggers a browser file download for text content (.txt)
 */
export function downloadTxtFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.txt') ? filename : `${filename}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
