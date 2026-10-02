/**
 * Strumieniowy parser danych zbiorczych Scryfall.
 *
 * Plik ma kilkaset MB, więc nie można go wczytać w całości. Obsługujemy oba
 * formaty publikowane przez Scryfall:
 *  - tablicę JSON:   [ {...}, {...} ]
 *  - JSON Lines:     {...}\n{...}\n
 * Parser przegląda tekst znak po znaku i wydziela kolejne obiekty kart
 * niezależnie od formatowania (nowe linie, wcięcia, podział na fragmenty).
 */
export async function* iterateJsonArrayObjects(chunks: AsyncIterable<string>): AsyncGenerator<any> {
  let depth = 0; // głębokość zagnieżdżenia { } i [ ]
  let inString = false;
  let escaped = false;
  let targetDepth = 0; // głębokość, na której zaczynają się obiekty kart (1 = JSONL, 2 = tablica)
  let current: string[] = []; // fragmenty bieżącego obiektu z poprzednich porcji
  let objStart = -1; // indeks początku obiektu w bieżącej porcji

  for await (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (targetDepth === 0) {
        if (ch === '[') targetDepth = 2;
        else if (ch === '{') targetDepth = 1;
        else continue; // białe znaki / BOM przed początkiem danych
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        depth++;
        if (ch === '{' && depth === targetDepth) objStart = i;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (ch === '}' && depth === targetDepth - 1 && (objStart >= 0 || current.length > 0)) {
          current.push(chunk.slice(objStart >= 0 ? objStart : 0, i + 1));
          const text = current.join('');
          current = [];
          objStart = -1;
          yield JSON.parse(text);
        }
      }
    }

    // obiekt ciągnie się dalej w następnej porcji
    if (targetDepth > 0 && depth >= targetDepth) {
      current.push(chunk.slice(objStart >= 0 ? objStart : 0));
      objStart = -1;
    }
  }
}
