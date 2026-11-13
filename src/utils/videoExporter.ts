import {
  BackgroundConfig,
  KaraokeStyle,
  LyricLine,
  SongMetadata,
  VocalRemovalConfig,
} from '../types/karaoke';
import { connectVocalRemovalGraph } from './audioEngine';
import { renderKaraokeFrame } from './karaokeCanvas';
import { sanitizeExportFilename } from './lyricsTiming';

export interface ExportVideoOptions {
  audioBuffer: AudioBuffer;
  isStereo: boolean;
  metadata: SongMetadata;
  lines: LyricLine[];
  style: KaraokeStyle;
  background: BackgroundConfig;
  vocalRemoval: VocalRemovalConfig;
  bgImage: HTMLImageElement | null;
  resolution: '720p' | '1080p';
  onProgress: (percent: number, elapsedSec: number, totalSec: number) => void;
  signal: AbortSignal;
}

export interface ExportVideoResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

function selectSupportedMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

export async function exportKaraokeVideo(
  options: ExportVideoOptions
): Promise<ExportVideoResult> {
  const {
    audioBuffer,
    isStereo,
    metadata,
    lines,
    style,
    background,
    vocalRemoval,
    bgImage,
    resolution,
    onProgress,
    signal,
  } = options;

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Questo browser non supporta MediaRecorder per l\'esportazione video.');
  }

  const width = resolution === '1080p' ? 1920 : 1280;
  const height = resolution === '1080p' ? 1080 : 720;
  const introDuration = Math.max(0, metadata.introDuration);
  const totalDuration = introDuration + audioBuffer.duration;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossibile inizializzare il contesto grafico 2D per l\'esportazione.');
  }

  // Draw initial frame before starting capture
  renderKaraokeFrame({
    ctx,
    width,
    height,
    timelineTime: 0,
    totalDuration,
    metadata,
    lines,
    style,
    background,
    bgImage,
  });

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const destination = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;

  const dsp = connectVocalRemovalGraph(audioCtx, source, destination, isStereo, vocalRemoval);

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);

  const mimeType = selectSupportedMimeType();
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: resolution === '1080p' ? 6_000_000 : 3_500_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  return new Promise<ExportVideoResult>((resolve, reject) => {
    let timerId = 0;
    let finished = false;

    const cleanup = () => {
      if (timerId) window.clearInterval(timerId);
      try {
        source.stop();
      } catch {
        // already stopped
      }
      dsp.disconnect();
      canvasStream.getTracks().forEach((t) => t.stop());
      destination.stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
    };

    const handleAbort = () => {
      if (finished) return;
      finished = true;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      cleanup();
      reject(new DOMException('Esportazione annullata dall\'utente.', 'AbortError'));
    };

    signal.addEventListener('abort', handleAbort, { once: true });

    recorder.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Errore durante la registrazione del flusso video.'));
    };

    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      cleanup();
      const blob = new Blob(chunks, { type: mimeType });
      resolve({
        blob,
        filename: sanitizeExportFilename(metadata.title, 'webm'),
        mimeType,
      });
    };

    const startAudioTime = audioCtx.currentTime + 0.05;
    const wallStart = performance.now();

    source.start(startAudioTime + introDuration);
    recorder.start(250);

    timerId = window.setInterval(() => {
      if (signal.aborted || finished) return;
      const elapsedSec = (performance.now() - wallStart) / 1000;
      const clamped = Math.min(totalDuration, elapsedSec);

      renderKaraokeFrame({
        ctx,
        width,
        height,
        timelineTime: clamped,
        totalDuration,
        metadata,
        lines,
        style,
        background,
        bgImage,
      });

      const pct = Math.min(99, Math.round((clamped / Math.max(0.1, totalDuration)) * 100));
      onProgress(pct, clamped, totalDuration);

      if (elapsedSec >= totalDuration + 0.15) {
        window.clearInterval(timerId);
        onProgress(100, totalDuration, totalDuration);
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }
    }, 33);
  });
}
