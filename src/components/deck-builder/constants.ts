import { ScryfallCard } from '../../types';

export interface DeckCategoryConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  border: string;
  badge: string;
}

export const DECK_CATEGORIES: DeckCategoryConfig[] = [
  { id: 'Stwory', name: 'Stwory (Creatures)', icon: '🐉', color: 'emerald', border: 'border-emerald-500/40', badge: 'bg-emerald-500/20 text-emerald-300' },
  { id: 'Czary natychmiastowe', name: 'Czary natychmiastowe (Instants)', icon: '⚡', color: 'cyan', border: 'border-cyan-500/40', badge: 'bg-cyan-500/20 text-cyan-300' },
  { id: 'Czary', name: 'Czary główne (Sorceries)', icon: '📜', color: 'blue', border: 'border-blue-500/40', badge: 'bg-blue-500/20 text-blue-300' },
  { id: 'Artefakty', name: 'Artefakty (Artifacts)', icon: '✨', color: 'stone', border: 'border-stone-500/40', badge: 'bg-stone-500/20 text-stone-300' },
  { id: 'Zaczarowania', name: 'Zaczarowania (Enchantments)', icon: '🔮', color: 'purple', border: 'border-purple-500/40', badge: 'bg-purple-500/20 text-purple-300' },
  { id: 'Planeswalkerzy', name: 'Planeswalkerzy', icon: '🛡️', color: 'rose', border: 'border-rose-500/40', badge: 'bg-rose-500/20 text-rose-300' },
  { id: 'Lądy', name: 'Lądy (Lands)', icon: '🏔️', color: 'yellow', border: 'border-yellow-500/40', badge: 'bg-yellow-500/20 text-yellow-300' },
  { id: 'Inne', name: 'Inne czary', icon: '⚔️', color: 'stone', border: 'border-stone-500/40', badge: 'bg-stone-500/20 text-stone-300' },
];

export function getCardCategory(card: ScryfallCard): string {
  const type = (card.type_line || '').toLowerCase();
  if (type.includes('creature')) return 'Stwory';
  if (type.includes('instant')) return 'Czary natychmiastowe';
  if (type.includes('sorcery')) return 'Czary';
  if (type.includes('artifact')) return 'Artefakty';
  if (type.includes('enchantment')) return 'Zaczarowania';
  if (type.includes('planeswalker')) return 'Planeswalkerzy';
  if (type.includes('land')) return 'Lądy';
  return 'Inne';
}

export const COLOR_IDENTITY_STYLE_MAP: Record<string, string> = {
  W: 'bg-amber-100 text-stone-900 border-amber-300',
  U: 'bg-blue-500 text-white border-blue-400',
  B: 'bg-stone-800 text-stone-200 border-stone-600',
  R: 'bg-red-500 text-white border-red-400',
  G: 'bg-emerald-500 text-white border-emerald-400',
};
