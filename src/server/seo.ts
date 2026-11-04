/**
 * SEO: robots.txt, sitemap.xml i strony HTML z metadanymi (tytuł, opis, Open Graph, canonical)
 * oraz prostą treścią dla wyszukiwarek, wstrzykiwaną do index.html przed wysłaniem.
 * React po starcie podmienia tę treść na normalny widok aplikacji.
 */
import fs from 'fs';
import { getDeckFormat } from '../utils/mtgFormats';
import type express from 'express';
import * as db from './db';
import type { CollectionItem, DeckItem, ScryfallCard, WishlistItem } from '../types';
import { GUIDES, getGuide, guidesNavHtml, renderGuide } from './seoGuides';
import { DEFAULT_GAME, GAMES, isGameAvailable, type GameId } from '../games';
import { OG_H, OG_W, cachedOgImage, renderCardsOgImage, shortHash } from './ogImage';

export const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://manascrew.eu').replace(/\/+$/, '');
export const SITE_NAME = 'Mana Screw';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

// Marka na końcu: „Mana Screw” to też nazwa karty MTG, więc o widoczność walczymy opisem, nie marką.
const HOME_TITLE = 'Kolekcja kart MTG, Pokémon i Lorcana z cenami w PLN | Mana Screw';
const HOME_DESCRIPTION =
  'Bezpłatna aplikacja do kolekcji kart Magic: The Gathering, Pokémon TCG i Disney Lorcana. Ceny z Cardmarket w złotówkach, skaner kart MTG i Lorcana, talie Commander i sprzedaż kart.';

export interface PageMeta {
  title: string;
  description: string;
  /** Ścieżka kanoniczna, np. /talia/abc. */
  path: string;
  image?: string;
  /** Wymiary obrazka, gdy są znane (np. wygenerowany kolaż 1200×630). */
  imageSize?: { width: number; height: number };
  imageAlt?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  jsonLd?: object[];
}

interface RenderedPage {
  status: number;
  meta: PageMeta;
  body: string;
}

// ---------- pomocnicze ----------

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/[\s,.;:]+\S*$/, '')}…`);

const cardImage = (card: ScryfallCard | null | undefined, size: 'art_crop' | 'normal' | 'large' = 'normal'): string => {
  if (!card) return '';
  const uris: any = (card as any).image_uris || (card as any).card_faces?.[0]?.image_uris;
  return (uris && (uris[size] || uris.normal || uris.large)) || '';
};

const eur = (card: ScryfallCard | null | undefined) => Number((card as any)?.prices?.eur || (card as any)?.prices?.eur_foil || 0) || 0;

const CATEGORY: { id: string; name: string; test: (t: string) => boolean }[] = [
  { id: 'creature', name: 'Stwory', test: (t) => t.includes('creature') },
  { id: 'instant', name: 'Instanty', test: (t) => t.includes('instant') },
  { id: 'sorcery', name: 'Czary', test: (t) => t.includes('sorcery') },
  { id: 'artifact', name: 'Artefakty', test: (t) => t.includes('artifact') },
  { id: 'enchantment', name: 'Zaklęcia', test: (t) => t.includes('enchantment') },
  { id: 'planeswalker', name: 'Planeswalkerzy', test: (t) => t.includes('planeswalker') },
  { id: 'land', name: 'Lądy', test: (t) => t.includes('land') },
  { id: 'other', name: 'Inne', test: () => true }
];

const categoryOf = (card: ScryfallCard) => {
  const t = (card.type_line || '').toLowerCase();
  return CATEGORY.find((c) => c.test(t))!;
};

/** Polska odmiana: 1 karta, 2 karty, 5 kart. */
const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const d = n % 10;
  const h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};
const kart = (n: number) => `${n} ${plural(n, 'karta', 'karty', 'kart')}`;

const fmtMoney = (v: number, currency = 'PLN') => {
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
};

// ---------- szablon index.html ----------

let templateCache: { file: string; mtimeMs: number; html: string } | null = null;

function readTemplate(file: string): string {
  const st = fs.statSync(file);
  if (!templateCache || templateCache.file !== file || templateCache.mtimeMs !== st.mtimeMs) {
    templateCache = { file, mtimeMs: st.mtimeMs, html: fs.readFileSync(file, 'utf8') };
  }
  return templateCache.html;
}

export function headTags(meta: PageMeta): string {
  const url = `${SITE_URL}${meta.path}`;
  const image = meta.image || DEFAULT_IMAGE;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    meta.noindex ? `<meta name="robots" content="noindex, follow" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="pl_PL" />`,
    `<meta property="og:type" content="${meta.type || 'website'}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    image === DEFAULT_IMAGE
      ? `<meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />`
      : meta.imageSize
        ? `<meta property="og:image:width" content="${meta.imageSize.width}" />\n    <meta property="og:image:height" content="${meta.imageSize.height}" />`
        : '',
    meta.imageAlt ? `<meta property="og:image:alt" content="${esc(meta.imageAlt)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ...(meta.jsonLd || []).map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`)
  ];
  return tags.filter(Boolean).join('\n    ');
}

const SSR_STYLE = `<style>
.seo-ssr{max-width:56rem;margin:0 auto;padding:2.5rem 1.25rem 4rem;color:#d6d3d1;font:15px/1.6 Geist,system-ui,sans-serif}
.seo-ssr h1{color:#fafaf9;font-size:1.75rem;line-height:1.25;margin:0 0 .75rem;font-weight:600}
.seo-ssr h2{color:#f5f5f4;font-size:1.05rem;margin:1.75rem 0 .5rem;font-weight:600}
.seo-ssr p{margin:.4rem 0;color:#a8a29e}.seo-ssr a{color:#fbbf24}
.seo-ssr ul{margin:.25rem 0;padding-left:1.1rem}.seo-ssr li{margin:.1rem 0}
.seo-ssr nav{font-size:13px;margin-bottom:1.5rem;color:#78716c}
</style>`;

/** Wstawia metadane i treść do szablonu index.html. */
export function renderTemplate(template: string, meta: PageMeta, body: string): string {
  let html = template;
  const start = html.indexOf('<!--seo:start-->');
  const end = html.indexOf('<!--seo:end-->');
  const head = `${headTags(meta)}\n    ${SSR_STYLE}`;
  if (start !== -1 && end > start) {
    html = html.slice(0, start) + head + html.slice(end + '<!--seo:end-->'.length);
  } else {
    html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace('</head>', `  ${head}\n  </head>`);
  }
  return html.replace(/<div id="root"><\/div>/, `<div id="root"><div class="seo-ssr">${body}</div></div>`);
}

// ---------- treść stron ----------

const breadcrumbNav = (label: string) =>
  `<nav><a href="/">Mana Screw</a> / ${esc(label)}</nav>`;

const appFooter = `<p style="margin-top:2rem"><a href="/">Mana Screw</a>: kolekcja kart Magic: The Gathering, Pokémon TCG i Disney Lorcana, skaner kart, ceny w PLN, budowanie talii Commander i giełda kart między graczami.</p>
<nav aria-label="Poradniki"><h2>Poradniki</h2>${guidesNavHtml()}</nav>`;

function homePage(): RenderedPage {
  const body = `
<h1>Darmowa aplikacja do kolekcji kart MTG, Pokémon i Lorcana</h1>
<p>${esc(HOME_DESCRIPTION)}</p>
<h2>Obsługiwane gry</h2>
<ul>
<li><strong>Magic: The Gathering</strong>: skaner kart, talie Commander i formaty MTG Arena, wzrosty i spadki cen, spoilery nowych dodatków.</li>
<li><strong>Pokémon TCG</strong>: wyszukiwarka kart, wersje zwykłe i reverse holo, ceny z Cardmarket w PLN.</li>
<li><strong>Disney Lorcana</strong>: skaner kart, wydania zwykłe i Enchanted, ceny z TCGplayer w PLN.</li>
</ul>
<h2>Co możesz zrobić</h2>
<ul>
<li><strong><a href="/skaner-kart-mtg">Skaner kart</a></strong>: dodawaj karty Magic i Lorcany do kolekcji aparatem telefonu.</li>
<li><strong><a href="/ceny-kart-mtg">Ceny w złotówkach</a></strong>: wyceny z Cardmarket i TCGplayer przeliczane po kursie NBP, wykres wartości kolekcji.</li>
<li><strong><a href="/talie-commander">Talie Commander (EDH)</a></strong>: analiza many i krzywej, rekomendacje EDHREC, Game Changers, szacowany bracket, sprawdzanie legalności.</li>
<li><strong>Sprzedaż i wymiana</strong>: publiczna oferta kart na sprzedaż, mapa sprzedawców, wiadomości między graczami.</li>
<li><strong>Lista życzeń</strong>: karty, których szukasz, z mapą graczy, którzy je sprzedają.</li>
<li><strong><a href="/import-z-manabox">Import i eksport</a></strong>: ManaBox, Moxfield, Archidekt i zwykłe listy tekstowe.</li>
</ul>
<p><a href="/">Załóż konto lub zaloguj się</a></p>
<nav aria-label="Poradniki"><h2>Poradniki</h2>${guidesNavHtml()}</nav>`;
  return {
    status: 200,
    meta: {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      path: '/',
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/`, inLanguage: 'pl-PL' },
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          description: HOME_DESCRIPTION,
          applicationCategory: 'GameApplication',
          operatingSystem: 'Web, Android, iOS',
          inLanguage: 'pl-PL',
          image: DEFAULT_IMAGE,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'PLN' }
        }
      ]
    },
    body
  };
}

function emailLinkPage(path: string): RenderedPage {
  const reset = path.startsWith('/nowe-haslo');
  const title = reset ? 'Ustaw nowe hasło' : 'Potwierdzenie adresu e-mail';
  return {
    status: 200,
    meta: { title: `${title} | ${SITE_NAME}`, description: title, path: reset ? '/nowe-haslo' : '/potwierdz-email', noindex: true },
    body: `<h1>${esc(title)}</h1><p>Ładowanie...</p>`
  };
}

function notFoundPage(path: string, what: string): RenderedPage {
  return {
    status: 404,
    meta: { title: `Nie znaleziono | ${SITE_NAME}`, description: what, path, noindex: true },
    body: `<h1>Nie znaleziono</h1><p>${esc(what)}</p><p><a href="/">Przejdź do strony głównej</a></p>`
  };
}

async function deckPage(id: string): Promise<RenderedPage> {
  const path = `/talia/${encodeURIComponent(id)}`;
  if (!/^[\w-]{1,64}$/.test(id)) return notFoundPage(path, 'Ta talia nie istnieje.');
  const found = await db.getPublicDeck(id);
  const owner = found ? await db.getUserById(found.userId) : null;
  if (!found || !owner || db.isBanActive(owner)) {
    return notFoundPage(path, 'Ta talia nie istnieje albo jej właściciel wyłączył publiczny link.');
  }
  const deck: DeckItem = found.deck;
  const main = (deck.cards || []).filter((e) => !e.isSideboard && !e.isCommander);
  const total = main.reduce((s, e) => s + (e.quantity || 0), 0) + (deck.commander && getDeckFormat(deck.format).commander ? 1 : 0);
  const fmt = getDeckFormat(deck.format);
  const cmd = fmt.commander ? deck.commander || null : null;
  const formatLabel = fmt.id === 'commander' ? 'Commander (EDH)' : fmt.platform === 'arena' ? `${fmt.name} (MTG Arena)` : fmt.label;

  const groups = new Map<string, { name: string; items: { name: string; qty: number }[] }>();
  for (const c of CATEGORY) groups.set(c.id, { name: c.name, items: [] });
  for (const e of main) groups.get(categoryOf(e.card).id)!.items.push({ name: e.card.name, qty: e.quantity || 1 });
  const count = (cat: string) => groups.get(cat)!.items.reduce((s, x) => s + x.qty, 0);

  const highlights = [...main]
    .filter((e) => !/\bbasic\b/i.test(e.card.type_line || ''))
    .sort((a, b) => eur(b.card) - eur(a.card))
    .slice(0, 3)
    .map((e) => e.card.name);

  const title = clip(cmd ? `${deck.name}: talia ${formatLabel} z ${cmd.name} | ${SITE_NAME}` : `${deck.name}: talia ${formatLabel} | ${SITE_NAME}`, 90);
  const description = clip(
    [
      `Talia ${formatLabel} gracza ${owner.username}`,
      cmd ? ` z dowódcą ${cmd.name}` : '',
      `: ${kart(total)}, w tym ${count('creature')} ${plural(count('creature'), 'stwór', 'stwory', 'stworów')} i ${count('land')} ${plural(count('land'), 'ląd', 'lądy', 'lądów')}.`,
      highlights.length ? ` Między innymi ${highlights.join(', ')}.` : '',
      ' Pełna lista kart, krzywa many i analiza talii.'
    ].join(''),
    200
  );

  const lists = [...groups.values()]
    .filter((g) => g.items.length)
    .map(
      (g) =>
        `<h2>${esc(g.name)} (${g.items.reduce((s, x) => s + x.qty, 0)})</h2><ul>${g.items
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((x) => `<li>${x.qty > 1 ? `${x.qty}× ` : ''}${esc(x.name)}</li>`)
          .join('')}</ul>`
    )
    .join('');

  const body = `${breadcrumbNav('Talie')}
<h1>${esc(deck.name)}</h1>
<p>Talia ${esc(formatLabel)} gracza <a href="/sprzedam/${encodeURIComponent(owner.username)}">${esc(owner.username)}</a>, ${esc(kart(total))}.</p>
${cmd ? `<h2>Dowódca</h2><p>${esc(cmd.name)}${cmd.type_line ? `, ${esc(cmd.type_line)}` : ''}</p>` : ''}
${deck.description ? `<p>${esc(clip(deck.description, 600))}</p>` : ''}
${lists}
${appFooter}`;

  return {
    status: 200,
    meta: {
      title,
      description,
      path,
      type: 'article',
      image: cardImage(cmd, 'large') || cardImage(main[0]?.card, 'large') || undefined,
      imageAlt: cmd ? cmd.name : deck.name,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: deck.name, item: `${SITE_URL}${path}` }
          ]
        }
      ]
    },
    body
  };
}

const gameQuery = (game: GameId) => (game !== DEFAULT_GAME ? `?gra=${game}` : '');
const gameLabel = (game: GameId) => (game === 'mtg' ? 'MTG' : GAMES[game].shortName);

interface OfferData {
  user: { id: string; username: string };
  folder: { id: string; name: string; slug: string } | null;
  items: CollectionItem[];
  currency: string;
}

/** Karty oferty (całej albo jednego folderu); null, gdy oferty nie ma lub jest ukryta. */
async function loadOffer(ref: string, folderSlug: string | undefined, game: GameId): Promise<OfferData | 'no-folder' | null> {
  const user = ref.length <= 100 ? await db.getUserByIdOrUsername(ref.trim()) : null;
  if (!user || db.isBanActive(user) || user.sale_hidden) return null;
  const folder = folderSlug
    ? (await db.getSaleFolders(user.id, game)).find((f) => f.slug === folderSlug.trim().toLowerCase()) || null
    : null;
  if (folderSlug && !folder) return 'no-folder';
  const items = ((await db.getCollection(user.id, game)) as CollectionItem[]).filter(
    (i) => i.isForSale && (!folder || i.saleFolderId === folder.id)
  );
  const settings: any = (await db.getSettings(user.id)) || {};
  const sorted = [...items].sort((a, b) => (Number(b.salePrice) || eur(b.card)) - (Number(a.salePrice) || eur(a.card)));
  return { user, folder: folder ? { id: folder.id, name: folder.name, slug: folder.slug } : null, items: sorted, currency: settings.currency || 'PLN' };
}

async function loadWishlist(ref: string, game: GameId) {
  const user = ref.length <= 100 ? await db.getUserByIdOrUsername(ref.trim()) : null;
  if (!user || db.isBanActive(user)) return null;
  const list = ((await db.getWishlist(user.id, game)) as WishlistItem[]).filter((w) => w.card);
  // Najdroższe karty pierwsze: to one najlepiej wyglądają w podglądzie linku
  const sorted = [...list].sort((a, b) => eur(b.card) - eur(a.card));
  return { user, list: sorted };
}

const TOP_IMAGES = 5;
const topImages = (cardsList: (ScryfallCard | null | undefined)[]) => cardsList.map((c) => cardImage(c, 'normal')).filter(Boolean).slice(0, TOP_IMAGES);

/** Adres kolażu kart do og:image; skrót w adresie zmienia się razem z ofertą. */
const ogImageUrl = (kind: 'sprzedam' | 'szukam', username: string, folderSlug: string | undefined, images: string[], game: GameId) => {
  if (images.length === 0) return undefined;
  const v = shortHash(images.join('|'));
  return `${SITE_URL}/og/${kind}/${encodeURIComponent(username)}${folderSlug ? `/${folderSlug}` : ''}.jpg?v=${v}${game !== DEFAULT_GAME ? `&gra=${game}` : ''}`;
};

async function salePage(ref: string, folderSlug?: string, game: GameId = DEFAULT_GAME): Promise<RenderedPage> {
  const path = `/sprzedam/${encodeURIComponent(ref)}${folderSlug ? `/${encodeURIComponent(folderSlug)}` : ''}${gameQuery(game)}`;
  const offer = await loadOffer(ref, folderSlug, game);
  if (!offer) return notFoundPage(path, 'Nie znaleziono oferty dla tego użytkownika.');
  if (offer === 'no-folder') return notFoundPage(path, 'Nie znaleziono tego folderu oferty.');
  const { user, folder, items: sorted, currency } = offer;
  const canonical = `/sprzedam/${encodeURIComponent(user.username)}${folder ? `/${folder.slug}` : ''}${gameQuery(game)}`;
  const n = sorted.reduce((s, i) => s + (i.quantity || 0) + (i.quantityFoil || 0), 0) || sorted.length;
  const label = gameLabel(game);
  const gameName = GAMES[game].name;

  const top = sorted.slice(0, 3).map((i) => i.card.name);
  const title = clip(
    folder
      ? `${folder.name}: karty ${label} na sprzedaż od ${user.username} (${kart(n)}) | ${SITE_NAME}`
      : `Karty ${label} na sprzedaż: ${user.username} (${kart(n)}) | ${SITE_NAME}`,
    90
  );
  const description = clip(
    n
      ? `${kart(n)} ${gameName} na sprzedaż od ${user.username}${top.length ? `${n > top.length ? ', między innymi' : ':'} ${top.join(', ')}` : ''}. Zobacz ceny i napisz do sprzedawcy w Mana Screw.`
      : `Oferta kart ${gameName} gracza ${user.username} w Mana Screw. Obecnie brak kart na sprzedaż.`,
    200
  );

  const rows = sorted
    .slice(0, 500)
    .map((i) => {
      const qty = (i.quantity || 0) + (i.quantityFoil || 0);
      const price = Number(i.salePrice) > 0 ? `, ${fmtMoney(Number(i.salePrice), currency)}` : '';
      const set = (i.card as any).set ? ` (${String((i.card as any).set).toUpperCase()})` : '';
      return `<li>${qty > 1 ? `${qty}× ` : ''}${esc(i.card.name)}${esc(set)}${i.quantityFoil > 0 ? ', foil' : ''}${esc(price)}</li>`;
    })
    .join('');

  const body = `${breadcrumbNav('Sprzedam')}
<h1>${folder ? `${esc(folder.name)}: karty ${esc(label)} na sprzedaż od ${esc(user.username)}` : `Karty ${esc(label)} na sprzedaż: ${esc(user.username)}`}</h1>
<p>${n ? `${esc(kart(n))} ${esc(gameName)} wystawionych na sprzedaż przez gracza ${esc(user.username)}.` : 'Ten gracz nie ma obecnie kart na sprzedaż.'} Aby kupić kartę, zaloguj się i napisz do sprzedawcy.</p>
${rows ? `<h2>Lista kart</h2><ul>${rows}</ul>` : ''}
${appFooter}`;

  const collage = ogImageUrl('sprzedam', user.username, folder?.slug, topImages(sorted.map((i) => i.card)), game);
  return {
    status: 200,
    meta: {
      title,
      description,
      path: canonical,
      type: 'profile',
      // link folderu bywa przeznaczony dla jednej osoby: wyszukiwarki go nie indeksują
      noindex: Boolean(folder),
      image: collage || cardImage(sorted[0]?.card, 'large') || undefined,
      imageSize: collage ? { width: OG_W, height: OG_H } : undefined,
      imageAlt: top.length ? top.join(', ') : undefined
    },
    body
  };
}

async function wishlistPage(ref: string, game: GameId = DEFAULT_GAME): Promise<RenderedPage> {
  const path = `/szukam/${encodeURIComponent(ref)}${gameQuery(game)}`;
  const data = await loadWishlist(ref, game);
  if (!data) return notFoundPage(path, 'Nie znaleziono listy życzeń tego użytkownika.');
  const { user, list } = data;
  const names = list.map((w) => w.card.name);
  const label = gameLabel(game);
  const gameName = GAMES[game].name;
  const body = `${breadcrumbNav('Lista życzeń')}
<h1>Lista życzeń: ${esc(user.username)}</h1>
<p>Karty ${esc(gameName)}, których szuka gracz ${esc(user.username)}.</p>
${names.length ? `<ul>${names.slice(0, 500).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${appFooter}`;
  const collage = ogImageUrl('szukam', user.username, undefined, topImages(list.map((w) => w.card)), game);
  return {
    status: 200,
    meta: {
      title: clip(`Lista życzeń ${user.username}: szukane karty ${label} | ${SITE_NAME}`, 90),
      description: clip(`${user.username} szuka ${kart(names.length)} ${gameName}${names.length ? `, między innymi ${names.slice(0, 3).join(', ')}` : ''}. Masz je? Napisz w Mana Screw.`, 200),
      path: `/szukam/${encodeURIComponent(user.username)}${gameQuery(game)}`,
      type: 'profile',
      // Lista życzeń jest dostępna z linku, ale nie promujemy jej w wynikach wyszukiwania
      noindex: true,
      image: collage,
      imageSize: collage ? { width: OG_W, height: OG_H } : undefined,
      imageAlt: names.length ? names.slice(0, 3).join(', ') : undefined
    },
    body
  };
}

/** Kolaż kart dla /og/sprzedam/… i /og/szukam/…; null = brak oferty lub obrazków. */
async function offerOgImage(kind: 'sprzedam' | 'szukam', ref: string, folderSlug: string | undefined, game: GameId): Promise<Buffer | null> {
  let images: string[] = [];
  if (kind === 'sprzedam') {
    const offer = await loadOffer(ref, folderSlug, game);
    if (!offer || offer === 'no-folder') return null;
    images = topImages(offer.items.map((i) => i.card));
  } else {
    const data = await loadWishlist(ref, game);
    if (!data) return null;
    images = topImages(data.list.map((w) => w.card));
  }
  if (images.length === 0) return null;
  return cachedOgImage(`${kind}:${game}:${shortHash(images.join('|'))}`, () => renderCardsOgImage(images));
}

// ---------- cache wyników ----------

const PAGE_TTL_MS = 5 * 60 * 1000;
const pageCache = new Map<string, { at: number; page: RenderedPage }>();

async function cachedPage(key: string, build: () => Promise<RenderedPage>): Promise<RenderedPage> {
  const hit = pageCache.get(key);
  if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit.page;
  const page = await build();
  // 404 nie cache'ujemy: talia, którą ktoś właśnie upublicznił, ma być widoczna od razu
  if (page.status !== 200) return page;
  if (pageCache.size > 500) pageCache.delete(pageCache.keys().next().value as string);
  pageCache.set(key, { at: Date.now(), page });
  return page;
}

// ---------- trasy ----------

const LEGACY_PARAMS: [string, string][] = [
  ['talia', 'talia'],
  ['sprzedam', 'sprzedam'],
  ['sale', 'sprzedam'],
  ['szukam', 'szukam'],
  ['wishlist', 'szukam']
];

function robotsTxt(): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/admin/', '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join('\n');
}

let sitemapCache: { at: number; xml: string } | null = null;

async function sitemapXml(): Promise<string> {
  if (sitemapCache && Date.now() - sitemapCache.at < 60 * 60 * 1000) return sitemapCache.xml;
  const [decks, sellers] = await Promise.all([
    db.listPublicDecksForSitemap().catch(() => []),
    db.listSellersForSitemap().catch(() => [])
  ]);
  // Google ignoruje <priority> i <changefreq>, liczy się tylko <lastmod>
  const url = (loc: string, lastmod: string | null) =>
    `  <url><loc>${esc(`${SITE_URL}${loc}`)}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}</url>`;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url('/', null),
    ...GUIDES.map((g) => url(`/${g.slug}`, g.updated)),
    ...decks.map((d) => url(`/talia/${encodeURIComponent(d.id)}`, d.updatedAt)),
    ...sellers.map((s) => url(`/sprzedam/${encodeURIComponent(s.username)}`, s.updatedAt)),
    '</urlset>',
    ''
  ].join('\n');
  sitemapCache = { at: Date.now(), xml };
  return xml;
}

/**
 * Rejestruje robots.txt, sitemap.xml i strony aplikacji z metadanymi.
 * `getTemplate` zwraca aktualny index.html (w produkcji z dist, w trybie dev przetworzony przez Vite).
 */
const gameOf = (req: express.Request): GameId => {
  const v = typeof req.query.gra === 'string' ? req.query.gra : '';
  return isGameAvailable(v) ? v : DEFAULT_GAME;
};

export function registerSeoRoutes(app: express.Express, getTemplate: (req: express.Request) => Promise<string>) {
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600');
    res.send(robotsTxt());
  });

  app.get('/sitemap.xml', async (_req, res) => {
    try {
      res.type('application/xml').setHeader('Cache-Control', 'public, max-age=3600');
      res.send(await sitemapXml());
    } catch (err: any) {
      console.warn('[SEO] sitemap:', err?.message || err);
      res.status(500).type('text/plain').send('sitemap error');
    }
  });

  // Podgląd linku oferty i listy życzeń: kolaż kart (Facebook, Messenger, Discord)
  app.get(/^\/og\/(sprzedam|szukam)\/.+\.jpg$/, async (req, res) => {
    const m = req.path.match(/^\/og\/(sprzedam|szukam)\/([^/]+?)(?:\/([a-z0-9]{6,24}))?\.jpg$/i);
    if (!m || (m[1] === 'szukam' && m[3])) return res.status(404).end();
    let ref = m[2];
    try {
      ref = decodeURIComponent(ref);
    } catch {
      return res.status(404).end();
    }
    try {
      const buf = await offerOgImage(m[1] as 'sprzedam' | 'szukam', ref, m[3]?.toLowerCase(), gameOf(req));
      if (!buf) return res.redirect(302, DEFAULT_IMAGE);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.type('image/jpeg').send(buf);
    } catch (err: any) {
      console.warn('[SEO] og image:', err?.message || err);
      res.redirect(302, DEFAULT_IMAGE);
    }
  });

  app.get('*', async (req, res, next) => {
    if (req.path.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(req.path)) return next();
    try {
      // Stare linki (?talia=, ?sprzedam=, …) przekierowujemy na ładne adresy
      if (req.path === '/') {
        for (const [param, prefix] of LEGACY_PARAMS) {
          const v = req.query[param];
          if (typeof v === 'string' && v.trim()) {
            const rest = new URLSearchParams();
            for (const [k, val] of Object.entries(req.query)) {
              if (!LEGACY_PARAMS.some(([p]) => p === k) && typeof val === 'string') rest.set(k, val);
            }
            const qs = rest.toString();
            return res.redirect(301, `/${prefix}/${encodeURIComponent(v.trim())}${qs ? `?${qs}` : ''}`);
          }
        }
      }

      // Poradniki: samodzielne strony HTML, bez aplikacji React
      const guide = getGuide(req.path.replace(/^\/+|\/+$/g, ''));
      if (guide) {
        if (req.path !== `/${guide.slug}`) return res.redirect(301, `/${guide.slug}`);
        res.setHeader('Cache-Control', 'public, max-age=600');
        return res.type('html').send(renderGuide(guide));
      }

      let page: RenderedPage;
      const m = req.path.match(/^\/(talia|sprzedam|szukam)\/([^/]+)\/?$/) || req.path.match(/^\/(sprzedam)\/([^/]+)\/([a-z0-9]{6,24})\/?$/i);
      if (req.path === '/' || req.path === '/index.html') {
        page = homePage();
      } else if (/^\/(potwierdz-email|nowe-haslo)\/?$/.test(req.path)) {
        // Strony z linków w mailach: obsługuje je aplikacja, wyszukiwarki ich nie indeksują
        page = emailLinkPage(req.path);
      } else if (m) {
        let ref = m[2];
        try {
          ref = decodeURIComponent(ref);
        } catch {
          /* surowy */
        }
        const folderSlug = m[3] ? m[3].toLowerCase() : undefined;
        const game = gameOf(req);
        const key = `${m[1]}:${m[1] === 'talia' ? '' : `${game}:`}${ref.toLowerCase()}${folderSlug ? `/${folderSlug}` : ''}`;
        page = await cachedPage(key, () =>
          m[1] === 'talia' ? deckPage(ref) : m[1] === 'sprzedam' ? salePage(ref, folderSlug, game) : wishlistPage(ref, game)
        );
      } else {
        page = notFoundPage(req.path, 'Ta strona nie istnieje.');
      }

      const template = await getTemplate(req);
      res.status(page.status);
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(renderTemplate(template, page.meta, page.body));
    } catch (err: any) {
      console.warn('[SEO] render:', err?.message || err);
      // Bez tego trafiłby tu zwykły index.html ze statusem 200 i bez metadanych.
      // 503 mówi wyszukiwarce „wróć później”, a przeglądarka i tak uruchomi aplikację.
      try {
        const template = await getTemplate(req);
        res.status(503).setHeader('Retry-After', '120');
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').send(template);
      } catch {
        next();
      }
    }
  });
}

/** Do testów i do czyszczenia po zmianie talii. */
export function clearSeoCache() {
  pageCache.clear();
  sitemapCache = null;
}

export { readTemplate };
