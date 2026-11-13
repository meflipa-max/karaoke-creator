import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  Minus,
} from 'lucide-react';
import { LyricLine } from '../types/karaoke';
import {
  formatTimecode,
  nudgeLineTiming,
  nudgeWordTiming,
  rebalanceLineWords,
  roundTime,
  shiftAllLyrics,
  updateWordText,
} from '../utils/lyricsTiming';

interface LyricTimingEditorProps {
  lines: LyricLine[];
  songTime: number;
  songDuration: number;
  activeLineIndex: number;
  onChangeLines: (nextLines: LyricLine[]) => void;
  onSeekToSongTime: (songTime: number) => void;
}

export const LyricTimingEditor: React.FC<LyricTimingEditorProps> = ({
  lines,
  songTime,
  songDuration,
  activeLineIndex,
  onChangeLines,
  onSeekToSongTime,
}) => {
  const [expandedLineIds, setExpandedLineIds] = useState<Record<string, boolean>>({});
  const [editingDrafts, setEditingDrafts] = useState<Record<string, string>>({});

  const toggleExpand = (lineId: string) => {
    setExpandedLineIds((prev) => ({ ...prev, [lineId]: !prev[lineId] }));
  };

  const handleGlobalShift = (deltaSec: number) => {
    onChangeLines(shiftAllLyrics(lines, deltaSec, songDuration));
  };

  const handleNudgeLine = (lineId: string, deltaSec: number) => {
    onChangeLines(
      lines.map((l) => (l.id === lineId ? nudgeLineTiming(l, deltaSec, songDuration) : l))
    );
  };

  const handleSnapLineStartToPlayhead = (lineId: string) => {
    const target = lines.find((l) => l.id === lineId);
    if (!target) return;
    const delta = roundTime(songTime - target.startTime);
    handleNudgeLine(lineId, delta);
  };

  const handleCommitLineText = (line: LyricLine, rawText: string) => {
    setEditingDrafts((prev) => {
      const next = { ...prev };
      delete next[line.id];
      return next;
    });
    if (!rawText.trim()) return;
    const updated = rebalanceLineWords(line, rawText);
    onChangeLines(lines.map((l) => (l.id === line.id ? updated : l)));
  };

  const handleWordTextChange = (lineId: string, wordId: string, text: string) => {
    onChangeLines(
      lines.map((l) => (l.id === lineId ? updateWordText(l, wordId, text) : l))
    );
  };

  const handleNudgeWord = (lineId: string, wordId: string, deltaSec: number) => {
    onChangeLines(
      lines.map((l) => (l.id === lineId ? nudgeWordTiming(l, wordId, deltaSec, songDuration) : l))
    );
  };

  const handleAddLine = () => {
    const start = roundTime(Math.min(Math.max(0, songTime), Math.max(0.5, songDuration - 1.5)));
    const end = roundTime(Math.min(songDuration, start + 2.4));
    const newId = `line-custom-${Date.now()}`;
    const newLine: LyricLine = {
      id: newId,
      startTime: start,
      endTime: end,
      words: [
        { id: `${newId}-w0`, text: 'Nuova', startTime: start, endTime: roundTime((start + end) / 2) },
        { id: `${newId}-w1`, text: 'riga', startTime: roundTime((start + end) / 2), endTime: end },
      ],
    };
    const merged = [...lines, newLine].sort((a, b) => a.startTime - b.startTime);
    onChangeLines(merged);
  };

  const handleDeleteLine = (lineId: string) => {
    onChangeLines(lines.filter((l) => l.id !== lineId));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Global timing controls */}
      <div className="flex flex-col gap-2.5 border-b border-slate-800 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-300 whitespace-nowrap">
              Anticipa / Ritarda tutto
            </span>
          </div>

          <button
            type="button"
            onClick={handleAddLine}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#1A1F28] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-amber-500/60 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5 text-amber-400" />
            <span>Aggiungi riga</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleGlobalShift(-0.2)}
            className="rounded border border-slate-700 bg-[#0D0F13] px-2 py-1 text-xs font-mono tabular-nums text-slate-200 hover:border-amber-500/60 cursor-pointer whitespace-nowrap shrink-0"
          >
            -0.2s
          </button>
          <button
            type="button"
            onClick={() => handleGlobalShift(-0.05)}
            className="rounded border border-slate-700 bg-[#0D0F13] px-2 py-1 text-xs font-mono tabular-nums text-slate-200 hover:border-amber-500/60 cursor-pointer whitespace-nowrap shrink-0"
          >
            -0.05s
          </button>
          <button
            type="button"
            onClick={() => handleGlobalShift(0.05)}
            className="rounded border border-slate-700 bg-[#0D0F13] px-2 py-1 text-xs font-mono tabular-nums text-slate-200 hover:border-amber-500/60 cursor-pointer whitespace-nowrap shrink-0"
          >
            +0.05s
          </button>
          <button
            type="button"
            onClick={() => handleGlobalShift(0.2)}
            className="rounded border border-slate-700 bg-[#0D0F13] px-2 py-1 text-xs font-mono tabular-nums text-slate-200 hover:border-amber-500/60 cursor-pointer whitespace-nowrap shrink-0"
          >
            +0.2s
          </button>
        </div>
      </div>

      {/* Scrollable Lyric Rows */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center">
            <p className="text-sm text-slate-300">Nessuna riga di testo presente.</p>
            <p className="mt-1 text-xs text-slate-500">
              Clicca &ldquo;Aggiungi riga&rdquo; per inserire manualmente il testo sincronizzato.
            </p>
          </div>
        ) : (
          lines.map((line, idx) => {
            const isActive = idx === activeLineIndex;
            const isExpanded = Boolean(expandedLineIds[line.id]);
            const fullText =
              editingDrafts[line.id] !== undefined
                ? editingDrafts[line.id]
                : line.words.map((w) => w.text).join(' ');

            return (
              <div
                key={line.id}
                className={`rounded-lg border p-3 transition-colors ${
                  isActive
                    ? 'border-amber-500/70 bg-amber-500/10'
                    : 'border-slate-800 bg-[#0D0F13]/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSeekToSongTime(line.startTime)}
                    className="inline-flex items-center gap-2 text-left text-xs font-mono tabular-nums text-slate-300 hover:text-amber-300 cursor-pointer whitespace-nowrap shrink-0"
                    title="Vai a questo momento del brano"
                  >
                    <span className={isActive ? 'font-semibold text-amber-400' : 'text-slate-400'}>
                      #{idx + 1}
                    </span>
                    <span>{formatTimecode(line.startTime)}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      -
                    </span>
                    <span>{formatTimecode(line.endTime)}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleNudgeLine(line.id, -0.1)}
                      aria-label={`Anticipa riga ${idx + 1} di 0.1 secondi`}
                      className="rounded border border-slate-700 bg-[#14171D] px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-slate-300 hover:border-amber-500/60 cursor-pointer"
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNudgeLine(line.id, 0.1)}
                      aria-label={`Ritarda riga ${idx + 1} di 0.1 secondi`}
                      className="rounded border border-slate-700 bg-[#14171D] px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-slate-300 hover:border-amber-500/60 cursor-pointer"
                    >
                      +0.1s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSnapLineStartToPlayhead(line.id)}
                      aria-label={`Imposta inizio riga ${idx + 1} al tempo corrente`}
                      title="Allinea inizio riga al cursore attuale"
                      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#14171D] px-1.5 py-0.5 text-[11px] font-medium text-slate-200 hover:border-amber-500/60 hover:text-amber-300 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Crosshair className="h-3 w-3" />
                      <span>Qui</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(line.id)}
                      aria-expanded={isExpanded}
                      aria-label={`Modifica parole della riga ${idx + 1}`}
                      className="rounded border border-slate-700 bg-[#14171D] p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLine(line.id)}
                      aria-label={`Elimina riga ${idx + 1}`}
                      className="rounded border border-slate-800 bg-[#14171D] p-1 text-slate-500 hover:border-red-500/40 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Full line text editor */}
                <div className="mt-2">
                  <label htmlFor={`line-text-${line.id}`} className="sr-only">
                    Testo riga {idx + 1}
                  </label>
                  <input
                    id={`line-text-${line.id}`}
                    type="text"
                    value={fullText}
                    onChange={(ev) =>
                      setEditingDrafts((prev) => ({ ...prev, [line.id]: ev.target.value }))
                    }
                    onBlur={(ev) => handleCommitLineText(line, ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') {
                        ev.currentTarget.blur();
                      }
                    }}
                    className="w-full rounded-md border border-slate-800 bg-[#14171D] px-2.5 py-1.5 text-sm font-medium text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Expanded word-level micro timing & word text editor */}
                {isExpanded && (
                  <div className="mt-3 space-y-2 border-t border-slate-800/80 pt-2.5">
                    <p className="text-[11px] font-medium text-slate-400">
                      Ritocco singole parole e tempismo (±0.05s)
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {line.words.map((word) => (
                        <div
                          key={word.id}
                          className="flex items-center gap-1.5 rounded border border-slate-800 bg-[#14171D] px-2 py-1"
                        >
                          <input
                            type="text"
                            aria-label={`Modifica parola ${word.text}`}
                            value={word.text}
                            onChange={(ev) =>
                              handleWordTextChange(line.id, word.id, ev.target.value)
                            }
                            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-100 focus:outline-none"
                          />
                          <span className="text-[10px] font-mono tabular-nums text-slate-500 shrink-0">
                            {word.startTime.toFixed(2)}s
                          </span>
                          <button
                            type="button"
                            onClick={() => handleNudgeWord(line.id, word.id, -0.05)}
                            aria-label={`Anticipa parola ${word.text}`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-amber-300 cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleNudgeWord(line.id, word.id, 0.05)}
                            aria-label={`Ritarda parola ${word.text}`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-amber-300 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
