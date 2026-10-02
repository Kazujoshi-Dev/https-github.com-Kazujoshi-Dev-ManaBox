/**
 * Strumieniowy parser tablicy JSON z danymi zbiorczymi Scryfall.
 *
 * Plik "default_cards" ma kilkaset MB, więc nie można go wczytać w całości.
 * Parser przegląda tekst znak po znaku i wydziela kolejne obiekty z tablicy
 * najwyższego poziomu — niezależnie od formatowania (nowe linie, wcięcia).
 */
export async function* iterateJsonArrayObjects(chunks: AsyncIterable<string>): AsyncGenerator<any> {
  let depth = 0; // głębokość zagnieżdżenia { } i [ ]
  let inString = false;
  let escaped = false;
  let current: string[] = []; // fragmenty bieżącego obiektu
  let objStart = -1; // indeks początku obiektu w bieżącym fragmencie

  for await (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        depth++;
        // obiekt karty zaczyna się na głębokości 2 (wewnątrz tablicy najwyższego poziomu)
        if (ch === '{' && depth === 2) objStart = i;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (ch === '}' && depth === 1 && (objStart >= 0 || current.length > 0)) {
          current.push(chunk.slice(objStart >= 0 ? objStart : 0, i + 1));
          const text = current.join('');
          current = [];
          objStart = -1;
          yield JSON.parse(text);
        }
      }
    }

    // obiekt ciągnie się dalej w następnym fragmencie
    if (depth >= 2) {
      current.push(chunk.slice(objStart >= 0 ? objStart : 0));
      objStart = -1;
    }
  }
}
