import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2, X, Monitor } from 'lucide-react';
import { bugReportsApi, type BugReport, type BugReportStatus } from '../../services/api';
import { useT, locale, tk } from '../../i18n';

const STATUSES: Array<{ id: BugReportStatus; label: string; cls: string }> = [
  { id: 'new', label: tk('Nowe'), cls: 'bg-amber-400/15 text-amber-300 ring-amber-400/30' },
  { id: 'in_progress', label: tk('W trakcie'), cls: 'bg-sky-400/15 text-sky-300 ring-sky-400/30' },
  { id: 'resolved', label: tk('Naprawione'), cls: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30' },
  { id: 'rejected', label: tk('Odrzucone'), cls: 'bg-stone-700/60 text-stone-300 ring-stone-600' }
];

const FILTERS: Array<{ id: BugReportStatus | 'open' | 'all'; label: string }> = [
  { id: 'open', label: tk('Otwarte') },
  { id: 'resolved', label: tk('Naprawione') },
  { id: 'rejected', label: tk('Odrzucone') },
  { id: 'all', label: tk('Wszystkie') }
];

const fmt = (iso: string) => new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Panel admina: zgłoszenia błędów od użytkowników. */
export const AdminBugReports: React.FC<{ showToast?: (m: string) => void; onCountChange?: (n: number) => void }> = ({ showToast, onCountChange }) => {
  const t = useT();
  const [filter, setFilter] = useState<BugReportStatus | 'open' | 'all'>('open');
  const [reports, setReports] = useState<BugReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: number; url: string | null } | null>(null);

  const load = useCallback(() => {
    bugReportsApi
      .list(filter)
      .then((d) => {
        setReports(d.reports);
        onCountChange?.(d.newCount);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [filter, onCountChange]);
  useEffect(() => {
    setReports(null);
    load();
  }, [load]);

  const openShot = async (id: number) => {
    setPreview({ id, url: null });
    try {
      const url = await bugReportsApi.screenshotUrl(id);
      setPreview((p) => (p && p.id === id ? { id, url } : p));
    } catch (e: any) {
      setPreview(null);
      setError(e.message);
    }
  };
  const closeShot = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const setStatus = async (r: BugReport, status: BugReportStatus) => {
    try {
      await bugReportsApi.setStatus(r.id, status);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (r: BugReport) => {
    if (!window.confirm(t('Usunąć zgłoszenie #{id}?', { id: r.id }))) return;
    try {
      await bugReportsApi.remove(r.id);
      showToast?.(t('Usunięto zgłoszenie #{id}.', { id: r.id }));
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
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
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

      {reports === null ? (
        <p className="text-sm text-stone-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('Ładowanie…')}
        </p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-stone-400 rounded-xl border border-stone-800 bg-stone-900 p-4">{t('Brak zgłoszeń w tym widoku.')}</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const st = STATUSES.find((s) => s.id === r.status) || STATUSES[0];
            return (
              <li key={r.id} className="rounded-xl border border-stone-800 bg-stone-900 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-stone-100 tabular-nums">#{r.id}</span>
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 ${st.cls}`}>{t(st.label)}</span>
                  <span className="text-sm text-stone-300">{r.username || t('konto usunięte')}</span>
                  <span className="text-xs text-stone-500">{fmt(r.createdAt)}</span>
                  {r.page && <span className="text-xs text-stone-500">· {r.page}</span>}
                </div>

                <p className="text-sm text-stone-200 whitespace-pre-wrap break-words">{r.description}</p>

                {r.userAgent && (
                  <p className="text-xs text-stone-500 flex items-start gap-1.5">
                    <Monitor className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span className="break-all">{r.userAgent}</span>
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {r.hasScreenshot && (
                    <button type="button" onClick={() => openShot(r.id)} className="btn btn-secondary h-8 px-2.5 text-sm">
                      <ImageIcon className="w-4 h-4" /> {t('Zrzut ekranu')}
                    </button>
                  )}
                  <select
                    value={r.status}
                    onChange={(e) => setStatus(r, e.target.value as BugReportStatus)}
                    aria-label={t('Status zgłoszenia #{id}', { id: r.id })}
                    className="h-8 rounded-lg bg-stone-950 border border-stone-800 px-2 text-sm text-stone-200"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {t(s.label)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => remove(r)} aria-label={t('Usuń zgłoszenie #{id}', { id: r.id })} className="ml-auto w-8 h-8 rounded-lg text-stone-500 hover:text-rose-300 hover:bg-stone-800 flex items-center justify-center cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={closeShot} role="dialog" aria-modal="true" aria-label={t('Zrzut ekranu do zgłoszenia #{id}', { id: preview.id })}>
          <button type="button" onClick={closeShot} aria-label={t('Zamknij')} className="absolute top-4 right-4 w-10 h-10 rounded-lg bg-stone-900/90 text-stone-200 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          {preview.url ? (
            <img src={preview.url} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          ) : (
            <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
          )}
        </div>
      )}
    </div>
  );
};
