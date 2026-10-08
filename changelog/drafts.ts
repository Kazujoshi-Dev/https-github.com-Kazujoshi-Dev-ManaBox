/**
 * Dziennik zmian „na brudno”.
 *
 * Każda zmiana widoczna dla użytkowników dostaje tu jeden wpis (w tym samym commicie co kod).
 * Serwer codziennie o 23:30 (czas polski) publikuje wpisy z danego dnia w zakładce „Dziennik zmian”.
 * Wpisy z wcześniejszych dni, których jeszcze nie opublikowano, pojawiają się od razu po wdrożeniu.
 *
 * Zasady pisania:
 * - jedno zdanie, po polsku, z perspektywy użytkownika („Możesz teraz…”, „Talia pokazuje…”),
 * - bez szczegółów technicznych (nazwy plików, API, baza danych),
 * - `id` musi być unikalne i nie może się zmieniać (po nim serwer rozpoznaje wpis),
 * - poprawienie tekstu już opublikowanego wpisu zaktualizuje go w dzienniku.
 */

export type ChangelogType = 'new' | 'improved' | 'fixed';

export interface ChangelogDraft {
  id: string;
  /** Dzień zmiany (czas polski), RRRR-MM-DD. */
  day: string;
  type: ChangelogType;
  /** Część aplikacji, np. „Talie”, „Kolekcja”. */
  area?: string;
  text: string;
}

export const CHANGELOG_DRAFTS: ChangelogDraft[] = [
  // ---------- 2 października 2026 ----------
  { id: '2026-10-02-scanner-local', day: '2026-10-02', type: 'new', area: 'Skaner', text: 'Nowy skaner kart w przeglądarce: sam wykrywa kartę, prostuje zdjęcie i rozpoznaje ją po grafice i numerze.' },
  { id: '2026-10-02-scanner-continuous', day: '2026-10-02', type: 'new', area: 'Skaner', text: 'Tryb ciągły skanera do szybkiego dodawania całych stosów kart.' },
  { id: '2026-10-02-mobile-nav', day: '2026-10-02', type: 'new', area: 'Telefon', text: 'Wygodniejsza wersja na telefon: dolny pasek nawigacji, kolekcja jako lista i okna wysuwane od dołu.' },
  { id: '2026-10-02-pwa', day: '2026-10-02', type: 'new', area: 'Telefon', text: 'Mana Screw możesz dodać do ekranu głównego telefonu i uruchamiać jak aplikację.' },
  { id: '2026-10-02-back-button', day: '2026-10-02', type: 'fixed', area: 'Telefon', text: 'Przycisk i gest „Wstecz” zamyka otwarte okno zamiast opuszczać stronę.' },
  { id: '2026-10-02-sellers-map', day: '2026-10-02', type: 'new', area: 'Gracze', text: 'Mapa sprzedawców i miejscowość w profilu: zobacz, kto w okolicy sprzedaje karty.' },
  { id: '2026-10-02-wishlist-link', day: '2026-10-02', type: 'new', area: 'Lista życzeń', text: 'Publiczny link do listy życzeń, który możesz wysłać znajomym.' },
  { id: '2026-10-02-value-change', day: '2026-10-02', type: 'improved', area: 'Kolekcja', text: 'Nagłówek pokazuje zmianę wartości kolekcji od ostatniego odświeżenia cen.' },
  { id: '2026-10-02-settings', day: '2026-10-02', type: 'new', area: 'Ustawienia', text: 'Ustawienia w osobnej zakładce: zmiana hasła, wylogowanie ze wszystkich urządzeń i usunięcie konta.' },
  { id: '2026-10-02-deck-stats', day: '2026-10-02', type: 'new', area: 'Talie', text: 'Statystyki talii: losowa ręka startowa, szanse dociągnięcia i wymagania kolorów many.' },
  { id: '2026-10-02-edhrec', day: '2026-10-02', type: 'new', area: 'Talie', text: 'Sugestie kart z EDHREC dla talii Commander.' },
  { id: '2026-10-02-deck-links', day: '2026-10-02', type: 'new', area: 'Talie', text: 'Publiczne linki do talii: każdy z linkiem zobaczy talię bez logowania.' },
  { id: '2026-10-02-for-sale-binder', day: '2026-10-02', type: 'improved', area: 'Kolekcja', text: 'Karty oznaczone na sprzedaż trafiają do osobnej kategorii „Sprzedam”.' },
  { id: '2026-10-02-edit-save', day: '2026-10-02', type: 'fixed', area: 'Kolekcja', text: 'Edycja pozycji w kolekcji znów zapisuje się poprawnie.' },

  // ---------- 4 października 2026 ----------
  { id: '2026-10-04-login-page', day: '2026-10-04', type: 'new', area: 'Logowanie', text: 'Nowa strona startowa z kartami dnia i opisem wszystkich funkcji.' },
  { id: '2026-10-04-ui-refresh', day: '2026-10-04', type: 'improved', area: 'Wygląd', text: 'Odświeżony wygląd całej aplikacji: czytelniejsze teksty, nowy nagłówek z zakładkami w jednej linii i menu konta.' },
  { id: '2026-10-04-deck-colors', day: '2026-10-04', type: 'improved', area: 'Talie', text: 'Nowa sekcja kolorów many z podglądem kart, o których mówią podpowiedzi.' },
  { id: '2026-10-04-basic-lands', day: '2026-10-04', type: 'new', area: 'Talie', text: 'Szybkie dodawanie Basic Lands w kolorach dowódcy.' },
  { id: '2026-10-04-tokens', day: '2026-10-04', type: 'new', area: 'Talie', text: 'Sekcja „Tokeny” z tokenami, które tworzą karty w talii.' },
  { id: '2026-10-04-replace', day: '2026-10-04', type: 'new', area: 'Talie', text: 'Przycisk „Zastąp” w sugestiach EDHREC: wybierz kartę z talii, którą zamienisz na polecaną.' },
  { id: '2026-10-04-legality', day: '2026-10-04', type: 'new', area: 'Talie', text: 'Sprawdzanie legalności w Commanderze: niedozwolone karty są podświetlone na czerwono z wyjaśnieniem.' },
  { id: '2026-10-04-version-picker', day: '2026-10-04', type: 'new', area: 'Talie', text: 'Przy dodawaniu karty do talii wybierasz wydanie i wersję foil.' },
  { id: '2026-10-04-deck-sorting', day: '2026-10-04', type: 'improved', area: 'Talie', text: 'Kategorie talii układają się w czterech kolumnach, a karty możesz sortować po nazwie, koszcie many lub kolorze.' },
  { id: '2026-10-04-deck-value', day: '2026-10-04', type: 'fixed', area: 'Talie', text: 'Wartość talii na kafelku zgadza się z wartością w widoku talii (uwzględnia foile).' },
  { id: '2026-10-04-deck-to-binder', day: '2026-10-04', type: 'new', area: 'Talie', text: 'Przycisk na kafelku talii kopiuje wszystkie jej karty, w tych samych wersjach, do domyślnego klasera.' },
  { id: '2026-10-04-japanese', day: '2026-10-04', type: 'new', area: 'Karty', text: 'Japońskie wersje kart, także Basic Lands, do wyboru przy dodawaniu.' },
  { id: '2026-10-04-bracket', day: '2026-10-04', type: 'new', area: 'Talie', text: 'Oznaczenie Game Changers na kartach i szacowany bracket talii (dane z Commander Spellbook).' },
  { id: '2026-10-04-anti-spam', day: '2026-10-04', type: 'improved', area: 'Wiadomości', text: 'Ochrona przed spamem w wiadomościach i możliwość blokowania użytkowników.' },
  { id: '2026-10-04-history-chart', day: '2026-10-04', type: 'new', area: 'Kolekcja', text: 'Kliknij wartość kolekcji w nagłówku, aby zobaczyć wykres wartości i liczby kart z 7 dni, miesiąca lub roku.' },
  { id: '2026-10-04-wishlist-map', day: '2026-10-04', type: 'new', area: 'Lista życzeń', text: 'Przycisk „Mapa sprzedawców” na liście życzeń.' },
  { id: '2026-10-04-message-seller', day: '2026-10-04', type: 'new', area: 'Sprzedam', text: 'Przycisk „Napisz do sprzedawcy” w profilu gracza i w publicznej ofercie sprzedaży.' },
  { id: '2026-10-04-pretty-links', day: '2026-10-04', type: 'improved', area: 'Udostępnianie', text: 'Krótsze linki do talii i ofert (np. manascrew.eu/sprzedam/nazwa) z ładnym podglądem po wklejeniu w komunikatorze.' },
  { id: '2026-10-04-logo', day: '2026-10-04', type: 'improved', area: 'Wygląd', text: 'Nowe logo aplikacji.' },
  { id: '2026-10-04-coffee', day: '2026-10-04', type: 'new', text: 'Przycisk „Postaw kawę”, jeśli chcesz wesprzeć rozwój Mana Screw.' },

  // ---------- 5 października 2026 ----------
  { id: '2026-10-05-top-movers', day: '2026-10-05', type: 'improved', area: 'Statystyki', text: 'Nowa sekcja „Największe zmiany”: 20 kart z kolekcji, które najbardziej zyskały, i 20, które najbardziej straciły od ostatniego odświeżenia cen.' },
  { id: '2026-10-05-changelog', day: '2026-10-05', type: 'new', area: 'Dziennik zmian', text: 'Zakładka „Dziennik zmian”: codziennie o 23:30 pojawia się tu podsumowanie nowości z danego dnia.' },
  { id: '2026-10-05-unread-mail', day: '2026-10-05', type: 'improved', area: 'Wiadomości', text: 'Nowe wiadomości pojawiają się bez odświeżania strony: koperta podświetla się na bursztynowo, na telefonie pojawia się w nagłówku, a liczbę nieprzeczytanych widać też w tytule karty przeglądarki.' },
  { id: '2026-10-05-wishlist-match-label', day: '2026-10-05', type: 'fixed', area: 'Gracze', text: 'Kafelek gracza jasno rozróżnia karty z Twojej listy życzeń, które sprzedaje, od tych, które ma tylko w kolekcji.' },
  { id: '2026-10-05-set-share', day: '2026-10-05', type: 'improved', area: 'Kolekcja', text: 'Lista dodatków w filtrze kolekcji pokazuje, ile różnych kart z dodatku masz, np. 45/269 (16%), i jest ułożona od najnowszego dodatku.' },
  { id: '2026-10-05-bug-report', day: '2026-10-05', type: 'new', area: 'Pomoc', text: 'Zgłoś błąd z menu konta: opisz problem i dołącz zrzut ekranu (z pliku albo wklejony skrótem Ctrl+V).' },
  { id: '2026-10-05-phyrexian', day: '2026-10-05', type: 'new', area: 'Karty', text: 'Karty w języku phyrexian w bazie kart, do wyboru przy dodawaniu i jako język karty w kolekcji.' },
  { id: '2026-10-05-import-progress', day: '2026-10-05', type: 'improved', area: 'Import', text: 'Pasek postępu przy imporcie kolekcji: przy dużych listach (np. kilka tysięcy kart) widać, ile kart już rozpoznano i zapisano.' },
  { id: '2026-10-05-suggestion-wishlist', day: '2026-10-05', type: 'improved', area: 'Talie', text: 'W sugestiach EDHREC przycisk z sercem dodaje kartę do listy życzeń; karty, które już na niej są, mają wypełnione serce.' },
  { id: '2026-10-05-suggestion-regular-print', day: '2026-10-05', type: 'improved', area: 'Talie', text: 'Sugestie EDHREC pokazują najnowsze zwykłe wydanie karty zamiast Secret Lair, promek czy wersji borderless i showcase.' },
  { id: '2026-10-05-dfc-thumbs', day: '2026-10-05', type: 'fixed', area: 'Karty', text: 'Miniatury kart dwustronnych (np. przy wyborze dowódcy, w talii i w wyszukiwarce) wczytują się poprawnie.' },
  { id: '2026-10-05-for-sale-add', day: '2026-10-05', type: 'new', area: 'Sprzedam', text: 'Przycisk „Dodaj kartę na sprzedaż”: wyszukaj dowolną kartę, wybierz wydanie, foil, ilość, stan i cenę, a trafi od razu do Twojej oferty.' },
  { id: '2026-10-05-print-filter', day: '2026-10-05', type: 'improved', area: 'Karty', text: 'Przy wyborze wydania karty możesz wpisać kod dodatku i numer z dołu karty (np. DSC 114), aby od razu znaleźć właściwą wersję.' },
  { id: '2026-10-05-delete-main-binder', day: '2026-10-05', type: 'fixed', area: 'Kolekcja', text: 'Jasne ostrzeżenie przy usuwaniu klasera: usunięcie głównego klasera usuwa jego karty (poza wystawionymi na sprzedaż), a usunięcie innego przenosi karty do głównego.' },

  // ---------- 8 października 2026 ----------
  { id: '2026-10-08-separate-entries', day: '2026-10-08', type: 'fixed', area: 'Kolekcja', text: 'Karty różniące się wydaniem, wersją foil, stanem, językiem lub klaserem są w kolekcji osobnymi pozycjami, a dodanie innej wersji nie zmienia już posiadanej karty.' },
  { id: '2026-10-08-catalog-create-error', day: '2026-10-08', type: 'fixed', area: 'Kolekcja', text: 'Tworzenie nowego klasera nie kończy się już błędem, a konta, którym przy rejestracji nie utworzyły się startowe klasery, dostają je automatycznie.' }
];
