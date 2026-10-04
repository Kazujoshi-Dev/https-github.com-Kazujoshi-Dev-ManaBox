import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, X, Check } from 'lucide-react';
import { profileApi } from '../services/api';
import type { CitySuggestion, UserProfile } from '../types';

/**
 * Opcjonalna miejscowość użytkownika (do mapy sprzedawców).
 * Podpowiedzi z OpenStreetMap; zapis od razu po wybraniu z listy.
 */
export const CityPicker: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    profileApi.get().then(setProfile).catch(() => setProfile(null));
  }, []);

  // Podpowiedzi po krótkiej przerwie w pisaniu (oszczędzamy darmowy geokoder)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const list = await profileApi.searchCities(q);
        if (seq === searchSeq.current) setSuggestions(list);
      } catch (err: any) {
        if (seq === searchSeq.current) setMessage({ kind: 'error', text: err.message });
      } finally {
        if (seq === searchSeq.current) setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const save = async (label: string | null) => {
    setIsSaving(true);
    setMessage(null);
    try {
      const saved = await profileApi.saveCity(label);
      setProfile(saved);
      setQuery('');
      setSuggestions([]);
      setMessage({ kind: 'ok', text: label ? 'Zapisano miejscowość.' : 'Usunięto miejscowość.' });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-stone-200">Miejscowość (opcjonalnie)</p>
          <p className="text-[11px] text-stone-400">
            Pojawisz się na mapie sprzedawców, gdy masz karty na sprzedaż. Inni użytkownicy zobaczą tylko nazwę miasta,
            nigdy dokładny adres.
          </p>
        </div>
      </div>

      {profile?.city && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <span className="text-sm text-amber-200 truncate">{profile.cityLabel || profile.city}</span>
          <button
            type="button"
            onClick={() => save(null)}
            disabled={isSaving}
            className="shrink-0 h-9 px-2.5 rounded-lg text-xs font-semibold text-stone-300 hover:text-rose-300 hover:bg-stone-800 flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Usuń
          </button>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMessage(null);
          }}
          placeholder={profile?.city ? 'Zmień miejscowość...' : 'Wpisz nazwę miejscowości, np. Kraków'}
          aria-label="Miejscowość"
          autoComplete="off"
          className="w-full bg-stone-900 border border-stone-700 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
        />
        {(isSearching || isSaving) && <Loader2 className="w-4 h-4 text-amber-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>

      {suggestions.length > 0 && (
        <ul className="rounded-lg border border-stone-800 divide-y divide-stone-800 overflow-hidden" role="listbox" aria-label="Podpowiedzi miejscowości">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => save(s.label)}
                disabled={isSaving}
                className="w-full text-left px-3 py-2.5 min-h-11 text-sm text-stone-200 bg-stone-900 hover:bg-stone-800 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <MapPin className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 3 && !isSearching && suggestions.length === 0 && !message && (
        <p className="text-[11px] text-stone-500">Brak wyników. Spróbuj innej pisowni.</p>
      )}

      {message && (
        <p className={`text-[11px] flex items-center gap-1 ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-300'}`}>
          {message.kind === 'ok' && <Check className="w-3.5 h-3.5" />}
          {message.text}
        </p>
      )}
      <p className="text-[11px] text-stone-500">Dane miejscowości: © OpenStreetMap</p>
    </div>
  );
};
