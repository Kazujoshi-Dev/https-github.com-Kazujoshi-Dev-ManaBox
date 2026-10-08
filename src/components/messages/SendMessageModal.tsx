import React, { useState, useEffect } from 'react';
import { RegisteredUserSummary } from '../../types';
import { messagesApi } from '../../services/api';
import { X, Send, Mail, User, AlertCircle } from 'lucide-react';

import { useBackToClose } from '../../hooks/useBackButton';
import { useT } from '../../i18n';
interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipient?: { id?: string; username: string } | null;
  availableUsers?: RegisteredUserSummary[];
  initialSubject?: string;
  onSuccess?: (recipientUsername: string) => void;
  showToast?: (message: string) => void;
}

export const SendMessageModal: React.FC<SendMessageModalProps> = ({
  isOpen,
  onClose,
  recipient,
  availableUsers = [],
  initialSubject = '',
  onSuccess,
  showToast,
}) => {
  const t = useT();
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);

  const [recipientUsername, setRecipientUsername] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRecipientUsername(recipient?.username || '');
      setSubject(initialSubject || '');
      setBody('');
      setError(null);
    }
  }, [isOpen, recipient, initialSubject]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientUsername.trim()) {
      setError(t('Wskaż odbiorcę wiadomości.'));
      return;
    }
    if (!subject.trim()) {
      setError(t('Podaj temat wiadomości.'));
      return;
    }
    if (!body.trim()) {
      setError(t('Wpisz treść wiadomości.'));
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await messagesApi.sendMessage({
        recipientUsername: recipientUsername.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });

      showToast?.(t('Wysłano wiadomość do @{name}!', { name: recipientUsername.trim() }));
      onSuccess?.(recipientUsername.trim());
      onClose();
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || t('Nie udało się wysłać wiadomości.'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t('Nowa wiadomość')}</h3>
              <p className="text-xs text-stone-400">{t('Wewnętrzna komunikacja z graczem')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Recipient */}
          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('Odbiorca')}</span>
            </label>
            {recipient ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 text-sm font-semibold">
                <span className="text-amber-400 font-bold">@</span>
                <span>{recipient.username}</span>
              </div>
            ) : availableUsers.length > 0 ? (
              <select
                value={recipientUsername}
                onChange={(e) => setRecipientUsername(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none cursor-pointer"
              >
                <option value="">{t('-- Wybierz gracza z listy --')}</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.username}>
                    @{u.username} ({t('{n} kart na sprzedaż', { n: u.forSaleCount })})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={recipientUsername}
                onChange={(e) => setRecipientUsername(e.target.value)}
                placeholder={t('Wpisz nazwę użytkownika...')}
                className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
              />
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5">
              {t('Temat wiadomości')}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('np. Pytanie o kartę na sprzedaż, propozycja wymiany...')}
              maxLength={150}
              className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5">
              {t('Treść wiadomości')}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={t('Napisz swoją wiadomość...')}
              className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors resize-none"
            />
            <p className={`mt-1 text-right text-xs tabular-nums ${body.length > 3800 ? 'text-amber-300' : 'text-stone-500'}`}>{body.length} / 4000</p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
            >
              {t('Anuluj')}
            </button>
            <button
              type="submit"
              disabled={isSending || !subject.trim() || !body.trim() || !recipientUsername.trim()}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold text-xs shadow-lg shadow-amber-950/60 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
              <span>{isSending ? t('Wysyłanie...') : t('Wyślij wiadomość')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
