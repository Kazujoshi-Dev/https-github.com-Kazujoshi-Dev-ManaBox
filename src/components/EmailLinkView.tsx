import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, MailCheck } from 'lucide-react';
import { emailAuthApi } from '../services/api';
import type { AuthUser } from '../types';
import type { EmailLink } from '../utils/emailLinks';
import { useT } from '../i18n';

interface Props {
  link: EmailLink;
  /** Udane potwierdzenie lub reset: serwer od razu zwraca sesję (chyba że konto jest zablokowane). */
  onAuthSuccess: (user: AuthUser, token: string, message: string) => void;
  /** Powrót do ekranu logowania; `forgot` otwiera od razu prośbę o nowy link do zmiany hasła. */
  onDone: (next?: 'login' | 'forgot', message?: string) => void;
}

const card = 'w-full max-w-sm bg-stone-900 ring-1 ring-stone-800 rounded-2xl p-6 space-y-4 shadow-2xl';
const iconBox = 'w-12 h-12 rounded-2xl flex items-center justify-center';
const primaryBtn =
  'w-full h-12 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryBtn = 'w-full h-10 text-sm font-medium text-stone-400 hover:text-stone-200 cursor-pointer';
const input =
  'w-full bg-stone-950 border border-stone-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 rounded-xl px-3.5 py-3 text-base sm:text-sm text-stone-100 placeholder-stone-500 focus:outline-none';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-4 gap-6">
    <div className="flex items-center gap-3">
      <img src="/logo.webp" alt="" width={40} height={40} className="w-10 h-10" />
      <span className="text-lg font-bold tracking-tight text-stone-50">Mana Screw</span>
    </div>
    {children}
  </div>
);

const ErrorNote: React.FC<{ text: string }> = ({ text }) => (
  <p role="alert" className="p-3 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30 flex items-start gap-2.5 text-sm text-rose-200">
    <AlertCircle className="w-4 h-4 shrink-0 text-rose-300 mt-0.5" aria-hidden="true" />
    <span>{text}</span>
  </p>
);

/** Potwierdzenie adresu e-mail: token zużywamy od razu po otwarciu linku. */
const VerifyEmail: React.FC<Props> = ({ link, onAuthSuccess, onDone }) => {
  const t = useT();
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode uruchamia efekt dwa razy, a token działa tylko raz
    started.current = true;
    emailAuthApi
      .verifyEmail(link.token)
      .then((res) => {
        if (res.token && res.user) {
          onAuthSuccess(res.user, res.token, t('Adres e-mail potwierdzony. Witaj w Mana Screw!'));
        } else {
          setState('done');
        }
      })
      .catch((err) => {
        setError(err.message);
        setState('error');
      });
  }, [link.token, onAuthSuccess]);

  return (
    <Shell>
      <div className={card}>
        {state === 'loading' && (
          <div className="flex items-center gap-3 text-sm text-stone-300" role="status">
            <Loader2 className="w-5 h-5 animate-spin text-amber-300" aria-hidden="true" />
            {t('Potwierdzamy adres e-mail...')}
          </div>
        )}
        {state === 'done' && (
          <>
            <div className={`${iconBox} bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-300`}>
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">{t('Adres potwierdzony')}</h1>
            <p className="text-sm text-stone-400">{t('Możesz się teraz zalogować.')}</p>
            <button type="button" className={primaryBtn} onClick={() => onDone('login')}>
              {t('Przejdź do logowania')}
            </button>
          </>
        )}
        {state === 'error' && (
          <>
            <div className={`${iconBox} bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-300`}>
              <MailCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">{t('Nie udało się potwierdzić adresu')}</h1>
            <ErrorNote text={error} />
            <p className="text-xs text-stone-500">{t('Nowy link wyślesz z ekranu logowania: spróbuj się zalogować i wybierz „Wyślij link potwierdzający ponownie”.')}</p>
            <button type="button" className={primaryBtn} onClick={() => onDone('login')}>
              {t('Przejdź do logowania')}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
};

/** Ustawienie nowego hasła z linku: najpierw sprawdzamy token, potem pokazujemy formularz. */
const ResetPassword: React.FC<Props> = ({ link, onAuthSuccess, onDone }) => {
  const t = useT();
  const [state, setState] = useState<'checking' | 'form' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    emailAuthApi
      .checkResetToken(link.token)
      .then((r) => !cancelled && setState(r.valid ? 'form' : 'invalid'))
      .catch((err) => {
        if (cancelled) return;
        // Błąd sieci: pokażmy formularz, serwer i tak sprawdzi token przy zapisie
        setError(err.message);
        setState('form');
      });
    return () => {
      cancelled = true;
    };
  }, [link.token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t('Hasło musi mieć co najmniej 8 znaków.'));
    if (password !== repeat) return setError(t('Hasła nie są takie same.'));
    setSaving(true);
    try {
      const res = await emailAuthApi.resetPassword(link.token, password);
      if (res.token && res.user) {
        onAuthSuccess(res.user, res.token, t('Hasło zostało zmienione.'));
      } else {
        setState('done');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      <div className={card}>
        {state === 'checking' && (
          <div className="flex items-center gap-3 text-sm text-stone-300" role="status">
            <Loader2 className="w-5 h-5 animate-spin text-amber-300" aria-hidden="true" />
            {t('Sprawdzamy link...')}
          </div>
        )}
        {state === 'invalid' && (
          <>
            <div className={`${iconBox} bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-300`}>
              <KeyRound className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">{t('Link wygasł')}</h1>
            <p className="text-sm text-stone-400">
              {t('Ten link jest nieprawidłowy, wygasł albo został już użyty. Link do zmiany hasła działa 60 minut i tylko raz.')}
            </p>
            <button type="button" className={primaryBtn} onClick={() => onDone('forgot')}>
              {t('Wyślij nowy link')}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => onDone('login')}>
              {t('Wróć do logowania')}
            </button>
          </>
        )}
        {state === 'done' && (
          <>
            <div className={`${iconBox} bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-300`}>
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">{t('Hasło zmienione')}</h1>
            <p className="text-sm text-stone-400">{t('Możesz zalogować się nowym hasłem.')}</p>
            <button type="button" className={primaryBtn} onClick={() => onDone('login')}>
              {t('Przejdź do logowania')}
            </button>
          </>
        )}
        {state === 'form' && (
          <form onSubmit={submit} className="space-y-4">
            <div className={`${iconBox} bg-amber-400/15 ring-1 ring-amber-400/30 text-amber-300`}>
              <KeyRound className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold">{t('Ustaw nowe hasło')}</h1>
              <p className="text-sm text-stone-400">{t('Po zapisaniu wylogujemy Cię ze wszystkich innych urządzeń.')}</p>
            </div>
            {error && <ErrorNote text={error} />}
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-stone-300">{t('Nowe hasło')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('Co najmniej 8 znaków')}
                className={input}
                autoFocus
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-stone-300">{t('Powtórz hasło')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                className={input}
              />
            </label>
            <button type="submit" disabled={saving} className={primaryBtn}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t('Zapisz nowe hasło')}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => onDone('login')}>
              {t('Anuluj')}
            </button>
          </form>
        )}
      </div>
    </Shell>
  );
};

export const EmailLinkView: React.FC<Props> = (props) =>
  props.link.kind === 'verify' ? <VerifyEmail {...props} /> : <ResetPassword {...props} />;
