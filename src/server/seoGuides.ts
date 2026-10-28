/**
 * Poradniki: statyczne strony HTML pod konkretne zapytania w Google (skaner kart, ceny w PLN,
 * import z ManaBox, talie Commander, Pokémon, Lorcana).
 *
 * Strony celowo NIE ładują aplikacji React: gdyby ładowały, niezalogowany gość (i Googlebot po
 * wykonaniu JS) zobaczyłby formularz logowania zamiast treści. Każda strona ma własną treść,
 * FAQ i linki do pozostałych poradników oraz do aplikacji.
 *
 * Treść musi opisywać to, co aplikacja naprawdę potrafi. Po zmianie funkcji zaktualizuj też tutaj.
 */
import { esc, headTags, SITE_URL, SITE_NAME, type PageMeta } from './seo';

interface GuideSection {
  h2: string;
  /** Akapity (zwykły tekst) albo lista punktów. */
  paragraphs?: string[];
  list?: string[];
  steps?: string[];
}

export interface Guide {
  slug: string;
  /** Krótka nazwa do nawigacji i linków. */
  nav: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  /** Data ostatniej istotnej zmiany treści (RRRR-MM-DD), trafia do sitemap.xml. */
  updated: string;
}

export const GUIDES: Guide[] = [
  {
    slug: 'skaner-kart-mtg',
    nav: 'Skaner kart',
    title: 'Skaner kart MTG i Lorcana w telefonie, za darmo | Mana Screw',
    description:
      'Skanuj karty Magic: The Gathering i Disney Lorcana aparatem telefonu. Aplikacja rozpoznaje kartę i wydanie, dodaje ją do kolekcji i pokazuje cenę w złotówkach.',
    h1: 'Skaner kart Magic: The Gathering i Disney Lorcana',
    lead:
      'Mana Screw rozpoznaje karty aparatem telefonu prosto w przeglądarce. Nie trzeba niczego instalować, a skanowanie nie ma limitu. Zeskanowana karta trafia do kolekcji razem z wydaniem i aktualną ceną w PLN.',
    sections: [
      {
        h2: 'Jak działa skaner',
        steps: [
          'Zaloguj się w Mana Screw na telefonie i wybierz grę: Magic: The Gathering albo Disney Lorcana.',
          'Otwórz skaner i nakieruj aparat na kartę. Aplikacja odczyta nazwę oraz numer kolekcjonerski i dopasuje właściwe wydanie.',
          'Sprawdź podpowiedź, w razie potrzeby zmień wydanie, wersję foil lub język i dodaj kartę do kolekcji albo wybranego klasera.',
          'Skanuj kolejne karty bez zamykania aparatu. Po wszystkim zobaczysz łączną wartość kolekcji w złotówkach.'
        ]
      },
      {
        h2: 'Co rozpoznaje skaner',
        list: [
          'Karty Magic: The Gathering ze wszystkich dodatków, także wersje japońskie.',
          'Karty Disney Lorcana z dostępnych dodatków.',
          'Konkretne wydanie karty, a nie tylko jej nazwę, dzięki czemu cena dotyczy właściwego druku.',
          'Karty Pokémon TCG dodasz na razie przez wyszukiwarkę; skaner dla Pokémon jest w planach.'
        ]
      },
      {
        h2: 'Po zeskanowaniu',
        paragraphs: [
          'Każda karta ma cenę z Cardmarket lub TCGplayer przeliczoną na złotówki po kursie NBP. Wykres pokazuje, jak zmienia się wartość kolekcji w czasie.',
          'Karty możesz od razu podzielić na klasery, oznaczyć do sprzedaży albo dodać do talii. Kolekcję wyeksportujesz do pliku w każdej chwili.'
        ]
      }
    ],
    faq: [
      { q: 'Czy skaner kart jest płatny?', a: 'Nie. Skaner i cała aplikacja Mana Screw są bezpłatne, a liczba skanów nie jest ograniczona.' },
      { q: 'Czy muszę instalować aplikację?', a: 'Nie. Skaner działa w przeglądarce telefonu. Możesz też dodać Mana Screw do ekranu głównego, wtedy otwiera się jak zwykła aplikacja.' },
      { q: 'Czy skaner rozpoznaje karty Pokémon?', a: 'Jeszcze nie. Skaner obsługuje Magic: The Gathering i Disney Lorcana. Karty Pokémon dodasz przez wyszukiwarkę.' }
    ],
    updated: '2026-10-28'
  },
  {
    slug: 'ceny-kart-mtg',
    nav: 'Ceny w PLN',
    title: 'Ceny kart MTG w złotówkach: wycena kolekcji | Mana Screw',
    description:
      'Sprawdzaj ceny kart Magic: The Gathering w PLN. Ceny z Cardmarket i TCGplayer po kursie NBP, wykres wartości kolekcji, wzrosty i spadki cen. Za darmo.',
    h1: 'Ceny kart Magic: The Gathering w złotówkach',
    lead:
      'Większość serwisów podaje ceny kart w euro albo dolarach. Mana Screw przelicza je na złotówki po aktualnym kursie NBP, więc od razu wiesz, ile jest warta Twoja kolekcja, talia albo oferta na sprzedaż.',
    sections: [
      {
        h2: 'Skąd pochodzą ceny',
        paragraphs: [
          'Ceny kart Magic pochodzą z Cardmarket (w euro) i TCGplayer (w dolarach). Aplikacja przelicza je na złotówki po średnim kursie NBP. Osobno liczone są wersje zwykłe i foil.',
          'Ceny są orientacyjne: pokazują rynkowy poziom, a nie gwarantowaną cenę sprzedaży. Rzeczywista cena zależy też od stanu karty, języka i wydania.'
        ]
      },
      {
        h2: 'Wycena kolekcji i talii',
        list: [
          'Łączna wartość kolekcji w PLN z wykresem za tydzień, miesiąc i rok.',
          'Wartość każdej talii, także talii Commander, z listą najdroższych kart.',
          'Ranking najdroższych kart z wybranego dodatku.',
          'Wybór waluty w ustawieniach, jeśli wolisz euro albo dolary.'
        ]
      },
      {
        h2: 'Wzrosty i spadki cen',
        paragraphs: [
          'Zakładka „Alerty cenowe” pokazuje karty, które w ostatnich dniach najmocniej zdrożały lub potaniały na Cardmarket, w podziale na formaty. Możesz zawęzić listę do kart z własnej kolekcji i listy życzeń oraz ustawić próg zmiany ceny.'
        ]
      }
    ],
    faq: [
      { q: 'Jak często aktualizowane są ceny?', a: 'Ceny kart są aktualizowane raz na dobę, a kurs złotówki pochodzi z tabel NBP.' },
      { q: 'Czy mogę sprawdzić wartość kolekcji bez wpisywania kart ręcznie?', a: 'Tak. Zaimportuj kolekcję z pliku (np. z ManaBox albo z listy tekstowej) lub zeskanuj karty aparatem telefonu.' },
      { q: 'Czy pokazujecie ceny polskich sklepów?', a: 'Nie. Ceny pochodzą z Cardmarket i TCGplayer, czyli z największych rynków kart w Europie i USA.' }
    ],
    updated: '2026-10-28'
  },
  {
    slug: 'import-z-manabox',
    nav: 'Import z ManaBox',
    title: 'Import kolekcji z ManaBox i Moxfield do Mana Screw',
    description:
      'Przenieś kolekcję kart MTG z ManaBox (plik CSV z klaserami), Moxfield, Archidekt lub listy tekstowej. Ceny w PLN i oferta sprzedaży po polsku.',
    h1: 'Import kolekcji kart MTG z ManaBox, Moxfield i Archidekt',
    lead:
      'Masz już kolekcję w innej aplikacji? Nie musisz wpisywać kart od nowa. Mana Screw wczytuje eksport z ManaBox razem z klaserami, a także listy z Moxfield, Archidekt i zwykłe pliki tekstowe.',
    sections: [
      {
        h2: 'Import z ManaBox krok po kroku',
        steps: [
          'W ManaBox wyeksportuj kolekcję do pliku CSV.',
          'W Mana Screw otwórz kolekcję Magic: The Gathering i wybierz import.',
          'Wskaż plik CSV. Aplikacja rozpozna format, wydania, foile, stan i język kart.',
          'Zdecyduj, czy zachować klasery z ManaBox. Brakujące klasery zostaną utworzone, istniejące dopasowane po nazwie.'
        ]
      },
      {
        h2: 'Inne formaty',
        list: [
          'Listy tekstowe w formacie „1x Nazwa (dodatek) numer”, takie jak eksport z Moxfield, Archidekt czy Deckstats.',
          'Zwykła lista nazw kart, po jednej w linii.',
          'Talie importujesz osobno: wklej listę albo wczytaj plik z Moxfield lub Archidekt.'
        ]
      },
      {
        h2: 'Co zyskujesz po przeniesieniu kolekcji',
        list: [
          'Ceny kart i wartość kolekcji w złotówkach.',
          'Publiczną ofertę sprzedaży pod jednym linkiem i mapę graczy z okolicy.',
          'Kolekcje Pokémon TCG i Disney Lorcana na tym samym koncie.',
          'Eksport w każdej chwili, więc dane zawsze są Twoje.'
        ]
      }
    ],
    faq: [
      { q: 'Czy import z ManaBox zachowa moje klasery?', a: 'Tak, jeśli zaznaczysz tę opcję. Klasery z pliku CSV zostaną odtworzone w Mana Screw.' },
      { q: 'Czy mogę wrócić do innej aplikacji?', a: 'Tak. Kolekcję wyeksportujesz do pliku tekstowego zgodnego z Moxfield i Archidekt.' },
      { q: 'Czy import działa dla Pokémon i Lorcany?', a: 'Import z pliku działa na razie dla Magic: The Gathering. Karty Pokémon i Lorcany dodasz wyszukiwarką, a Lorcanę także skanerem.' }
    ],
    updated: '2026-10-28'
  },
  {
    slug: 'talie-commander',
    nav: 'Talie Commander',
    title: 'Talie Commander (EDH): bracket, EDHREC i analiza | Mana Screw',
    description:
      'Buduj talie Commander i inne talie MTG: szacowany bracket, Game Changers, podpowiedzi z EDHREC, combo, krzywa many, legalność i wartość talii w PLN.',
    h1: 'Budowanie talii Commander (EDH) i innych formatów MTG',
    lead:
      'Deck builder w Mana Screw pomaga złożyć talię Commander i sprawdzić, na jakim poziomie mocy gra. Obsługuje też formaty papierowe, takie jak Modern, Standard czy Pauper, oraz formaty MTG Arena.',
    sections: [
      {
        h2: 'Analiza talii Commander',
        list: [
          'Szacowany bracket (1–5) na podstawie Game Changers, combo i kart przyspieszających.',
          'Combo w talii i combo, którym brakuje jednej karty, z bazy Commander Spellbook.',
          'Podpowiedzi kart dla wybranego dowódcy z EDHREC.',
          'Krzywa many, rozkład kolorów, liczba lądów i typów kart.'
        ]
      },
      {
        h2: 'Legalność i formaty',
        paragraphs: [
          'Talia sprawdza legalność kart i limit kopii w wybranym formacie. Talie do MTG Arena pokazują koszt w wildcardach i kopiują się do gry jednym przyciskiem.'
        ]
      },
      {
        h2: 'Talie a kolekcja',
        paragraphs: [
          'Karty do talii możesz dobierać z całej bazy albo tylko z własnej kolekcji, a talia pokazuje swoją wartość rynkową w złotówkach. Talię udostępnisz linkiem: inni gracze zobaczą pełną listę kart bez zakładania konta.'
        ]
      }
    ],
    faq: [
      { q: 'Co to jest bracket w Commander?', a: 'To oficjalna skala mocy talii Commander od 1 do 5. Pomaga dobrać przeciwników o podobnym poziomie gry.' },
      { q: 'Czy mogę zaimportować talię z Moxfield?', a: 'Tak. Wklej listę kart albo wczytaj plik wyeksportowany z Moxfield lub Archidekt.' },
      { q: 'Czy mogę udostępnić talię znajomym?', a: 'Tak. Każda talia może mieć publiczny link, który działa bez logowania.' }
    ],
    updated: '2026-10-28'
  },
  {
    slug: 'kolekcja-pokemon',
    nav: 'Pokémon TCG',
    title: 'Kolekcja kart Pokémon TCG z cenami w PLN | Mana Screw',
    description:
      'Darmowa aplikacja do kolekcji kart Pokémon TCG: wyszukiwarka kart, klasery, lista życzeń, oferta sprzedaży i ceny z Cardmarket w złotówkach.',
    h1: 'Aplikacja do kolekcji kart Pokémon TCG',
    lead:
      'Mana Screw to nie tylko Magic. Na tym samym koncie prowadzisz osobną kolekcję kart Pokémon TCG z cenami przeliczonymi na złotówki.',
    sections: [
      {
        h2: 'Co możesz zrobić',
        list: [
          'Wyszukać kartę po nazwie, dodatku i numerze, a potem wybrać konkretne wydanie.',
          'Podzielić kolekcję na klasery i rozróżniać wersje zwykłe i reverse holo.',
          'Śledzić wartość kolekcji w PLN na podstawie cen z Cardmarket (zapasowo z TCGplayer).',
          'Prowadzić listę życzeń i wystawić karty na sprzedaż pod jednym linkiem.'
        ]
      },
      {
        h2: 'Jedno konto, trzy gry',
        paragraphs: [
          'Magic: The Gathering, Pokémon TCG i Disney Lorcana mają osobne kolekcje, klasery, listy życzeń i oferty. Między grami przełączasz się jednym kliknięciem, a wiadomości i profil są wspólne.'
        ]
      }
    ],
    faq: [
      { q: 'Czy mogę skanować karty Pokémon aparatem?', a: 'Jeszcze nie. Skaner działa dla Magic: The Gathering i Disney Lorcana. Karty Pokémon dodasz wyszukiwarką.' },
      { q: 'Skąd pochodzą ceny kart Pokémon?', a: 'Z Cardmarket, a gdy ich brakuje, z TCGplayer. Ceny są przeliczane na złotówki po kursie NBP.' }
    ],
    updated: '2026-10-28'
  },
  {
    slug: 'kolekcja-lorcana',
    nav: 'Disney Lorcana',
    title: 'Kolekcja kart Disney Lorcana i skaner kart | Mana Screw',
    description:
      'Darmowa aplikacja do kolekcji kart Disney Lorcana: skaner kart w telefonie, klasery, lista życzeń, oferta sprzedaży i ceny w złotówkach.',
    h1: 'Aplikacja do kolekcji kart Disney Lorcana',
    lead:
      'Prowadź kolekcję Disney Lorcana w telefonie: zeskanuj karty aparatem, sprawdź ich wartość w złotówkach i wystaw duplikaty na sprzedaż.',
    sections: [
      {
        h2: 'Skaner kart Lorcana',
        paragraphs: [
          'Nakieruj aparat na kartę, a aplikacja rozpozna ją razem z wydaniem i doda do kolekcji. Skanowanie jest bezpłatne i bez limitu.'
        ]
      },
      {
        h2: 'Kolekcja i handel',
        list: [
          'Klasery oraz wydania zwykłe i Enchanted.',
          'Wartość kolekcji w PLN na podstawie cen z TCGplayer po kursie NBP.',
          'Lista życzeń i publiczna oferta sprzedaży pod jednym linkiem.'
        ]
      }
    ],
    faq: [
      { q: 'Czy aplikacja do Lorcany jest darmowa?', a: 'Tak. Mana Screw jest bezpłatny dla wszystkich obsługiwanych gier.' },
      { q: 'Czy mogę mieć na jednym koncie Lorcanę i Magic?', a: 'Tak. Każda gra ma osobną kolekcję, a przełączasz się między nimi jednym kliknięciem.' }
    ],
    updated: '2026-10-28'
  }
];

const GUIDE_BY_SLUG = new Map(GUIDES.map((g) => [g.slug, g]));

export function getGuide(slug: string): Guide | undefined {
  return GUIDE_BY_SLUG.get(slug);
}

const GUIDE_STYLE = `<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0c0a09;color:#d6d3d1;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#fbbf24}
.wrap{max-width:46rem;margin:0 auto;padding:0 16px}
header{border-bottom:1px solid #1c1917}
header .wrap{display:flex;align-items:center;gap:12px;padding-top:14px;padding-bottom:14px}
.brand{display:flex;align-items:center;gap:10px;color:#fafaf9;font-weight:700;text-decoration:none}
.cta{display:inline-block;background:#fbbf24;color:#0c0a09;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px}
header .cta{margin-left:auto;padding:8px 14px;font-size:14px}
main{padding:32px 0 48px}
h1{color:#fafaf9;font-size:clamp(28px,5vw,38px);line-height:1.15;margin:8px 0 14px;letter-spacing:-.01em}
h2{color:#f5f5f4;font-size:21px;margin:36px 0 10px}
h3{color:#e7e5e4;font-size:16px;margin:18px 0 4px}
.lead{font-size:18px;color:#a8a29e}
p,li{color:#a8a29e}
ul,ol{padding-left:22px}li{margin:6px 0}
.crumbs{font-size:13px;color:#78716c}
.crumbs a{color:#a8a29e}
.box{margin:40px 0 0;padding:20px;border-radius:12px;background:#1c1917}
.box p{margin:0 0 14px;color:#d6d3d1}
nav.guides{border-top:1px solid #1c1917;padding:24px 0;font-size:14px}
nav.guides ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px 18px}
footer{font-size:12px;color:#78716c;padding:0 0 32px}
footer p{color:#78716c}
</style>`;

/** Nawigacja po poradnikach: linki widoczne na każdej stronie poradnika. */
export function guidesNavHtml(current?: string): string {
  const items = GUIDES.map((g) =>
    g.slug === current ? `<li><strong>${esc(g.nav)}</strong></li>` : `<li><a href="/${g.slug}">${esc(g.nav)}</a></li>`
  ).join('');
  return `<ul>${items}</ul>`;
}

function sectionHtml(s: GuideSection): string {
  const parts = [`<h2>${esc(s.h2)}</h2>`];
  for (const p of s.paragraphs || []) parts.push(`<p>${esc(p)}</p>`);
  if (s.steps?.length) parts.push(`<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`);
  if (s.list?.length) parts.push(`<ul>${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
  return parts.join('\n');
}

/** Pełny, samodzielny dokument HTML poradnika (bez skryptów aplikacji). */
export function renderGuide(g: Guide): string {
  const path = `/${g.slug}`;
  const meta: PageMeta = {
    title: g.title,
    description: g.description,
    path,
    type: 'article',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: g.nav, item: `${SITE_URL}${path}` }
        ]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
      }
    ]
  };

  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1c1917" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    ${headTags(meta)}
    ${GUIDE_STYLE}
  </head>
  <body>
    <header><div class="wrap">
      <a class="brand" href="/"><img src="/logo.webp" alt="" width="32" height="32" />${SITE_NAME}</a>
      <a class="cta" href="/">Otwórz aplikację</a>
    </div></header>
    <main class="wrap">
      <div class="crumbs"><a href="/">${SITE_NAME}</a> / ${esc(g.nav)}</div>
      <article>
        <h1>${esc(g.h1)}</h1>
        <p class="lead">${esc(g.lead)}</p>
        ${g.sections.map(sectionHtml).join('\n')}
        <h2>Najczęstsze pytania</h2>
        ${g.faq.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}
      </article>
      <div class="box">
        <p>Mana Screw jest bezpłatny. Wystarczy e-mail i hasło, jedno konto obejmuje Magic: The Gathering, Pokémon TCG i Disney Lorcana.</p>
        <a class="cta" href="/">Załóż darmowe konto</a>
      </div>
    </main>
    <div class="wrap">
      <nav class="guides" aria-label="Poradniki">${guidesNavHtml(g.slug)}</nav>
      <footer>
        <p>Mana Screw nie jest powiązany z Wizards of the Coast, Nintendo, The Pokémon Company, Disney ani Ravensburger. Nazwy gier i kart są znakami towarowymi ich właścicieli. Dane kart: Scryfall, TCGdex, Lorcast. Ceny: Cardmarket i TCGplayer.</p>
      </footer>
    </div>
  </body>
</html>
`;
}
