import { LyricLine, LyricWord } from '../types/karaoke';

export function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export function formatMinutesSeconds(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Distributes pasted raw lyrics evenly across the usable song duration
 * as a clean fallback when AI transcription/alignment is unavailable or skipped.
 */
export function parseLyricsToLines(rawText: string, songDuration: number): LyricLine[] {
  const rawLines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) return [];

  const safeDur = Math.max(4, songDuration);
  const leadIn = Math.min(2.0, safeDur * 0.06);
  const leadOut = Math.min(1.5, safeDur * 0.05);
  const usable = Math.max(2, safeDur - leadIn - leadOut);

  const lineWeights = rawLines.map((line) => Math.max(4, line.replace(/\s+/g, '').length));
  const totalWeight = lineWeights.reduce((sum, w) => sum + w, 0);

  let cursor = leadIn;
  return rawLines.map((lineText, idx) => {
    const tokens = lineText.split(/\s+/).filter(Boolean);
    const share = (lineWeights[idx] / totalWeight) * usable;
    const gap = Math.min(0.25, share * 0.12);
    const startTime = roundTime(cursor);
    const endTime = roundTime(Math.min(safeDur, cursor + Math.max(0.6, share - gap)));
    cursor = Math.min(safeDur, endTime + gap);

    const words = distributeWordsInRange(tokens, startTime, endTime, `line-${idx}`);
    return {
      id: `line-${idx}-${Math.round(startTime * 100)}`,
      startTime,
      endTime,
      words,
    };
  });
}

export function distributeWordsInRange(
  tokens: string[],
  startTime: number,
  endTime: number,
  prefix = 'w'
): LyricWord[] {
  if (tokens.length === 0) return [];
  const safeStart = Math.max(0, startTime);
  const safeEnd = Math.max(safeStart + 0.2, endTime);
  const span = safeEnd - safeStart;

  const weights = tokens.map((t) => Math.max(1.5, t.length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  let cursor = safeStart;
  return tokens.map((text, idx) => {
    const isLast = idx === tokens.length - 1;
    const wDur = (weights[idx] / totalWeight) * span;
    const wStart = roundTime(cursor);
    const wEnd = isLast ? roundTime(safeEnd) : roundTime(Math.min(safeEnd, cursor + wDur));
    cursor = wEnd;
    return {
      id: `${prefix}-w-${idx}-${Math.round(wStart * 100)}`,
      text,
      startTime: wStart,
      endTime: Math.max(roundTime(wStart + 0.05), wEnd),
    };
  });
}

/**
 * Rebuilds a line's words when the user edits the full line text,
 * keeping the existing startTime and endTime intact.
 */
export function rebalanceLineWords(line: LyricLine, newText: string): LyricLine {
  const tokens = newText
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return line;
  }

  return {
    ...line,
    words: distributeWordsInRange(tokens, line.startTime, line.endTime, line.id),
  };
}

/**
 * Updates a single word's text without shifting timings.
 */
export function updateWordText(line: LyricLine, wordId: string, newText: string): LyricLine {
  const clean = newText.trim();
  if (!clean) return line;
  return {
    ...line,
    words: line.words.map((w) => (w.id === wordId ? { ...w, text: clean } : w)),
  };
}

/**
 * Shifts an entire line and all its words by deltaSec while keeping bounds valid.
 */
export function nudgeLineTiming(
  line: LyricLine,
  deltaSec: number,
  maxDuration: number
): LyricLine {
  const duration = Math.max(0.25, line.endTime - line.startTime);
  const newStart = roundTime(clamp(line.startTime + deltaSec, 0, Math.max(0, maxDuration - duration)));
  const appliedDelta = newStart - line.startTime;

  return {
    ...line,
    startTime: newStart,
    endTime: roundTime(clamp(line.endTime + appliedDelta, newStart + 0.25, maxDuration)),
    words: line.words.map((w) => {
      const ws = roundTime(clamp(w.startTime + appliedDelta, newStart, maxDuration - 0.05));
      const we = roundTime(clamp(w.endTime + appliedDelta, ws + 0.05, maxDuration));
      return { ...w, startTime: ws, endTime: we };
    }),
  };
}

/**
 * Adjusts only the start or end bound of a line (useful for fine-tuning duration).
 */
export function adjustLineBoundary(
  line: LyricLine,
  edge: 'start' | 'end',
  newTime: number,
  maxDuration: number
): LyricLine {
  const clamped = roundTime(clamp(newTime, 0, maxDuration));
  let start = line.startTime;
  let end = line.endTime;

  if (edge === 'start') {
    start = Math.min(clamped, roundTime(end - 0.25));
  } else {
    end = Math.max(clamped, roundTime(start + 0.25));
  }

  const tokens = line.words.map((w) => w.text);
  return {
    ...line,
    startTime: start,
    endTime: end,
    words: distributeWordsInRange(tokens, start, end, line.id),
  };
}

/**
 * Nudges a single word's timing inside its line and expands line bounds if needed.
 */
export function nudgeWordTiming(
  line: LyricLine,
  wordId: string,
  deltaSec: number,
  maxDuration: number
): LyricLine {
  const idx = line.words.findIndex((w) => w.id === wordId);
  if (idx === -1) return line;

  const target = line.words[idx];
  const wordDur = Math.max(0.08, target.endTime - target.startTime);
  const newStart = roundTime(clamp(target.startTime + deltaSec, 0, Math.max(0, maxDuration - wordDur)));
  const newEnd = roundTime(clamp(newStart + wordDur, newStart + 0.08, maxDuration));

  const updatedWords = line.words.map((w, i) => {
    if (i !== idx) return w;
    return { ...w, startTime: newStart, endTime: newEnd };
  });

  const minLineStart = Math.min(...updatedWords.map((w) => w.startTime));
  const maxLineEnd = Math.max(...updatedWords.map((w) => w.endTime));

  return {
    ...line,
    startTime: roundTime(minLineStart),
    endTime: roundTime(maxLineEnd),
    words: updatedWords,
  };
}

/**
 * Shifts all lyric lines globally by deltaSec.
 */
export function shiftAllLyrics(
  lines: LyricLine[],
  deltaSec: number,
  maxDuration: number
): LyricLine[] {
  return lines.map((line) => nudgeLineTiming(line, deltaSec, maxDuration));
}

export function getWordSweepProgress(word: LyricWord, songTime: number): number {
  if (songTime <= word.startTime) return 0;
  if (songTime >= word.endTime) return 1;
  const span = Math.max(0.05, word.endTime - word.startTime);
  return clamp((songTime - word.startTime) / span, 0, 1);
}

export interface ActiveLyricView {
  currentLineIndex: number;
  prevLine: LyricLine | null;
  currentLine: LyricLine | null;
  nextLine: LyricLine | null;
  upcomingLineAfterNext: LyricLine | null;
  countdownBeforeLine: number | null; // seconds until next line if in an instrumental gap <= 3s
}

export function getActiveLyricState(lines: LyricLine[], songTime: number): ActiveLyricView {
  if (lines.length === 0) {
    return {
      currentLineIndex: -1,
      prevLine: null,
      currentLine: null,
      nextLine: null,
      upcomingLineAfterNext: null,
      countdownBeforeLine: null,
    };
  }

  // Find active line (or most recently finished line within a short 0.6s grace tail)
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const nextStart = i + 1 < lines.length ? lines[i + 1].startTime : Infinity;
    const graceEnd = Math.min(line.endTime + 0.5, nextStart);
    if (songTime >= line.startTime && songTime <= graceEnd) {
      activeIdx = i;
      break;
    }
  }

  if (activeIdx !== -1) {
    return {
      currentLineIndex: activeIdx,
      prevLine: activeIdx > 0 ? lines[activeIdx - 1] : null,
      currentLine: lines[activeIdx],
      nextLine: activeIdx + 1 < lines.length ? lines[activeIdx + 1] : null,
      upcomingLineAfterNext: activeIdx + 2 < lines.length ? lines[activeIdx + 2] : null,
      countdownBeforeLine: null,
    };
  }

  // Otherwise we are before the first line or in an instrumental break
  const upcomingIdx = lines.findIndex((l) => l.startTime > songTime);
  if (upcomingIdx === -1) {
    // After the final lyric line
    const lastIdx = lines.length - 1;
    return {
      currentLineIndex: -1,
      prevLine: lines[lastIdx],
      currentLine: null,
      nextLine: null,
      upcomingLineAfterNext: null,
      countdownBeforeLine: null,
    };
  }

  const upcoming = lines[upcomingIdx];
  const timeUntil = upcoming.startTime - songTime;

  return {
    currentLineIndex: -1,
    prevLine: upcomingIdx > 0 ? lines[upcomingIdx - 1] : null,
    currentLine: upcoming,
    nextLine: upcomingIdx + 1 < lines.length ? lines[upcomingIdx + 1] : null,
    upcomingLineAfterNext: upcomingIdx + 2 < lines.length ? lines[upcomingIdx + 2] : null,
    countdownBeforeLine: timeUntil <= 3.0 ? timeUntil : null,
  };
}

export function buildLrcContent(lines: LyricLine[], title: string, artist: string): string {
  const header = [
    `[ti:${title || 'Senza Titolo'}]`,
    `[ar:${artist || 'Artista'}]`,
    '',
  ];

  const rows = lines.map((line) => {
    const mins = Math.floor(line.startTime / 60);
    const secs = line.startTime % 60;
    const tag = `[${String(mins).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}]`;
    const text = line.words.map((w) => w.text).join(' ');
    return `${tag}${text}`;
  });

  return [...header, ...rows].join('\n');
}

export function sanitizeExportFilename(title: string, ext = 'webm'): string {
  const base = (title || 'karaoke-video')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'karaoke-video'}-karaoke.${ext}`;
}
