import { ScryfallCard, CardCondition, CardLanguage, Catalog, AppSettings } from '../../types';

export type ScannerEngine = 'delver_lens';

export type CardRarityDetection = 'common' | 'uncommon' | 'rare' | 'mythic';

export interface ScanResult {
  rawText: string;
  cleanedTitle: string;
  detectedSet?: string;
  detectedCollectorNumber?: string;
  confidence: number;
  matchedCard: ScryfallCard | null;
  possibleCards: ScryfallCard[];
  debugCropUrl?: string;
  debugTitleUrl?: string;
  debugBottomUrl?: string;
  debugArtUrl?: string;
  debugSetSymbolUrl?: string;
  perceptualHash?: string;
  detectedRarity?: CardRarityDetection;
  detectedColorIdentity?: string[];
  engineUsed?: ScannerEngine;
  isFoilDetected?: boolean;
  isAutoCropped?: boolean;
}

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalogs: Catalog[];
  settings: AppSettings;
  onSaveToCollection: (data: {
    card: ScryfallCard;
    quantity: number;
    quantityFoil: number;
    condition: CardCondition;
    language: CardLanguage;
    purchasePrice?: number | null;
    notes?: string;
    binder?: string;
  }) => Promise<any>;
  showToast: (message: string) => void;
}
