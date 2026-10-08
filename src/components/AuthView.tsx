import React, { useEffect, useRef, useState } from 'react';
import { SUPPORT_URL } from './ui/SupportButton';
import { DISCORD_URL } from './ui/DiscordButton';
import { TermsLink } from './AppFooter';
import { versionLabel } from '../utils/appVersion';
import { BinderShowcase } from './auth/BinderShowcase';
import { FeatureBento } from './auth/FeatureBento';
import { useShowcaseCards } from './auth/useShowcaseCards';
import { AuthUser } from '../types';
import { emailAuthApi } from '../services/api';
import { LanguageSwitcher } from './ui/LanguageSwitcher';
import { useT, tServer } from '../i18n';

interface AuthViewProps {
  onAuthSuccess: (user: AuthUser, token: string) => void;
  /** Ekran startowy formularza, np. „forgot” po wygaśnięciu linku resetu hasła. */
  initialMode?: AuthMode;
}

type AuthMode = 'login' | 'register' | 'forgot';

/** Odstęp między kolejnymi prośbami o link z ekranu „Sprawdź skrzynkę”. */
const RESEND_COOLDOWN_S = 60;

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess, initialMode = 'login' }) => {
  const t = useT();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  // Po rejestracji (albo próbie logowania na niepotwierdzone konto): adres, na który poszedł link
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const [focusUsername, setFocusUsername] = useState(false);

  // „Załóż konto” z opisu funkcji: przełącz na rejestrację i przewiń do formularza
  const startRegistration = () => {
    setMode('register');
    setError(null);
    setSuccessMsg(null);
    setFocusUsername(true);
    formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  useEffect(() => {
    if (focusUsername && mode === 'register') {
      usernameRef.current?.focus({ preventScroll: true });
      setFocusUsername(false);
    }
  }, [focusUsername, mode]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const resendVerification = async (target: string) => {
    setError(null);
    setSuccessMsg(null);
    setResending(true);
    try {
      await emailAuthApi.resendVerification(target);
      setSuccessMsg(t('Wysłaliśmy nowy link. Sprawdź skrzynkę, także folder spam.'));
      setResendIn(RESEND_COOLDOWN_S);
    } catch (err: any) {
      setError(err.message || t('Nie udało się wysłać linku.'));
    } finally {
      setResending(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim()) {
      setError(t('Podaj adres e-mail użyty przy rejestracji.'));
      return;
    }
    setIsLoading(true);
    try {
      await emailAuthApi.forgotPassword(email.trim().toLowerCase());
      setSuccessMsg(t('Jeśli konto o tym adresie istnieje, wysłaliśmy na nie link do ustawienia nowego hasła. Link jest ważny 60 minut.'));
    } catch (err: any) {
      setError(err.message || t('Nie udało się wysłać linku.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setCanResend(false);

    if (!email.trim() || !password.trim()) {
      setError(t('Podaj adres email oraz hasło.'));
      return;
    }

    if (mode === 'register' && !username.trim()) {
      setError(t('Podaj nazwę użytkownika.'));
      return;
    }

    if (mode === 'register' && password.length < 8) {
      setError(t('Hasło musi mieć co najmniej 8 znaków.'));
      return;
    }

    setIsLoading(true);

    try {
      let endpoint = '/api/auth/login';
      if (mode === 'register') endpoint = '/api/auth/register';

      const body = {
        email: email.trim().toLowerCase(),
        password,
        username: username.trim() || undefined
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        // Fallback if response was plain text or HTML
        if (res.status === 404) {
          throw new Error(t('Serwer chwilowo nie odpowiada (404). Odśwież stronę za moment.'));
        }
        throw new Error(t('Wystąpił błąd komunikacji z serwerem (kod {code}).', { code: res.status }));
      }

      if (!res.ok) {
        if (data?.code === 'EMAIL_NOT_VERIFIED') {
          setCanResend(true);
        }
        throw new Error(data?.error ? (tServer(data.error) as string) : t('Błąd autoryzacji ({code})', { code: res.status }));
      }

      if (data?.pendingVerification) {
        setPendingEmail(data.email || email.trim().toLowerCase());
        setPassword('');
        if (data.mailSent === false) {
          setError(t('Konto zostało założone, ale nie udało się wysłać maila. Kliknij „Wyślij link ponownie”.'));
        }
        return;
      }

      if (data?.token && data?.user) {
        onAuthSuccess(data.user, data.token);
      } else {
        throw new Error(t('Nieprawidłowa odpowiedź serwera autoryzacji.'));
      }
    } catch (err: any) {
      setError(err.message || t('Nie udało się połączyć z serwerem.'));
    } finally {
      setIsLoading(false);
    }
  };

  const cards = useShowcaseCards();
  // Tło: grafika legendarnej karty z dzisiejszego zestawu (zmienia się codziennie)
  const backdrop = cards.find((c) => c.legendary && c.artCrop)?.artCrop || cards.find((c) => c.artCrop)?.artCrop || null;
  const [backdropLoaded, setBackdropLoaded] = useState(false);
  // Bez kart (np. baza kart jeszcze się synchronizuje) formularz stoi na środku, bez pustej kolumny
  const hasCards = cards.length >= 3;
  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setSuccessMsg(null);
    setCanResend(false);
    setPendingEmail(null);
  };
  const inputCls =
    'w-full h-11 bg-stone-950 border border-stone-700 hover:border-stone-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 rounded-lg px-3.5 text-base sm:text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors';
  const labelCls = 'block text-sm font-medium text-stone-200';
  const linkCls = 'font-medium text-amber-300 hover:text-amber-200 underline underline-offset-[3px] decoration-amber-300/40 hover:decoration-amber-200 cursor-pointer';
  const primaryBtnCls =
    'w-full h-11 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 active:translate-y-px text-stone-950 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait';
  const secondaryBtnCls =
    'w-full h-11 rounded-lg border border-stone-700 hover:border-stone-500 text-stone-100 text-sm font-medium cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  // Komunikaty: zwykły akapit z kreską z lewej, bez ikon
  const notices = (
    <>
      {error && (
        <p role="alert" className="border-l-2 border-rose-400 bg-rose-500/[0.08] rounded-r-md pl-3 pr-3 py-2.5 text-sm text-rose-200 leading-relaxed">
          {error}
        </p>
      )}
      {successMsg && (
        <p role="status" className="border-l-2 border-emerald-400 bg-emerald-500/[0.08] rounded-r-md pl-3 pr-3 py-2.5 text-sm text-emerald-200 leading-relaxed">
          {successMsg}
        </p>
      )}
    </>
  );

  const backToLogin = (
    <p className="text-sm text-stone-400">
      {t('Pamiętasz już?')}{' '}
      <button type="button" onClick={() => switchMode('login')} className={linkCls}>
        {t('Wróć do logowania')}
      </button>
    </p>
  );

  return (
    <div className="auth-page relative isolate min-h-dvh bg-stone-950 text-stone-100 overflow-x-clip">
      {/* Tło: przyciemniona grafika karty, ziarno i winieta; wygasa ku dołowi strony */}
      <div className="auth-backdrop" aria-hidden="true">
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            referrerPolicy="no-referrer"
            onLoad={() => setBackdropLoaded(true)}
            className={`auth-backdrop-art ${backdropLoaded ? 'is-loaded' : ''}`}
          />
        )}
        <div className="auth-backdrop-shade" />
        <div className="auth-backdrop-grain" />
      </div>

      {/* 1. Hero: logowanie + strona klasera */}
      <section className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pt-[calc(1.25rem+env(safe-area-inset-top))] lg:pt-12 pb-12 lg:pb-20 grid lg:grid-cols-12 gap-10 lg:gap-14 items-center lg:min-h-[100dvh]">
        <div className={`${hasCards ? 'lg:col-span-5' : 'lg:col-span-12 lg:max-w-xl lg:mx-auto w-full'} space-y-7 auth-rise`}>
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="" width={48} height={48} className="w-12 h-12" />
            <span className="text-lg font-bold tracking-tight text-stone-50">Mana Screw</span>
            <LanguageSwitcher className="ml-auto" />
          </div>

          <div className="space-y-3">
            <h1 className="text-[32px] sm:text-4xl xl:text-[44px] font-bold tracking-tight leading-[1.05] text-stone-50 text-balance">
              {t('Twoja kolekcja Magic: The Gathering, zawsze pod ręką')}
            </h1>
            <p className="text-base text-stone-400 leading-relaxed max-w-[46ch]">
              {t('Skanuj karty telefonem, buduj talie w każdym formacie, także do MTG Arena, i śledź wartość kolekcji w złotówkach. Sprzedawaj i wymieniaj z graczami z okolicy.')}
            </p>
          </div>

          {/* Formularz */}
          <div ref={formCardRef} className="max-w-md rounded-xl bg-stone-900 border border-stone-800 p-6 sm:p-7 scroll-mt-6">
            {pendingEmail ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-stone-50">{t('Sprawdź skrzynkę')}</h2>
                  <p className="text-sm text-stone-300 leading-relaxed">
                    {t('Wysłaliśmy link aktywacyjny na')} <strong className="font-semibold text-stone-50 break-all">{pendingEmail}</strong>. {t('Kliknij go, aby potwierdzić adres i zalogować się. Link jest ważny 24 godziny.')}
                  </p>
                  <p className="text-sm text-stone-500">{t('Nie widzisz maila? Zajrzyj do folderu spam albo „Oferty”.')}</p>
                </div>
                {notices}
                <button
                  type="button"
                  disabled={resending || resendIn > 0}
                  onClick={() => resendVerification(pendingEmail)}
                  className={secondaryBtnCls}
                >
                  {resending ? t('Wysyłam...') : resendIn > 0 ? <span className="tabular-nums">{t('Wyślij ponownie za {s} s', { s: resendIn })}</span> : t('Wyślij link ponownie')}
                </button>
                {backToLogin}
              </div>
            ) : mode === 'forgot' ? (
              <form onSubmit={handleForgot} className="space-y-5">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-stone-50">{t('Nowe hasło')}</h2>
                  <p className="text-sm text-stone-400 leading-relaxed">{t('Podaj adres e-mail użyty przy rejestracji. Wyślemy na niego link do ustawienia nowego hasła.')}</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="auth-forgot-email" className={labelCls}>{t('Adres e-mail')}</label>
                  <input
                    id="auth-forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {notices}
                <button type="submit" disabled={isLoading} className={primaryBtnCls}>
                  {isLoading ? t('Wysyłam...') : t('Wyślij link')}
                </button>
                {backToLogin}
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <h2 className="text-xl font-semibold tracking-tight text-stone-50">
                    {mode === 'register' ? t('Załóż konto') : t('Zaloguj się')}
                  </h2>
                  <p className="text-sm text-stone-400">
                    {mode === 'register' ? t('Masz już konto?') : t('Pierwszy raz tutaj?')}{' '}
                    <button type="button" onClick={() => switchMode(mode === 'register' ? 'login' : 'register')} className={linkCls}>
                      {mode === 'register' ? t('Zaloguj się') : t('Załóż darmowe konto')}
                    </button>
                  </p>
                </div>

                {mode === 'register' && (
                  <div className="space-y-2">
                    <label htmlFor="auth-username" className={labelCls}>{t('Nazwa gracza')}</label>
                    <input
                      id="auth-username"
                      type="text"
                      required
                      ref={usernameRef}
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={inputCls}
                      aria-describedby="auth-username-help"
                    />
                    <p id="auth-username-help" className="text-xs text-stone-500">{t('Widoczna dla innych graczy, np. w ofercie sprzedaży.')}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="auth-email" className={labelCls}>{t('Adres e-mail')}</label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="auth-password" className={labelCls}>{t('Hasło')}</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs font-medium text-stone-400 hover:text-amber-300 underline-offset-[3px] hover:underline cursor-pointer"
                      >
                        {t('Nie pamiętasz?')}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      minLength={mode === 'register' ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputCls} pr-16`}
                      aria-describedby={mode === 'register' ? 'auth-password-help' : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-controls="auth-password"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-2.5 rounded-md text-xs font-medium text-stone-400 hover:text-stone-100 hover:bg-stone-800 cursor-pointer"
                    >
                      {showPassword ? t('Ukryj') : t('Pokaż')}
                    </button>
                  </div>
                  {mode === 'register' && <p id="auth-password-help" className="text-xs text-stone-500">{t('Co najmniej 8 znaków.')}</p>}
                </div>

                {notices}
                {canResend && mode === 'login' && (
                  <button
                    type="button"
                    disabled={resending || resendIn > 0}
                    onClick={() => resendVerification(email.trim().toLowerCase())}
                    className={secondaryBtnCls}
                  >
                    {resending ? t('Wysyłam...') : resendIn > 0 ? <span className="tabular-nums">{t('Wyślij link ponownie za {s} s', { s: resendIn })}</span> : t('Wyślij link potwierdzający ponownie')}
                  </button>
                )}

                <button type="submit" disabled={isLoading} className={primaryBtnCls}>
                  {isLoading
                    ? mode === 'register' ? t('Zakładam konto...') : t('Loguję...')
                    : mode === 'register' ? t('Załóż konto') : t('Zaloguj się')}
                </button>
              </form>
            )}
          </div>
        </div>

        {hasCards && (
        <div className="lg:col-span-7 auth-rise auth-rise-late">
          <div className="hidden sm:block lg:pl-6 w-full max-w-[min(36rem,calc((100dvh-6rem)/1.45))] mx-auto">
            <BinderShowcase cards={cards} />
          </div>
          <div className="sm:hidden">
            <BinderShowcase cards={cards} compact />
          </div>
        </div>
        )}
      </section>

      {/* 2. Funkcje */}
      <section className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pb-16 lg:pb-24 space-y-8" aria-labelledby="auth-features">
        <h2 id="auth-features" className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-50 max-w-xl">
          {t('Wszystko, czego potrzebuje kolekcjoner')}
        </h2>
        <FeatureBento cards={cards} />
      </section>

      {/* 3. Zachęta do rejestracji */}
      {mode === 'login' && !pendingEmail && (
        <section className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pb-16">
          <div className="rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-stone-50">{t('Konto jest darmowe')}</h2>
              <p className="text-sm text-stone-400">{t('Wystarczy e-mail i hasło. Kolekcję możesz zaimportować z pliku tekstowego.')}</p>
            </div>
            <button
              type="button"
              onClick={startRegistration}
              className="h-11 px-6 rounded-lg bg-amber-400 hover:bg-amber-300 active:translate-y-px text-stone-950 font-semibold text-sm shrink-0 cursor-pointer transition-colors"
            >
              {t('Załóż konto')}
            </button>
          </div>
        </section>
      )}

      {/* 4. Stopka: informacja prawna wymagana przez Fan Content Policy */}
      <footer className="relative border-t border-stone-900">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-2 text-xs text-stone-500 leading-relaxed">
          <p>
            Mana Screw is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
          </p>
          <p>
            {t('Dane i obrazy kart:')}{' '}
            <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">Scryfall</a>. {t('Ceny: Cardmarket i TCGPlayer. Mapa:')} ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">OpenStreetMap</a>.
          </p>
          <p>
            {t('Lubisz Mana Screw?')}{' '}
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline">{t('Postaw kawę')}</a>
            <span className="text-stone-600"> · </span>
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-stone-400 hover:text-stone-200 underline-offset-2 hover:underline">Discord</a>
          </p>
          <p>
            {t('manascrew.eu nie odpowiada za oszustwa wynikające z handlu między graczami.')} <TermsLink />
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{t('Wersja')} {versionLabel()}</span>
          </p>
        </div>
      </footer>
    </div>
  );
};
