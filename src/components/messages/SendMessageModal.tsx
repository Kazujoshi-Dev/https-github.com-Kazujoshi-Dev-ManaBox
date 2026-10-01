import React, { useState, useEffect } from 'react';
import { RegisteredUserSummary } from '../../types';
import { messagesApi } from '../../services/api';
import { X, Send, Mail, User, AlertCircle } from 'lucide-react';

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
      setError('Wskaż odbiorcę wiadomości.');
      return;
    }
    if (!subject.trim()) {
      setError('Podaj temat wiadomości.');
      return;
    }
    if (!body.trim()) {
      setError('Wpisz treść wiadomości.');
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

      showToast?.(`Wysłano wiadomość do @${recipientUsername.trim()}!`);
      onSuccess?.(recipientUsername.trim());
      onClose();
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Nie udało się wysłać wiadomości.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Nowa Wiadomość</h3>
              <p className="text-xs text-stone-400">Wewnętrzna komunikacja z graczem</p>
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
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Odbiorca</span>
            </label>
            {recipient ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-200 text-sm font-semibold">
                <span className="text-blue-400 font-bold">@</span>
                <span>{recipient.username}</span>
              </div>
            ) : availableUsers.length > 0 ? (
              <select
                value={recipientUsername}
                onChange={(e) => setRecipientUsername(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none cursor-pointer"
              >
                <option value="">-- Wybierz gracza z listy --</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.username}>
                    @{u.username} ({u.forSaleCount} kart na sprzedaż)
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={recipientUsername}
                onChange={(e) => setRecipientUsername(e.target.value)}
                placeholder="Wpisz nazwę użytkownika..."
                className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
              />
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
              Temat wiadomości
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="np. Pytanie o kartę na sprzedaż, propozycja wymiany..."
              maxLength={150}
              className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
              Treść wiadomości
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Napisz swoją wiadomość..."
              className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isSending || !subject.trim() || !body.trim() || !recipientUsername.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-blue-950/60 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
              <span>{isSending ? 'Wysyłanie...' : 'Wyślij wiadomość'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
