import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { changelogApi, type ChangelogRelease, type ChangelogType } from '../services/api';

export const CHANGE_TYPES: Array<{ id: ChangelogType; label: string; dot: string; text: string }> = [
  { id: 'new', label: 'Nowości', dot: 'bg-amber-400', text: 'text-amber-300' },
  { id: 'improved', label: 'Ulepszenia', dot: 'bg-sky-400', text: 'text-sky-300' },
  { id: 'fixed', label: 'Poprawki', dot: 'bg-emerald-400', text: 'text-emerald-300' }
];

const PAGE = 8;

const dateParts = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return {
    date: d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }),
    weekday: d.toLocaleDateString('pl-PL', { weekday: 'long' })
  };
};

const zmian = (n: number) => {
  if (n === 1) return '1 zmiana';
  const d = n % 10;
  const h = n % 100;
  return `${n} ${d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'zmiany' : 'zmian'}`;
};

interface ChangelogProps {
  /** Wywoływane po wczytaniu wpisów (zakładka gasi kropkę „nowe”). */
  onSeen?: (latestDay: string) => void;
}

/** Zakładka „Dziennik zmian”: wpisy publikowane codziennie o 23:30. */
export const Changelog: React.FC<ChangelogProps> = ({ onSeen }) => {
  const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
  const [publishTime, setPublishTime] = useState('23:30');
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [filter, setFilter] = useState<ChangelogType | 'all'>('all');

  useEffect(() => {
    changelogApi
      .list(120)
      .then((d) => {
        setReleases(d.releases);
        if (d.publishTime) setPublishTime(d.publishTime);
      })
      .catch((e) => setError(e.message || 'Nie udało się wczytać dziennika zmian.'));
  }, []);

  useEffect(() => {
    if (releases && releases.length) onSeen?.(releases[0].day);
  }, [releases, onSeen]);

  const visible = useMemo(() => {
    if (!releases) return [];
    return releases
      .map((r) => ({ ...r, items: filter === 'all' ? r.items : r.items.filter((i) => i.type === filter) }))
      .filter((r) => r.items.length > 0);
  }, [releases, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, new: 0, improved: 0, fixed: 0 };
    for (const r of releases || []) for (const i of r.items) {
      c.all++;
      c[i.type]++;
    }
    return c;
  }, [releases]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dziennik zmian"
        description={`Co nowego w Mana Screw. Nowe wpisy pojawiają się codziennie o ${publishTime}.`}
      />

      {releases && releases.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Rodzaj zmian">
          {[{ id: 'all' as const, label: 'Wszystkie', dot: '' }, ...CHANGE_TYPES].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => {
                setFilter(t.id);
                setShown(PAGE);
              }}
              className={`h-8 px-3 rounded-full text-sm flex items-center gap-2 cursor-pointer ring-1 ${
                filter === t.id ? 'bg-stone-800 ring-stone-600 text-stone-50' : 'ring-stone-800 text-stone-400 hover:text-stone-200 hover:ring-stone-700'
              }`}
            >
              {t.dot && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} aria-hidden="true" />}
              {t.label}
              <span className="text-xs text-stone-500 tabular-nums">{counts[t.id]}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!releases && !error && (
        <p className="text-sm text-stone-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Wczytywanie…
        </p>
      )}
      {releases && releases.length === 0 && (
        <p className="text-sm text-stone-400 py-10 text-center">Pierwszy wpis pojawi się dziś o {publishTime}.</p>
      )}

      <ol className="relative max-w-5xl">
        {visible.slice(0, shown).map((r, idx) => {
          const { date, weekday } = dateParts(r.day);
          return (
            <li key={r.day} className="relative grid grid-cols-1 md:grid-cols-[200px_1fr] gap-x-8 gap-y-3 pb-10 last:pb-0">
              {/* Data */}
              <div className="md:sticky md:top-32 self-start flex md:block items-baseline gap-3">
                <h3 className="text-base font-semibold text-stone-100 first-letter:uppercase">{date}</h3>
                <p className="text-sm text-stone-500">
                  <span className="inline-block first-letter:uppercase">{weekday}</span>
                  <span className="md:hidden"> · </span>
                  <span className="md:block md:mt-0.5">{zmian(r.items.length)}</span>
                </p>
                {idx === 0 && filter === 'all' && (
                  <span className="hidden md:inline-block mt-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">Najnowsze</span>
                )}
              </div>

              {/* Zmiany */}
              <div className="rounded-xl border border-stone-800 bg-stone-900 divide-y divide-stone-800">
                {CHANGE_TYPES.map((t) => {
                  const items = r.items.filter((i) => i.type === t.id);
                  if (!items.length) return null;
                  return (
                    <section key={t.id} className="p-4 sm:p-5">
                      <h4 className={`text-sm font-medium flex items-center gap-2 mb-2.5 ${t.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
                        {t.label}
                      </h4>
                      <ul className="space-y-2">
                        {items.map((i) => (
                          <li key={i.id} className="text-[15px] leading-relaxed text-stone-200 pl-3.5 relative">
                            <span className="absolute left-0 top-[0.7em] w-1 h-1 rounded-full bg-stone-600" aria-hidden="true" />
                            {i.area && <span className="text-stone-400 font-medium">{i.area}: </span>}
                            {i.text}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      {visible.length > shown && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setShown((s) => s + PAGE)} className="btn btn-secondary">
            Pokaż starsze wpisy
          </button>
        </div>
      )}
    </div>
  );
};
