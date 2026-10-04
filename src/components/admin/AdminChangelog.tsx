import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Send, Plus, Loader2 } from 'lucide-react';
import { changelogApi, type ChangelogPendingDraft, type ChangelogType } from '../../services/api';
import { CHANGE_TYPES } from '../Changelog';

const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });

/** Panel admina: zmiany czekające na publikację o 23:30, ręczne wpisy i publikacja od razu. */
export const AdminChangelog: React.FC<{ showToast?: (m: string) => void }> = ({ showToast }) => {
  const [drafts, setDrafts] = useState<ChangelogPendingDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<ChangelogType>('new');
  const [area, setArea] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    changelogApi
      .pending()
      .then((d) => {
        setDrafts(d.drafts);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) return;
    setBusy(true);
    try {
      await changelogApi.add({ type, area: area.trim() || undefined, text: text.trim() });
      setText('');
      showToast?.('Dodano zmianę do dziennika (opublikuje się o 23:30).');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await changelogApi.remove(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const r = await changelogApi.publishNow();
      showToast?.(r.published ? `Opublikowano ${r.published} zmian.` : 'Nie ma nic do opublikowania.');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-stone-100">Zmiany czekające na publikację</h3>
          <p className="text-sm text-stone-400">
            Wpisy z repozytorium i dodane tutaj. Publikują się automatycznie codziennie o 23:30.
          </p>
        </div>
        <button type="button" onClick={publish} disabled={busy || !drafts?.length} className="btn btn-secondary">
          <Send className="w-4 h-4" />
          Opublikuj teraz
        </button>
      </div>

      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

      <div className="rounded-xl border border-stone-800 bg-stone-900 divide-y divide-stone-800">
        {drafts === null ? (
          <p className="p-4 text-sm text-stone-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie…
          </p>
        ) : drafts.length === 0 ? (
          <p className="p-4 text-sm text-stone-400">Brak nowych zmian. Wszystko jest już w dzienniku.</p>
        ) : (
          drafts.map((d) => {
            const t = CHANGE_TYPES.find((x) => x.id === d.type);
            return (
              <div key={d.id} className="p-3 sm:p-4 flex items-start gap-3">
                <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${t?.dot || 'bg-stone-500'}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-stone-200">
                    {d.area && <span className="text-stone-400 font-medium">{d.area}: </span>}
                    {d.text}
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {t?.label} · {fmtDay(d.day)} · {d.source === 'admin' ? 'dodane w panelu' : 'z repozytorium'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  aria-label="Usuń wpis"
                  title="Usuń wpis"
                  className="w-8 h-8 rounded-lg text-stone-500 hover:text-rose-300 hover:bg-stone-800 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={add} className="rounded-xl border border-stone-800 bg-stone-900 p-4 space-y-3">
        <h4 className="text-sm font-medium text-stone-200">Dodaj zmianę ręcznie</h4>
        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ChangelogType)}
            aria-label="Rodzaj zmiany"
            className="h-10 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100"
          >
            {CHANGE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={60}
            placeholder="Część aplikacji (np. Talie)"
            aria-label="Część aplikacji"
            className="h-10 w-48 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100 placeholder-stone-500"
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Opis zmiany dla użytkowników, jednym zdaniem"
          aria-label="Opis zmiany"
          className="w-full rounded-lg bg-stone-950 border border-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500"
        />
        <button type="submit" disabled={busy || text.trim().length < 3} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Dodaj
        </button>
      </form>
    </div>
  );
};
