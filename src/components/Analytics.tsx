import { PageHeader } from './ui/PageHeader';
import React, { useMemo, useState } from 'react';
import { CollectionItem, AppSettings } from '../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError } from '../utils/formatters';
import { computeValueChange, itemValue } from '../hooks/useCollectionStats';
import { CollectionHistoryPanel } from './CollectionHistoryModal';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { 
  BarChart3, 
  Coins, 
  TrendingUp,
  TrendingDown,
  LineChart,
  Award, 
  Sparkles, 
  Flame, 
  Layers, 
  PieChart as PieIcon 
} from 'lucide-react';
import { useT, locale } from '../i18n';

const MOVERS_LIMIT = 20;

/** Lądy (wszystkie, nie tylko podstawowe) nie wliczają się do kolorów ani krzywej many. Przy kartach dwustronnych liczy się przednia strona. */
const isLand = (typeLine?: string) => /\bland\b/i.test((typeLine || '').split('//')[0]);

type Mover = { item: CollectionItem; now: number; before: number; delta: number; pct: number | null };

interface AnalyticsProps {
  collection: CollectionItem[];
  settings: AppSettings;
  onViewCardDetails: (item: CollectionItem) => void;
}

export const Analytics: React.FC<AnalyticsProps> = ({ collection, settings, onViewCardDetails }) => {
  const t = useT();
  
  // Overall metrics
  const stats = useMemo(() => {
    let totalCards = 0;
    let totalValue = 0;
    const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, Multi: 0 };
    const cmcCounts: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
    const rarityCounts: Record<string, number> = { Mythic: 0, Rare: 0, Uncommon: 0, Common: 0, Inne: 0 };

    collection.forEach(item => {
      const card = item.card;
      if (!card) return;

      const qty = item.quantity + item.quantityFoil;
      totalCards += qty;

      const priceNorm = getCardPrice(card, false, settings);
      const priceFoil = getCardPrice(card, true, settings);

      totalValue += (item.quantity * priceNorm) + (item.quantityFoil * priceFoil);

      // Rzadkość liczymy dla wszystkich kart; kolory i krzywą many bez lądów
      const rarity = card.rarity ? card.rarity.toLowerCase() : 'common';
      if (rarity === 'mythic') rarityCounts['Mythic'] += qty;
      else if (rarity === 'rare') rarityCounts['Rare'] += qty;
      else if (rarity === 'uncommon') rarityCounts['Uncommon'] += qty;
      else if (rarity === 'common') rarityCounts['Common'] += qty;
      else rarityCounts['Inne'] += qty;

      if (isLand(card.type_line)) return;

      // CMC breakdown
      const cmc = Math.floor(card.cmc || 0);
      if (cmc >= 6) {
        cmcCounts['6+'] += qty;
      } else {
        cmcCounts[String(cmc)] = (cmcCounts[String(cmc)] || 0) + qty;
      }

      // Colors breakdown
      const colors = card.colors || [];
      if (colors.length === 0) {
        colorCounts['C'] += qty;
      } else if (colors.length > 1) {
        colorCounts['Multi'] += qty;
      } else {
        const c = colors[0];
        if (colorCounts[c] !== undefined) colorCounts[c] += qty;
      }
    });

    return {
      totalCards,
      uniqueCards: collection.length,
      totalValue,
      colorCounts,
      cmcCounts,
      rarityCounts
    };
  }, [collection, settings]);

  // Najcenniejsze karty: ranking po cenie jednej sztuki (liczba egzemplarzy nie ma znaczenia)
  const topValuable = useMemo(() => {
    return collection
      .filter(item => item.card)
      .map(item => {
        const priceNorm = item.quantity > 0 ? getCardPrice(item.card, false, settings) : 0;
        const priceFoil = item.quantityFoil > 0 ? getCardPrice(item.card, true, settings) : 0;
        const unitPrice = Math.max(priceNorm, priceFoil);
        return { item, unitPrice };
      })
      .filter(row => row.unitPrice > 0)
      .sort((a, b) => b.unitPrice - a.unitPrice)
      .slice(0, 5);
  }, [collection, settings]);

  // Recharts Data Formats
  const cmcChartData = [
    { cmc: 'CMC 0', ilosc: stats.cmcCounts['0'] },
    { cmc: 'CMC 1', ilosc: stats.cmcCounts['1'] },
    { cmc: 'CMC 2', ilosc: stats.cmcCounts['2'] },
    { cmc: 'CMC 3', ilosc: stats.cmcCounts['3'] },
    { cmc: 'CMC 4', ilosc: stats.cmcCounts['4'] },
    { cmc: 'CMC 5', ilosc: stats.cmcCounts['5'] },
    { cmc: 'CMC 6+', ilosc: stats.cmcCounts['6+'] },
  ];

  const colorChartData = [
    { name: t('Biały (W)'), value: stats.colorCounts.W, color: '#fef3c7' },
    { name: t('Niebieski (U)'), value: stats.colorCounts.U, color: '#2563eb' },
    { name: t('Czarny (B)'), value: stats.colorCounts.B, color: '#44403c' },
    { name: t('Czerwony (R)'), value: stats.colorCounts.R, color: '#dc2626' },
    { name: t('Zielony (G)'), value: stats.colorCounts.G, color: '#16a34a' },
    { name: t('Bezbarwne (C)'), value: stats.colorCounts.C, color: '#a8a29e' },
    { name: t('Wielobarwne'), value: stats.colorCounts.Multi, color: '#d97706' },
  ].filter(d => d.value > 0);

  const rarityChartData = [
    { name: 'Mythic', value: stats.rarityCounts.Mythic, color: '#f59e0b' },
    { name: 'Rare', value: stats.rarityCounts.Rare, color: '#eab308' },
    { name: 'Uncommon', value: stats.rarityCounts.Uncommon, color: '#cbd5e1' },
    { name: 'Common', value: stats.rarityCounts.Common, color: '#78716c' },
  ].filter(d => d.value > 0);

  // Zmiana wartości względem cen sprzed ostatniej aktualizacji
  const change = useMemo(() => computeValueChange(collection, settings), [collection, settings]);
  const movers = useMemo(() => {
    const list = collection
      .filter(item => item.card && item.previousPrices)
      .map(item => {
        const now = itemValue(item, settings);
        const before = itemValue(item, settings, item.previousPrices!);
        return { item, now, before, delta: now - before, pct: before > 0 ? ((now - before) / before) * 100 : null };
      })
      .filter(m => Math.abs(m.delta) >= 0.005);
    const up = list.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, MOVERS_LIMIT);
    const down = list.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, MOVERS_LIMIT);
    return { up, down };
  }, [collection, settings]);
  const [moversSide, setMoversSide] = useState<'up' | 'down'>('up');
  const hasChange = change.valueChange !== null;
  const changeSign = !hasChange || Math.abs(change.valueChange!) < 0.005 ? 0 : change.valueChange! > 0 ? 1 : -1;
  const changeColor = changeSign > 0 ? 'text-emerald-400' : changeSign < 0 ? 'text-rose-400' : 'text-stone-200';
  const ChangeIcon = changeSign < 0 ? TrendingDown : TrendingUp;
  const fmtDelta = (v: number) => `${v > 0 ? '+' : ''}${formatCurrency(v, settings.currency)}`;

  return (
    <div className="space-y-6">
      
      <PageHeader title={t('Statystyki')} description={t('Wartość kolekcji, kolory, krzywa many i rzadkość kart.')} />

      <div className="grid grid-cols-2 lg:grid-cols-3 rounded-xl border border-stone-800 bg-stone-900 [&>*]:p-4">
        <div className="space-y-1 border-stone-800">
          <p className="text-sm text-stone-400">{t('Karty')}</p>
          <p className="text-2xl font-semibold text-stone-50 tabular-nums">{stats.totalCards}</p>
          <p className="text-xs text-stone-500">{t('{n} różnych pozycji', { n: stats.uniqueCards })}</p>
        </div>
        <div className="space-y-1 border-l border-stone-800">
          <p className="text-sm text-stone-400">{t('Wartość')}</p>
          <p className="text-2xl font-semibold text-stone-50 tabular-nums">{formatCurrency(stats.totalValue, settings.currency)}</p>
          <p className="text-xs text-stone-500">{settings.pricingSource === 'CARDMARKET' ? t('Cardmarket Trend') : 'TCGPlayer Market'}</p>
        </div>
        <div className="space-y-1 col-span-2 lg:col-span-1 border-t lg:border-t-0 lg:border-l border-stone-800">
          <p className="text-sm text-stone-400 flex items-center gap-1.5">
            <ChangeIcon className={`w-4 h-4 ${changeColor}`} />
            {t('Zmiana wartości')}
          </p>
          <p className={`text-2xl font-semibold tabular-nums ${hasChange ? changeColor : 'text-stone-500'}`}>
            {hasChange ? fmtDelta(change.valueChange!) : '—'}
            {change.valueChangePercent !== null && changeSign !== 0 && (
              <span className="ml-1.5 text-sm font-medium opacity-80">
                ({change.valueChangePercent > 0 ? '+' : ''}{change.valueChangePercent.toFixed(1).replace('.', locale() === 'pl-PL' ? ',' : '.')}%)
              </span>
            )}
          </p>
          <p className="text-xs text-stone-500">
            {hasChange
              ? t('Od poprzednich cen') + (change.lastPriceChangeAt ? ` (${new Date(change.lastPriceChangeAt).toLocaleDateString(locale())})` : '')
              : t('Pojawi się po odświeżeniu cen')}
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Mana Curve (CMC) Bar Chart */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-200 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>{t('Krzywa many')}</span>
            </h3>
            <span className="text-[11px] text-stone-500">{t('Bez lądów')}</span>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cmcChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="cmc" stroke="#78716c" fontSize={11} tickLine={false} />
                <YAxis stroke="#78716c" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1c1917', borderColor: '#44403c', borderRadius: '0.75rem', color: '#f5f5f4' }}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                />
                <Bar dataKey="ilosc" fill="#f59e0b" radius={[6, 6, 0, 0]} name={t('Liczba kart')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Color Pie Chart */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-200 flex items-center gap-1.5">
              <PieIcon className="w-4 h-4 text-amber-400" />
              <span>{t('Kolory kart')}</span>
            </h3>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={colorChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                >
                  {colorChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1c1917', borderColor: '#44403c', borderRadius: '0.75rem', color: '#f5f5f4' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#d6d3d1' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-stone-500 text-center">{t('Lądy nie są wliczane do statystyki kolorów.')}</p>
        </div>

      </div>

      {/* Top 5 Most Valuable Cards */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-200 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <span>{t('Najcenniejsze karty')}</span>
          </h3>
          <span className="text-[11px] text-stone-500">{t('Cena za 1 sztukę')}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pt-2">
          {topValuable.map(({ item, unitPrice }, index) => {
            const card = item.card;
            const img = getCardImageUri(card, 'normal');

            return (
              <div
                key={item.id}
                onClick={() => onViewCardDetails(item)}
                className="group bg-stone-950 p-3 rounded-xl border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between space-y-3"
              >
                <div className="relative aspect-[488/680] rounded-lg overflow-hidden bg-stone-900">
                  <img 
                    src={img} 
                    alt={card.name} 
                    referrerPolicy="no-referrer"
                    onError={(e) => handleCardImageError(e, img)}
                    className="w-full h-full object-contain transition-transform" 
                  />
                  <div className="absolute top-1 left-1 bg-amber-500 text-stone-950 font-bold text-[11px] w-5 h-5 rounded-full flex items-center justify-center shadow">
                    #{index + 1}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-xs text-stone-100 group-hover:text-amber-300 line-clamp-1 transition-colors">
                    {card.name}
                  </h4>
                  <p className="text-[11px] text-stone-400 tabular-nums mt-0.5">
                    {card.set.toUpperCase()} • {item.quantity + item.quantityFoil} {t('szt.')}
                  </p>
                  <p className="text-xs tabular-nums font-bold text-emerald-400 mt-1">
                    {formatCurrency(unitPrice, settings.currency)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Największe zmiany cen od ostatniego odświeżenia */}
      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-stone-100 flex items-center gap-2">
              <ChangeIcon className={`w-5 h-5 ${changeSign < 0 ? 'text-rose-400' : 'text-emerald-400'}`} />
              {t('Największe zmiany')}
            </h3>
            <p className="text-sm text-stone-400 mt-0.5">
              {t('Karty z kolekcji, które najwięcej zyskały i straciły od ostatniego odświeżenia cen')}
              {change.lastPriceChangeAt ? ` (${new Date(change.lastPriceChangeAt).toLocaleDateString(locale())})` : ''}.
            </p>
          </div>
          {(movers.up.length > 0 || movers.down.length > 0) && (
            <div className="lg:hidden inline-grid grid-cols-2 p-1 rounded-lg bg-stone-950 ring-1 ring-stone-800" role="tablist" aria-label={t('Kierunek zmiany')}>
              {([
                ['up', `${t('Zyskały')} (${movers.up.length})`],
                ['down', `${t('Straciły')} (${movers.down.length})`]
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={moversSide === id}
                  onClick={() => setMoversSide(id)}
                  className={`h-8 px-3 rounded-md text-sm cursor-pointer ${moversSide === id ? 'bg-stone-800 text-stone-50 font-medium' : 'text-stone-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {movers.up.length === 0 && movers.down.length === 0 ? (
          <p className="text-sm text-stone-400 py-6 text-center">
            {hasChange ? t('Od ostatniego odświeżenia ceny kart się nie zmieniły.') : t('Zmiany pojawią się po pierwszym odświeżeniu cen.')}
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            {([
              ['up', t('Zyskały'), movers.up],
              ['down', t('Straciły'), movers.down]
            ] as const).map(([id, title, list]) => (
              <div key={id} className={moversSide === id ? '' : 'max-lg:hidden'}>
                <h4 className={`hidden lg:flex items-center gap-1.5 text-sm font-medium mb-2 ${id === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {id === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {title}
                  <span className="text-stone-500 font-normal tabular-nums">{list.length}</span>
                </h4>
                {list.length === 0 ? (
                  <p className="text-sm text-stone-500 py-3">{id === 'up' ? t('Żadna karta nie zdrożała.') : t('Żadna karta nie potaniała.')}</p>
                ) : (
                  <ol className="divide-y divide-stone-800/80">
                    {(list as Mover[]).map((m, i) => (
                      <MoverRow key={m.item.id} mover={m} rank={i + 1} currency={settings.currency} fmtDelta={fmtDelta} onOpen={() => onViewCardDetails(m.item)} />
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Historia wartości kolekcji (to samo co w oknie po kliknięciu wartości kolekcji) */}
      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-stone-100 flex items-center gap-2">
            <LineChart className="w-5 h-5 text-amber-400" />
            {t('Historia kolekcji')}
          </h3>
          <p className="text-sm text-stone-400 mt-0.5">{t('Wartość i liczba kart dzień po dniu.')}</p>
        </div>
        <CollectionHistoryPanel currency={settings.currency} />
      </section>

    </div>
  );
};

const MoverRow: React.FC<{
  mover: Mover;
  rank: number;
  currency: string;
  fmtDelta: (v: number) => string;
  onOpen: () => void;
}> = ({ mover, rank, currency, fmtDelta, onOpen }) => {
  const t = useT();
  const { item, now, before, delta, pct } = mover;
  const img = getCardImageUri(item.card, 'small') || getCardImageUri(item.card, 'normal');
  const qty = item.quantity + item.quantityFoil;
  const up = delta > 0;
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg text-left hover:bg-stone-800/70 cursor-pointer">
        <span className="w-5 shrink-0 text-xs text-stone-500 tabular-nums text-right">{rank}</span>
        <span className="w-9 shrink-0 aspect-[488/680] rounded overflow-hidden bg-stone-800">
          {img && <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, img)} className="w-full h-full object-contain" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-stone-100 truncate">{item.card.name}</span>
          <span className="block text-xs text-stone-500 truncate tabular-nums">
            <span className="max-sm:hidden">
              {item.card.set.toUpperCase()}
              {qty > 1 && <> · {qty} {t('szt.')}</>}
              {item.quantityFoil > 0 && <> {t('· foil')}</>}
              {' · '}
            </span>
            {qty > 1 && <span className="sm:hidden">{qty} {t('szt.')} · </span>}
            {formatCurrency(before, currency)} → <span className="text-stone-300">{formatCurrency(now, currency)}</span>
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className={`block text-sm font-medium ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtDelta(delta)}</span>
          {pct !== null && (
            <span className={`block text-xs ${up ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
              {pct > 0 ? '+' : ''}
              {Math.abs(pct) >= 100 ? Math.round(pct) : pct.toFixed(1).replace('.', ',')}%
            </span>
          )}
        </span>
      </button>
    </li>
  );
};
