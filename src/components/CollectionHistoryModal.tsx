import React, { useEffect, useId, useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { collectionApi } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { useBackToClose } from '../hooks/useBackButton';
import type { CurrencyCode } from '../types';
import { useT, locale, plural, t as tr, tk } from '../i18n';

type Range = 7 | 30 | 365;
const RANGES: Array<{ days: Range; label: string }> = [
  { days: 7, label: tk('7 dni') },
  { days: 30, label: tk('30 dni') },
  { days: 365, label: tk('Rok') }
];

interface Point {
  day: string;
  value: number;
  cards: number;
  currency: string;
}

const VALUE_COLOR = '#fbbf24'; // amber-400 (akcent aplikacji)
const CARDS_COLOR = '#a8a29e'; // stone-400

const fmtDay = (d: string, long = false) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(locale(), long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });

/** Jeden wykres (wartość albo liczba kart) – osobne osie, bez mieszania skal. */
const SeriesChart: React.FC<{
  data: Point[];
  dataKey: 'value' | 'cards';
  color: string;
  format: (v: number) => string;
  label: string;
}> = ({ data, dataKey, color, format, label }) => {
  const gradientId = `fill-${dataKey}-${useId().replace(/:/g, '')}`;
  return (
  <div className="h-48 sm:h-56" role="img" aria-label={`${label}: ${tr('wykres dzień po dniu')}`}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#292524" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={(d) => fmtDay(d)}
          tick={{ fill: '#a8a29e', fontSize: 12 }}
          axisLine={{ stroke: '#44403c' }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v) => (dataKey === 'value' ? Math.round(v).toLocaleString(locale()) : String(v))}
          tick={{ fill: '#a8a29e', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={56}
          domain={['auto', 'auto']}
          allowDecimals={dataKey === 'value'}
        />
        <Tooltip
          cursor={{ stroke: '#78716c', strokeWidth: 1 }}
          contentStyle={{ background: '#1c1917', border: '1px solid #44403c', borderRadius: 8, fontSize: 13 }}
          labelStyle={{ color: '#e7e5e4' }}
          itemStyle={{ color: '#e7e5e4' }}
          labelFormatter={(d) => fmtDay(String(d), true)}
          formatter={(v: any) => [format(Number(v)), label]}
        />
        <Area
          type="linear"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={data.length <= 31 ? { r: 3, fill: color, strokeWidth: 0 } : false}
          activeDot={{ r: 5, stroke: '#1c1917', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
  );
};

/** Historia kolekcji: wybór zakresu i krzywych, podsumowanie i wykresy. Używana w oknie i w Statystykach. */
export const CollectionHistoryPanel: React.FC<{ currency: CurrencyCode }> = ({ currency }) => {
  const t = useT();
  const [range, setRange] = useState<Range>(30);
  const [show, setShow] = useState({ value: true, cards: true });
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    collectionApi
      .history(range)
      .then((d) => !cancelled && setPoints(d.points.filter((p) => p.currency === (d.currency || currency))))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [range, currency]);

  const summary = useMemo(() => {
    if (!points || points.length === 0) return null;
    const first = points[0];
    const last = points[points.length - 1];
    return {
      value: last.value,
      valueDelta: last.value - first.value,
      cards: last.cards,
      cardsDelta: last.cards - first.cards,
      since: first.day
    };
  }, [points]);

  const money = (v: number) => formatCurrency(v, currency);
  const signed = (v: number, f: (n: number) => string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`;
  const toggles: Array<{ key: 'value' | 'cards'; label: string; color: string }> = [
    { key: 'value', label: t('Wartość'), color: VALUE_COLOR },
    { key: 'cards', label: t('Liczba kart'), color: CARDS_COLOR }
  ];

  return (
    <div className="space-y-5">
      {/* Zakres i krzywe: jeden rząd nad wykresami */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-grid grid-cols-3 p-1 rounded-lg bg-stone-950 ring-1 ring-stone-800" role="radiogroup" aria-label={t('Zakres czasu')}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              role="radio"
              aria-checked={range === r.days}
              onClick={() => setRange(r.days)}
              className={`h-8 px-3.5 rounded-md text-sm cursor-pointer ${
                range === r.days ? 'bg-stone-800 text-stone-50 font-medium' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={t('Widoczne krzywe')}>
          {toggles.map((tg) => {
            const on = show[tg.key];
            return (
              <button
                key={tg.key}
                type="button"
                aria-pressed={on}
                onClick={() => setShow((s) => ({ ...s, [tg.key]: !s[tg.key] }))}
                className={`h-8 px-3 rounded-md text-sm flex items-center gap-2 cursor-pointer ring-1 ${
                  on ? 'ring-stone-600 text-stone-100 bg-stone-800' : 'ring-stone-800 text-stone-500 hover:text-stone-300'
                }`}
              >
                <span className="w-3 h-0.5 rounded-full" style={{ background: on ? tg.color : '#57534e' }} aria-hidden="true" />
                {tg.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-stone-300">{error}</p>
      ) : points === null ? (
        <div className="h-56 flex items-center justify-center text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          {summary && (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-stone-400">{t('Wartość')}</dt>
                <dd className="text-2xl font-semibold text-stone-50 tabular-nums">{money(summary.value)}</dd>
                {points.length > 1 && (
                  <dd className={`text-sm tabular-nums ${summary.valueDelta > 0 ? 'text-emerald-400' : summary.valueDelta < 0 ? 'text-rose-400' : 'text-stone-400'}`}>
                    {signed(summary.valueDelta, money)} {t('od')} {fmtDay(summary.since)}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-sm text-stone-400">{t('Liczba kart')}</dt>
                <dd className="text-2xl font-semibold text-stone-50 tabular-nums">{summary.cards.toLocaleString(locale())}</dd>
                {points.length > 1 && (
                  <dd className="text-sm tabular-nums text-stone-400">
                    {signed(summary.cardsDelta, (n) => n.toLocaleString(locale()))} {t('od')} {fmtDay(summary.since)}
                  </dd>
                )}
              </div>
            </dl>
          )}

          {points.length < 2 ? (
            <p className="text-sm text-stone-400 rounded-lg bg-stone-950/60 ring-1 ring-stone-800 p-4">
              {t('Historia zbiera się od dziś: każdego dnia zapisujemy wartość i liczbę kart. Wykres pojawi się, gdy będą co najmniej dwa dni danych.')}
            </p>
          ) : (
            <div className="space-y-6">
              {show.value && (
                <div>
                  <h4 className="text-sm font-medium text-stone-300 mb-1">{t('Wartość')} ({currency})</h4>
                  <SeriesChart data={points} dataKey="value" color={VALUE_COLOR} format={money} label={t('Wartość')} />
                </div>
              )}
              {show.cards && (
                <div>
                  <h4 className="text-sm font-medium text-stone-300 mb-1">{t('Liczba kart')}</h4>
                  <SeriesChart data={points} dataKey="cards" color={CARDS_COLOR} format={(n) => plural(n, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards']).replace(String(n), n.toLocaleString(locale()))} label={t('Liczba kart')} />
                </div>
              )}
              {!show.value && !show.cards && <p className="text-sm text-stone-500">{t('Włącz co najmniej jedną krzywą.')}</p>}
            </div>
          )}
        </>
      )}
      <p className="text-xs text-stone-500">
        {t('Wartość liczymy po cenach zapisanych w kolekcji, więc zmienia się po odświeżeniu cen albo zmianach w kolekcji.')}
      </p>
    </div>
  );
};

/** Okno z historią kolekcji: wartość i liczba kart w czasie, z wyborem zakresu i krzywych. */
export const CollectionHistoryModal: React.FC<{ currency: CurrencyCode; onClose: () => void }> = ({ currency, onClose }) => {
  const t = useT();
  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={t('Historia kolekcji')}
    >
      <div className="w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto bg-stone-900 border border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-stone-800">
          <div>
            <h3 className="text-base font-semibold text-stone-50">{t('Historia kolekcji')}</h3>
            <p className="text-sm text-stone-400">{t('Wartość i liczba kart dzień po dniu.')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Zamknij')} className="w-10 h-10 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <CollectionHistoryPanel currency={currency} />
        </div>
      </div>
    </div>
  );
};
