import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Sparkles, Loader2, AlertCircle, Info, FolderHeart, Layers, RefreshCw } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { AppSettings, CollectionItem, PriceAlertFormat, PriceMover, PriceMoversResponse, ScryfallCard, WishlistItem } from '../types';
import { convertEur, formatCurrency, getCardImageUri, handleCardImageError } from '../utils/formatters';
import { priceMoversApi } from '../services/api';
import { useT, locale, tk } from '../i18n';

interface PriceAlertsProps {
  settings: AppSettings;
  collection: CollectionItem[];
  wishlist: WishlistItem[];
  onSelectCard: (card: ScryfallCard) => void;
}

const FORMATS: Array<{ id: PriceAlertFormat; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'pioneer', label: 'Pioneer' },
  { id: 'modern', label: 'Modern' },
  { id: 'pauper', label: 'Pauper' },
  { id: 'legacy', label: 'Legacy' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'commander', label: 'Commander' },
  { id: 'historic', label: 'Historic' },
  { id: 'brawl', label: 'Brawl' },
  { id: 'premodern', label: 'Premodern' }
];
const PERIODS: Array<{ days: number; label: string }> = [
  { days: 1, label: tk('24 godziny') },
  { days: 7, label: tk('7 dni') },
  { days: 30, label: tk('30 dni') },
  { days: 90, label: tk('90 dni') }
];
const MIN_PRICES = [0.5, 1, 2, 5, 10, 20];
const MIN_CHANGES = [10, 15, 25, 50, 100];
const VISIBLE_ROWS = 15;

interface Filters {
  format: PriceAlertFormat;
  days: number;
  foil: boolean;
  min: number;
  pct: number;
  mineOnly: boolean;
}
const DEFAULT_FILTERS: Filters = { format: 'modern', days: 7, foil: false, min: 1, pct: 15, mineOnly: false };
const FILTERS_KEY = 'mtg_price_alerts_filters';

function loadFilters(): Filters {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      const f = { ...DEFAULT_FILTERS, ...saved };
      if (!FORMATS.some((x) => x.id === f.format)) f.format = DEFAULT_FILTERS.format;
      if (!PERIODS.some((x) => x.days === f.days)) f.days = DEFAULT_FILTERS.days;
      if (!MIN_PRICES.includes(f.min)) f.min = DEFAULT_FILTERS.min;
      if (!MIN_CHANGES.includes(f.pct)) f.pct = DEFAULT_FILTERS.pct;
      return f;
    }
  } catch {}
  return DEFAULT_FILTERS;
}

function formatPct(pct: number): string {
  const abs = Math.abs(pct).toLocaleString(locale(), { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 });
  return `${pct > 0 ? '+' : '-'}${abs}%`;
}

/** Mały wykres notowań z okresu. */
const Sparkline: React.FC<{ values: number[]; up: boolean }> = ({ values, up }) => {
  const pts = values.filter((v) => v > 0);
  if (pts.length < 2) return <span className="w-16 h-6 shrink-0" aria-hidden="true" />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 64;
  const h = 24;
  const path = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-16 h-6 shrink-0 ${up ? 'text-emerald-400' : 'text-rose-400'}`} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/** Przycisk-pigułka (format, okres, wersja). */
const Chip: React.FC<{ active: boolean; disabled?: boolean; title?: string; onClick: () => void; children: React.ReactNode }> = ({
  active,
  disabled,
  title,
  onClick,
  children
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-pressed={active}
    className={`h-9 px-3.5 rounded-xl border text-sm font-semibold whitespace-nowrap transition-colors ${
      active
        ? 'bg-amber-500 text-stone-950 border-amber-400'
        : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700 hover:text-stone-100'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    {children}
  </button>
);

export const PriceAlerts: React.FC<PriceAlertsProps> = ({ settings, collection, wishlist, onSelectCard }) => {
  const t = useT();
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [data, setData] = useState<PriceMoversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [mobileSide, setMobileSide] = useState<'up' | 'down'>('up');
  const [expanded, setExpanded] = useState<{ up: boolean; down: boolean }>({ up: false, down: false });

  const update = (patch: Partial<Filters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setExpanded({ up: false, down: false });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    priceMoversApi
      .get({ format: filters.format, days: filters.days, finish: filters.foil ? 'foil' : 'normal', min: filters.min, pct: filters.pct })
      .then((res) => alive && setData(res))
      .catch((err) => alive && setError(err?.message || t('Nie udało się pobrać alertów cenowych.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters.format, filters.days, filters.foil, filters.min, filters.pct, reloadKey]);

  // Twoje karty: liczba egzemplarzy w kolekcji i lista życzeń, po nazwie (każde wydanie)
  const owned = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of collection) {
      const name = item.card?.name?.toLowerCase();
      if (name) m.set(name, (m.get(name) || 0) + (item.quantity || 0) + (item.quantityFoil || 0));
    }
    return m;
  }, [collection]);
  const wished = useMemo(() => new Set(wishlist.map((w) => w.card?.name?.toLowerCase()).filter(Boolean) as string[]), [wishlist]);
  const isMine = (card: ScryfallCard) => owned.has(card.name.toLowerCase()) || wished.has(card.name.toLowerCase());

  const lists = useMemo(() => {
    const pick = (l: PriceMover[]) => (filters.mineOnly ? l.filter((m) => isMine(m.card)) : l);
    return { up: pick(data?.gainers || []), down: pick(data?.losers || []) };
  }, [data, filters.mineOnly, owned, wished]);

  const coverage = data?.coverageDays ?? 0;
  const ready = Boolean(data?.ready);
  const dayLabel = data?.day ? new Date(`${data.day}T12:00:00Z`).toLocaleDateString(locale(), { dateStyle: 'long' }) : null;

  const minLabel = (eur: number) => {
    const local = formatCurrency(convertEur(eur, settings), settings.currency);
    return settings.currency === 'EUR' ? local : `${eur.toLocaleString(locale())} € (${local})`;
  };

  const renderRow = (m: PriceMover, idx: number, up: boolean) => {
    const name = m.card.name.toLowerCase();
    const count = owned.get(name) || 0;
    return (
      <li key={m.card.id}>
        <button
          type="button"
          onClick={() => onSelectCard(m.card)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-stone-800/60 focus-visible:bg-stone-800/60 transition-colors cursor-pointer"
        >
          <span className="hidden sm:block w-5 text-right text-[11px] font-bold text-stone-500 tabular-nums shrink-0">{idx + 1}</span>
          <img
            src={getCardImageUri(m.card, 'small')}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => handleCardImageError(e, getCardImageUri(m.card, 'small'))}
            className="w-10 h-14 rounded-md object-cover bg-stone-950 shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-stone-100 truncate">{m.card.name}</span>
            <span className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="text-[11px] text-stone-400 truncate max-w-[12rem]" title={m.card.set_name}>
                <span className="font-bold tabular-nums text-stone-300">{m.card.set.toUpperCase()}</span> #{m.card.collector_number}
              </span>
              {filters.foil && (
                <span className="ms-foil-chip text-[11px] font-semibold px-1.5 rounded inline-flex items-center gap-0.5">
                  <Sparkles className="w-3 h-3" />
                  {t('Foil')}
                </span>
              )}
              {count > 0 && (
                <span className="text-[11px] font-semibold px-1.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {t('Masz {n}', { n: count })}
                </span>
              )}
              {wished.has(name) && (
                <span className="text-[11px] font-semibold px-1.5 rounded bg-stone-800 text-stone-300 border border-stone-700 inline-flex items-center gap-1">
                  <FolderHeart className="w-3 h-3" />
                  {t('Lista życzeń')}
                </span>
              )}
            </span>
          </span>
          <span className="hidden sm:block">
            <Sparkline values={m.series} up={up} />
          </span>
          <span className="text-right shrink-0 sm:w-[5.5rem]">
            <span className="block text-sm font-bold text-stone-100 tabular-nums">{formatCurrency(convertEur(m.to, settings), settings.currency)}</span>
            <span className="block text-[11px] text-stone-500 tabular-nums">
              {t('było')} {formatCurrency(convertEur(m.from, settings), settings.currency)}
            </span>
            {/* telefon: zmiana pod ceną */}
            <span className={`sm:hidden block text-xs font-bold tabular-nums ${up ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPct(m.pct)}</span>
          </span>
          <span
            className={`hidden sm:block shrink-0 w-[4.25rem] text-center text-xs font-bold tabular-nums rounded-lg px-1.5 py-1 border ${
              up ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-300 bg-rose-500/10 border-rose-500/30'
            }`}
          >
            {formatPct(m.pct)}
          </span>
        </button>
      </li>
    );
  };

  const renderColumn = (side: 'up' | 'down') => {
    const up = side === 'up';
    const list = lists[side];
    const shown = expanded[side] ? list : list.slice(0, VISIBLE_ROWS);
    const Icon = up ? TrendingUp : TrendingDown;
    return (
      <section
        aria-label={up ? t('Wzrosty') : t('Spadki')}
        className={`bg-stone-900 border border-stone-800 rounded-2xl p-2 sm:p-3 ${mobileSide === side ? '' : 'hidden lg:block'}`}
      >
        <h3 className="hidden lg:flex items-center justify-between gap-2 px-3 pt-2 pb-3">
          <span className={`flex items-center gap-2 text-base font-semibold ${up ? 'text-emerald-300' : 'text-rose-300'}`}>
            <Icon className="w-4.5 h-4.5" />
            {up ? t('Wzrosty') : t('Spadki')}
          </span>
          <span className="text-xs text-stone-500 tabular-nums">{list.length}</span>
        </h3>
        {list.length === 0 ? (
          <p className="px-3 pb-4 text-sm text-stone-400">
            {filters.mineOnly
              ? t('Żadna z Twoich kart nie spełnia tych filtrów.')
              : up
                ? t('Brak kart, które zdrożały o wybrany próg. Spróbuj obniżyć próg zmiany lub ceny.')
                : t('Brak kart, które potaniały o wybrany próg. Spróbuj obniżyć próg zmiany lub ceny.')}
          </p>
        ) : (
          <>
            <ol className="space-y-0.5">{shown.map((m, i) => renderRow(m, i, up))}</ol>
            {list.length > VISIBLE_ROWS && (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [side]: !e[side] }))}
                className="btn btn-ghost w-full mt-1"
              >
                {expanded[side] ? t('Pokaż mniej') : t('Pokaż wszystkie ({n})', { n: list.length })}
              </button>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Alerty cenowe')}
        description={t('Karty, które w ostatnich dniach najmocniej zdrożały lub potaniały na Cardmarket (MCM Trend), w podziale na formaty.')}
        meta={dayLabel ? <span>{t('Ostatnie notowanie: {date}', { date: dayLabel })}</span> : undefined}
      />

      {/* Formaty */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap" role="group" aria-label={t('Format')}>
        {FORMATS.map((f) => (
          <Chip key={f.id} active={filters.format === f.id} onClick={() => update({ format: f.id })}>
            {f.label}
          </Chip>
        ))}
      </div>

      {/* Filtry */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-3 sm:p-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <span className="block text-[11px] font-bold text-stone-400 mb-1.5">{t('Okres')}</span>
          <div className="flex gap-1.5" role="group" aria-label={t('Okres')}>
            {PERIODS.map((p) => {
              // notowania na początku okresu mogą być do 2 dni późniejsze (jak na serwerze)
              const unavailable = ready && coverage + 2 < p.days;
              return (
                <Chip
                  key={p.days}
                  active={filters.days === p.days}
                  disabled={unavailable}
                  title={unavailable ? t('Za mało historii cen dla tego okresu.') : undefined}
                  onClick={() => update({ days: p.days })}
                >
                  {t(p.label)}
                </Chip>
              );
            })}
          </div>
        </div>
        <div>
          <span className="block text-[11px] font-bold text-stone-400 mb-1.5">{t('Wersja')}</span>
          <div className="flex gap-1.5" role="group" aria-label={t('Wersja')}>
            <Chip active={!filters.foil} onClick={() => update({ foil: false })}>
              {t('Zwykłe')}
            </Chip>
            <Chip active={filters.foil} onClick={() => update({ foil: true })}>
              {t('Foil')}
            </Chip>
          </div>
        </div>
        <label className="block">
          <span className="block text-[11px] font-bold text-stone-400 mb-1.5">{t('Cena od')}</span>
          <select
            value={filters.min}
            onChange={(e) => update({ min: Number(e.target.value) })}
            className="h-9 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl px-3 text-sm text-stone-100 tabular-nums focus:outline-none cursor-pointer"
          >
            {MIN_PRICES.map((v) => (
              <option key={v} value={v}>
                {minLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-stone-400 mb-1.5">{t('Zmiana o co najmniej')}</span>
          <select
            value={filters.pct}
            onChange={(e) => update({ pct: Number(e.target.value) })}
            className="h-9 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl px-3 text-sm text-stone-100 tabular-nums focus:outline-none cursor-pointer"
          >
            {MIN_CHANGES.map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2.5 h-9 text-sm text-stone-300 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.mineOnly}
            onChange={(e) => update({ mineOnly: e.target.checked })}
            className="w-4 h-4 accent-amber-500"
          />
          {t('Tylko moje karty')}
          <span className="text-[11px] text-stone-500">{t('(kolekcja i lista życzeń)')}</span>
        </label>
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn btn-secondary">
            <RefreshCw className="w-4 h-4" />
            {t('Spróbuj ponownie')}
          </button>
        </div>
      ) : loading && !data ? (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-10 flex items-center justify-center gap-2.5 text-sm text-stone-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('Wczytywanie notowań…')}
        </div>
      ) : !ready ? (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 text-sm text-stone-300 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p>
            {t('Zbieramy historię cen kart. Alerty pojawią się, gdy serwer pobierze notowania z ostatnich 90 dni (zwykle w ciągu kilkunastu minut od wdrożenia).')}
          </p>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {/* Telefon: przełącznik między wzrostami i spadkami */}
          <div className="lg:hidden grid grid-cols-2 gap-1.5 bg-stone-900 border border-stone-800 rounded-xl p-1" role="tablist">
            {(['up', 'down'] as const).map((side) => (
              <button
                key={side}
                type="button"
                role="tab"
                aria-selected={mobileSide === side}
                onClick={() => setMobileSide(side)}
                className={`h-9 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                  mobileSide === side ? 'bg-stone-800 text-stone-50' : 'text-stone-400'
                }`}
              >
                {side === 'up' ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
                {side === 'up' ? t('Wzrosty') : t('Spadki')}
                <span className="text-[11px] text-stone-500 tabular-nums">{lists[side].length}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {renderColumn('up')}
            {renderColumn('down')}
          </div>
        </div>
      )}

      <p className="text-xs text-stone-500 flex items-start gap-1.5 px-1">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {t('Ceny: Cardmarket Trend (dane Scryfall i MTGJSON), aktualizowane raz na dobę. Przy każdej karcie pokazujemy jedno wydanie, to z największą zmianą ceny.')}
      </p>
    </div>
  );
};

export default PriceAlerts;
