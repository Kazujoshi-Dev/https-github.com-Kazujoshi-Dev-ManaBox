import React, { useCallback, useEffect, useState } from 'react';
import { Check, Gauge, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import {
  scanSamplesApi,
  type ScanEvalFailure,
  type ScanEvalSummary,
  type ScanSample,
  type ScanSampleCard,
  type ScanSampleLabel
} from '../../services/api';
import { useT, locale, tk } from '../../i18n';

type Filter = ScanSampleLabel | 'labeled' | 'all';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'pending', label: tk('Do oznaczenia') },
  { id: 'labeled', label: tk('Oznaczone') },
  { id: 'all', label: tk('Wszystkie') }
];

const REASONS: Record<ScanSample['reason'], string> = {
  none: tk('Brak wyniku'),
  uncertain: tk('Niepewny wynik'),
  random: tk('Kontrola losowa')
};

const OUTCOMES: Record<ScanEvalFailure['outcome'], { label: string; cls: string }> = {
  wrong: { label: tk('Pewna pomyłka'), cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' },
  false_alarm: { label: tk('Wynik dla nie-karty'), cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' },
  none: { label: tk('Brak wyniku'), cls: 'bg-stone-700/60 text-stone-300 ring-stone-600' },
  wrong_unsure: { label: tk('Niepewna pomyłka'), cls: 'bg-amber-400/15 text-amber-300 ring-amber-400/30' },
  same_name: { label: tk('Inne wydanie'), cls: 'bg-stone-700/60 text-stone-300 ring-stone-600' }
};

const fmt = (iso: string) => new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : '–');
const cardLabel = (c: ScanSampleCard) => `${c.name} [${c.set.toUpperCase()} #${c.collectorNumber}]`;

/** Kadr próbki (pobierany z autoryzacją, więc przez blob:). */
const SampleImage: React.FC<{ id: number }> = ({ id }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    scanSamplesApi
      .imageUrl(id)
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url ? (
    <img src={url} alt="" className="w-[150px] h-[210px] rounded-lg object-cover bg-stone-950" />
  ) : (
    <div className="w-[150px] h-[210px] rounded-lg bg-stone-950 flex items-center justify-center">
      <Loader2 className="w-4 h-4 text-stone-500 animate-spin" />
    </div>
  );
};

const CardThumb: React.FC<{ card: ScanSampleCard; note?: string; active?: boolean; onPick?: () => void; title: string }> = ({ card, note, active, onPick, title }) => (
  <button
    type="button"
    onClick={onPick}
    disabled={!onPick}
    title={title}
    className={`w-[78px] text-left rounded-lg p-1 ring-1 cursor-pointer disabled:cursor-default ${
      active ? 'ring-amber-400 bg-amber-400/10' : 'ring-stone-800 hover:ring-stone-600'
    }`}
  >
    {card.image ? <img src={card.image} alt="" loading="lazy" className="w-full rounded" /> : <div className="w-full aspect-[63/88] rounded bg-stone-800" />}
    <span className="block mt-1 text-[11px] leading-tight text-stone-300 line-clamp-2">{card.name}</span>
    <span className="block text-[11px] text-stone-500 tabular-nums">
      {card.set.toUpperCase()} #{card.collectorNumber}
      {note ? ` · ${note}` : ''}
    </span>
  </button>
);

const SUMMARY_ROWS: Array<{ key: keyof ScanEvalSummary; label: string; of: 'cards' | 'notCards'; better: 'up' | 'down' }> = [
  { key: 'correct', label: tk('Dokładnie to wydanie'), of: 'cards', better: 'up' },
  { key: 'sameName', label: tk('Właściwa karta, inne wydanie'), of: 'cards', better: 'down' },
  { key: 'wrong', label: tk('Pewna pomyłka'), of: 'cards', better: 'down' },
  { key: 'wrongUnsure', label: tk('Niepewna pomyłka'), of: 'cards', better: 'down' },
  { key: 'none', label: tk('Brak wyniku'), of: 'cards', better: 'down' },
  { key: 'quickPath', label: tk('Rozpoznane bez OCR'), of: 'cards', better: 'up' },
  { key: 'fusedQuick', label: tk('W tym dzięki kilku klatkom'), of: 'cards', better: 'up' },
  { key: 'falseAlarm', label: tk('Wynik dla nie-karty'), of: 'notCards', better: 'down' }
];

const EvalReport: React.FC<{ summary: ScanEvalSummary; previous: ScanEvalSummary | null; failures?: ScanEvalFailure[]; when?: string }> = ({ summary, previous, failures, when }) => {
  const t = useT();
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-4 space-y-3">
      <p className="text-sm text-stone-300">
        {t('Ocenione próbki: {n} (karty: {cards}, nie-karty: {other})', { n: summary.total, cards: summary.cards, other: summary.notCards })}
        {when ? <span className="text-stone-500"> · {fmt(when)}</span> : null}
        <span className="text-stone-500 tabular-nums"> · {Math.round(summary.ms / 100) / 10} s</span>
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-stone-500">
            <th className="font-medium py-1">{t('Wynik')}</th>
            <th className="font-medium py-1 text-right">{t('Liczba')}</th>
            <th className="font-medium py-1 text-right">%</th>
            {previous && <th className="font-medium py-1 text-right">{t('Poprzednio')}</th>}
          </tr>
        </thead>
        <tbody>
          {SUMMARY_ROWS.map((r) => {
            const now = summary[r.key] ?? 0;
            const before = previous ? previous[r.key] ?? 0 : null;
            const ratioNow = summary[r.of] ? now / summary[r.of] : 0;
            const ratioBefore = previous && previous[r.of] ? (before as number) / previous[r.of] : null;
            const diff = ratioBefore === null ? 0 : ratioNow - ratioBefore;
            const good = r.better === 'up' ? diff > 0.0005 : diff < -0.0005;
            const bad = r.better === 'up' ? diff < -0.0005 : diff > 0.0005;
            return (
              <tr key={r.key} className="border-t border-stone-800">
                <td className="py-1.5 text-stone-200">{t(r.label)}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-200">{now}</td>
                <td className={`py-1.5 text-right tabular-nums ${good ? 'text-emerald-400' : bad ? 'text-rose-300' : 'text-stone-300'}`}>{pct(now, summary[r.of])}</td>
                {previous && <td className="py-1.5 text-right tabular-nums text-stone-500">{pct(before as number, previous[r.of])}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {failures && failures.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-stone-500">{t('Błędy (najgorsze najpierw):')}</p>
          <ul className="space-y-1">
            {failures.map((f) => (
              <li key={f.id} className="text-sm flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="tabular-nums text-stone-500">#{f.id}</span>
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 ${OUTCOMES[f.outcome].cls}`}>{t(OUTCOMES[f.outcome].label)}</span>
                <span className="text-stone-300">{f.expected ? cardLabel(f.expected) : t('nie karta')}</span>
                <span className="text-stone-500">→</span>
                <span className="text-stone-300">{f.got ? cardLabel(f.got) : t('brak')}</span>
                {f.got && <span className="text-stone-500 tabular-nums">{f.confidence}% · {f.method}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** Panel admina: prawdziwe kadry ze skanera do oznaczenia i ocena rozpoznawania na nich. */
export const AdminScanSamples: React.FC<{ showToast?: (m: string) => void }> = ({ showToast }) => {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('pending');
  const [samples, setSamples] = useState<ScanSample[] | null>(null);
  const [counts, setCounts] = useState<Record<ScanSampleLabel, number>>({ pending: 0, card: 0, not_card: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [setNumbers, setSetNumbers] = useState<Record<number, string>>({});
  const [lastEval, setLastEval] = useState<{ summary: ScanEvalSummary; createdAt: string } | null>(null);
  const [report, setReport] = useState<{ summary: ScanEvalSummary; previous: ScanEvalSummary | null; failures: ScanEvalFailure[] } | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const load = useCallback(
    (offset = 0) => {
      scanSamplesApi
        .list(filter, offset)
        .then((d) => {
          setSamples((prev) => (offset && prev ? [...prev, ...d.samples] : d.samples));
          setHasMore(d.samples.length === 30);
          setCounts(d.counts);
          setLastEval(d.lastEval);
          setError(null);
        })
        .catch((e) => setError(e.message));
    },
    [filter]
  );
  useEffect(() => {
    setSamples(null);
    load();
  }, [load]);

  const update = (id: number, patch: Partial<ScanSample> | null) => {
    setSamples((prev) => {
      if (!prev) return prev;
      // w widoku „Do oznaczenia” oznaczona próbka znika z listy
      if (patch === null || (filter === 'pending' && patch.labelStatus && patch.labelStatus !== 'pending')) return prev.filter((s) => s.id !== id);
      return prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
    });
  };

  const label = async (s: ScanSample, body: { status: ScanSampleLabel; cardId?: string; setNumber?: string }) => {
    setBusy(s.id);
    try {
      const r = await scanSamplesApi.label(s.id, body);
      setCounts((c) => ({ ...c, [s.labelStatus]: Math.max(0, c[s.labelStatus] - 1), [body.status]: c[body.status] + 1 }));
      update(s.id, { labelStatus: body.status, label: r.label });
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (s: ScanSample) => {
    if (!window.confirm(t('Usunąć próbkę #{id}?', { id: s.id }))) return;
    try {
      await scanSamplesApi.remove(s.id);
      setCounts((c) => ({ ...c, [s.labelStatus]: Math.max(0, c[s.labelStatus] - 1) }));
      update(s.id, null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const evaluate = async () => {
    setEvaluating(true);
    try {
      const r = await scanSamplesApi.evaluate();
      setReport(r);
      setLastEval({ summary: r.summary, createdAt: new Date().toISOString() });
      showToast?.(t('Ocena skanera gotowa.'));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEvaluating(false);
    }
  };

  const labeled = counts.card + counts.not_card;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-800 bg-stone-900 p-4 space-y-3">
        <p className="text-sm text-stone-300">
          {t('Kadry kart, przy których skaner nie był pewny albo nic nie znalazł, oraz losowe próbki pewnych wyników. Oznacz, jaka to naprawdę karta, a ocena pokaże, jak skaner radzi sobie na prawdziwych zdjęciach.')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={evaluate} disabled={evaluating || labeled === 0} className="btn btn-primary h-9 px-3 text-sm">
            {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />}
            {t('Oceń skaner')}
          </button>
          <span className="text-xs text-stone-500 tabular-nums">
            {t('Oznaczone próbki: {n}', { n: labeled })}
          </span>
        </div>
      </div>

      {report ? (
        <EvalReport summary={report.summary} previous={report.previous} failures={report.failures} />
      ) : lastEval ? (
        <EvalReport summary={lastEval.summary} previous={null} when={lastEval.createdAt} />
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`h-8 px-3 rounded-full text-sm cursor-pointer ring-1 ${
              filter === f.id ? 'bg-stone-800 ring-stone-600 text-stone-50' : 'ring-stone-800 text-stone-400 hover:text-stone-200'
            }`}
          >
            {t(f.label)}
            {f.id === 'pending' && counts.pending ? <span className="tabular-nums"> ({counts.pending})</span> : null}
            {f.id === 'labeled' && labeled ? <span className="tabular-nums"> ({labeled})</span> : null}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

      {samples === null ? (
        <p className="text-sm text-stone-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('Ładowanie…')}
        </p>
      ) : samples.length === 0 ? (
        <p className="text-sm text-stone-400 rounded-xl border border-stone-800 bg-stone-900 p-4">{t('Brak próbek w tym widoku.')}</p>
      ) : (
        <ul className="space-y-3">
          {samples.map((s) => {
            const pickedId = s.label?.id;
            const others = s.candidates.filter((c) => c.id !== s.matched?.id);
            return (
              <li key={s.id} className="rounded-xl border border-stone-800 bg-stone-900 p-4 flex flex-col sm:flex-row gap-4">
                <SampleImage id={s.id} />
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-stone-100 tabular-nums">#{s.id}</span>
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 bg-stone-700/60 text-stone-300 ring-stone-600">{t(REASONS[s.reason])}</span>
                    {s.labelStatus === 'card' && (
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 bg-amber-400/15 text-amber-300 ring-amber-400/30">{t('Oznaczona')}</span>
                    )}
                    {s.labelStatus === 'not_card' && (
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 bg-stone-700/60 text-stone-300 ring-stone-600">{t('Nie karta')}</span>
                    )}
                    <span className="text-sm text-stone-300">{s.username || t('konto usunięte')}</span>
                    <span className="text-xs text-stone-500">{fmt(s.createdAt)}</span>
                  </div>

                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    <dt className="text-stone-500">{t('Wynik skanera')}</dt>
                    <dd className="text-stone-300 tabular-nums">
                      {s.matched ? `${cardLabel(s.matched)} · ${s.confidence}% · ${s.method}` : t('brak')}
                      {s.imageDistance !== null ? ` · ${t('obraz')} ${Math.round(s.imageDistance)}` : ''}
                    </dd>
                    <dt className="text-stone-500">{t('Odczyt OCR')}</dt>
                    <dd className="text-stone-300 break-words">
                      {s.hintTitle || '–'}
                      {s.hintSet || s.hintCollector ? ` · ${s.hintSet.toUpperCase() || '?'} #${s.hintCollector || '?'}` : ''}
                    </dd>
                    {s.frames > 1 && (
                      <>
                        <dt className="text-stone-500">{t('Klatki')}</dt>
                        <dd className="text-stone-300 tabular-nums">{s.frames}</dd>
                      </>
                    )}
                    {s.glare !== null && (
                      <>
                        <dt className="text-stone-500">{t('Odblask')}</dt>
                        <dd className="text-stone-300 tabular-nums">{Math.round(s.glare * 1000) / 10}%</dd>
                      </>
                    )}
                    {s.label && (
                      <>
                        <dt className="text-stone-500">{t('Oznaczenie')}</dt>
                        <dd className="text-amber-300">{cardLabel(s.label)}</dd>
                      </>
                    )}
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    {s.matched && (
                      <CardThumb
                        card={s.matched}
                        note={t('wynik')}
                        active={pickedId === s.matched.id}
                        onPick={() => label(s, { status: 'card', cardId: s.matched!.id })}
                        title={t('Oznacz jako tę kartę')}
                      />
                    )}
                    {others.map((c) => (
                      <CardThumb
                        key={c.id}
                        card={c}
                        note={c.distance !== undefined ? String(c.distance) : undefined}
                        active={pickedId === c.id}
                        onPick={() => label(s, { status: 'card', cardId: c.id })}
                        title={t('Oznacz jako tę kartę')}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = (setNumbers[s.id] || '').trim();
                        if (v) label(s, { status: 'card', setNumber: v });
                      }}
                    >
                      <input
                        value={setNumbers[s.id] || ''}
                        onChange={(e) => setSetNumbers((m) => ({ ...m, [s.id]: e.target.value }))}
                        placeholder={t('np. dmu 123')}
                        aria-label={t('Kod setu i numer właściwej karty')}
                        className="h-8 w-32 rounded-lg bg-stone-950 border border-stone-800 px-2 text-sm text-stone-200"
                      />
                      <button type="submit" disabled={busy === s.id} className="btn btn-secondary h-8 px-2.5 text-sm">
                        <Check className="w-4 h-4" /> {t('Zapisz')}
                      </button>
                    </form>
                    <button type="button" disabled={busy === s.id} onClick={() => label(s, { status: 'not_card' })} className="btn btn-ghost h-8 px-2.5 text-sm">
                      <X className="w-4 h-4" /> {t('To nie karta')}
                    </button>
                    {s.labelStatus !== 'pending' && (
                      <button type="button" disabled={busy === s.id} onClick={() => label(s, { status: 'pending' })} className="btn btn-ghost h-8 px-2.5 text-sm">
                        <RotateCcw className="w-4 h-4" /> {t('Cofnij oznaczenie')}
                      </button>
                    )}
                    {busy === s.id && <Loader2 className="w-4 h-4 text-stone-400 animate-spin" />}
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      aria-label={t('Usuń próbkę #{id}', { id: s.id })}
                      className="ml-auto w-8 h-8 rounded-lg text-stone-500 hover:text-rose-300 hover:bg-stone-800 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {samples && hasMore && (
        <button type="button" onClick={() => load(samples.length)} className="btn btn-secondary h-9 px-3 text-sm">
          {t('Pokaż więcej')}
        </button>
      )}
    </div>
  );
};
