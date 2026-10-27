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

/**
 * Strumieniowy parser plików MTGJSON w postaci `{ "meta": {...}, "data": { "<klucz>": {...}, ... } }`
 * (np. AllPrices.json, AllIdentifiers.json, ponad 1 GB po rozpakowaniu).
 * Zwraca kolejne pary [klucz, wartość] z obiektu "data". Wartości kluczy odrzuconych przez
 * `wanted` nie są ani składane, ani parsowane, więc pomijanie zbędnych wpisów jest tanie.
 */
export async function* iterateDataEntries(
  chunks: AsyncIterable<string>,
  wanted: (key: string) => boolean = () => true
): AsyncGenerator<[string, any]> {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let topKey = ''; // ostatni klucz na najwyższym poziomie ("meta", "data")
  let readingTopKey = false;
  let inData = false;
  let readingKey = false; // czytamy klucz wpisu w "data"
  let keyParts: string[] = [];
  let keyStart = -1;
  let topKeyParts: string[] = [];
  let entryKey = '';
  let capturing = false; // składamy tekst bieżącej wartości
  let valueParts: string[] = [];
  let valueStart = -1;

  for await (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);

      if (inString) {
        if (escaped) escaped = false;
        else if (c === 92 /* \ */) escaped = true;
        else if (c === 34 /* " */) {
          inString = false;
          if (readingKey) {
            keyParts.push(chunk.slice(keyStart, i));
            entryKey = keyParts.join('');
            keyParts = [];
            readingKey = false;
          } else if (readingTopKey) {
            topKeyParts.push(chunk.slice(keyStart, i));
            topKey = topKeyParts.join('');
            topKeyParts = [];
            readingTopKey = false;
          }
        }
        continue;
      }

      if (c === 34 /* " */) {
        inString = true;
        if (inData && depth === 2) {
          readingKey = true;
          keyStart = i + 1;
        } else if (depth === 1) {
          readingTopKey = true;
          keyStart = i + 1;
        }
      } else if (c === 123 /* { */ || c === 91 /* [ */) {
        depth++;
        if (depth === 2 && c === 123 && topKey === 'data') {
          inData = true;
        } else if (inData && depth === 3 && wanted(entryKey)) {
          capturing = true;
          valueStart = i;
          valueParts = [];
        }
      } else if (c === 125 /* } */ || c === 93 /* ] */) {
        depth--;
        if (inData && depth === 2 && capturing) {
          valueParts.push(chunk.slice(valueStart >= 0 ? valueStart : 0, i + 1));
          const text = valueParts.join('');
          valueParts = [];
          capturing = false;
          valueStart = -1;
          yield [entryKey, JSON.parse(text)];
        } else if (inData && depth === 1) {
          inData = false;
        }
      }
    }

    // klucz lub wartość ciągną się dalej w następnej porcji
    if (inString && (readingKey || readingTopKey)) {
      (readingKey ? keyParts : topKeyParts).push(chunk.slice(keyStart));
      keyStart = 0;
    }
    if (capturing) {
      valueParts.push(chunk.slice(valueStart >= 0 ? valueStart : 0));
      valueStart = -1;
    }
  }
}
