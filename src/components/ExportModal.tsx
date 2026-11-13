import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Film, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { KaraokeProject } from '../types/karaoke';
import { exportKaraokeVideo } from '../utils/videoExporter';
import { buildLrcContent, formatMinutesSeconds, sanitizeExportFilename } from '../utils/lyricsTiming';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: KaraokeProject;
  audioBuffer: AudioBuffer;
  bgImage: HTMLImageElement | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  audioBuffer,
  bgImage,
}) => {
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [useVocalRemoval, setUseVocalRemoval] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  if (!isOpen) return null;

  const totalDuration = project.metadata.introDuration + audioBuffer.duration;

  const handleStartExport = async () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setErrorMsg(null);
    setProgress(0);
    setElapsed(0);
    setIsExporting(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await exportKaraokeVideo({
        audioBuffer,
        isStereo: project.isStereo,
        metadata: project.metadata,
        lines: project.lines,
        style: project.style,
        background: project.background,
        vocalRemoval: useVocalRemoval
          ? project.vocalRemoval
          : { ...project.vocalRemoval, suppression: 0 },
        bgImage,
        resolution,
        onProgress: (pct, el) => {
          setProgress(pct);
          setElapsed(el);
        },
        signal: controller.signal,
      });

      const url = URL.createObjectURL(result.blob);
      setDownloadUrl(url);
      setDownloadName(result.filename);

      // Auto-trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorMsg((err as Error).message || 'Errore durante l\'esportazione video.');
      }
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsExporting(false);
  };

  const handleDownloadLrc = () => {
    const lrc = buildLrcContent(
      project.lines,
      project.metadata.title,
      project.metadata.artist
    );
    const blob = new Blob([lrc], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeExportFilename(project.metadata.title, 'lrc');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#14171D] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="export-modal-title" className="text-lg font-semibold text-slate-100">
              Esporta Video Karaoke
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {project.metadata.title} · {project.metadata.artist} · Durata totale{' '}
              <span className="font-mono tabular-nums">{formatMinutesSeconds(totalDuration)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={isExporting ? handleCancelExport : onClose}
            aria-label="Chiudi finestra esportazione"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <span className="block text-xs font-medium text-slate-300">Risoluzione Video</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setResolution('720p')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                  resolution === '720p'
                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-[#0D0F13] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold">720p HD (1280×720)</div>
                <div className="mt-0.5 text-[11px] text-slate-400">Esportazione rapida · 30 fps</div>
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setResolution('1080p')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                  resolution === '1080p'
                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-[#0D0F13] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold">1080p Full HD (1920×1080)</div>
                <div className="mt-0.5 text-[11px] text-slate-400">Massima nitidezza · 30 fps</div>
              </button>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300">Traccia Audio nel Video</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setUseVocalRemoval(true)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                  useVocalRemoval
                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-[#0D0F13] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold">Base Karaoke (Senza Voce)</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Rimozione vocale ({Math.round(project.vocalRemoval.suppression * 100)}%)
                </div>
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setUseVocalRemoval(false)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                  !useVocalRemoval
                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                    : 'border-slate-800 bg-[#0D0F13] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold">Audio Originale (Con Voce)</div>
                <div className="mt-0.5 text-[11px] text-slate-400">Video con testo cantato</div>
              </button>
            </div>
          </div>

          {isExporting && (
            <div className="rounded-lg border border-slate-800 bg-[#0D0F13] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 font-medium text-slate-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                  <span>Rendering video e audio in corso...</span>
                </span>
                <span className="font-mono tabular-nums text-amber-400">{progress}%</span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-amber-500 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500 font-mono tabular-nums">
                {formatMinutesSeconds(elapsed)} / {formatMinutesSeconds(totalDuration)} — Non chiudere questa scheda durante il rendering.
              </p>
            </div>
          )}

          {downloadUrl && !isExporting && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="truncate">Video pronto: {downloadName}</span>
              </div>
              <a
                href={downloadUrl}
                download={downloadName}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-emerald-400 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Scarica</span>
              </a>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={handleDownloadLrc}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D0F13] px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Scarica Testo (.lrc)</span>
          </button>

          <div className="flex items-center gap-2">
            {isExporting ? (
              <button
                type="button"
                onClick={handleCancelExport}
                className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-2 text-xs font-medium text-red-200 hover:bg-red-950/50 cursor-pointer whitespace-nowrap shrink-0"
              >
                Annulla Rendering
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartExport}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Film className="h-3.5 w-3.5" />
                <span>{downloadUrl ? 'Esporta di Nuovo (.webm)' : 'Genera Video (.webm)'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
