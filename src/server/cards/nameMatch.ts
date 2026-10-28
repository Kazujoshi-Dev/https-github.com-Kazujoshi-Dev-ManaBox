/**
 * Dopasowywanie nazw kart odczytanych przez OCR do nazw z bazy.
 * OCR często myli pojedyncze znaki (l/I/1, O/0, rn/m), dlatego używamy
 * indeksu trigramów do szybkiego zawężenia kandydatów i odległości
 * Levenshteina do ostatecznej oceny.
 */

/** Ujednolica nazwę: małe litery, bez akcentów, tylko litery/cyfry i pojedyncze spacje. */
export function normalizeName(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(s: string): string[] {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return [...out];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Podobieństwo 0..1 (1 = identyczne). */
export function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

export interface NameMatch {
  name: string; // nazwa w postaci znormalizowanej
  score: number; // 0..1
}

/** Ilu kandydatów (wg wspólnych trigramów) oceniamy dokładnie. */
const SHORTLIST = 120;
/** Kara za dopasowanie po odcięciu słowa z brzegu odczytu. */
const TRIM_PENALTY = 0.03;

/** Zapytanie oraz jego wersje bez krótkiego (1–2 znaki) pierwszego lub ostatniego słowa. */
export function queryVariants(q: string): { text: string; penalty: number }[] {
  const out = [{ text: q, penalty: 0 }];
  const words = q.split(' ');
  if (words.length < 2) return out;
  const dropFirst = words[0].length <= 2;
  const dropLast = words[words.length - 1].length <= 2;
  const add = (w: string[]) => {
    const text = w.join(' ');
    if (text.length >= 3 && !out.some((o) => o.text === text)) out.push({ text, penalty: TRIM_PENALTY });
  };
  if (dropFirst) add(words.slice(1));
  if (dropLast) add(words.slice(0, -1));
  if (dropFirst && dropLast && words.length > 2) add(words.slice(1, -1));
  return out;
}

export class NameIndex {
  private names: string[] = [];
  private byTrigram = new Map<string, number[]>();
  private exact = new Map<string, number>();

  constructor(normalizedNames: Iterable<string>) {
    for (const n of normalizedNames) {
      if (!n || this.exact.has(n)) continue;
      const idx = this.names.length;
      this.names.push(n);
      this.exact.set(n, idx);
      for (const t of trigrams(n)) {
        let list = this.byTrigram.get(t);
        if (!list) this.byTrigram.set(t, (list = []));
        list.push(idx);
      }
    }
  }

  get size(): number {
    return this.names.length;
  }

  /**
   * Zwraca najlepsze dopasowania nazwy (posortowane malejąco wg podobieństwa).
   *
   * OCR paska tytułu często dokleja na brzegach 1–2 przypadkowe znaki (krawędź ramki,
   * symbol many), np. „EK Sefessan Champion”. Dlatego porównujemy też wersje zapytania
   * bez krótkiego pierwszego i/lub ostatniego słowa, z niewielką karą, żeby pełny odczyt
   * wygrywał, gdy pasuje równie dobrze (np. prawdziwe „Ob Nixilis”).
   */
  search(query: string, limit = 5, minScore = 0.6): NameMatch[] {
    const q = normalizeName(query);
    if (q.length < 2) return [];
    const exactIdx = this.exact.get(q);
    if (exactIdx !== undefined) return [{ name: this.names[exactIdx], score: 1 }];

    const best = new Map<string, number>();
    for (const { text, penalty } of queryVariants(q)) {
      for (const m of this.scoreAll(text)) {
        const score = m.score - penalty;
        if (score > (best.get(m.name) ?? -Infinity)) best.set(m.name, score);
      }
    }
    return [...best.entries()]
      .map(([name, score]) => ({ name, score }))
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Ocena kandydatów dla jednej postaci zapytania (już znormalizowanej). */
  private scoreAll(q: string): NameMatch[] {
    const exactIdx = this.exact.get(q);
    if (exactIdx !== undefined) return [{ name: this.names[exactIdx], score: 1 }];

    // Zliczamy wspólne trigramy, żeby wybrać kandydatów do dokładniejszej oceny.
    const qTri = trigrams(q);
    const counts = new Map<number, number>();
    for (const t of qTri) {
      const list = this.byTrigram.get(t);
      if (!list || list.length > 20000) continue; // pomijamy bardzo częste trigramy (np. "  t")
      for (const idx of list) counts.set(idx, (counts.get(idx) || 0) + 1);
    }

    const shortlist = [...counts.entries()]
      .map(([idx, common]) => {
        const n = this.names[idx];
        // współczynnik Dice'a na trigramach
        const dice = (2 * common) / (qTri.length + trigrams(n).length);
        return { idx, dice };
      })
      .sort((a, b) => b.dice - a.dice)
      .slice(0, SHORTLIST);

    return shortlist.map(({ idx }) => {
      const n = this.names[idx];
      let score = nameSimilarity(q, n);
      // OCR często ucina koniec długich nazw — porównaj też z prefiksem tej samej długości.
      if (n.length > q.length + 2 && q.length >= 6) {
        score = Math.max(score, nameSimilarity(q, n.slice(0, q.length)) - 0.05);
      }
      return { name: n, score };
    });
  }
}
