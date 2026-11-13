import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  MicOff,
  Sliders,
  Type as TypeIcon,
  Image as ImageIcon,
  ListMusic,
} from 'lucide-react';
import { KaraokeProject, LyricLine } from '../types/karaoke';
import { connectVocalRemovalGraph } from '../utils/audioEngine';
import { renderKaraokeFrame } from '../utils/karaokeCanvas';
import { formatTimecode, getActiveLyricState } from '../utils/lyricsTiming';
import { LyricTimingEditor } from './LyricTimingEditor';
import { BackgroundIntroPanel, TypographyPanel } from './StyleCustomizer';

export type StudioTab = 'lyrics' | 'typography' | 'background';

interface StudioWorkspaceProps {
  project: KaraokeProject;
  audioBuffer: AudioBuffer;
  bgImage: HTMLImageElement | null;
  activeTab: StudioTab;
  onChangeTab: (tab: StudioTab) => void;
  onUpdateProject: (updater: (prev: KaraokeProject) => KaraokeProject) => void;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  project,
  audioBuffer,
  bgImage,
  activeTab,
  onChangeTab,
  onUpdateProject,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineTime, setTimelineTime] = useState(0);

  // Audio playback refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dspRef = useRef<ReturnType<typeof connectVocalRemovalGraph> | null>(null);
  const playStartWallRef = useRef<number>(0);
  const playStartTimelineRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const totalDuration = project.metadata.introDuration + audioBuffer.duration;
  const songTime = Math.max(0, timelineTime - project.metadata.introDuration);

  const activeLyricState = useMemo(
    () => getActiveLyricState(project.lines, songTime),
    [project.lines, songTime]
  );

  // Stop active audio node cleanly
  const stopAudioEngine = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch {
        // ignore if already stopped
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (dspRef.current) {
      dspRef.current.disconnect();
      dspRef.current = null;
    }
  }, []);

  // Cleanup on unmount or audioBuffer swap
  useEffect(() => {
    return () => {
      stopAudioEngine();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [audioBuffer, stopAudioEngine]);

  // Live update vocal removal DSP parameters while playing
  useEffect(() => {
    if (dspRef.current) {
      dspRef.current.updateConfig(project.vocalRemoval);
    }
  }, [project.vocalRemoval]);

  // Render live canvas whenever state or playhead updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderKaraokeFrame({
      ctx,
      width: canvas.width,
      height: canvas.height,
      timelineTime,
      totalDuration,
      metadata: project.metadata,
      lines: project.lines,
      style: project.style,
      background: project.background,
      bgImage,
    });
  }, [
    timelineTime,
    totalDuration,
    project.metadata,
    project.lines,
    project.style,
    project.background,
    bgImage,
  ]);

  const ensureAudioContext = useCallback(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  }, []);

  const startPlaybackFrom = useCallback(
    async (startAtTimeline: number) => {
      stopAudioEngine();

      const clampedStart = Math.max(0, Math.min(totalDuration - 0.05, startAtTimeline));
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // ignore resume rejection if browser requires direct click
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const dsp = connectVocalRemovalGraph(
        ctx,
        source,
        ctx.destination,
        project.isStereo,
        project.vocalRemoval
      );

      sourceRef.current = source;
      dspRef.current = dsp;

      const introDur = project.metadata.introDuration;
      if (clampedStart < introDur) {
        const delaySec = introDur - clampedStart;
        source.start(ctx.currentTime + delaySec, 0);
      } else {
        const songOffset = Math.max(0, clampedStart - introDur);
        source.start(ctx.currentTime, songOffset);
      }

      playStartWallRef.current = performance.now();
      playStartTimelineRef.current = clampedStart;
      setTimelineTime(clampedStart);
      setIsPlaying(true);

      const tick = () => {
        const elapsed = (performance.now() - playStartWallRef.current) / 1000;
        const nextTime = playStartTimelineRef.current + elapsed;
        if (nextTime >= totalDuration) {
          stopAudioEngine();
          setIsPlaying(false);
          setTimelineTime(totalDuration);
          return;
        }
        setTimelineTime(nextTime);
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [
      audioBuffer,
      ensureAudioContext,
      project.isStereo,
      project.metadata.introDuration,
      project.vocalRemoval,
      stopAudioEngine,
      totalDuration,
    ]
  );

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      stopAudioEngine();
      setIsPlaying(false);
    } else {
      ensureAudioContext();
      const startFrom = timelineTime >= totalDuration - 0.1 ? 0 : timelineTime;
      void startPlaybackFrom(startFrom);
    }
  }, [ensureAudioContext, isPlaying, startPlaybackFrom, stopAudioEngine, timelineTime, totalDuration]);

  const handleSeekTimeline = useCallback(
    (nextTimelineTime: number) => {
      const clamped = Math.max(0, Math.min(totalDuration, nextTimelineTime));
      setTimelineTime(clamped);
      if (isPlaying) {
        void startPlaybackFrom(clamped);
      }
    },
    [isPlaying, startPlaybackFrom, totalDuration]
  );

  const handleSeekToSongTime = useCallback(
    (targetSongTime: number) => {
      handleSeekTimeline(project.metadata.introDuration + targetSongTime);
    },
    [handleSeekTimeline, project.metadata.introDuration]
  );

  // Spacebar play/pause when not typing in inputs
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space') return;
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      ev.preventDefault();
      togglePlayPause();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlayPause]);

  const vocalModeLabel =
    project.vocalRemoval.suppression >= 0.9
      ? 'Base Karaoke (Voce rimossa)'
      : project.vocalRemoval.suppression <= 0.1
      ? 'Audio Originale (Con voce)'
      : `Mix Bilanciato (${Math.round(project.vocalRemoval.suppression * 100)}%)`;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Stage: Live 16:9 Preview Canvas + Transport + Vocal Removal */}
        <section className="space-y-4 lg:col-span-7 xl:col-span-8">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#090B0F] shadow-xl">
            <div className="relative aspect-video w-full bg-black">
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                data-testid="karaoke-canvas"
                className="h-full w-full object-contain"
              />
            </div>

            {/* Scrubber & Transport Controls */}
            <div className="border-t border-slate-800 bg-[#14171D] p-4">
              {/* Visual timeline markers + range scrubber */}
              <div className="relative mb-3">
                <div
                  aria-hidden="true"
                  className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
                >
                  {/* Intro zone highlight */}
                  {project.metadata.introDuration > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 bg-amber-500/40"
                      style={{
                        width: `${(project.metadata.introDuration / Math.max(0.1, totalDuration)) * 100}%`,
                      }}
                    />
                  )}
                  {/* Lyric line segments */}
                  {project.lines.map((line) => {
                    const leftPct =
                      ((project.metadata.introDuration + line.startTime) /
                        Math.max(0.1, totalDuration)) *
                      100;
                    const widthPct =
                      ((line.endTime - line.startTime) / Math.max(0.1, totalDuration)) * 100;
                    return (
                      <div
                        key={line.id}
                        className="absolute inset-y-0 bg-slate-500/70"
                        style={{ left: `${leftPct}%`, width: `${Math.max(0.5, widthPct)}%` }}
                      />
                    );
                  })}
                </div>
                <input
                  type="range"
                  aria-label="Cursore temporale del video"
                  min={0}
                  max={totalDuration}
                  step={0.02}
                  value={timelineTime}
                  onChange={(ev) => handleSeekTimeline(Number(ev.target.value))}
                  className="mt-2 w-full cursor-pointer"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Metti in pausa anteprima' : 'Riproduci anteprima'}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-4 w-4" />
                        <span>Pausa</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        <span>Riproduci</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSeekTimeline(0)}
                    aria-label="Torna all'inizio (intro)"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D0F13] px-3 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Inizio</span>
                  </button>

                  {project.metadata.introDuration > 0 &&
                    timelineTime < project.metadata.introDuration && (
                      <button
                        type="button"
                        onClick={() => handleSeekTimeline(project.metadata.introDuration)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>Salta intro</span>
                      </button>
                    )}

                  <div className="text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap shrink-0">
                    <span>{formatTimecode(timelineTime)}</span>
                    <span className="mx-1 text-slate-600">/</span>
                    <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 whitespace-nowrap">
                  {timelineTime < project.metadata.introDuration
                    ? `Intro titolo · Musica tra ${Math.ceil(
                        project.metadata.introDuration - timelineTime
                      )}s`
                    : activeLyricState.currentLineIndex >= 0
                    ? `Riga #${activeLyricState.currentLineIndex + 1} di ${project.lines.length}`
                    : 'Base musicale'}
                </div>
              </div>
            </div>
          </div>

          {/* Vocal Removal Mix Strip */}
          <div className="rounded-xl border border-slate-800 bg-[#14171D] p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MicOff className="h-4 w-4 text-amber-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-slate-100">
                    Rimozione Voce (Base Strumentale)
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {project.isStereo
                    ? vocalModeLabel
                    : 'Traccia mono: filtro attenuazione voce attivo'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject((p) => ({
                      ...p,
                      vocalRemoval: { ...p.vocalRemoval, suppression: 1 },
                    }))
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    project.vocalRemoval.suppression >= 0.9
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700 bg-[#0D0F13] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  Base Karaoke (100%)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject((p) => ({
                      ...p,
                      vocalRemoval: { ...p.vocalRemoval, suppression: 0.5 },
                    }))
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    project.vocalRemoval.suppression > 0.1 &&
                    project.vocalRemoval.suppression < 0.9
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700 bg-[#0D0F13] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  Voce Guida (50%)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject((p) => ({
                      ...p,
                      vocalRemoval: { ...p.vocalRemoval, suppression: 0 },
                    }))
                  }
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    project.vocalRemoval.suppression <= 0.1
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-slate-700 bg-[#0D0F13] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Originale</span>
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-800/80 pt-3">
              <div className="flex flex-1 min-w-[200px] items-center gap-3">
                <label
                  htmlFor="vocal-suppression-slider"
                  className="text-xs font-medium text-slate-400 whitespace-nowrap"
                >
                  Intensità rimozione
                </label>
                <input
                  id="vocal-suppression-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={project.vocalRemoval.suppression}
                  onChange={(ev) =>
                    onUpdateProject((p) => ({
                      ...p,
                      vocalRemoval: {
                        ...p.vocalRemoval,
                        suppression: Number(ev.target.value),
                      },
                    }))
                  }
                  className="flex-1 cursor-pointer"
                />
                <span className="w-10 text-right text-xs font-mono tabular-nums text-amber-400">
                  {Math.round(project.vocalRemoval.suppression * 100)}%
                </span>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={project.vocalRemoval.bassPreserve}
                  onChange={(ev) =>
                    onUpdateProject((p) => ({
                      ...p,
                      vocalRemoval: {
                        ...p.vocalRemoval,
                        bassPreserve: ev.target.checked,
                      },
                    }))
                  }
                  className="h-3.5 w-3.5 accent-amber-500"
                />
                <span>Preserva bassi e cassa</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={project.vocalRemoval.extraVocalCut}
                  onChange={(ev) =>
                    onUpdateProject((p) => ({
                      ...p,
                      vocalRemoval: {
                        ...p.vocalRemoval,
                        extraVocalCut: ev.target.checked,
                      },
                    }))
                  }
                  className="h-3.5 w-3.5 accent-amber-500"
                />
                <span>Taglio voce extra</span>
              </label>
            </div>
          </div>
        </section>

        {/* Right Inspector Panel: Tabbed Editor */}
        <aside className="flex h-[680px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#14171D] lg:col-span-5 xl:col-span-4">
          <div
            role="tablist"
            aria-label="Pannelli di modifica"
            className="grid grid-cols-3 border-b border-slate-800 bg-[#0D0F13] p-1.5 gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'lyrics'}
              onClick={() => onChangeTab('lyrics')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'lyrics'
                  ? 'bg-[#1A1F28] text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListMusic className="h-3.5 w-3.5 shrink-0" />
              <span>Testo e Tempi</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'typography'}
              onClick={() => onChangeTab('typography')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'typography'
                  ? 'bg-[#1A1F28] text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TypeIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Font e Stile</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'background'}
              onClick={() => onChangeTab('background')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'background'
                  ? 'bg-[#1A1F28] text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Sfondo e Intro</span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
            {activeTab === 'lyrics' && (
              <LyricTimingEditor
                lines={project.lines}
                songTime={songTime}
                songDuration={audioBuffer.duration}
                activeLineIndex={activeLyricState.currentLineIndex}
                onChangeLines={(nextLines: LyricLine[]) =>
                  onUpdateProject((p) => ({ ...p, lines: nextLines }))
                }
                onSeekToSongTime={handleSeekToSongTime}
              />
            )}

            {activeTab === 'typography' && (
              <TypographyPanel
                style={project.style}
                onChangeStyle={(nextStyle) =>
                  onUpdateProject((p) => ({ ...p, style: nextStyle }))
                }
              />
            )}

            {activeTab === 'background' && (
              <BackgroundIntroPanel
                metadata={project.metadata}
                background={project.background}
                onChangeMetadata={(nextMetadata) =>
                  onUpdateProject((p) => ({ ...p, metadata: nextMetadata }))
                }
                onChangeBackground={(nextBackground) =>
                  onUpdateProject((p) => ({ ...p, background: nextBackground }))
                }
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 bg-[#0D0F13]/80 px-4 py-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Sliders className="h-3 w-3 text-amber-400" />
              <span>Anteprima aggiornata in tempo reale</span>
            </span>
            <span className="font-mono tabular-nums">{project.lines.length} righe</span>
          </div>
        </aside>
      </div>
    </main>
  );
};
