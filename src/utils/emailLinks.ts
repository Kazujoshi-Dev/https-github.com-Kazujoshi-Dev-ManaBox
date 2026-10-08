/**
 * Linki z e-maili: /potwierdz-email?token=… (potwierdzenie rejestracji) i /nowe-haslo?token=… (reset hasła).
 */
export interface EmailLink {
  kind: 'verify' | 'reset';
  token: string;
}

export function parseEmailLink(loc: Pick<Location, 'pathname' | 'search'> = window.location): EmailLink | null {
  const path = loc.pathname.replace(/\/+$/, '');
  const kind = path === '/potwierdz-email' ? 'verify' : path === '/nowe-haslo' ? 'reset' : null;
  if (!kind) return null;
  const token = new URLSearchParams(loc.search).get('token') || '';
  return { kind, token };
}
