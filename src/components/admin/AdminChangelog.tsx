import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Send, Plus, Loader2, Languages } from 'lucide-react';
import { changelogApi, type ChangelogPendingDraft, type ChangelogType } from '../../services/api';
import { CHANGE_TYPES } from '../Changelog';
import { useT, locale } from '../../i18n';

const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

/** Panel admina: zmiany czekające na publikację o 23:30, ręczne wpisy i publikacja od razu. */
export const AdminChangelog: React.FC<{ showToast?: (m: string) => void }> = ({ showToast }) => {
  const t = useT();
  const [drafts, setDrafts] = useState<ChangelogPendingDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<ChangelogType>('new');
  const [area, setArea] = useState('');
  const [text, setText] = useState('');
  const [areaEn, setAreaEn] = useState('');
  const [textEn, setTextEn] = useState('');
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
    if (text.trim().length < 3 || textEn.trim().length < 3) return;
    setBusy(true);
    try {
      await changelogApi.add({
        type,
        area: area.trim() || undefined,
        text: text.trim(),
        areaEn: areaEn.trim() || undefined,
        textEn: textEn.trim()
      });
      setText('');
      setTextEn('');
      showToast?.(t('Dodano zmianę do dziennika (opublikuje się o 23:30).'));
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
      showToast?.(r.published ? t('Opublikowano {published} zmian.', { published: r.published }) : t('Nie ma nic do opublikowania.'));
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
          <h3 className="text-base font-semibold text-stone-100">{t('Zmiany czekające na publikację')}</h3>
          <p className="text-sm text-stone-400">
            {t('Wpisy z repozytorium i dodane tutaj. Publikują się automatycznie codziennie o 23:30.')}
          </p>
        </div>
        <button type="button" onClick={publish} disabled={busy || !drafts?.length} className="btn btn-secondary">
          <Send className="w-4 h-4" />
          {t('Opublikuj teraz')}
        </button>
      </div>

      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

      <div className="rounded-xl border border-stone-800 bg-stone-900 divide-y divide-stone-800">
        {drafts === null ? (
          <p className="p-4 text-sm text-stone-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('Ładowanie…')}
          </p>
        ) : drafts.length === 0 ? (
          <p className="p-4 text-sm text-stone-400">{t('Brak nowych zmian. Wszystko jest już w dzienniku.')}</p>
        ) : (
          drafts.map((d) => {
            const ct = CHANGE_TYPES.find((x) => x.id === d.type);
            return (
              <div key={d.id} className="p-3 sm:p-4 flex items-start gap-3">
                <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${ct?.dot || 'bg-stone-500'}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-stone-200">
                    {d.area && <span className="text-stone-400 font-medium">{d.area}: </span>}
                    {d.text}
                  </p>
                  {d.textEn ? (
                    <p className="text-sm text-stone-400 mt-0.5 flex gap-1.5">
                      <Languages className="w-3.5 h-3.5 mt-0.5 shrink-0 text-stone-500" aria-label="EN" />
                      <span>
                        {d.areaEn && <span className="font-medium">{d.areaEn}: </span>}
                        {d.textEn}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-300 mt-0.5">{t('Brak wersji angielskiej')}</p>
                  )}
                  <p className="text-xs text-stone-500 mt-0.5">
                    {t(ct?.label || '')} · {fmtDay(d.day)} · {d.source === 'admin' ? t('dodane w panelu') : t('z repozytorium')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  aria-label={t('Usuń wpis')}
                  title={t('Usuń wpis')}
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
        <h4 className="text-sm font-medium text-stone-200">{t('Dodaj zmianę ręcznie')}</h4>
        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ChangelogType)}
            aria-label={t('Rodzaj zmiany')}
            className="h-10 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100"
          >
            {CHANGE_TYPES.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {t(ct.label)}
              </option>
            ))}
          </select>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={60}
            placeholder={t('Część aplikacji (np. Talie)')}
            aria-label={t('Część aplikacji')}
            className="h-10 w-48 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100 placeholder-stone-500"
          />
          <input
            value={areaEn}
            onChange={(e) => setAreaEn(e.target.value)}
            maxLength={60}
            placeholder={t('Po angielsku (np. Decks)')}
            aria-label={t('Część aplikacji po angielsku')}
            className="h-10 w-48 rounded-lg bg-stone-950 border border-stone-800 px-3 text-sm text-stone-100 placeholder-stone-500"
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t('Opis zmiany dla użytkowników, jednym zdaniem')}
          aria-label={t('Opis zmiany')}
          className="w-full rounded-lg bg-stone-950 border border-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500"
        />
        <textarea
          value={textEn}
          onChange={(e) => setTextEn(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t('To samo zdanie po angielsku')}
          aria-label={t('Opis zmiany po angielsku')}
          className="w-full rounded-lg bg-stone-950 border border-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500"
        />
        <p className="text-xs text-stone-500">{t('Angielska nazwa części aplikacji uzupełni się sama dla znanych nazw (np. Talie → Decks).')}</p>
        <button type="submit" disabled={busy || text.trim().length < 3 || textEn.trim().length < 3} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          {t('Dodaj')}
        </button>
      </form>
    </div>
  );
};
