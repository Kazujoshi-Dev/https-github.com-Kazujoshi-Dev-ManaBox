/**
 * Tłumaczy polski komunikat według słownika: najpierw dokładny tekst, potem wzorce z liczbami
 * i nazwami ($1, $2… = dopasowane fragmenty). Bez dopasowania zwraca tekst bez zmian.
 * Bez zależności od Reacta i od samego słownika, więc korzysta z tego też serwer.
 */
export function translateWith(dict: Record<string, string>, patterns: Array<[RegExp, string]>, message: string): string {
  const exact = dict[message];
  if (exact !== undefined) return exact;
  for (const [re, en] of patterns) {
    const m = message.match(re);
    if (m) return en.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
  }
  return message;
}
