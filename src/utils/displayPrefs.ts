import { useSyncExternalStore } from 'react';

/**
 * Preferencje wyświetlania potrzebne w wielu miejscach aplikacji (także tam, gdzie komponent
 * nie dostaje ustawień użytkownika). Wartości ustawia useSettings na podstawie ustawień konta.
 */
let showEdhrecRank = true;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function setShowEdhrecRank(value: boolean) {
  if (value === showEdhrecRank) return;
  showEdhrecRank = value;
  listeners.forEach((fn) => fn());
}

/** Czy pokazywać oznaczenia rankingu EDHREC („EDH #123”) przy kartach. */
export function useShowEdhrecRank(): boolean {
  return useSyncExternalStore(subscribe, () => showEdhrecRank, () => showEdhrecRank);
}
