import React, { useMemo } from 'react';
import { CollectionItem, AppSettings } from '../types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError } from '../utils/formatters';
import { computeValueChange, itemValue } from '../hooks/useCollectionStats';
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
  Award, 
  Sparkles, 
  Flame, 
  Layers, 
  PieChart as PieIcon 
} from 'lucide-react';

interface AnalyticsProps {
  collection: CollectionItem[];
  settings: AppSettings;
  onViewCardDetails: (item: CollectionItem) => void;
}

export const Analytics: React.FC<AnalyticsProps> = ({ collection, settings, onViewCardDetails }) => {
  
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

      // Rarity breakdown
      const rarity = card.rarity ? card.rarity.toLowerCase() : 'common';
      if (rarity === 'mythic') rarityCounts['Mythic'] += qty;
      else if (rarity === 'rare') rarityCounts['Rare'] += qty;
      else if (rarity === 'uncommon') rarityCounts['Uncommon'] += qty;
      else if (rarity === 'common') rarityCounts['Common'] += qty;
      else rarityCounts['Inne'] += qty;
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

  // Top Most Valuable Cards in Collection
  const topValuable = useMemo(() => {
    return [...collection]
      .map(item => {
        const priceNorm = getCardPrice(item.card, false, settings);
        const priceFoil = getCardPrice(item.card, true, settings);
        const maxSinglePrice = Math.max(priceNorm, priceFoil);
        const totalValue = (item.quantity * priceNorm) + (item.quantityFoil * priceFoil);
        return { item, maxSinglePrice, totalValue };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
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
    { name: 'Biały (W)', value: stats.colorCounts.W, color: '#fef3c7' },
    { name: 'Niebieski (U)', value: stats.colorCounts.U, color: '#2563eb' },
    { name: 'Czarny (B)', value: stats.colorCounts.B, color: '#44403c' },
    { name: 'Czerwony (R)', value: stats.colorCounts.R, color: '#dc2626' },
    { name: 'Zielony (G)', value: stats.colorCounts.G, color: '#16a34a' },
    { name: 'Bezbarwne (C)', value: stats.colorCounts.C, color: '#a8a29e' },
    { name: 'Wielobarwne', value: stats.colorCounts.Multi, color: '#d97706' },
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
      .map(item => ({ item, delta: itemValue(item, settings) - itemValue(item, settings, item.previousPrices!) }))
      .filter(m => Math.abs(m.delta) >= 0.005);
    const up = list.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta)[0] || null;
    const down = list.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta)[0] || null;
    return { up, down };
  }, [collection, settings]);
  const hasChange = change.valueChange !== null;
  const changeSign = !hasChange || Math.abs(change.valueChange!) < 0.005 ? 0 : change.valueChange! > 0 ? 1 : -1;
  const changeColor = changeSign > 0 ? 'text-emerald-400' : changeSign < 0 ? 'text-rose-400' : 'text-stone-200';
  const ChangeIcon = changeSign < 0 ? TrendingDown : TrendingUp;
  const fmtDelta = (v: number) => `${v > 0 ? '+' : ''}${formatCurrency(v, settings.currency)}`;

  return (
    <div className="space-y-6">
      
      {/* Top Banner Overview */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <h2 className="text-xl font-bold text-stone-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-400" />
            <span>Statystyki i Analiza Kolekcji</span>
          </h2>
          <p className="text-xs text-stone-400 mt-1">
            Szczegółowa analityka wartości, struktury kolorów, krzywej many oraz rzadkości kart w Twoim klaserze.
          </p>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-1">
            <p className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Łączna Liczba Kart</span>
            </p>
            <p className="text-2xl font-bold text-amber-200">{stats.totalCards} <span className="text-xs font-normal text-stone-400">szt.</span></p>
            <p className="text-[11px] text-stone-500">{stats.uniqueCards} unikalnych wpisów</p>
          </div>

          <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-1">
            <p className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span>Wartość Rynkowa ({settings.currency})</span>
            </p>
            <p className="text-2xl font-bold text-emerald-400">{formatCurrency(stats.totalValue, settings.currency)}</p>
            <p className="text-[11px] text-stone-500">
              Wycena wg: {settings.pricingSource === 'CARDMARKET' ? 'Cardmarket Trend' : 'TCGPlayer Market'}
            </p>
          </div>

          <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-1">
            <p className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
              <ChangeIcon className={`w-3.5 h-3.5 ${changeColor}`} />
              <span>Zmiana wartości</span>
            </p>
            <p className={`text-2xl font-bold ${changeColor}`}>
              {hasChange ? fmtDelta(change.valueChange!) : '—'}
              {change.valueChangePercent !== null && changeSign !== 0 && (
                <span className="ml-1.5 text-sm font-bold opacity-80">
                  ({change.valueChangePercent > 0 ? '+' : ''}{change.valueChangePercent.toFixed(1).replace('.', ',')}%)
                </span>
              )}
            </p>
            <p className="text-[11px] text-stone-500">
              {hasChange
                ? `Względem cen sprzed ostatniej aktualizacji${change.lastPriceChangeAt ? ` (${new Date(change.lastPriceChangeAt).toLocaleDateString('pl-PL')})` : ''}`
                : 'Pojawi się po odświeżeniu cen, gdy ceny się zmienią'}
            </p>
          </div>

          <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
            <p className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Największe zmiany</span>
            </p>
            {movers.up || movers.down ? (
              <div className="space-y-1.5">
                {[movers.up, movers.down].filter(Boolean).map(m => (
                  <button
                    key={m!.item.id}
                    type="button"
                    onClick={() => onViewCardDetails(m!.item)}
                    className="w-full flex items-center justify-between gap-2 text-left text-sm hover:bg-stone-900 rounded-lg -mx-1 px-1 py-0.5 cursor-pointer"
                  >
                    <span className="truncate text-stone-200">{m!.item.card.name}</span>
                    <span className={`shrink-0 font-bold ${m!.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtDelta(m!.delta)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-2xl font-bold text-stone-200">—</p>
            )}
            <p className="text-[11px] text-stone-500">Karty, których wartość zmieniła się najbardziej</p>
          </div>

        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Mana Curve (CMC) Bar Chart */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-200 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Krzywa Many (Mana Value / CMC)</span>
            </h3>
            <span className="text-[11px] text-stone-400">Rozkład według kosztu</span>
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
                <Bar dataKey="ilosc" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Liczba kart" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Color Pie Chart */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-200 flex items-center gap-1.5">
              <PieIcon className="w-4 h-4 text-amber-400" />
              <span>Rozkład Kolorów Kart</span>
            </h3>
            <span className="text-[11px] text-stone-400">Udział w kolekcji</span>
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
        </div>

      </div>

      {/* Top 5 Most Valuable Cards */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-200 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <span>Top 5 Najcenniejszych Kart w Kolekcji</span>
          </h3>
          <span className="text-xs text-stone-400">Rynkowa wycena rynkowa</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pt-2">
          {topValuable.map(({ item, maxSinglePrice, totalValue }, index) => {
            const card = item.card;
            const img = getCardImageUri(card, 'normal');

            return (
              <div
                key={item.id}
                onClick={() => onViewCardDetails(item)}
                className="group bg-stone-950 p-3 rounded-xl border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between space-y-3"
              >
                <div className="relative aspect-[2.5/3.5] rounded-lg overflow-hidden bg-stone-900">
                  <img 
                    src={img} 
                    alt={card.name} 
                    referrerPolicy="no-referrer"
                    onError={(e) => handleCardImageError(e, img)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
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
                    {card.set} • {item.quantity + item.quantityFoil} szt.
                  </p>
                  <p className="text-xs tabular-nums font-bold text-emerald-400 mt-1">
                    {formatCurrency(totalValue, settings.currency)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
