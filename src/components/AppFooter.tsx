import React, { useState } from 'react';
import { versionLabel } from '../utils/appVersion';
import { TermsModal } from './TermsModal';
import { useT } from '../i18n';

/** Link „Regulamin” otwierający okno z regulaminem. */
export const TermsLink: React.FC<{ className?: string }> = ({ className = '' }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`underline underline-offset-2 hover:text-stone-300 cursor-pointer ${className}`}>
        {t('Regulamin')}
      </button>
      {open && <TermsModal onClose={() => setOpen(false)} />}
    </>
  );
};

/** Minimalistyczna stopka: wersja aplikacji, regulamin i krótka informacja o handlu między graczami. */
export const AppFooter: React.FC<{ className?: string }> = ({ className = '' }) => {
  const t = useT();
  return (
  <footer className={`max-w-[1760px] w-full mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 mt-12 ${className}`}>
    <div className="border-t border-stone-900 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-stone-500">
      <p>{t('manascrew.eu nie odpowiada za oszustwa wynikające z handlu między graczami.')}</p>
      <div className="flex items-center gap-3 shrink-0">
        <TermsLink />
        <span aria-hidden="true">·</span>
        <span className="tabular-nums" title={t('Wersja aplikacji')}>
          {t('Wersja')} {versionLabel()}
        </span>
      </div>
    </div>
  </footer>
  );
};
