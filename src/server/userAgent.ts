/**
 * Identyfikacja aplikacji w zapytaniach wychodzących.
 *
 * Scryfall wymaga, by każde zapytanie do API miało własny nagłówek User-Agent
 * w formacie `NazwaAplikacji/Wersja` (https://scryfall.com/docs/api).
 * Wszystkie zapytania serwera do Scryfall (API, dane zbiorcze, obrazy) korzystają z tej stałej.
 * Przeglądarka nie może ustawić User-Agent, dlatego obrazy z api.scryfall.com
 * ładujemy przez /api/scryfall/image-proxy.
 */
export const APP_NAME = 'ManaScrew';
export const APP_VERSION = '1.0';
export const APP_USER_AGENT = `${APP_NAME}/${APP_VERSION}`;
