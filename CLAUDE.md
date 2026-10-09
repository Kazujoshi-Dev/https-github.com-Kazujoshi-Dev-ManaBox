# Mana Screw: zasady pracy w repozytorium

## Dziennik zmian (obowiązkowo)
Każda zmiana widoczna dla użytkowników dostaje wpis w `changelog/drafts.ts`, w tym samym commicie co kod.
- Jeden wpis = jedno zdanie z perspektywy użytkownika, bez szczegółów technicznych, **zawsze w dwóch językach**:
  `text` po polsku i `textEn` po angielsku (to samo zdanie, nie skrót). Wpis bez `textEn` jest niekompletny.
- W `textEn` nazwy przycisków i zakładek pisz tak, jak w angielskiej wersji interfejsu (`src/i18n/en`), np. „Postaw kawę” → “Buy me a coffee”.
- `area` podajesz po polsku; angielska nazwa pochodzi z mapy `CHANGELOG_AREAS_EN` w tym samym pliku. Nowy obszar = dopisz go też do mapy.
- `day` to dzisiejsza data w czasie polskim (RRRR-MM-DD), `type`: `new` (nowość), `improved` (ulepszenie), `fixed` (poprawka).
- `id` unikalne i stałe, np. `2026-10-05-krotki-opis`. Nie zmieniaj `id` istniejących wpisów.
- Zmiany czysto techniczne (refaktoryzacja, testy, konfiguracja serwera) nie trafiają do dziennika.
Serwer publikuje wpisy codziennie o 23:30 (Europe/Warsaw) w zakładce „Dziennik zmian”, w języku wybranym przez użytkownika.
Przykład: `{ id: '2026-10-09-przyklad', day: '2026-10-09', type: 'new', area: 'Talie', text: 'Możesz teraz…', textEn: 'You can now…' }`

## Wdrożenie
Produkcja: `git pull && docker compose up -d --build` na serwerze. Zmiany idą bezpośrednio na `main`.

## Styl UI
- Paleta stone + jeden akcent amber; emerald tylko dla pieniędzy/wzrostów, rose dla strat i akcji niszczących.
- Teksty po polsku (z tłumaczeniem w `src/i18n/en` przez `t(...)`), bez długich myślników (—), minimum 11px, liczby z `tabular-nums`.
- Klasy przycisków: `.btn .btn-primary .btn-secondary .btn-ghost`; nagłówki zakładek: `PageHeader`.
