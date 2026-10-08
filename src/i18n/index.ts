import { useSyncExternalStore } from 'react';
import { translateWith } from './translate';

/**
 * Tłumaczenia interfejsu.
 *
 * Kluczem jest polski tekst (język bazowy aplikacji), więc w kodzie widać, co jest wyświetlane,
 * a brak tłumaczenia angielskiego po prostu pokazuje tekst po polsku.
 * Zmienne w tekście: `t('Dodano {n} kart', { n })`.
 *
 * Komponent, który wyświetla przetłumaczony tekst, pobiera `t` przez `useT()`;
 * dzięki temu przerysowuje się po zmianie języka. Kod poza komponentami może używać `t` bezpośrednio.
 *
 * Słownik angielski jest w osobnym pliku ładowanym dopiero, gdy jest potrzebny,
 * więc użytkownicy polskiej wersji go nie pobierają.
 */

export type Lang = 'pl' | 'en';
export const LANGS: Lang[] = ['pl', 'en'];

const STORAGE_KEY = 'ms_lang';

function readStoredLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pl' || saved === 'en') return saved;
  } catch {
    /* brak dostępu do localStorage */
  }
  return 'pl';
}

let current: Lang = typeof window === 'undefined' ? 'pl' : readStoredLang();
const listeners = new Set<() => void>();

let EN: Record<string, string> | null = null;
let EN_PATTERNS: Array<[RegExp, string]> = [];
let enLoading: Promise<void> | null = null;

/** Wczytuje słownik angielski (raz). */
function loadEnglish(): Promise<void> {
  if (EN) return Promise.resolve();
  if (!enLoading) {
    enLoading = import('./en').then((m) => {
      EN = m.EN;
      EN_PATTERNS = m.EN_PATTERNS;
    });
    enLoading.catch(() => {
      enLoading = null;
    });
  }
  return enLoading;
}

/** Przygotowuje zapisany język przed pierwszym renderem (słownik angielski, gdy trzeba). */
export function prepareLanguage(): Promise<void> {
  return current === 'en' ? loadEnglish().catch(() => undefined) : Promise.resolve();
}

function applyDocumentLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
applyDocumentLang(current);

export function isLang(value: unknown): value is Lang {
  return value === 'pl' || value === 'en';
}

export function getLang(): Lang {
  return current;
}

let pendingLang: Lang | null = null;

export function setLang(lang: Lang) {
  if (!isLang(lang)) return;
  if (lang === 'en' && !EN) {
    // Język zmieniamy dopiero po wczytaniu słownika, żeby nie mignął polski tekst
    pendingLang = lang;
    loadEnglish()
      .then(() => {
        if (pendingLang === 'en') setLang('en');
      })
      .catch(() => undefined);
    return;
  }
  pendingLang = null;
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* brak dostępu do localStorage */
  }
  applyDocumentLang(lang);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export type TVars = Record<string, string | number | null | undefined>;

function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name] ?? '') : m));
}

/** Tłumaczy polski tekst na bieżący język (z podstawieniem zmiennych `{nazwa}`). */
export function t(key: string, vars?: TVars): string {
  if (current === 'en' && EN) {
    const en = EN[key];
    if (en !== undefined) return interpolate(en, vars);
  }
  return interpolate(key, vars);
}

/** Tłumaczy tekst, który może przyjść z serwera lub z innego źródła (brak tłumaczenia = bez zmian). */
export function tMaybe(key: string | null | undefined): string {
  if (!key) return key ?? '';
  return t(key);
}

/** Język bieżący; komponent przerysuje się po jego zmianie. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Funkcja tłumacząca; komponent przerysuje się po zmianie języka. */
export function useT(): typeof t {
  useLang();
  return t;
}

/** Locale do formatowania dat i liczb. */
export function locale(): string {
  return current === 'en' ? 'en-GB' : 'pl-PL';
}

/**
 * Odmiana przez liczbę.
 * pl: [1 karta, 2-4 karty, 5+ kart], en: [1 card, 2+ cards].
 * Formy mogą zawierać `{n}`.
 */
export function plural(n: number, pl: [string, string, string], en: [string, string]): string {
  let form: string;
  if (current === 'en') {
    form = Math.abs(n) === 1 ? en[0] : en[1];
  } else {
    const abs = Math.abs(n);
    if (abs === 1) form = pl[0];
    else if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 12 || abs % 100 > 14)) form = pl[1];
    else form = pl[2];
  }
  return form.replace(/\{n\}/g, String(n));
}

/** Wybór tekstu zależnie od języka, gdy zdania różnią się budową. */
export function byLang<T>(pl: T, en: T): T {
  return current === 'en' ? en : pl;
}

/** Nazwa głównego klasera zapisywana w bazie (wartość danych, nie tekst interfejsu). */
export const MAIN_BINDER = 'Klaser Główny';

/** Klasery zakładane automatycznie przy rejestracji (nazwy i opisy z serwera, po polsku). */
const DEFAULT_BINDER_TEXTS = new Set([MAIN_BINDER, 'Na wymianę', 'Główny klaser całej kolekcji', 'Karty przeznaczone na handel i wymianę z graczami']);

/** Nazwa lub opis klasera do wyświetlenia: domyślne klasery w bieżącym języku, własne bez zmian. */
export function binderName(name: string | null | undefined): string {
  if (!name) return name ?? '';
  return DEFAULT_BINDER_TEXTS.has(name) ? t(name) : name;
}

/**
 * Oznacza tekst do tłumaczenia bez tłumaczenia go od razu (np. w stałych na poziomie modułu).
 * Taki tekst tłumaczy się w miejscu wyświetlenia przez `t(...)`.
 */
export function tk<T extends string>(key: T): T {
  return key;
}

/** Liczba z ustaloną liczbą miejsc po przecinku i separatorem dziesiętnym bieżącego języka. */
export function fixed(value: number, digits: number): string {
  const s = value.toFixed(digits);
  return current === 'pl' ? s.replace('.', ',') : s;
}

/**
 * Tłumaczy komunikat z serwera (serwer odpowiada po polsku).
 * Najpierw szukamy dokładnego tekstu w słowniku, potem wzorców z liczbami i nazwami.
 */
export function tServer(message: string | null | undefined): string | undefined {
  if (!message) return undefined;
  if (current !== 'en' || !EN) return message;
  return translateWith(EN, EN_PATTERNS, message);
}

/**
 * Dokleja nagłówek X-Lang do zapytań do własnego API, żeby serwer odpowiadał komunikatami
 * i mailami w języku interfejsu. Wywoływane raz przy starcie aplikacji.
 */
export function installApiLanguageHeader() {
  if (typeof window === 'undefined' || (window as any).__msLangFetch) return;
  (window as any).__msLangFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const sameOriginApi = url.startsWith('/api') || url.startsWith(`${window.location.origin}/api`);
    if (!sameOriginApi) return original(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('X-Lang')) headers.set('X-Lang', current);
    return original(input, { ...init, headers });
  };
}
