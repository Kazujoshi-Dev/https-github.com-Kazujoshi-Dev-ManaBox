import React from 'react';

/**
 * Nagłówek zakładki: tytuł, krótki opis i akcje po prawej. Bez ramki i ikony,
 * żeby treść zakładki zaczynała się wyżej.
 */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Dodatkowe informacje pod opisem (np. liczniki). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, meta, actions, className = '' }) => (
  <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
    <div className="min-w-0 space-y-1">
      <h2 className="text-2xl font-semibold tracking-tight text-stone-50">{title}</h2>
      {description && <p className="text-sm text-stone-400 max-w-[65ch]">{description}</p>}
      {meta && <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-400">{meta}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);
