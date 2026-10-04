# Mana Screw: zasady pracy w repozytorium

## Dziennik zmian (obowiązkowo)
Każda zmiana widoczna dla użytkowników dostaje wpis w `changelog/drafts.ts`, w tym samym commicie co kod.
- Jeden wpis = jedno zdanie po polsku, z perspektywy użytkownika, bez szczegółów technicznych.
- `day` to dzisiejsza data w czasie polskim (RRRR-MM-DD), `type`: `new` (nowość), `improved` (ulepszenie), `fixed` (poprawka).
- `id` unikalne i stałe, np. `2026-10-05-krotki-opis`. Nie zmieniaj `id` istniejących wpisów.
- Zmiany czysto techniczne (refaktoryzacja, testy, konfiguracja serwera) nie trafiają do dziennika.
Serwer publikuje wpisy codziennie o 23:30 (Europe/Warsaw) w zakładce „Dziennik zmian”.

## Wdrożenie
Produkcja: `git pull && docker compose up -d --build` na serwerze. Zmiany idą bezpośrednio na `main`.

## Styl UI
- Paleta stone + jeden akcent amber; emerald tylko dla pieniędzy/wzrostów, rose dla strat i akcji niszczących.
- Teksty po polsku, bez długich myślników (—), minimum 11px, liczby z `tabular-nums`.
- Klasy przycisków: `.btn .btn-primary .btn-secondary .btn-ghost`; nagłówki zakładek: `PageHeader`.
