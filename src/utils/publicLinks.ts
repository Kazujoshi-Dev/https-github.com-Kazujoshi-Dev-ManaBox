/**
 * Publiczne linki: ładne adresy (/talia/id, /sprzedam/nazwa, /szukam/nazwa)
 * oraz stare linki z parametrem (?talia=, ?sprzedam=, ?sale=, ?szukam=, ?wishlist=).
 */
export type PublicLinkKind = 'deck' | 'sale' | 'wishlist';

const PATH_PREFIX: Record<PublicLinkKind, string> = { deck: 'talia', sale: 'sprzedam', wishlist: 'szukam' };

export function parsePublicLink(loc: Pick<Location, 'pathname' | 'search'> = window.location): { kind: PublicLinkKind; ref: string } | null {
  const m = loc.pathname.match(/^\/(talia|sprzedam|szukam)\/([^/]+)\/?$/);
  if (m) {
    let ref = m[2];
    try {
      ref = decodeURIComponent(ref);
    } catch {
      /* zostawiamy surowy */
    }
    const kind: PublicLinkKind = m[1] === 'talia' ? 'deck' : m[1] === 'sprzedam' ? 'sale' : 'wishlist';
    return ref ? { kind, ref } : null;
  }
  const params = new URLSearchParams(loc.search);
  const deck = params.get('talia');
  if (deck) return { kind: 'deck', ref: deck };
  const sale = params.get('sprzedam') || params.get('sale');
  if (sale) return { kind: 'sale', ref: sale };
  const wish = params.get('szukam') || params.get('wishlist');
  if (wish) return { kind: 'wishlist', ref: wish };
  return null;
}

export const publicPath = (kind: PublicLinkKind, ref: string) => `/${PATH_PREFIX[kind]}/${encodeURIComponent(ref)}`;

export const publicUrl = (kind: PublicLinkKind, ref: string) =>
  `${typeof window !== 'undefined' ? window.location.origin : 'https://manascrew.eu'}${publicPath(kind, ref)}`;
