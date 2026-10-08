import React from 'react';
import { Coffee } from 'lucide-react';
import { useT } from '../../i18n';

export const SUPPORT_URL = 'https://suppi.pl/kazujoshi-dev';

interface SupportButtonProps {
  /** pill: przycisk w nagłówku (napis od xl), icon: sama ikona, link: link tekstowy w stopce. */
  variant?: 'pill' | 'icon' | 'link';
  className?: string;
}

/** „Postaw kawę”: wsparcie autora przez suppi.pl (otwiera się w nowej karcie). */
export const SupportButton: React.FC<SupportButtonProps> = ({ variant = 'pill', className = '' }) => {
  const t = useT();
  const common = {
    href: SUPPORT_URL,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: t('Postaw kawę autorowi aplikacji (suppi.pl)')
  };
  if (variant === 'link') {
    return (
      <a {...common} className={`inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 ${className}`}>
        <Coffee className="w-3.5 h-3.5" />
        {t('Postaw kawę')}
      </a>
    );
  }
  if (variant === 'icon') {
    return (
      <a
        {...common}
        aria-label={t('Postaw kawę')}
        className={`w-9 h-9 rounded-lg flex items-center justify-center text-amber-300 hover:text-amber-200 hover:bg-stone-800 active:bg-stone-800 ${className}`}
      >
        <Coffee className="w-[18px] h-[18px]" />
      </a>
    );
  }
  return (
    <a
      {...common}
      aria-label={t('Postaw kawę')}
      className={`h-9 px-2.5 xl:px-3 rounded-lg flex items-center gap-2 text-sm text-amber-200/90 hover:text-amber-100 bg-amber-400/[0.07] hover:bg-amber-400/15 ring-1 ring-amber-400/20 ${className}`}
    >
      <Coffee className="w-4 h-4" />
      <span className="hidden xl:inline">{t('Postaw kawę')}</span>
    </a>
  );
};
