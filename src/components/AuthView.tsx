import React, { useEffect, useRef, useState } from 'react';
import { SupportButton } from './ui/SupportButton';
import { TermsLink } from './AppFooter';
import { versionLabel } from '../utils/appVersion';
import { BinderShowcase } from './auth/BinderShowcase';
import { FeatureBento } from './auth/FeatureBento';
import { useShowcaseCards } from './auth/useShowcaseCards';
import { AuthUser } from '../types';
import { emailAuthApi } from '../services/api';
import { Lock, Mail, User, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Loader2, MailCheck } from 'lucide-react';

interface AuthViewProps {
  onAuthSuccess: (user: AuthUser, token: string) => void;
  /** Ekran startowy formularza, np. „forgot” po wygaśnięciu linku resetu hasła. */
  initialMode?: AuthMode;
}

type AuthMode = 'login' | 'register' | 'forgot';

/** Odstęp między kolejnymi prośbami o link z ekranu „Sprawdź skrzynkę”. */
const RESEND_COOLDOWN_S = 60;

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess, initialMode = 'login' }) => {
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
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const resendVerification = async (target: string) => {
    setError(null);
    setSuccessMsg(null);
    setResending(true);
    try {
      await emailAuthApi.resendVerification(target);
      setSuccessMsg('Wysłaliśmy nowy link. Sprawdź skrzynkę, także folder spam.');
      setResendIn(RESEND_COOLDOWN_S);
    } catch (err: any) {
      setError(err.message || 'Nie udało się wysłać linku.');
    } finally {
      setResending(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim()) {
      setError('Podaj adres e-mail użyty przy rejestracji.');
      return;
    }
    setIsLoading(true);
    try {
      await emailAuthApi.forgotPassword(email.trim().toLowerCase());
      setSuccessMsg('Jeśli konto o tym adresie istnieje, wysłaliśmy na nie link do ustawienia nowego hasła. Link jest ważny 60 minut.');
    } catch (err: any) {
      setError(err.message || 'Nie udało się wysłać linku.');
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
      setError('Podaj adres email oraz hasło.');
      return;
    }

    if (mode === 'register' && !username.trim()) {
      setError('Podaj nazwę użytkownika.');
      return;
    }

    if (mode === 'register' && password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
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
          throw new Error('Serwer chwilowo nie odpowiada (404). Odśwież stronę za moment.');
        }
        throw new Error(`Wystąpił błąd komunikacji z serwerem (kod ${res.status}).`);
      }

      if (!res.ok) {
        if (data?.code === 'EMAIL_NOT_VERIFIED') {
          setCanResend(true);
        }
        throw new Error(data?.error || `Błąd autoryzacji (${res.status})`);
      }

      if (data?.pendingVerification) {
        setPendingEmail(data.email || email.trim().toLowerCase());
        setPassword('');
        if (data.mailSent === false) {
          setError('Konto zostało założone, ale nie udało się wysłać maila. Kliknij „Wyślij link ponownie”.');
        }
        return;
      }

      if (data?.token && data?.user) {
        onAuthSuccess(data.user, data.token);
      } else {
        throw new Error('Nieprawidłowa odpowiedź serwera autoryzacji.');
      }
    } catch (err: any) {
      setError(err.message || 'Nie udało się połączyć z serwerem.');
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
    'w-full bg-stone-950 border border-stone-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 rounded-xl pl-10 pr-3.5 py-3 text-base sm:text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors';
  const labelCls = 'block text-sm font-medium text-stone-300 mb-1.5';

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
          </div>

          <div className="space-y-3">
            <h1 className="text-[32px] sm:text-4xl xl:text-[44px] font-bold tracking-tight leading-[1.05] text-stone-50 text-balance">
              Twoja kolekcja Magic: The Gathering, zawsze pod ręką
            </h1>
            <p className="text-base text-stone-400 leading-relaxed max-w-[46ch]">
              Skanuj karty telefonem, buduj talie Commander i śledź wartość kolekcji w złotówkach. Sprzedawaj i wymieniaj z graczami z okolicy.
            </p>
          </div>

          {/* Formularz */}
          <div ref={formCardRef} className="rounded-2xl bg-stone-900/90 backdrop-blur-md ring-1 ring-stone-700/60 p-5 sm:p-6 space-y-5 scroll-mt-6 shadow-[0_24px_60px_-24px_rgba(12,10,9,0.9)]">
            {pendingEmail ? (
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/15 ring-1 ring-amber-400/30 text-amber-300 flex items-center justify-center">
                  <MailCheck className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-stone-50">Sprawdź skrzynkę</h2>
                  <p className="text-sm text-stone-300 leading-relaxed">
                    Wysłaliśmy link aktywacyjny na <strong className="text-stone-50 break-all">{pendingEmail}</strong>. Kliknij go, aby potwierdzić adres i zalogować się. Link jest ważny 24 godziny.
                  </p>
                  <p className="text-xs text-stone-500">Nie widzisz maila? Zajrzyj do folderu spam albo „Oferty”.</p>
                </div>
                {error && (
                  <p role="alert" className="p-3 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30 flex items-start gap-2.5 text-sm text-rose-200">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-300 mt-0.5" aria-hidden="true" />
                    <span>{error}</span>
                  </p>
                )}
                {successMsg && (
                  <p role="status" className="p-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-start gap-2.5 text-sm text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300 mt-0.5" aria-hidden="true" />
                    <span>{successMsg}</span>
                  </p>
                )}
                <button
                  type="button"
                  disabled={resending || resendIn > 0}
                  onClick={() => resendVerification(pendingEmail)}
                  className="w-full h-11 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {resending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  {resendIn > 0 ? <span className="tabular-nums">Wyślij ponownie za {resendIn} s</span> : 'Wyślij link ponownie'}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full h-10 text-sm font-medium text-stone-400 hover:text-stone-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  Wróć do logowania
                </button>
              </div>
            ) : mode === 'forgot' ? (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-stone-50">Nie pamiętasz hasła?</h2>
                  <p className="text-sm text-stone-400 leading-relaxed">Podaj adres e-mail użyty przy rejestracji. Wyślemy na niego link do ustawienia nowego hasła.</p>
                </div>
                <div>
                  <label htmlFor="auth-forgot-email" className={labelCls}>Adres e-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
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
                </div>
                {error && (
                  <p role="alert" className="p-3 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30 flex items-start gap-2.5 text-sm text-rose-200">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-300 mt-0.5" aria-hidden="true" />
                    <span>{error}</span>
                  </p>
                )}
                {successMsg && (
                  <p role="status" className="p-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-start gap-2.5 text-sm text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300 mt-0.5" aria-hidden="true" />
                    <span>{successMsg}</span>
                  </p>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-stone-950 font-bold text-sm flex items-center justify-center gap-2 transition-[background-color,transform] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Mail className="w-4 h-4" aria-hidden="true" />}
                  <span>{isLoading ? 'Chwileczkę...' : 'Wyślij link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full h-10 text-sm font-medium text-stone-400 hover:text-stone-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  Wróć do logowania
                </button>
              </form>
            ) : (
              <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-stone-950 ring-1 ring-stone-800" role="tablist" aria-label="Logowanie lub rejestracja">
                {(['login', 'register'] as AuthMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchMode(m)}
                    className={`h-10 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                      mode === m ? 'bg-stone-800 text-stone-50 shadow-sm' : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {m === 'login' ? 'Logowanie' : 'Załóż konto'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
                {mode === 'register' && (
                  <div>
                    <label htmlFor="auth-username" className={labelCls}>Nazwa gracza</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
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
                    </div>
                    <p id="auth-username-help" className="text-xs text-stone-500 mt-1.5">Widoczna dla innych graczy, np. w ofercie sprzedaży.</p>
                  </div>
                )}

                <div>
                  <label htmlFor="auth-email" className={labelCls}>Adres e-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
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
                </div>

                <div>
                  <label htmlFor="auth-password" className={labelCls}>Hasło</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-password"
                      type="password"
                      required
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      minLength={mode === 'register' ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputCls}
                      aria-describedby={mode === 'register' ? 'auth-password-help' : undefined}
                    />
                  </div>
                  {mode === 'register' && <p id="auth-password-help" className="text-xs text-stone-500 mt-1.5">Co najmniej 8 znaków.</p>}
                  {mode === 'login' && (
                    <div className="mt-2 text-right">
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs font-medium text-stone-400 hover:text-amber-300 underline-offset-2 hover:underline cursor-pointer"
                      >
                        Nie pamiętasz hasła?
                      </button>
                    </div>
                  )}
                </div>

                {error && (
                  <p role="alert" className="p-3 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30 flex items-start gap-2.5 text-sm text-rose-200">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-300 mt-0.5" aria-hidden="true" />
                    <span>{error}</span>
                  </p>
                )}
                {successMsg && (
                  <p role="status" className="p-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-start gap-2.5 text-sm text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300 mt-0.5" aria-hidden="true" />
                    <span>{successMsg}</span>
                  </p>
                )}
                {canResend && mode === 'login' && (
                  <button
                    type="button"
                    disabled={resending || resendIn > 0}
                    onClick={() => resendVerification(email.trim().toLowerCase())}
                    className="w-full h-10 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {resending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    {resendIn > 0 ? <span className="tabular-nums">Wyślij link ponownie za {resendIn} s</span> : 'Wyślij link potwierdzający ponownie'}
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-stone-950 font-bold text-sm flex items-center justify-center gap-2 transition-[background-color,transform] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Chwileczkę...</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'register' ? 'Załóż konto' : 'Zaloguj się'}</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>
              </>
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
          Wszystko, czego potrzebuje kolekcjoner
        </h2>
        <FeatureBento cards={cards} />
      </section>

      {/* 3. Zachęta do rejestracji */}
      {mode === 'login' && !pendingEmail && (
        <section className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pb-16">
          <div className="rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-stone-50">Konto jest darmowe</h2>
              <p className="text-sm text-stone-400">Wystarczy e-mail i hasło. Kolekcję możesz zaimportować z pliku tekstowego.</p>
            </div>
            <button
              type="button"
              onClick={startRegistration}
              className="h-12 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-stone-950 font-bold text-sm shrink-0 cursor-pointer transition-[background-color,transform]"
            >
              Załóż konto
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
            Dane i obrazy kart:{' '}
            <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">Scryfall</a>. Ceny: Cardmarket i TCGPlayer. Mapa: ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">OpenStreetMap</a>.
          </p>
          <p>
            Lubisz Mana Screw? <SupportButton variant="link" />
          </p>
          <p>
            manascrew.eu nie odpowiada za oszustwa wynikające z handlu między graczami. <TermsLink />
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">Wersja {versionLabel()}</span>
          </p>
        </div>
      </footer>
    </div>
  );
};
