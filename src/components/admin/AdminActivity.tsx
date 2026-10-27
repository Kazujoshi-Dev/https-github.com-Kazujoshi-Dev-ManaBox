import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Smartphone, Monitor } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { adminApi } from '../../services/api';
import type { AdminActivityStats } from '../../types';
import { useT, locale, plural, tk } from '../../i18n';

type Range = 7 | 30 | 90 | 365;
const RANGES: Array<{ days: Range; label: string }> = [
  { days: 7, label: tk('7 dni') },
  { days: 30, label: tk('30 dni') },
  { days: 90, label: tk('90 dni') },
  { days: 365, label: tk('Rok') }
];

const AMBER = '#fbbf24'; // akcent: aktywni użytkownicy
const STONE = '#a8a29e'; // logowania / komputer
const ROSE = '#fb7185'; // nieudane logowania

const fmtNum = (n: number) => n.toLocaleString(locale());
const fmtDay = (d: string, long = false) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(locale(), long ? { weekday: 'short', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const tooltipStyle = { backgroundColor: '#1c1917', borderColor: '#44403c', borderRadius: '0.75rem', color: '#f5f5f4', fontSize: 12 };
const axisProps = {
  tick: { fill: '#a8a29e', fontSize: 11 },
  axisLine: { stroke: '#44403c' },
  tickLine: false
} as const;

/** Panel admina: logowania i aktywność użytkowników (dane zagregowane dziennie). */
export const AdminActivity: React.FC = () => {
  const t = useT();
  const [days, setDays] = useState<Range>(30);
  const [data, setData] = useState<AdminActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((d: Range) => {
    setLoading(true);
    adminApi
      .activity(d)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(days), [days, load]);

  const devices = useMemo(() => {
    if (!data) return null;
    const mobile = data.series.reduce((s, d) => s + d.mobile, 0);
    const desktop = data.series.reduce((s, d) => s + d.desktop, 0);
    const total = mobile + desktop;
    return total ? { mobile: Math.round((mobile / total) * 100), desktop: Math.round((desktop / total) * 100) } : null;
  }, [data]);

  if (error) return <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>;
  if (!data) {
    return (
      <p className="text-sm text-stone-400 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('Ładowanie...')}
      </p>
    );
  }
  if (!data.available) {
    return (
      <p className="text-sm text-stone-400 bg-stone-900 border border-stone-800 rounded-xl p-4">
        {t('Statystyki aktywności wymagają bazy PostgreSQL.')}
      </p>
    );
  }

  const stickiness = data.active30d ? Math.round((data.activeToday / data.active30d) * 100) : null;
  const tiles = [
    { label: t('Teraz online'), value: fmtNum(data.onlineNow), hint: t('ostatnie 15 min') },
    { label: t('Aktywni dziś'), value: fmtNum(data.activeToday), hint: stickiness !== null ? t('{n}% aktywnych w 30 dni', { n: stickiness }) : '' },
    { label: t('Aktywni (7 dni)'), value: fmtNum(data.active7d), hint: '' },
    { label: t('Aktywni (30 dni)'), value: fmtNum(data.active30d), hint: '' },
    { label: t('Logowania (7 dni)'), value: fmtNum(data.logins7d), hint: '' },
    {
      label: t('Nieudane logowania (7 dni)'),
      value: fmtNum(data.failedLogins7d),
      hint: '',
      danger: data.failedLogins7d > Math.max(20, data.logins7d)
    },
    { label: t('Rejestracje (30 dni)'), value: fmtNum(data.registrations30d), hint: '' },
    {
      label: t('Wracający nowi'),
      value: data.returningPct === null ? '-' : `${data.returningPct}%`,
      hint: t('zarejestrowani 8–37 dni temu, aktywni w ostatnim tygodniu')
    }
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-stone-800 bg-stone-800">
        {tiles.map(({ label, value, hint, danger }) => (
          <div key={label} className="bg-stone-900 p-3.5">
            <p className="text-xs text-stone-400">{label}</p>
            <p className={`text-xl font-semibold mt-0.5 tabular-nums ${danger ? 'text-rose-300' : 'text-stone-50'}`}>{value}</p>
            {hint && <p className="text-[11px] text-stone-500 mt-0.5">{hint}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            className={`h-8 px-3 rounded-lg text-xs font-medium border cursor-pointer ${
              days === r.days ? 'bg-stone-800 border-stone-700 text-stone-50' : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            {t(r.label)}
          </button>
        ))}
        {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-500" />}
        <span className="text-[11px] text-stone-500 ml-auto">{t('Dane z {time}', { time: fmtDateTime(data.generatedAt) })}</span>
      </div>

      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-stone-100">{t('Aktywni użytkownicy dziennie')}</h3>
          {devices && (
            <p className="text-xs text-stone-400 flex items-center gap-3 tabular-nums">
              <span className="flex items-center gap-1"><Smartphone className="w-3.5 h-3.5 text-amber-400" />{t('Telefon')} {devices.mobile}%</span>
              <span className="flex items-center gap-1"><Monitor className="w-3.5 h-3.5 text-stone-400" />{t('Komputer')} {devices.desktop}%</span>
            </p>
          )}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#292524" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d) => fmtDay(d)} minTickGap={24} {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => fmtDay(String(d), true)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#d6d3d1' }} />
              <Bar dataKey="mobile" stackId="a" fill={AMBER} name={t('Telefon')} />
              <Bar dataKey="desktop" stackId="a" fill={STONE} name={t('Komputer')} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-stone-500">
          {t('Osoba korzystająca tego samego dnia z telefonu i komputera jest liczona w obu grupach.')}
        </p>
      </section>

      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-100">{t('Logowania i rejestracje')}</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#292524" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d) => fmtDay(d)} minTickGap={24} {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => fmtDay(String(d), true)} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#d6d3d1' }} />
              <Line type="monotone" dataKey="logins" stroke={STONE} strokeWidth={2} dot={false} name={t('Logowania')} />
              <Line type="monotone" dataKey="failedLogins" stroke={ROSE} strokeWidth={2} dot={false} name={t('Nieudane logowania')} />
              <Line type="monotone" dataKey="registrations" stroke={AMBER} strokeWidth={2} dot={false} name={t('Rejestracje')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-stone-500">
          {t('Logowania liczymy od wdrożenia statystyk. Nagły wzrost nieudanych logowań może oznaczać próby zgadywania haseł.')}
        </p>
      </section>

      <section className="bg-stone-900 border border-stone-800 rounded-2xl divide-y divide-stone-800">
        <h3 className="text-sm font-semibold text-stone-100 p-4">{t('Najaktywniejsi w wybranym okresie')}</h3>
        {data.topUsers.length === 0 ? (
          <p className="p-4 text-sm text-stone-400">{t('Brak danych.')}</p>
        ) : (
          data.topUsers.map((u, i) => (
            <div key={u.id} className="px-4 py-2.5 text-sm flex items-center gap-3">
              <span className="w-5 text-xs text-stone-500 tabular-nums">{i + 1}.</span>
              <span className="flex-1 min-w-0 truncate text-stone-100 font-medium">{u.username}</span>
              <span className="text-xs text-stone-300 tabular-nums shrink-0">
                {fmtNum(u.activeDays)} {plural(u.activeDays, ['dzień', 'dni', 'dni'], ['day', 'days'])}
              </span>
              <span className="hidden sm:block text-xs text-stone-500 tabular-nums w-40 text-right shrink-0">{fmtDateTime(u.lastActiveAt)}</span>
            </div>
          ))
        )}
      </section>

      <p className="text-[11px] text-stone-500">
        {t('Zapisujemy tylko dni aktywności i dzienne liczniki logowań, bez adresów IP i odwiedzanych stron. Dane starsze niż 400 dni są usuwane.')}
      </p>
    </div>
  );
};
