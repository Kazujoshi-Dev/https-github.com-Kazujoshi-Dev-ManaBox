import React, { useEffect, useRef, useState } from 'react';
import { BinderShowcase } from './auth/BinderShowcase';
import { FeatureBento } from './auth/FeatureBento';
import { useShowcaseCards } from './auth/useShowcaseCards';
import '@fontsource-variable/geist';
import { AuthUser } from '../types';
import { Lock, Mail, User, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface AuthViewProps {
  onAuthSuccess: (user: AuthUser, token: string) => void;
}

type AuthMode = 'login' | 'register';

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

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
        throw new Error(data?.error || `Błąd autoryzacji (${res.status})`);
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
  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setSuccessMsg(null);
  };
  const inputCls =
    'w-full bg-stone-950 border border-stone-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 rounded-xl pl-10 pr-3.5 py-3 text-base sm:text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors';
  const labelCls = 'block text-sm font-medium text-stone-300 mb-1.5';

  return (
    <div className="auth-page min-h-dvh bg-stone-950 text-stone-100 overflow-x-clip">
      {/* 1. Hero: logowanie + strona klasera */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pt-[calc(1.25rem+env(safe-area-inset-top))] lg:pt-12 pb-12 lg:pb-20 grid lg:grid-cols-12 gap-10 lg:gap-14 items-center lg:min-h-[100dvh]">
        <div className="lg:col-span-5 space-y-7 auth-rise">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
            <span className="text-lg font-bold tracking-tight text-stone-50">Mana Screw</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-[32px] sm:text-4xl xl:text-[44px] font-bold tracking-tight leading-[1.05] text-stone-50 text-balance">
              Twoja kolekcja Magic: The Gathering, zawsze pod ręką
            </h1>
            <p className="text-base text-stone-400 leading-relaxed max-w-[46ch]">
              Skanuj karty telefonem, układaj klasery i sprawdzaj wartość w złotówkach. Sprzedawaj i wymieniaj z graczami z okolicy.
            </p>
          </div>

          {/* Formularz */}
          <div ref={formCardRef} className="rounded-2xl bg-stone-900 ring-1 ring-stone-800 p-5 sm:p-6 space-y-5 scroll-mt-6 shadow-[0_24px_60px_-24px_rgba(12,10,9,0.9)]">
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
          </div>
        </div>

        <div className="lg:col-span-7 auth-rise auth-rise-late">
          <div className="hidden sm:block lg:pl-6 w-full max-w-[min(36rem,calc((100dvh-6rem)/1.45))] mx-auto">
            <BinderShowcase cards={cards} />
          </div>
          <div className="sm:hidden">
            <BinderShowcase cards={cards} compact />
          </div>
        </div>
      </section>

      {/* 2. Funkcje */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pb-16 lg:pb-24 space-y-8" aria-labelledby="auth-features">
        <h2 id="auth-features" className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-50 max-w-xl">
          Wszystko, czego potrzebuje kolekcjoner
        </h2>
        <FeatureBento cards={cards} />
      </section>

      {/* 3. Zachęta do rejestracji */}
      {mode === 'login' && (
        <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pb-16">
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
      <footer className="border-t border-stone-900">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-2 text-xs text-stone-500 leading-relaxed">
          <p>
            Mana Screw is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
          </p>
          <p>
            Dane i obrazy kart:{' '}
            <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">Scryfall</a>. Ceny: Cardmarket i TCGPlayer. Mapa: ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-300">OpenStreetMap</a>.
          </p>
        </div>
      </footer>
    </div>
  );
};
