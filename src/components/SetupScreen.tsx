import React, { useRef, useState } from 'react';
import { Upload, Music, Image as ImageIcon, Play, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { PRESET_BACKGROUNDS } from '../types/karaoke';

export interface SetupSubmission {
  audioFile: File;
  title: string;
  artist: string;
  introDuration: number;
  lyricsText: string;
  backgroundUrl: string;
  backgroundLabel: string;
}

interface SetupScreenProps {
  onSubmitSong: (data: SetupSubmission) => Promise<void>;
  onLoadDemo: () => Promise<void>;
  isProcessing: boolean;
  processingStage: string;
  errorMessage: string | null;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({
  onSubmitSong,
  onLoadDemo,
  isProcessing,
  processingStage,
  errorMessage,
}) => {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [introDuration, setIntroDuration] = useState(4);
  const [lyricsText, setLyricsText] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState(PRESET_BACKGROUNDS[0].url);
  const [backgroundLabel, setBackgroundLabel] = useState(PRESET_BACKGROUNDS[0].label);
  const [customBgPreview, setCustomBgPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [brokenPresets, setBrokenPresets] = useState<Record<string, boolean>>({});

  const handleAudioPick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file.name)) {
      setLocalError('Seleziona un file audio valido (MP3, WAV, M4A, OGG, FLAC).');
      return;
    }
    setLocalError(null);
    setAudioFile(file);

    // Pre-fill title/artist cleanly from filename if blank
    if (!title.trim()) {
      const base = file.name.replace(/\.[^/.]+$/, '').replace(/[_]+/g, ' ');
      const parts = base.split(' - ');
      if (parts.length >= 2) {
        if (!artist.trim()) setArtist(parts[0].trim());
        setTitle(parts.slice(1).join(' - ').trim());
      } else {
        setTitle(base.trim());
      }
    }
  };

  const handleBackgroundPick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLocalError('Seleziona un file immagine valido (JPG, PNG, WEBP).');
      return;
    }
    setLocalError(null);
    const objectUrl = URL.createObjectURL(file);
    setCustomBgPreview(objectUrl);
    setBackgroundUrl(objectUrl);
    setBackgroundLabel(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) {
      setLocalError('Carica prima un file audio della canzone.');
      return;
    }
    setLocalError(null);
    await onSubmitSong({
      audioFile,
      title: title.trim() || 'Senza Titolo',
      artist: artist.trim() || 'Artista',
      introDuration: Math.max(0, Math.min(10, introDuration)),
      lyricsText,
      backgroundUrl,
      backgroundLabel,
    });
  };

  const activeError = localError || errorMessage;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8 md:py-12">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-amber-400">
            Studio di Produzione Karaoke
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-50 md:text-4xl [text-wrap:balance]">
            Trasforma qualsiasi brano in un video karaoke editabile
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Carica una canzone completa di base e voce: rimuoviamo la parte vocale, sincronizziamo le parole a ritmo con la melodia e prepariamo l&apos;anteprima video in tempo reale.
          </p>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onLoadDemo}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#14171D] px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-amber-500/60 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="h-4 w-4 text-amber-400" />
            <span>Prova con Brano Demo</span>
          </button>
        </div>
      </div>

      {activeError && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span>{activeError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Audio + Metadata */}
        <div className="space-y-6 lg:col-span-6">
          <section className="rounded-xl border border-slate-800 bg-[#14171D] p-5 md:p-6">
            <h2 className="text-base font-semibold text-slate-100">
              01. Traccia Audio (Base + Voce)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Formati supportati: MP3, WAV, M4A, OGG, FLAC. L&apos;elaborazione della base strumentale avviene direttamente nel browser.
            </p>

            <div
              onDragOver={(ev) => {
                ev.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(ev) => {
                ev.preventDefault();
                setDragActive(false);
                handleAudioPick(ev.dataTransfer.files?.[0]);
              }}
              className={`mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
                dragActive
                  ? 'border-amber-400 bg-amber-500/10'
                  : audioFile
                  ? 'border-emerald-500/40 bg-emerald-950/15'
                  : 'border-slate-700 bg-[#0D0F13]/70 hover:border-slate-500'
              }`}
            >
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="sr-only"
                id="audio-upload-input"
                onChange={(ev) => handleAudioPick(ev.target.files?.[0])}
              />

              <Music className={`h-8 w-8 ${audioFile ? 'text-emerald-400' : 'text-slate-400'}`} />
              {audioFile ? (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-semibold text-slate-100">{audioFile.name}</p>
                  <p className="text-xs text-slate-400 font-mono tabular-nums">
                    {(audioFile.size / (1024 * 1024)).toFixed(2)} MB · Pronto per l&apos;analisi
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-medium text-slate-200">
                    Trascina qui la canzone oppure seleziona un file
                  </p>
                  <p className="text-xs text-slate-500">
                    Stereo consigliato per una rimozione vocale più pulita
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#1A1F28] px-4 py-2 text-xs font-medium text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{audioFile ? 'Cambia File Audio' : 'Scegli File Audio'}</span>
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-[#14171D] p-5 md:p-6">
            <h2 className="text-base font-semibold text-slate-100">
              02. Titolo, Artista e Intro Iniziale
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Verranno mostrati sullo schermo qualche secondo prima che inizi la musica.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="setup-title" className="block text-xs font-medium text-slate-300">
                  Titolo canzone
                </label>
                <input
                  id="setup-title"
                  type="text"
                  value={title}
                  onChange={(ev) => setTitle(ev.target.value)}
                  placeholder="es. Nel blu dipinto di blu"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#0D0F13] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="setup-artist" className="block text-xs font-medium text-slate-300">
                  Artista
                </label>
                <input
                  id="setup-artist"
                  type="text"
                  value={artist}
                  onChange={(ev) => setArtist(ev.target.value)}
                  placeholder="es. Domenico Modugno"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#0D0F13] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="setup-intro-sec" className="font-medium text-slate-300">
                  Durata schermata titolo prima dell&apos;inizio
                </label>
                <span className="font-mono tabular-nums text-amber-400">{introDuration} secondi</span>
              </div>
              <input
                id="setup-intro-sec"
                type="range"
                min={0}
                max={8}
                step={1}
                value={introDuration}
                onChange={(ev) => setIntroDuration(Number(ev.target.value))}
                className="mt-2 w-full cursor-pointer"
              />
            </div>
          </section>
        </div>

        {/* Right Column: Background + Optional Lyrics + Launch */}
        <div className="space-y-6 lg:col-span-6">
          <section className="rounded-xl border border-slate-800 bg-[#14171D] p-5 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  03. Immagine di Sfondo del Video
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Carica una tua foto oppure scegli uno degli sfondi da palco pronti.
                </p>
              </div>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                id="bg-upload-input"
                onChange={(ev) => handleBackgroundPick(ev.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#1A1F28] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>Carica Sfondo</span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {PRESET_BACKGROUNDS.map((preset) => {
                const selected = backgroundUrl === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setBackgroundUrl(preset.url);
                      setBackgroundLabel(preset.label);
                    }}
                    className={`group overflow-hidden rounded-lg border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-amber-400 ring-1 ring-amber-400/50'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="aspect-video w-full bg-slate-900 overflow-hidden">
                      {!brokenPresets[preset.id] ? (
                        <img
                          src={preset.url}
                          alt={preset.label}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenPresets((prev) => ({ ...prev, [preset.id]: true }))
                          }
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-xs text-slate-400">
                          {preset.label}
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 py-1.5 text-xs font-medium text-slate-200 truncate">
                      {preset.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {customBgPreview && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <span className="truncate text-amber-200">
                  Sfondo personalizzato attivo: {backgroundLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBackgroundUrl(customBgPreview);
                  }}
                  className="font-medium text-amber-400 hover:underline whitespace-nowrap shrink-0 ml-3 cursor-pointer"
                >
                  Usa questo
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-[#14171D] p-5 md:p-6">
            <h2 className="text-base font-semibold text-slate-100">
              04. Testo della Canzone (Opzionale)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Incolla le strofe qui sotto per allinearle esattamente alla voce. Se lasci il campo vuoto, l&apos;app analizzerà l&apos;audio ed estrarrà automaticamente il testo e il tempismo.
            </p>

            <label htmlFor="setup-lyrics" className="sr-only">
              Testo della canzone opzionale
            </label>
            <textarea
              id="setup-lyrics"
              rows={6}
              value={lyricsText}
              onChange={(ev) => setLyricsText(ev.target.value)}
              placeholder={`Incolla qui il testo (una riga per verso)...\n\nOppure lascia vuoto per l'estrazione automatica dall'audio.`}
              className="mt-4 w-full resize-y rounded-lg border border-slate-700 bg-[#0D0F13] px-3.5 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                {lyricsText.trim()
                  ? `${lyricsText.trim().split(/\r?\n/).filter(Boolean).length} righe inserite`
                  : 'Modalità automatica: estrazione da audio'}
              </span>
              {lyricsText.trim() && (
                <button
                  type="button"
                  onClick={() => setLyricsText('')}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Svuota testo
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isProcessing || !audioFile}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{processingStage || 'Elaborazione audio e testo...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Crea Video Karaoke</span>
                </>
              )}
            </button>
          </section>
        </div>
      </form>
    </main>
  );
};
