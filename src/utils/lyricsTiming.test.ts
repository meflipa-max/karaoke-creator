import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustLineBoundary,
  buildLrcContent,
  formatTimecode,
  getActiveLyricState,
  getWordSweepProgress,
  nudgeLineTiming,
  nudgeWordTiming,
  parseLyricsToLines,
  rebalanceLineWords,
  sanitizeExportFilename,
  shiftAllLyrics,
  updateWordText,
} from './lyricsTiming';

test('formatTimecode formats mm:ss.cc accurately', () => {
  assert.equal(formatTimecode(0), '00:00.00');
  assert.equal(formatTimecode(65.42), '01:05.42');
  assert.equal(formatTimecode(-3), '00:00.00');
});

test('parseLyricsToLines distributes pasted lyrics sequentially within song duration', () => {
  const lines = parseLyricsToLines('Nel blu dipinto di blu\nFelice di stare lassu', 20);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startTime >= 0);
  assert.ok(lines[0].endTime > lines[0].startTime);
  assert.ok(lines[1].startTime >= lines[0].endTime);
  assert.ok(lines[1].endTime <= 20);
  assert.equal(lines[0].words.map((w) => w.text).join(' '), 'Nel blu dipinto di blu');
});

test('rebalanceLineWords preserves line bounds while updating words', () => {
  const [line] = parseLyricsToLines('Prima riga di test', 12);
  const updated = rebalanceLineWords(line, 'Nuove parole cantate');
  assert.equal(updated.startTime, line.startTime);
  assert.equal(updated.endTime, line.endTime);
  assert.equal(updated.words.length, 3);
  assert.equal(updated.words[0].startTime, line.startTime);
  assert.equal(updated.words[2].endTime, line.endTime);
});

test('updateWordText modifies a single word cleanly', () => {
  const [line] = parseLyricsToLines('Ciao mondo bello', 10);
  const targetId = line.words[1].id;
  const updated = updateWordText(line, targetId, 'sole');
  assert.equal(updated.words.map((w) => w.text).join(' '), 'Ciao sole bello');
  assert.equal(updated.words[1].startTime, line.words[1].startTime);
});

test('nudgeLineTiming and shiftAllLyrics clamp safely inside song bounds', () => {
  const lines = parseLyricsToLines('Uno due\nTre quattro', 15);
  const nudgedBack = nudgeLineTiming(lines[0], -10, 15);
  assert.equal(nudgedBack.startTime, 0);
  assert.ok(nudgedBack.endTime > nudgedBack.startTime);

  const shifted = shiftAllLyrics(lines, 0.5, 15);
  assert.equal(shifted[0].startTime, Number((lines[0].startTime + 0.5).toFixed(2)));
});

test('adjustLineBoundary clamps start before end and rebalances words', () => {
  const [line] = parseLyricsToLines('Canta con me', 15);
  const extended = adjustLineBoundary(line, 'end', line.endTime + 1.5, 25);
  assert.equal(extended.endTime, Number((line.endTime + 1.5).toFixed(2)));
  assert.equal(extended.words[extended.words.length - 1].endTime, extended.endTime);
});

test('nudgeWordTiming shifts individual word and updates line bounds if needed', () => {
  const [line] = parseLyricsToLines('Stella cadente', 15);
  const firstWord = line.words[0];
  const updated = nudgeWordTiming(line, firstWord.id, -0.5, 15);
  assert.ok(updated.words[0].startTime <= firstWord.startTime);
  assert.equal(updated.startTime, updated.words[0].startTime);
});

test('getWordSweepProgress computes 0..1 progressive coloring ratio', () => {
  const word = { id: 'w1', text: 'Sole', startTime: 4.0, endTime: 6.0 };
  assert.equal(getWordSweepProgress(word, 3.5), 0);
  assert.equal(getWordSweepProgress(word, 5.0), 0.5);
  assert.equal(getWordSweepProgress(word, 6.5), 1);
});

test('getActiveLyricState returns active line, next line, and pre-verse countdown', () => {
  const lines = [
    {
      id: 'l1',
      startTime: 5,
      endTime: 8,
      words: [{ id: 'w1', text: 'Primo', startTime: 5, endTime: 8 }],
    },
    {
      id: 'l2',
      startTime: 10,
      endTime: 13,
      words: [{ id: 'w2', text: 'Secondo', startTime: 10, endTime: 13 }],
    },
  ];

  const pre = getActiveLyricState(lines, 3.5);
  assert.equal(pre.currentLineIndex, -1);
  assert.equal(pre.currentLine?.id, 'l1');
  assert.equal(pre.countdownBeforeLine, 1.5);

  const during = getActiveLyricState(lines, 6.2);
  assert.equal(during.currentLineIndex, 0);
  assert.equal(during.currentLine?.id, 'l1');
  assert.equal(during.nextLine?.id, 'l2');
  assert.equal(during.countdownBeforeLine, null);
});

test('buildLrcContent and sanitizeExportFilename generate clean outputs', () => {
  const [line] = parseLyricsToLines('Musica e parole', 10);
  const lrc = buildLrcContent([line], 'Notte Magica', 'Studio');
  assert.ok(lrc.includes('[ti:Notte Magica]'));
  assert.ok(lrc.includes('Musica e parole'));
  assert.equal(sanitizeExportFilename('Città d\'Oro!'), 'citta-d-oro-karaoke.webm');
});

test('analyzeStereoProfile distinguishes dual-mono tracks from wide stereo mixes', async () => {
  const { analyzeStereoProfile } = await import('./audioEngine');
  const len = 1000;
  const left = new Float32Array(len);
  const identicalRight = new Float32Array(len);
  const stereoRight = new Float32Array(len);

  for (let i = 0; i < len; i += 1) {
    left[i] = Math.sin(i * 0.1);
    identicalRight[i] = left[i];
    stereoRight[i] = Math.cos(i * 0.1) * 0.6;
  }

  const dualMono = analyzeStereoProfile(left, identicalRight);
  assert.equal(dualMono.isEffectiveStereo, false);

  const trueStereo = analyzeStereoProfile(left, stereoRight);
  assert.equal(trueStereo.isEffectiveStereo, true);
  assert.ok(trueStereo.makeupGain >= 1.0);
});
