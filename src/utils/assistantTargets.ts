/**
 * Własne cele ról w asystencie budowy talii Commander (ustawiane przez gracza przyciskami +/-).
 * Bez zależności od przeglądarki, więc używa tego też serwer do sprawdzania danych.
 */
export type Role = 'lands' | 'ramp' | 'draw' | 'removal' | 'wipe';
export const ROLES: Role[] = ['lands', 'ramp', 'draw', 'removal', 'wipe'];

/** Zapisane tylko role zmienione przez gracza; brak wpisu = cel automatyczny. */
export type AssistantTargets = Partial<Record<Role, number>>;

export const TARGET_MIN = 0;
export const TARGET_MAX: Record<Role, number> = { lands: 60, ramp: 40, draw: 40, removal: 40, wipe: 20 };

export const clampTarget = (role: Role, v: number) => Math.min(TARGET_MAX[role], Math.max(TARGET_MIN, Math.round(v)));

/** Czyści dane z żądania lub bazy: tylko znane role i liczby całkowite w zakresie. */
export function sanitizeAssistantTargets(raw: unknown): AssistantTargets | undefined {
  let obj = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const out: AssistantTargets = {};
  for (const role of ROLES) {
    const v = (obj as Record<string, unknown>)[role];
    if (typeof v === 'number' && Number.isFinite(v)) out[role] = clampTarget(role, v);
  }
  return Object.keys(out).length ? out : undefined;
}
