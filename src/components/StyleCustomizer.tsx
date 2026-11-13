import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import {
  BackgroundConfig,
  HIGHLIGHT_COLORS,
  KARAOKE_FONTS,
  KaraokeFontFamily,
  KaraokeStyle,
  PRESET_BACKGROUNDS,
  SongMetadata,
} from '../types/karaoke';

interface TypographyPanelProps {
  style: KaraokeStyle;
  onChangeStyle: (next: KaraokeStyle) => void;
}

export const TypographyPanel: React.FC<TypographyPanelProps> = ({ style, onChangeStyle }) => {
  return (
    <div className="space-y-5 overflow-y-auto p-4">
      <div>
        <label htmlFor="font-family-select" className="block text-xs font-medium text-slate-300">
          Carattere del testo (Font)
        </label>
        <select
          id="font-family-select"
          value={style.fontFamily}
          onChange={(ev) =>
            onChangeStyle({ ...style, fontFamily: ev.target.value as KaraokeFontFamily })
          }
          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#0D0F13] px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
        >
          {KARAOKE_FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} — {f.category}
            </option>
          ))}
        </select>

        {/* Quick visual font family selector buttons */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {KARAOKE_FONTS.map((font) => {
            const active = style.fontFamily === font.id;
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => onChangeStyle({ ...style, fontFamily: font.id })}
                style={{ fontFamily: `"${font.id}", sans-serif` }}
                className={`rounded-md border px-2.5 py-2 text-left text-xs transition-colors cursor-pointer truncate ${
                  active
                    ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                    : 'border-slate-800 bg-[#0D0F13] text-slate-300 hover:border-slate-600'
                }`}
              >
                {font.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="font-size-slider" className="font-medium text-slate-300">
            Grandezza font
          </label>
          <span className="font-mono tabular-nums text-amber-400">{style.fontSize} px</span>
        </div>
        <input
          id="font-size-slider"
          type="range"
          min={32}
          max={82}
          step={2}
          value={style.fontSize}
          onChange={(ev) => onChangeStyle({ ...style, fontSize: Number(ev.target.value) })}
          className="mt-2 w-full cursor-pointer"
        />
      </div>

      <div>
        <span className="block text-xs font-medium text-slate-300">Spessore carattere</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-lg bg-[#0D0F13] p-1 border border-slate-800">
          {[
            { value: '600' as const, label: 'Medio' },
            { value: '700' as const, label: 'Grassetto' },
            { value: '800' as const, label: 'Extra Bold' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChangeStyle({ ...style, fontWeight: opt.value })}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                style.fontWeight === opt.value
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-xs font-medium text-slate-300">
          Colore parole cantate
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {HIGHLIGHT_COLORS.map((swatch) => {
            const selected = style.activeColor === swatch.value;
            return (
              <button
                key={swatch.id}
                type="button"
                onClick={() => onChangeStyle({ ...style, activeColor: swatch.value })}
                aria-label={`Colore ${swatch.label}`}
                title={swatch.label}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                  selected
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-slate-800 bg-[#0D0F13] text-slate-300 hover:border-slate-600'
                }`}
              >
                <span
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: swatch.value }}
                />
                <span>{swatch.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="block text-xs font-medium text-slate-300">Posizione testo</span>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-[#0D0F13] p-1">
            <button
              type="button"
              onClick={() => onChangeStyle({ ...style, verticalPosition: 'center' })}
              className={`rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                style.verticalPosition === 'center'
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Centro
            </button>
            <button
              type="button"
              onClick={() => onChangeStyle({ ...style, verticalPosition: 'lower' })}
              className={`rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                style.verticalPosition === 'lower'
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              In basso
            </button>
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-300">Righe visibili</span>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-[#0D0F13] p-1">
            <button
              type="button"
              onClick={() => onChangeStyle({ ...style, visibleLines: 2 })}
              className={`rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                style.visibleLines === 2
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2 Righe
            </button>
            <button
              type="button"
              onClick={() => onChangeStyle({ ...style, visibleLines: 3 })}
              className={`rounded-md py-1.5 text-xs font-medium cursor-pointer ${
                style.visibleLines === 3
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3 Righe
            </button>
          </div>
        </div>
      </div>

      <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0D0F13] px-3 py-2.5 cursor-pointer">
        <span className="text-xs font-medium text-slate-200">
          Contorno scuro ad alta leggibilità
        </span>
        <input
          type="checkbox"
          checked={style.showStroke}
          onChange={(ev) => onChangeStyle({ ...style, showStroke: ev.target.checked })}
          className="h-4 w-4 accent-amber-500"
        />
      </label>
    </div>
  );
};

interface BackgroundIntroPanelProps {
  metadata: SongMetadata;
  background: BackgroundConfig;
  onChangeMetadata: (next: SongMetadata) => void;
  onChangeBackground: (next: BackgroundConfig) => void;
}

export const BackgroundIntroPanel: React.FC<BackgroundIntroPanelProps> = ({
  metadata,
  background,
  onChangeMetadata,
  onChangeBackground,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [brokenPresets, setBrokenPresets] = useState<Record<string, boolean>>({});

  const handleUploadBg = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    onChangeBackground({
      ...background,
      imageUrl: url,
      imageLabel: file.name,
    });
  };

  return (
    <div className="space-y-5 overflow-y-auto p-4">
      <div className="space-y-3 border-b border-slate-800 pb-4">
        <h3 className="text-xs font-semibold text-slate-200">
          Schermata Titolo &amp; Artista (Intro)
        </h3>
        <div>
          <label htmlFor="edit-title" className="block text-xs font-medium text-slate-400">
            Titolo canzone
          </label>
          <input
            id="edit-title"
            type="text"
            value={metadata.title}
            onChange={(ev) => onChangeMetadata({ ...metadata, title: ev.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0D0F13] px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="edit-artist" className="block text-xs font-medium text-slate-400">
            Artista
          </label>
          <input
            id="edit-artist"
            type="text"
            value={metadata.artist}
            onChange={(ev) => onChangeMetadata({ ...metadata, artist: ev.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0D0F13] px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="edit-intro-dur" className="font-medium text-slate-400">
              Secondi intro prima della canzone
            </label>
            <span className="font-mono tabular-nums text-amber-400">
              {metadata.introDuration}s
            </span>
          </div>
          <input
            id="edit-intro-dur"
            type="range"
            min={0}
            max={8}
            step={1}
            value={metadata.introDuration}
            onChange={(ev) =>
              onChangeMetadata({ ...metadata, introDuration: Number(ev.target.value) })
            }
            className="mt-1.5 w-full cursor-pointer"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200">Immagine di Sfondo</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(ev) => handleUploadBg(ev.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#1A1F28] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500/60 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Carica Immagine</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PRESET_BACKGROUNDS.map((preset) => {
            const selected = background.imageUrl === preset.url;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onChangeBackground({
                    ...background,
                    imageUrl: preset.url,
                    imageLabel: preset.label,
                  })
                }
                className={`overflow-hidden rounded-lg border text-left transition-colors cursor-pointer ${
                  selected ? 'border-amber-400' : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="aspect-video w-full bg-slate-900">
                  {!brokenPresets[preset.id] ? (
                    <img
                      src={preset.url}
                      alt={preset.label}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenPresets((prev) => ({ ...prev, [preset.id]: true }))
                      }
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-900 text-[10px] text-slate-400">
                      {preset.label}
                    </div>
                  )}
                </div>
                <div className="px-2 py-1 text-[11px] font-medium text-slate-300 truncate">
                  {preset.label}
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="bg-dim-slider" className="font-medium text-slate-400">
              Oscuramento sfondo (contrasto testo)
            </label>
            <span className="font-mono tabular-nums text-amber-400">
              {Math.round(background.dimOpacity * 100)}%
            </span>
          </div>
          <input
            id="bg-dim-slider"
            type="range"
            min={0.15}
            max={0.85}
            step={0.05}
            value={background.dimOpacity}
            onChange={(ev) =>
              onChangeBackground({ ...background, dimOpacity: Number(ev.target.value) })
            }
            className="mt-1.5 w-full cursor-pointer"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="bg-blur-slider" className="font-medium text-slate-400">
              Sfocatura sfondo
            </label>
            <span className="font-mono tabular-nums text-amber-400">{background.blurPx} px</span>
          </div>
          <input
            id="bg-blur-slider"
            type="range"
            min={0}
            max={14}
            step={1}
            value={background.blurPx}
            onChange={(ev) =>
              onChangeBackground({ ...background, blurPx: Number(ev.target.value) })
            }
            className="mt-1.5 w-full cursor-pointer"
          />
        </div>

        <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0D0F13] px-3 py-2.5 cursor-pointer">
          <span className="text-xs font-medium text-slate-200">
            Zoom lento cinematografico (Ken Burns)
          </span>
          <input
            type="checkbox"
            checked={background.kenBurns}
            onChange={(ev) =>
              onChangeBackground({ ...background, kenBurns: ev.target.checked })
            }
            className="h-4 w-4 accent-amber-500"
          />
        </label>
      </div>
    </div>
  );
};
