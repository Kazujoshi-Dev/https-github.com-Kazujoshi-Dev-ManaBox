/**
 * Wybór wydania karty na podstawie stopki odczytanej przez OCR.
 *
 * Używane, gdy obraz rozpoznał kartę pewnie, ale kilka wydań (dodruki z tą samą ilustracją)
 * wygląda prawie tak samo. Wybieramy tylko spośród wydań TEJ SAMEJ karty, które serwer już
 * zwrócił, więc błędnie odczytana stopka może najwyżej nie zmienić wyniku, a nie podmienić kartę.
 *
 * Zamiast ściśle parsować stopkę (OCR z kamery często gubi ukośnik, myli 5 z S, 0 z O),
 * sprawdzamy, który z ZNANYCH kandydatów najlepiej pasuje do odczytanego tekstu:
 * kod setu, numer kolekcjonerski i litera rzadkości „P” (promka).
 */

interface PrintingLike {
  set: string;
  collector_number: string;
  lang?: string;
  promo?: boolean;
  set_type?: string;
}

/** Litery i cyfry, które OCR myli najczęściej, sprowadzone do jednej postaci (do porównań kodów setów). */
function lettersForm(s: string): string {
  return s.toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');
}

/** To samo w drugą stronę (do porównań numerów). */
function digitsForm(s: string): string {
  return s.toUpperCase().replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
}

const isPromo = (p: PrintingLike) => Boolean(p.promo) || p.set_type === 'promo';

/**
 * The List (Scryfall `plst`, numer np. "MH1-123"): na karcie jest stopka oryginału (MH1, 123).
 * Kod setu i numer, które widać na karcie; dla zwykłych wydań po prostu set i numer.
 */
function printedSetNumber(p: PrintingLike): { set: string; number: string; list: boolean } {
  if (p.set === 'plst') {
    const m = /^([A-Z0-9]{2,6})-(.+)$/i.exec(p.collector_number);
    if (m) return { set: m[1].toUpperCase(), number: m[2].toUpperCase(), list: true };
  }
  return { set: p.set.toUpperCase(), number: p.collector_number.toUpperCase(), list: false };
}

/** Tokeny tekstu stopki (litery/cyfry rozdzielone wszystkim innym). */
function tokens(text: string): string[] {
  return text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

export interface FooterScore {
  set: boolean;
  number: boolean;
  score: number;
}

/** Jak dobrze wydanie pasuje do odczytanej stopki. */
export function scorePrinting(p: PrintingLike, text: string): FooterScore {
  const toks = tokens(text);
  const letterToks = new Set(toks.map(lettersForm));
  const printed = printedSetNumber(p);
  const code = printed.set;
  // promki Scryfall mają kod z przedrostkiem „p” (np. pm15), a na karcie jest kod dodatku (M15)
  const codes = [code];
  if (isPromo(p) && code.length >= 4 && code.startsWith('P')) codes.push(code.slice(1));
  const set = codes.some((c) => letterToks.has(lettersForm(c)));
  // OCR często gubi pierwszą albo ostatnią literę kodu przy krawędzi wycinka (np. „IMA” → „MA”):
  // to słabsza wskazówka niż pełny kod, ale lepsza niż nic
  const setPartial =
    !set &&
    codes.some((c) => c.length >= 3 && [c.slice(1), c.slice(0, -1)].some((part) => part.length >= 2 && letterToks.has(lettersForm(part))));

  const num = printed.number.replace(/^0+(?=\d)/, '');
  const digits = digitsForm(text);
  // numer jako osobna liczba (np. „0187”, „171/205”), bez dopasowania wewnątrz dłuższej liczby
  const numRe = new RegExp(`(^|[^0-9])0*${num.replace(/[^0-9A-Z]/g, '')}([^0-9]|$)`);
  const number = /\d/.test(num) && numRe.test(digits);

  // litera rzadkości: „P” oznacza promkę, C/U/R/M zwykłe wydanie
  const rarity = toks.find((t) => t.length === 1 && 'CURMSPTL'.includes(t));
  let score = (set ? 2 : setPartial ? 1 : 0) + (number ? 2 : 0);
  if (rarity === 'P') score += isPromo(p) ? 1 : -1;
  else if (rarity && 'CURM'.includes(rarity) && isPromo(p)) score -= 1;
  return { set, number, score };
}

/**
 * Indeks wydania wskazanego przez stopkę albo -1, gdy stopka nie rozstrzyga.
 * `printings[0]` to wybór obrazu: zmieniamy go tylko na wydanie, które pasuje do stopki wyraźnie
 * lepiej (co najmniej zgodny kod setu albo numer) i jest jedynym najlepszym kandydatem.
 */
export function pickPrintingByFooterText(printings: PrintingLike[], text: string, lang?: string): number {
  if (!text || printings.length < 2) return -1;
  const scored = printings.map((p, i) => ({ i, s: scorePrinting(p, text), langOk: !lang || (p.lang || 'en') === lang }));
  const total = (x: (typeof scored)[number]) => x.s.score + (x.langOk ? 0.5 : 0);
  const current = total(scored[0]);
  const hits = scored.filter((x) => x.s.set || x.s.number);
  if (!hits.length) return -1;
  const bestScore = Math.max(...hits.map(total));
  if (bestScore < 2 || bestScore <= current) return -1;
  const top = hits.filter((x) => total(x) === bestScore);

  // Ta sama stopka (kod setu i numer) może należeć do kilku wydań: wersji językowych i dodruku z The List.
  // Różne sety albo numery = stopka nie rozstrzyga. W obrębie jednej stopki: język odczytany ze stopki
  // (gdy nieczytelny, angielski, jak przy wyborze po obrazie), a The List tak jak wybrał serwer (printings[0]).
  const printedKey = (i: number) => {
    const p = printedSetNumber(printings[i]);
    return `${p.set}/${p.number.replace(/^0+(?=\d)/, '')}`;
  };
  if (new Set(top.map((x) => printedKey(x.i))).size > 1) return -1;
  const wantLang = lang || 'en';
  const currentList = printedSetNumber(printings[0]).list;
  const rank = (i: number) =>
    ((printings[i].lang || 'en') === wantLang ? 2 : 0) + (printedSetNumber(printings[i]).list === currentList ? 1 : 0);
  const best = top.reduce((a, b) => (rank(b.i) > rank(a.i) ? b : a)).i;
  return best > 0 ? best : -1;
}
