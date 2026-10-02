import React, { useState } from 'react';
import { KeyRound, Loader2, AlertCircle, LogOut } from 'lucide-react';
import { authApi } from '../services/api';
import type { AuthUser } from '../types';

interface Props {
  user: AuthUser;
  onChanged: (user: AuthUser, token: string) => void;
  onLogout: () => void;
}

/** Ekran po resecie hasła przez administratora: trzeba ustawić własne hasło. */
export const ForcePasswordChange: React.FC<Props> = ({ user, onChanged, onLogout }) => {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Hasło musi mieć co najmniej 8 znaków.');
    if (password !== repeat) return setError('Hasła nie są takie same.');
    setSaving(true);
    try {
      const res = await authApi.changePassword(password);
      onChanged(res.user, res.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const input =
    'w-full bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl px-3.5 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none';

  return (
    <div className="min-h-dvh bg-stone-950 flex items-center justify-center p-4 text-stone-100">
      <form onSubmit={submit} className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
          <KeyRound className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-black">Ustaw nowe hasło</h1>
          <p className="text-sm text-stone-400">
            Cześć, <strong className="text-stone-200">{user.username}</strong>! Logujesz się hasłem tymczasowym od administratora.
            Ustaw własne hasło, aby korzystać z konta.
          </p>
        </div>

        {error && (
          <p className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            {error}
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Nowe hasło</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Co najmniej 8 znaków"
            className={input}
            autoFocus
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Powtórz hasło</span>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className={input}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Zapisz hasło
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full h-10 text-xs font-semibold text-stone-400 hover:text-stone-200 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Wyloguj
        </button>
      </form>
    </div>
  );
};
