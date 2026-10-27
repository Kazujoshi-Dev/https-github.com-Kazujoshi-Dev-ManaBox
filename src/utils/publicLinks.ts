/**
 * Publiczne linki: ładne adresy (/talia/id, /sprzedam/nazwa, /szukam/nazwa)
 * oraz stare linki z parametrem (?talia=, ?sprzedam=, ?sale=, ?szukam=, ?wishlist=).
 */
import { DEFAULT_GAME, isGameAvailable, type GameId } from '../games';

export type PublicLinkKind = 'deck' | 'sale' | 'wishlist';

/** Parametr adresu z grą oferty lub listy życzeń (np. ?gra=lorcana); brak = MTG. */
const GAME_PARAM = 'gra';
const gameFromSearch = (search: string): GameId => {
  const v = new URLSearchParams(search).get(GAME_PARAM);
  return isGameAvailable(v) ? v : DEFAULT_GAME;
};
const gameQuery = (game?: GameId) => (game && game !== DEFAULT_GAME ? `?${GAME_PARAM}=${game}` : '');

const PATH_PREFIX: Record<PublicLinkKind, string> = { deck: 'talia', sale: 'sprzedam', wishlist: 'szukam' };

export function parsePublicLink(
  loc: Pick<Location, 'pathname' | 'search'> = window.location
): { kind: PublicLinkKind; ref: string; folder?: string; game: GameId } | null {
  const game = gameFromSearch(loc.search);
  // Folder oferty: /sprzedam/nazwa/slug
  const f = loc.pathname.match(/^\/sprzedam\/([^/]+)\/([a-z0-9]{6,24})\/?$/i);
  if (f) {
    let ref = f[1];
    try {
      ref = decodeURIComponent(ref);
    } catch {
      /* zostawiamy surowy */
    }
    return ref ? { kind: 'sale', ref, folder: f[2].toLowerCase(), game } : null;
  }
  const m = loc.pathname.match(/^\/(talia|sprzedam|szukam)\/([^/]+)\/?$/);
  if (m) {
    let ref = m[2];
    try {
      ref = decodeURIComponent(ref);
    } catch {
      /* zostawiamy surowy */
    }
    const kind: PublicLinkKind = m[1] === 'talia' ? 'deck' : m[1] === 'sprzedam' ? 'sale' : 'wishlist';
    return ref ? { kind, ref, game } : null;
  }
  const params = new URLSearchParams(loc.search);
  const deck = params.get('talia');
  if (deck) return { kind: 'deck', ref: deck, game };
  const sale = params.get('sprzedam') || params.get('sale');
  if (sale) return { kind: 'sale', ref: sale, game };
  const wish = params.get('szukam') || params.get('wishlist');
  if (wish) return { kind: 'wishlist', ref: wish, game };
  return null;
}

/** Oferta i lista życzeń są osobne dla każdej gry: link do gry innej niż MTG ma parametr ?gra=. */
export const publicPath = (kind: PublicLinkKind, ref: string, game?: GameId) =>
  `/${PATH_PREFIX[kind]}/${encodeURIComponent(ref)}${kind === 'deck' ? '' : gameQuery(game)}`;

const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://manascrew.eu');

export const publicUrl = (kind: PublicLinkKind, ref: string, game?: GameId) => `${origin()}${publicPath(kind, ref, game)}`;

/** Publiczny link jednego folderu oferty „Sprzedam”. */
export const saleFolderUrl = (sellerRef: string, slug: string, game?: GameId) =>
  `${origin()}/${PATH_PREFIX.sale}/${encodeURIComponent(sellerRef)}/${encodeURIComponent(slug)}${gameQuery(game)}`;
