import React, { useState } from 'react';
import { X, Share2, Copy, Check, ExternalLink, Loader2, Lock, Globe, FileText } from 'lucide-react';
import type { DeckItem } from '../../types';
import { decksApi } from '../../services/api';
import { useBackToClose } from '../../hooks/useBackButton';

/** Lista kart w formacie tekstowym (np. do Moxfield / Archidekt): „1 Nazwa karty”. */
export function deckToText(deck: DeckItem): string {
  const lines: string[] = [];
  if (deck.commander) lines.push(`1 ${deck.commander.name}`, '');
  deck.cards
    .filter((e) => !e.isCommander && !e.isSideboard)
    .forEach((e) => lines.push(`${e.quantity} ${e.card.name}`));
  return lines.join('\n');
}

export const deckPublicUrl = (deckId: string) => `${window.location.origin}/?talia=${encodeURIComponent(deckId)}`;

interface DeckShareModalProps {
  deck: DeckItem;
  onClose: () => void;
  onChanged: (isPublic: boolean) => void;
  showToast: (msg: string) => void;
}

export const DeckShareModal: React.FC<DeckShareModalProps> = ({ deck, onClose, onChanged, showToast }) => {
  useBackToClose(true, onClose);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'link' | 'txt' | null>(null);
  const isPublic = Boolean(deck.isPublic);
  const url = deckPublicUrl(deck.id);

  const toggle = async () => {
    setBusy(true);
    try {
      await decksApi.setVisibility(deck.id, !isPublic);
      onChanged(!isPublic);
      showToast(!isPublic ? 'Talia jest teraz dostępna pod publicznym linkiem.' : 'Publiczny link do talii został wyłączony.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (what: 'link' | 'txt') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? url : deckToText(deck));
      setCopied(what);
      showToast(what === 'link' ? 'Skopiowano link do talii.' : 'Skopiowano listę kart.');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast('Nie udało się skopiować do schowka.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Udostępnij talię"
    >
      <div className="w-full sm:max-w-lg bg-stone-900 border border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out]">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0">
              <Share2 className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-stone-100">Udostępnij talię</h3>
              <p className="text-xs text-stone-400 truncate">{deck.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="w-10 h-10 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            role="switch"
            aria-checked={isPublic}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-colors disabled:opacity-60 ${
              isPublic ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-stone-950 border-stone-800 hover:border-stone-700'
            }`}
          >
            {isPublic ? <Globe className="w-5 h-5 text-emerald-400 shrink-0" /> : <Lock className="w-5 h-5 text-stone-400 shrink-0" />}
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-stone-100">{isPublic ? 'Publiczny link włączony' : 'Talia jest prywatna'}</span>
              <span className="block text-xs text-stone-400">
                {isPublic ? 'Każdy z linkiem zobaczy talię bez logowania. Wyłącz, aby link przestał działać.' : 'Włącz, aby wysłać talię znajomym lub wkleić link na forum.'}
              </span>
            </span>
            <span className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${isPublic ? 'bg-emerald-500' : 'bg-stone-700'}`}>
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin text-white absolute top-1 left-3.5" />
              ) : (
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isPublic ? 'left-[22px]' : 'left-0.5'}`} />
              )}
            </span>
          </button>

          {isPublic && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-stone-950 border border-stone-800 rounded-xl p-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Publiczny link do talii"
                  className="flex-1 min-w-0 bg-transparent px-1.5 text-xs font-mono text-stone-300 focus:outline-none"
                />
                <button type="button" onClick={() => copy('link')} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer">
                  {copied === 'link' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === 'link' ? 'Skopiowano' : 'Kopiuj'}
                </button>
              </div>
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-emerald-300">
                <ExternalLink className="w-3.5 h-3.5" /> Zobacz, jak widzą ją inni
              </a>
            </div>
          )}

          <button
            type="button"
            onClick={() => copy('txt')}
            className="w-full h-11 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            {copied === 'txt' ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4" />}
            Kopiuj listę kart (do Moxfield, Archidekt…)
          </button>
        </div>
      </div>
    </div>
  );
};
