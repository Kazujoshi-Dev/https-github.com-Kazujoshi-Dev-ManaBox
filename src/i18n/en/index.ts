/** Słownik angielski: polski tekst → tekst angielski. Podzielony na pliki według obszaru aplikacji. */
import { en_layout } from './layout';
import { en_auth } from './auth';
import { en_collection } from './collection';
import { en_card } from './card';
import { en_search } from './search';
import { en_stats } from './stats';
import { en_sale } from './sale';
import { en_public } from './public';
import { en_users } from './users';
import { en_messages } from './messages';
import { en_settings } from './settings';
import { en_decks } from './decks';
import { en_app } from './app';
import { en_scanner } from './scanner';
import { en_admin } from './admin';
import { en_server } from './server';
const parts: Record<string, string>[] = [en_server, en_admin, en_scanner, en_app, en_decks, en_settings, en_messages, en_users, en_layout, en_auth, en_collection, en_card, en_search, en_stats, en_sale, en_public];

export const EN: Record<string, string> = Object.assign({}, ...parts);

/** Komunikaty serwera ze zmiennymi: wzorzec polskiego tekstu → tekst angielski ($1, $2… = dopasowane fragmenty). */
export const EN_PATTERNS: Array<[RegExp, string]> = [
  [/^Konto zostało zablokowane na stałe\. Powód: ([\s\S]+)$/, 'Your account has been permanently banned. Reason: $1'],
  [/^Konto zostało zablokowane na stałe\.$/, 'Your account has been permanently banned.'],
  [/^Konto zostało zablokowane do (.+?)\. Powód: ([\s\S]+)$/, 'Your account is banned until $1. Reason: $2'],
  [/^Konto zostało zablokowane do (.+)\.$/, 'Your account is banned until $1.'],
  [/^Nie udało się pobrać kombinacji dla karty: ([\s\S]*)$/, 'Could not load combos for the card: $1'],
  [/^Nie udało się pobrać kombinacji: ([\s\S]*)$/, 'Could not load combos: $1'],
  [/^Temat może mieć najwyżej (\d+) znaków\.$/, 'The subject can be at most $1 characters long.'],
  [/^Wiadomość może mieć najwyżej (\d+) znaków\.$/, 'The message can be at most $1 characters long.'],
  [/^Dzienny limit wiadomości \((\d+)\) został wykorzystany\. Spróbuj jutro\.$/, 'You have used your daily message limit ($1). Try tomorrow.'],
  [/^Możesz zacząć najwyżej (\d+) nowych rozmów na dobę \(nowe konto\)\./, 'You can start at most $1 new conversations a day (new account). You can reply to messages without this limit.'],
  [/^Możesz zacząć najwyżej (\d+) nowych rozmów na dobę\./, 'You can start at most $1 new conversations a day. You can reply to messages without this limit.'],
  [/^Wysłano już (\d+) wiadomości do tej osoby\. Poczekaj, aż odpisze\.$/, 'You have already sent $1 messages to this person. Wait for a reply.'],
  [/^Za dużo pozycji naraz \(najwyżej (\d+)\)\. Podziel listę na mniejsze części\.$/, 'Too many entries at once (max $1). Split the list into smaller parts.'],
  [/^Klasera „Klaser Główny” nie można usunąć\. Możesz go opróżnić z kart\.$/, 'The “Main binder” can\'t be deleted. You can empty it of cards.'],
  [/^Nazwy klasera „Klaser Główny” nie można zmienić\.$/, 'The “Main binder” can\'t be renamed.']
];
