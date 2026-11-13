import { useCallback, useEffect, useState } from 'react';
import { Film, PlusCircle } from 'lucide-react';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_STYLE,
  DEFAULT_VOCAL_REMOVAL,
  KaraokeProject,
  LyricLine,
  PRESET_BACKGROUNDS,
} from './types/karaoke';
import {
  analyzeAudioBufferStereo,
  createDemoKaraokeTrack,
  renderCompactAnalysisWavBase64,
} from './utils/audioEngine';
import { parseLyricsToLines } from './utils/lyricsTiming';
import { SetupScreen, SetupSubmission } from './components/SetupScreen';
import { StudioTab, StudioWorkspace } from './components/StudioWorkspace';
import { ExportModal } from './components/ExportModal';

export default function App() {
  const [project, setProject] = useState<KaraokeProject | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>('lyrics');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Load current background image into an HTMLImageElement for instant canvas rendering
  const activeBgUrl = project?.background.imageUrl ?? PRESET_BACKGROUNDS[0].url;
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setBgImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setBgImage(null);
    };
    img.src = activeBgUrl;
    return () => {
      cancelled = true;
    };
  }, [activeBgUrl]);

  const handleLoadDemo = useCallback(async () => {
    setSetupError(null);
    setNoticeBanner(null);
    setIsProcessing(true);
    setProcessingStage('Generazione traccia stereo demo...');

    try {
      const demo = await createDemoKaraokeTrack();
      setAudioBuffer(demo.audioBuffer);
      setProject({
        id: `demo-${Date.now()}`,
        fileName: 'luci-nella-notte-demo.wav',
        songDuration: demo.audioBuffer.duration,
        isStereo: true,
        isDemo: true,
        metadata: {
          title: demo.title,
          artist: demo.artist,
          introDuration: 4,
        },
        lines: demo.lines,
        style: { ...DEFAULT_STYLE },
        background: { ...DEFAULT_BACKGROUND },
        vocalRemoval: { ...DEFAULT_VOCAL_REMOVAL },
      });
      setActiveTab('lyrics');
    } catch (err) {
      setSetupError(
        (err as Error).message || 'Impossibile generare il brano dimostrativo.'
      );
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  }, []);

  // Support ?autostart=1 to jump directly into the Studio workspace with demo track
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !project && !isProcessing) {
      void handleLoadDemo();
    }
  }, [handleLoadDemo, isProcessing, project]);

  const handleSubmitSong = async (submission: SetupSubmission) => {
    setSetupError(null);
    setNoticeBanner(null);
    setIsProcessing(true);

    try {
      setProcessingStage('Decodifica audio nel browser...');
      const arrayBuf = await submission.audioFile.arrayBuffer();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const tempCtx = new AudioCtx();
      const decoded = await tempCtx.decodeAudioData(arrayBuf.slice(0));
      await tempCtx.close().catch(() => {});

      const stereoProfile = analyzeAudioBufferStereo(decoded);
      const isStereo = stereoProfile.isEffectiveStereo;
      const hasUserLyrics = submission.lyricsText.trim().length > 0;

      setProcessingStage(
        hasUserLyrics
          ? 'Sincronizzazione del testo con la melodia...'
          : 'Estrazione automatica del testo dall’audio...'
      );

      let analyzedLines: LyricLine[] = [];
      let detectedTitle = submission.title;
      let detectedArtist = submission.artist;

      try {
        const audioBase64 = await renderCompactAnalysisWavBase64(decoded);
        const resp = await fetch('/api/lyrics/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64,
            mimeType: 'audio/wav',
            lyricsText: submission.lyricsText,
            durationSec: decoded.duration,
            fileName: submission.audioFile.name,
          }),
        });

        if (!resp.ok) {
          const payload = (await resp.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };
          throw new Error(payload.error || 'Errore nella risposta del servizio di analisi.');
        }

        const data = (await resp.json()) as {
          lines?: LyricLine[];
          suggestedTitle?: string;
          suggestedArtist?: string;
        };

        analyzedLines = Array.isArray(data.lines) ? data.lines : [];
        if (detectedTitle === 'Senza Titolo' && data.suggestedTitle) {
          detectedTitle = data.suggestedTitle;
        }
        if (detectedArtist === 'Artista' && data.suggestedArtist) {
          detectedArtist = data.suggestedArtist;
        }
      } catch (apiErr) {
        if (hasUserLyrics) {
          analyzedLines = parseLyricsToLines(submission.lyricsText, decoded.duration);
          setNoticeBanner(
            `Sincronizzazione AI non disponibile al momento (${(apiErr as Error).message}). Il testo è stato distribuito automaticamente: puoi rifinire i tempi qui a destra.`
          );
        } else {
          throw new Error(
            `${(apiErr as Error).message} Puoi incollare il testo manualmente per procedere comunque.`
          );
        }
      }

      if (analyzedLines.length === 0 && hasUserLyrics) {
        analyzedLines = parseLyricsToLines(submission.lyricsText, decoded.duration);
      }

      setAudioBuffer(decoded);
      setProject({
        id: `proj-${Date.now()}`,
        fileName: submission.audioFile.name,
        songDuration: decoded.duration,
        isStereo,
        isDemo: false,
        metadata: {
          title: detectedTitle,
          artist: detectedArtist,
          introDuration: submission.introDuration,
        },
        lines: analyzedLines,
        style: { ...DEFAULT_STYLE },
        background: {
          ...DEFAULT_BACKGROUND,
          imageUrl: submission.backgroundUrl,
          imageLabel: submission.backgroundLabel,
        },
        vocalRemoval: { ...DEFAULT_VOCAL_REMOVAL },
      });
      setActiveTab('lyrics');
    } catch (err) {
      setSetupError(
        (err as Error).message || 'Impossibile elaborare la canzone selezionata.'
      );
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const handleResetProject = () => {
    setIsExportOpen(false);
    setProject(null);
    setAudioBuffer(null);
    setNoticeBanner(null);
    setSetupError(null);
  };

  return (
    <div className="min-h-screen bg-[#0D0F13] text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-800/90 bg-[#0D0F13]/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 md:px-6">
          <a
            href="/"
            onClick={(ev) => {
              ev.preventDefault();
              handleResetProject();
            }}
            className="text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0"
          >
            Palco Studio
          </a>

          {project ? (
            <nav
              aria-label="Navigazione studio"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
            >
              <button
                type="button"
                onClick={handleResetProject}
                className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Nuovo Brano
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lyrics')}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'lyrics' ? 'text-amber-400' : 'hover:text-slate-100'
                }`}
              >
                Testo e Tempismo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('typography')}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'typography' ? 'text-amber-400' : 'hover:text-slate-100'
                }`}
              >
                Carattere e Font
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('background')}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'background' ? 'text-amber-400' : 'hover:text-slate-100'
                }`}
              >
                Sfondo e Intro
              </button>
            </nav>
          ) : (
            <nav
              aria-label="Fasi del flusso"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
            >
              <span className="text-slate-200 whitespace-nowrap shrink-0">Carica Brano</span>
              <span className="whitespace-nowrap shrink-0">Rimozione Voce</span>
              <span className="whitespace-nowrap shrink-0">Sincronizzazione</span>
              <span className="whitespace-nowrap shrink-0">Esporta Video</span>
            </nav>
          )}

          <div className="flex items-center gap-3 shrink-0">
            {project ? (
              <button
                type="button"
                onClick={() => setIsExportOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Film className="h-3.5 w-3.5" />
                <span>Esporta Video</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoadDemo}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Avvia Demo</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {noticeBanner && (
        <div className="mx-auto mt-4 w-full max-w-[1440px] px-4 md:px-6">
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
            {noticeBanner}
          </div>
        </div>
      )}

      {!project || !audioBuffer ? (
        <SetupScreen
          onSubmitSong={handleSubmitSong}
          onLoadDemo={handleLoadDemo}
          isProcessing={isProcessing}
          processingStage={processingStage}
          errorMessage={setupError}
        />
      ) : (
        <StudioWorkspace
          project={project}
          audioBuffer={audioBuffer}
          bgImage={bgImage}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onUpdateProject={(updater) =>
            setProject((prev) => (prev ? updater(prev) : prev))
          }
        />
      )}

      {project && audioBuffer && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          project={project}
          audioBuffer={audioBuffer}
          bgImage={bgImage}
        />
      )}
    </div>
  );
}
