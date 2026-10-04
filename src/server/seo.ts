/**
 * SEO: robots.txt, sitemap.xml i strony HTML z metadanymi (tytuł, opis, Open Graph, canonical)
 * oraz prostą treścią dla wyszukiwarek, wstrzykiwaną do index.html przed wysłaniem.
 * React po starcie podmienia tę treść na normalny widok aplikacji.
 */
import fs from 'fs';
import type express from 'express';
import * as db from './db';
import type { CollectionItem, DeckItem, ScryfallCard, WishlistItem } from '../types';

export const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://manascrew.eu').replace(/\/+$/, '');
const SITE_NAME = 'Mana Screw';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

const HOME_TITLE = 'Mana Screw | Kolekcja kart MTG, talie Commander i ceny w PLN';
const HOME_DESCRIPTION =
  'Bezpłatna aplikacja do kolekcji kart Magic: The Gathering. Skanuj karty aparatem, śledź ceny z Cardmarket w złotówkach, buduj talie Commander i sprzedawaj karty.';

export interface PageMeta {
  title: string;
  description: string;
  /** Ścieżka kanoniczna, np. /talia/abc. */
  path: string;
  image?: string;
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

function headTags(meta: PageMeta): string {
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
    image === DEFAULT_IMAGE ? `<meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />` : '',
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

const appFooter = `<p style="margin-top:2rem"><a href="/">Mana Screw</a>: kolekcja kart Magic: The Gathering, skaner kart, ceny w PLN, budowanie talii Commander i giełda kart między graczami.</p>`;

function homePage(): RenderedPage {
  const body = `
<h1>Mana Screw: kolekcja kart Magic: The Gathering</h1>
<p>${esc(HOME_DESCRIPTION)}</p>
<h2>Co możesz zrobić</h2>
<ul>
<li><strong>Skaner kart</strong>: dodawaj karty do kolekcji aparatem telefonu, także całe stosy.</li>
<li><strong>Ceny w złotówkach</strong>: wyceny z Cardmarket i TCGplayer przeliczane po kursie NBP, wykres wartości kolekcji.</li>
<li><strong>Talie Commander (EDH)</strong>: analiza many i krzywej, rekomendacje EDHREC, Game Changers, szacowany bracket, sprawdzanie legalności.</li>
<li><strong>Sprzedaż i wymiana</strong>: publiczna oferta kart na sprzedaż, mapa sprzedawców, wiadomości między graczami.</li>
<li><strong>Lista życzeń</strong>: karty, których szukasz, z mapą graczy, którzy je sprzedają.</li>
<li><strong>Import i eksport</strong>: ManaBox, Moxfield, Archidekt i zwykłe listy tekstowe.</li>
</ul>
<p><a href="/">Załóż konto lub zaloguj się</a></p>`;
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
  const total = main.reduce((s, e) => s + (e.quantity || 0), 0) + (deck.commander ? 1 : 0);
  const cmd = deck.commander || null;
  const isEdh = Boolean(cmd) || /commander|edh/i.test(deck.format || '');
  const formatLabel = isEdh ? 'Commander (EDH)' : deck.format || 'Magic: The Gathering';

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
      image: cardImage(cmd, 'art_crop') || cardImage(main[0]?.card, 'art_crop') || undefined,
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

async function salePage(ref: string): Promise<RenderedPage> {
  const path = `/sprzedam/${encodeURIComponent(ref)}`;
  const user = ref.length <= 100 ? await db.getUserByIdOrUsername(ref.trim()) : null;
  if (!user || db.isBanActive(user) || user.sale_hidden) return notFoundPage(path, 'Nie znaleziono oferty dla tego użytkownika.');
  const canonical = `/sprzedam/${encodeURIComponent(user.username)}`;
  const items = ((await db.getCollection(user.id)) as CollectionItem[]).filter((i) => i.isForSale);
  const settings: any = (await db.getSettings(user.id)) || {};
  const currency = settings.currency || 'PLN';
  const sorted = [...items].sort((a, b) => (Number(b.salePrice) || eur(b.card)) - (Number(a.salePrice) || eur(a.card)));
  const n = items.reduce((s, i) => s + (i.quantity || 0) + (i.quantityFoil || 0), 0) || items.length;

  const top = sorted.slice(0, 3).map((i) => i.card.name);
  const title = clip(`Karty MTG na sprzedaż: ${user.username} (${kart(n)}) | ${SITE_NAME}`, 90);
  const description = clip(
    n
      ? `${kart(n)} Magic: The Gathering na sprzedaż od ${user.username}${top.length ? `${n > top.length ? ', między innymi' : ':'} ${top.join(', ')}` : ''}. Zobacz ceny i napisz do sprzedawcy w Mana Screw.`
      : `Oferta kart Magic: The Gathering gracza ${user.username} w Mana Screw. Obecnie brak kart na sprzedaż.`,
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
<h1>Karty MTG na sprzedaż: ${esc(user.username)}</h1>
<p>${n ? `${esc(kart(n))} Magic: The Gathering wystawionych na sprzedaż przez gracza ${esc(user.username)}.` : 'Ten gracz nie ma obecnie kart na sprzedaż.'} Aby kupić kartę, zaloguj się i napisz do sprzedawcy.</p>
${rows ? `<h2>Lista kart</h2><ul>${rows}</ul>` : ''}
${appFooter}`;

  return {
    status: 200,
    meta: {
      title,
      description,
      path: canonical,
      type: 'profile',
      image: cardImage(sorted[0]?.card, 'art_crop') || undefined,
      imageAlt: sorted[0]?.card.name
    },
    body
  };
}

async function wishlistPage(ref: string): Promise<RenderedPage> {
  const path = `/szukam/${encodeURIComponent(ref)}`;
  const user = ref.length <= 100 ? await db.getUserByIdOrUsername(ref.trim()) : null;
  if (!user || db.isBanActive(user)) return notFoundPage(path, 'Nie znaleziono listy życzeń tego użytkownika.');
  const list = (await db.getWishlist(user.id)) as WishlistItem[];
  const names = list.map((w) => w.card?.name).filter(Boolean) as string[];
  const body = `${breadcrumbNav('Lista życzeń')}
<h1>Lista życzeń: ${esc(user.username)}</h1>
<p>Karty Magic: The Gathering, których szuka gracz ${esc(user.username)}.</p>
${names.length ? `<ul>${names.slice(0, 500).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${appFooter}`;
  return {
    status: 200,
    meta: {
      title: clip(`Lista życzeń ${user.username}: szukane karty MTG | ${SITE_NAME}`, 90),
      description: clip(`${user.username} szuka ${kart(names.length)} Magic: The Gathering${names.length ? `, między innymi ${names.slice(0, 3).join(', ')}` : ''}. Masz je? Napisz w Mana Screw.`, 200),
      path: `/szukam/${encodeURIComponent(user.username)}`,
      type: 'profile',
      // Lista życzeń jest dostępna z linku, ale nie promujemy jej w wynikach wyszukiwania
      noindex: true
    },
    body
  };
}

// ---------- cache wyników ----------

const PAGE_TTL_MS = 5 * 60 * 1000;
const pageCache = new Map<string, { at: number; page: RenderedPage }>();

async function cachedPage(key: string, build: () => Promise<RenderedPage>): Promise<RenderedPage> {
  const hit = pageCache.get(key);
  if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit.page;
  const page = await build();
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
  const url = (loc: string, lastmod: string | null, priority: string) =>
    `  <url><loc>${esc(`${SITE_URL}${loc}`)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}<priority>${priority}</priority></url>`;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url('/', null, '1.0'),
    ...decks.map((d) => url(`/talia/${encodeURIComponent(d.id)}`, d.updatedAt, '0.7')),
    ...sellers.map((s) => url(`/sprzedam/${encodeURIComponent(s.username)}`, s.updatedAt, '0.6')),
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

      let page: RenderedPage;
      const m = req.path.match(/^\/(talia|sprzedam|szukam)\/([^/]+)\/?$/);
      if (req.path === '/' || req.path === '/index.html') {
        page = homePage();
      } else if (m) {
        let ref = m[2];
        try {
          ref = decodeURIComponent(ref);
        } catch {
          /* surowy */
        }
        const key = `${m[1]}:${ref.toLowerCase()}`;
        page = await cachedPage(key, () => (m[1] === 'talia' ? deckPage(ref) : m[1] === 'sprzedam' ? salePage(ref) : wishlistPage(ref)));
      } else {
        page = notFoundPage(req.path, 'Ta strona nie istnieje.');
      }

      const template = await getTemplate(req);
      res.status(page.status);
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(renderTemplate(template, page.meta, page.body));
    } catch (err: any) {
      console.warn('[SEO] render:', err?.message || err);
      next();
    }
  });
}

/** Do testów i do czyszczenia po zmianie talii. */
export function clearSeoCache() {
  pageCache.clear();
  sitemapCache = null;
}

export { readTemplate };
