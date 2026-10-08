import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Gamepad2, X } from 'lucide-react';
import type { DeckItem } from '../../types';
import { useBackToClose } from '../../hooks/useBackButton';
import { exportDeckToArena, getDeckFormat, isOnArena } from '../../utils/mtgFormats';
import { downloadTxtFile } from '../../utils/textCardList';
import { useT } from '../../i18n';

/** Lista talii w formacie importu MTG Arena: kopiowanie do schowka albo plik .txt. */
export const DeckArenaExportModal: React.FC<{
  deck: DeckItem;
  onClose: () => void;
  showToast: (message: string) => void;
}> = ({ deck, onClose, showToast }) => {
  const t = useT();
  useBackToClose(true, onClose);
  const [copied, setCopied] = useState(false);
  const format = getDeckFormat(deck.format);
  const text = useMemo(() => exportDeckToArena({ ...deck, commander: format.commander ? deck.commander : null }), [deck, format.commander]);

  // Karty, których nie ma w Arenie: import w grze je pominie
  const missing = useMemo(() => {
    const all = [...(format.commander && deck.commander ? [deck.commander] : []), ...deck.cards.map((e) => e.card)];
    return [...new Set(all.filter((c) => !isOnArena(c)).map((c) => c.name))];
  }, [deck, format.commander]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast(t('Skopiowano talię. W MTG Arena otwórz Talie i kliknij Importuj.'));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast(t('Nie udało się skopiować. Zaznacz listę i skopiuj ją ręcznie.'));
    }
  };

  const handleDownload = () => {
    const safe = (deck.name || 'talia').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'talia';
    downloadTxtFile(`${safe}-mtga.txt`, text);
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-label={t('Eksport do MTG Arena')}
        className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh] max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)]"
      >
        <div className="p-4 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-base text-stone-50">{t('Eksport do MTG Arena')}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 cursor-pointer" aria-label={t('Zamknij')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-sm text-stone-300">
            {t('Skopiuj listę, a potem w MTG Arena otwórz')} <strong className="text-stone-100">{t('Talie')}</strong> {t('i kliknij')} <strong className="text-stone-100">{t('Importuj')}</strong>.
          </p>
          {missing.length > 0 && (
            <p className="text-xs text-rose-200 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
              {t('Tych kart nie ma w MTG Arena, import je pominie:')} {missing.join(', ')}.
            </p>
          )}
          <textarea
            readOnly
            value={text}
            rows={14}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-stone-200 tabular-nums font-mono leading-relaxed focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="p-4 border-t border-stone-800 flex items-center justify-end gap-2">
          <button type="button" onClick={handleDownload} className="btn btn-secondary">
            <Download className="w-4 h-4" />
            {t('Pobierz .txt')}
          </button>
          <button type="button" onClick={handleCopy} className="btn btn-primary">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t('Skopiowano') : t('Kopiuj do schowka')}
          </button>
        </div>
      </div>
    </div>
  );
};
