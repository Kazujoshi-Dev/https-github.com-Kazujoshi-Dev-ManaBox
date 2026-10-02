import React, { useState } from 'react';
import { AuthUser } from '../types';
import { Sparkles, Lock, Mail, User, ArrowRight, ShieldCheck, Database, Layers, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-amber-600/10 via-purple-600/10 to-blue-600/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-500/5 blur-3xl pointer-events-none rounded-full" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Mana Screw
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 max-w-sm mx-auto">
            Zaloguj się, aby zarządzać swoją prywatną kolekcją kart, klaserami i wycenami w PLN.
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
          
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

          {/* Database info badge */}
          <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-amber-400" />
              <span>Baza danych:</span>
            </span>
            <span className="font-mono text-stone-300 bg-stone-950 px-2 py-0.5 rounded border border-stone-800">
              PostgreSQL / Dedykowana
            </span>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-3 gap-3 text-center text-[11px] text-stone-400">
          <div className="bg-stone-900/50 border border-stone-800/60 p-2.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <span>Prywatna baza</span>
          </div>
          <div className="bg-stone-900/50 border border-stone-800/60 p-2.5 rounded-xl">
            <Layers className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <span>Własne klasery</span>
          </div>
          <div className="bg-stone-900/50 border border-stone-800/60 p-2.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <span>Ceny Cardmarket PLN</span>
          </div>
        </div>

      </div>
    </div>
  );
};
