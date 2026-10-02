import React, { useEffect, useRef, useState } from 'react';
import { FeatureHand, FeatureTable } from './AuthFeatures';
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

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100 relative overflow-x-clip">
      {/* Poświata w tle */}
      <div className="absolute top-0 left-1/3 w-[640px] h-[640px] bg-gradient-to-tr from-amber-600/10 via-purple-600/10 to-blue-600/10 blur-[120px] pointer-events-none rounded-full" aria-hidden="true" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-10 lg:py-14 lg:grid lg:grid-cols-12 lg:gap-14 lg:items-start">

        {/* Opis aplikacji (na dużym ekranie z kartami funkcji) */}
        <section className="lg:col-span-7 space-y-6">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl shadow-lg shadow-black/40" />
            <span className="text-lg font-black tracking-tight text-amber-100">Mana Screw</span>
          </div>
          <div className="space-y-3 max-w-xl">
            <h1 className="text-[28px] sm:text-4xl lg:text-[44px] font-black tracking-tight leading-[1.08] text-white text-balance">
              Cała kolekcja kart Magic: The Gathering w jednym miejscu
            </h1>
            <p className="text-[15px] sm:text-base text-stone-300 leading-relaxed max-w-[60ch]">
              Skanuj karty telefonem, układaj je w klaserach i sprawdzaj ich wartość w złotówkach. Wystaw karty na
              sprzedaż jednym linkiem i znajdź graczy w swojej okolicy.
            </p>
          </div>
          <div className="hidden lg:block pt-4 pr-4">
            <FeatureTable />
          </div>
        </section>

        <div className="lg:col-span-5 mt-7 lg:mt-24 lg:sticky lg:top-10 w-full max-w-md mx-auto lg:max-w-none space-y-6">
        {/* Auth Card */}
        <div ref={formCardRef} className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 scroll-mt-6">
          
          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 bg-stone-950 rounded-xl border border-stone-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Logowanie
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Nowe konto
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-300 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="space-y-1">
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username field (only registration) */}
            {mode === 'register' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                  Nazwa gracza / użytkownika
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    ref={usernameRef}
                    placeholder="np. Planeswalker"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Email field */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                Adres e-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  placeholder="twoj.email@domena.pl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Hasło
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none transition-colors"
                />
              </div>
              {mode === 'register' && (
                <p className="text-[10px] text-stone-500 mt-1">Minimum 8 znaków</p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 hover:from-amber-400 to-yellow-500 text-stone-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Przetwarzanie...</span>
                </>
              ) : mode === 'register' ? (
                <>
                  <span>Zarejestruj konto i wejdź do kolekcji</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Zaloguj się do kolekcji</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>

          {/* Duży ekran: zachęta pod formularzem */}
          {mode === 'login' && (
            <p className="hidden lg:block text-sm text-stone-400 text-center mt-5">
              Nie masz konta?{' '}
              <button type="button" onClick={startRegistration} className="font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4 cursor-pointer">
                Załóż je w minutę
              </button>
            </p>
          )}
        </div>

        {/* Telefon: funkcje jako karty przewijane palcem */}
        <section className="lg:hidden mt-10 space-y-4" aria-labelledby="features-heading">
          <h2 id="features-heading" className="text-lg font-extrabold text-stone-100">Co zyskujesz z kontem</h2>
          <FeatureHand />
          {mode === 'login' && (
            <button
              type="button"
              onClick={startRegistration}
              className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-sm cursor-pointer"
            >
              Załóż konto
            </button>
          )}
        </section>

      </div>
    </div>
  );
};
