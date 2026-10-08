import React, { useEffect } from 'react';
import { ScrollText, X } from 'lucide-react';
import { useBackToClose } from '../hooks/useBackButton';
import { useT, tk } from '../i18n';

/** Podstawowy regulamin serwisu. Kolejność punktów = numeracja. */
const TERMS: { title: string; body: string }[] = [
  {
    title: tk('Postanowienia ogólne'),
    body: tk('Serwis manascrew.eu (Mana Screw) to bezpłatne narzędzie do prowadzenia kolekcji kart Magic: The Gathering, budowania talii oraz wystawiania kart na sprzedaż lub wymianę. Korzystając z serwisu, akceptujesz niniejszy regulamin.'),
  },
  {
    title: tk('Konto użytkownika'),
    body: tk('Odpowiadasz za dane podane przy rejestracji i za bezpieczeństwo swojego hasła. Konto możesz w każdej chwili usunąć w ustawieniach.'),
  },
  {
    title: tk('Handel między graczami'),
    body: tk('Serwis jedynie umożliwia prezentowanie ofert i kontakt między graczami. Nie jest stroną transakcji, nie pośredniczy w płatnościach ani wysyłce i nie weryfikuje sprzedających, kupujących ani stanu kart.'),
  },
  {
    title: tk('Wyłączenie odpowiedzialności'),
    body: tk('manascrew.eu nie ponosi odpowiedzialności za oszustwa, niewywiązanie się z umowy, szkody ani spory wynikające z handlu lub wymiany między graczami. Wszelkie roszczenia należy kierować bezpośrednio do drugiej strony transakcji.'),
  },
  {
    title: tk('Bezpieczny handel'),
    body: tk('Zalecamy ostrożność: korzystaj ze sprawdzonych form płatności, preferuj odbiór osobisty lub przesyłki za pobraniem, a podejrzane zachowania zgłaszaj administracji.'),
  },
  {
    title: tk('Zasady zachowania'),
    body: tk('Zabronione jest publikowanie treści niezgodnych z prawem, obraźliwych lub wprowadzających w błąd. Administracja może usuwać takie treści oraz blokować konta naruszające regulamin.'),
  },
  {
    title: tk('Ceny i dane kart'),
    body: tk('Wyceny i dane kart pochodzą z zewnętrznych źródeł i mają charakter wyłącznie orientacyjny. Serwis nie gwarantuje ich aktualności ani dokładności.'),
  },
  {
    title: tk('Zmiany regulaminu'),
    body: tk('Regulamin może się zmieniać. Dalsze korzystanie z serwisu po zmianie oznacza akceptację nowej wersji.'),
  },
];

export const TermsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-title"
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-stone-900 border border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 p-4 border-b border-stone-800 shrink-0">
          <ScrollText className="w-5 h-5 text-amber-400 shrink-0" />
          <h3 id="terms-title" className="text-base font-semibold text-stone-50 flex-1">
            {t('Regulamin')}
          </h3>
          <button type="button" onClick={onClose} aria-label={t('Zamknij')} className="w-9 h-9 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ol className="p-4 space-y-4 overflow-y-auto text-sm text-stone-300 leading-relaxed">
          {TERMS.map((term, i) => (
            <li key={term.title}>
              <p className="font-medium text-stone-100">
                <span className="tabular-nums text-stone-500 mr-1.5">{i + 1}.</span>
                {t(term.title)}
              </p>
              <p className="mt-1 text-stone-400">{t(term.body)}</p>
            </li>
          ))}
        </ol>

        <div className="p-4 border-t border-stone-800 flex justify-end shrink-0">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            {t('Rozumiem')}
          </button>
        </div>
      </div>
    </div>
  );
};
