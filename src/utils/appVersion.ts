
import { locale } from '../i18n';/**
 * Wykrywanie nowej wersji aplikacji po wdrożeniu (git pull && docker compose up -d --build).
 *
 * Każdy build ma własny identyfikator (__BUILD_ID__, wpisywany przez Vite). Serwer zwraca
 * identyfikator działającej wersji w nagłówku X-App-Version przy każdej odpowiedzi API
 * oraz pod GET /api/version. Gdy się różnią, oznaczamy aktualizację jako oczekującą,
 * a hook useAppUpdate przeładowuje stronę w bezpiecznym momencie (zmiana zakładki,
 * karta w tle). index.html jest serwowany z no-cache, więc przeładowanie zawsze
 * pobiera nowy kod.
 */

export const CLIENT_VERSION: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/** Czas zbudowania tej wersji (ISO) albo pusty napis w trybie deweloperskim. */
export const CLIENT_BUILT_AT: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

/** Czytelna etykieta wersji do stopki, np. „2026.10.08 · mgx3k2a”. */
export function versionLabel(): string {
  if (!CLIENT_BUILT_AT) return CLIENT_VERSION;
  const d = new Date(CLIENT_BUILT_AT);
  if (Number.isNaN(d.getTime())) return CLIENT_VERSION;
  const parts = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}.${get('month')}.${get('day')} · ${CLIENT_VERSION}`;
}

const RESUME_TAB_KEY = 'ms_resume_tab';
const RELOADED_FOR_KEY = 'ms_reloaded_for';

let serverVersion: string | null = null;
const listeners = new Set<() => void>();

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* tryb prywatny lub zablokowany storage — trudno */
  }
}

function storageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* jw. */
  }
}

/** W trybie deweloperskim (Vite HMR) mechanizm jest wyłączony. */
const enabled = CLIENT_VERSION !== 'dev' && !import.meta.env.DEV;

/** Zapamiętuje wersję zgłoszoną przez serwer. Wywoływane z klienta API dla każdej odpowiedzi. */
export function noteServerVersion(version: string | null | undefined): void {
  if (!enabled || !version || version === serverVersion) return;
  serverVersion = version;
  if (version !== CLIENT_VERSION) listeners.forEach((fn) => fn());
}

/** Odczytuje nagłówek X-App-Version z odpowiedzi serwera. */
export function noteResponseVersion(res: Response): void {
  noteServerVersion(res.headers.get('X-App-Version'));
}

/** Czy na serwerze działa nowsza wersja niż ta w przeglądarce. */
export function isUpdatePending(): boolean {
  if (!enabled || !serverVersion || serverVersion === CLIENT_VERSION) return false;
  // Ochrona przed pętlą: jeśli już raz przeładowaliśmy dla tej wersji, a kod się nie zmienił
  // (np. pośredni cache), nie przeładowujemy w kółko.
  return storageGet(RELOADED_FOR_KEY) !== serverVersion;
}

export function subscribeUpdate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Pyta serwer o bieżącą wersję (bez cache). */
export async function checkServerVersion(): Promise<void> {
  if (!enabled) return;
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    noteServerVersion(data.version);
  } catch {
    /* serwer w trakcie restartu — spróbujemy później */
  }
}

/** Przeładowuje stronę do nowej wersji; opcjonalnie otwiera wskazaną zakładkę po starcie. */
export function reloadToNewVersion(resumeTab?: string): void {
  if (serverVersion) storageSet(RELOADED_FOR_KEY, serverVersion);
  if (resumeTab) storageSet(RESUME_TAB_KEY, resumeTab);
  window.location.reload();
}

/** Zakładka zapamiętana przed przeładowaniem (jednorazowo). */
export function takeResumeTab(): string | null {
  const tab = storageGet(RESUME_TAB_KEY);
  if (tab) storageRemove(RESUME_TAB_KEY);
  return tab;
}
