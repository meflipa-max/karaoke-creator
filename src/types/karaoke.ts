export interface LyricWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricLine {
  id: string;
  startTime: number;
  endTime: number;
  words: LyricWord[];
}

export type KaraokeFontFamily =
  | 'Outfit'
  | 'Plus Jakarta Sans'
  | 'DM Sans'
  | 'Montserrat'
  | 'Playfair Display'
  | 'Oswald'
  | 'Lora';

export type LyricVerticalPosition = 'center' | 'lower';

export interface KaraokeStyle {
  fontFamily: KaraokeFontFamily;
  fontSize: number; // 32..84
  fontWeight: '600' | '700' | '800';
  activeColor: string;
  inactiveColor: string;
  showStroke: boolean;
  verticalPosition: LyricVerticalPosition;
  visibleLines: 2 | 3;
}

export interface BackgroundConfig {
  imageUrl: string;
  imageLabel: string;
  blurPx: number; // 0..16
  dimOpacity: number; // 0.2..0.85
  kenBurns: boolean;
}

export interface VocalRemovalConfig {
  suppression: number; // 0 (original) .. 1 (full vocal removal)
  bassPreserve: boolean;
  extraVocalCut: boolean;
}

export interface SongMetadata {
  title: string;
  artist: string;
  introDuration: number; // seconds shown before song begins (0..10)
}

export interface KaraokeProject {
  id: string;
  fileName: string;
  songDuration: number;
  isStereo: boolean;
  isDemo: boolean;
  metadata: SongMetadata;
  lines: LyricLine[];
  style: KaraokeStyle;
  background: BackgroundConfig;
  vocalRemoval: VocalRemovalConfig;
}

export interface FontOption {
  id: KaraokeFontFamily;
  label: string;
  category: string;
}

export interface PresetBackground {
  id: string;
  label: string;
  url: string;
}

export const KARAOKE_FONTS: FontOption[] = [
  { id: 'Outfit', label: 'Outfit', category: 'Geometrico moderno' },
  { id: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', category: 'Pulito e nitido' },
  { id: 'DM Sans', label: 'DM Sans', category: 'Lineare leggibile' },
  { id: 'Montserrat', label: 'Montserrat', category: 'Forte e ampio' },
  { id: 'Oswald', label: 'Oswald', category: 'Condensato palco' },
  { id: 'Playfair Display', label: 'Playfair Display', category: 'Classico elegante' },
  { id: 'Lora', label: 'Lora', category: 'Editoriale morbido' },
];

export const HIGHLIGHT_COLORS = [
  { id: 'amber', label: 'Oro Caldo', value: '#FBBF24' },
  { id: 'gold', label: 'Giallo Palco', value: '#FDE047' },
  { id: 'rose', label: 'Corallo', value: '#FB7185' },
  { id: 'sky', label: 'Azzurro Vivo', value: '#38BDF8' },
  { id: 'emerald', label: 'Smeraldo', value: '#34D399' },
];

export const PRESET_BACKGROUNDS: PresetBackground[] = [
  {
    id: 'velvet-stage',
    label: 'Palco Notturno',
    url: '/src/assets/images/bg_velvet_stage_1794568874631.jpg',
  },
  {
    id: 'acoustic-studio',
    label: 'Studio Caldo',
    url: '/src/assets/images/bg_acoustic_studio_1794568875302.jpg',
  },
  {
    id: 'golden-horizon',
    label: 'Orizzonte Oro',
    url: '/src/assets/images/bg_golden_horizon_1794568875523.jpg',
  },
];

export const DEFAULT_STYLE: KaraokeStyle = {
  fontFamily: 'Outfit',
  fontSize: 54,
  fontWeight: '700',
  activeColor: '#FBBF24',
  inactiveColor: '#F8FAFC',
  showStroke: true,
  verticalPosition: 'center',
  visibleLines: 2,
};

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  imageUrl: PRESET_BACKGROUNDS[0].url,
  imageLabel: PRESET_BACKGROUNDS[0].label,
  blurPx: 2,
  dimOpacity: 0.45,
  kenBurns: true,
};

export const DEFAULT_VOCAL_REMOVAL: VocalRemovalConfig = {
  suppression: 1,
  bassPreserve: true,
  extraVocalCut: false,
};
