import type { ScryfallCard } from '../types';

const stripZeros = (s: string) => s.replace(/^0+(?=\d)/, '');

/** Dzieli wpisany filtr na słowa, np. „DSC #114”, „dsc/114” → ['dsc', '114']. */
export function printFilterTokens(query: string): string[] {
  return query.toLowerCase().replace(/[#/,]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Filtr wydań: każde słowo musi pasować do kodu dodatku, numeru karty lub nazwy dodatku.
 * Np. „dsc 114”, „#114”, „sld”, „duskmourn”, „dsc/114”.
 */
export function matchesPrint(p: ScryfallCard, query: string): boolean {
  const tokens = printFilterTokens(query);
  if (!tokens.length) return true;
  const set = (p.set || '').toLowerCase();
  const num = (p.collector_number || '').toLowerCase();
  const numBare = stripZeros(num);
  const setName = (p.set_name || '').toLowerCase();
  return tokens.every((t) => {
    const tb = stripZeros(t);
    return set === t || set.startsWith(t) || num === t || numBare === tb || num.startsWith(t) || setName.includes(t);
  });
}

/** Kod dodatku i numer z filtra, gdy wpisano oba (np. „dsc 114”); inaczej null. */
export function parseSetAndNumber(query: string): { set: string; number: string } | null {
  const [a, b] = printFilterTokens(query);
  if (!a || !b || !/^[a-z0-9]{2,6}$/.test(a)) return null;
  return { set: a, number: b };
}

/** Czy wydanie ma dokładnie ten kod dodatku i numer karty. */
export function isExactPrint(p: ScryfallCard, set: string, number: string): boolean {
  return (p.set || '').toLowerCase() === set && stripZeros((p.collector_number || '').toLowerCase()) === stripZeros(number);
}

/** Wydania pasujące do filtra; dokładne trafienie kodu i numeru (np. „dsc 114”) na początku. */
export function filterPrints(list: ScryfallCard[], query: string): ScryfallCard[] {
  const q = query.trim();
  if (!q) return list;
  const out = list.filter((p) => matchesPrint(p, q));
  const sn = parseSetAndNumber(q);
  if (!sn) return out;
  const exact = (p: ScryfallCard) => isExactPrint(p, sn.set, sn.number);
  return [...out.filter(exact), ...out.filter((p) => !exact(p))];
}
