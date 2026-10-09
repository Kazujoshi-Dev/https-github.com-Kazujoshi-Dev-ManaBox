import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { changelogApi, type ChangelogItem, type ChangelogRelease, type ChangelogType } from '../services/api';
import { useT, useLang, locale, tk, plural, type Lang } from '../i18n';

export const CHANGE_TYPES: Array<{ id: ChangelogType; label: string; dot: string; text: string }> = [
  { id: 'new', label: tk('Nowości'), dot: 'bg-amber-400', text: 'text-amber-300' },
  { id: 'improved', label: tk('Ulepszenia'), dot: 'bg-sky-400', text: 'text-sky-300' },
  { id: 'fixed', label: tk('Poprawki'), dot: 'bg-emerald-400', text: 'text-emerald-300' }
];

const PAGE = 8;

const dateParts = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return {
    date: d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
    weekday: d.toLocaleDateString(locale(), { weekday: 'long' })
  };
};

const zmian = (n: number) => plural(n, ['{n} zmiana', '{n} zmiany', '{n} zmian'], ['{n} change', '{n} changes']);

/** Treść wpisu w wybranym języku (brak tłumaczenia = wersja polska). */
export const itemText = (i: Pick<ChangelogItem, 'text' | 'textEn'>, lang: Lang) => (lang === 'en' && i.textEn ? i.textEn : i.text);
export const itemArea = (i: Pick<ChangelogItem, 'area' | 'areaEn'>, lang: Lang) => (lang === 'en' && i.areaEn ? i.areaEn : i.area);

interface ChangelogProps {
  /** Wywoływane po wczytaniu wpisów (zakładka gasi kropkę „nowe”). */
  onSeen?: (latestDay: string) => void;
}

/** Zakładka „Dziennik zmian”: wpisy publikowane codziennie o 23:30. */
export const Changelog: React.FC<ChangelogProps> = ({ onSeen }) => {
  const t = useT();
  const lang = useLang();
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
      .catch((e) => setError(e.message || t('Nie udało się wczytać dziennika zmian.')));
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
        title={t('Dziennik zmian')}
        description={t('Co nowego w Mana Screw. Nowe wpisy pojawiają się codziennie o {time}.', { time: publishTime })}
      />

      {releases && releases.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('Rodzaj zmian')}>
          {[{ id: 'all' as const, label: tk('Wszystkie'), dot: '' }, ...CHANGE_TYPES].map((ct) => (
            <button
              key={ct.id}
              type="button"
              role="tab"
              aria-selected={filter === ct.id}
              onClick={() => {
                setFilter(ct.id);
                setShown(PAGE);
              }}
              className={`h-8 px-3 rounded-full text-sm flex items-center gap-2 cursor-pointer ring-1 ${
                filter === ct.id ? 'bg-stone-800 ring-stone-600 text-stone-50' : 'ring-stone-800 text-stone-400 hover:text-stone-200 hover:ring-stone-700'
              }`}
            >
              {ct.dot && <span className={`w-1.5 h-1.5 rounded-full ${ct.dot}`} aria-hidden="true" />}
              {t(ct.label)}
              <span className="text-xs text-stone-500 tabular-nums">{counts[ct.id]}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!releases && !error && (
        <p className="text-sm text-stone-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('Wczytywanie…')}
        </p>
      )}
      {releases && releases.length === 0 && (
        <p className="text-sm text-stone-400 py-10 text-center">{t('Pierwszy wpis pojawi się dziś o {time}.', { time: publishTime })}</p>
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
                  <span className="hidden md:inline-block mt-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">{t('Najnowsze')}</span>
                )}
              </div>

              {/* Zmiany */}
              <div className="rounded-xl border border-stone-800 bg-stone-900 divide-y divide-stone-800">
                {CHANGE_TYPES.map((ct) => {
                  const items = r.items.filter((i) => i.type === ct.id);
                  if (!items.length) return null;
                  return (
                    <section key={ct.id} className="p-4 sm:p-5">
                      <h4 className={`text-sm font-medium flex items-center gap-2 mb-2.5 ${ct.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ct.dot}`} aria-hidden="true" />
                        {t(ct.label)}
                      </h4>
                      <ul className="space-y-2">
                        {items.map((i) => {
                          const area = itemArea(i, lang);
                          return (
                            <li key={i.id} className="text-[15px] leading-relaxed text-stone-200 pl-3.5 relative">
                              <span className="absolute left-0 top-[0.7em] w-1 h-1 rounded-full bg-stone-600" aria-hidden="true" />
                              {area && <span className="text-stone-400 font-medium">{area}: </span>}
                              {itemText(i, lang)}
                            </li>
                          );
                        })}
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
            {t('Pokaż starsze wpisy')}
          </button>
        </div>
      )}
    </div>
  );
};
