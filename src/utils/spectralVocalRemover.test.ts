import test from 'node:test';
import assert from 'node:assert/strict';
import { fftRadix2, processVocalRemovalChannels } from './spectralVocalRemover';

function computeRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / Math.max(1, buf.length));
}

test('fftRadix2 inverse reconstructs original signal accurately', () => {
  const n = 512;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const orig = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const val = 0.6 * Math.sin((2 * Math.PI * 5 * i) / n) + 0.25 * Math.cos((2 * Math.PI * 19 * i) / n);
    re[i] = val;
    orig[i] = val;
  }

  fftRadix2(re, im, false);
  fftRadix2(re, im, true);

  let maxErr = 0;
  for (let i = 0; i < n; i += 1) {
    maxErr = Math.max(maxErr, Math.abs(re[i] - orig[i]));
  }
  assert.ok(maxErr < 1e-5, `Expected tiny FFT error, got ${maxErr}`);
});

test('STFT COLA reconstruction is transparent when suppression is 0', () => {
  const sr = 44100;
  const len = 16384;
  const left = new Float32Array(len);
  const right = new Float32Array(len);

  for (let i = 0; i < len; i += 1) {
    left[i] = 0.45 * Math.sin((2 * Math.PI * 330 * i) / sr);
    right[i] = 0.45 * Math.cos((2 * Math.PI * 440 * i) / sr);
  }

  const out = processVocalRemovalChannels(left, right, {
    sampleRate: sr,
    config: { suppression: 0, bassPreserve: true, extraVocalCut: false },
  });

  // Check interior away from exact sample 0 boundary
  let errSq = 0;
  const start = 1024;
  const end = len - 1024;
  for (let i = start; i < end; i += 1) {
    const dl = out.left[i] - left[i];
    const dr = out.right[i] - right[i];
    errSq += dl * dl + dr * dr;
  }
  const errRms = Math.sqrt(errSq / ((end - start) * 2));
  assert.ok(errRms < 1e-4, `Expected near-zero COLA error, got ${errRms}`);
});

test('STFT vocal remover suppresses center vocals while keeping stereo instruments and bass clean', () => {
  const sr = 44100;
  const len = sr * 1; // 1 second
  const vocalOnlyL = new Float32Array(len);
  const backingL = new Float32Array(len);
  const backingR = new Float32Array(len);

  for (let i = 0; i < len; i += 1) {
    const t = i / sr;
    // Dead-center vocal at 600 Hz
    const vocal = 0.35 * Math.sin(2 * Math.PI * 600 * t);
    vocalOnlyL[i] = vocal;

    // Centered bass at 85 Hz + wide stereo chords (left 330 Hz, right 520 Hz)
    const bass = 0.3 * Math.sin(2 * Math.PI * 85 * t);
    const leftChord = 0.25 * Math.sin(2 * Math.PI * 330 * t);
    const rightChord = 0.25 * Math.sin(2 * Math.PI * 520 * t);

    backingL[i] = bass + leftChord;
    backingR[i] = bass + rightChord;
  }

  // Test vocal-only cancellation
  const vocalRemoved = processVocalRemovalChannels(vocalOnlyL, vocalOnlyL, {
    sampleRate: sr,
    config: { suppression: 1, bassPreserve: true, extraVocalCut: false },
  });
  // Note: vocalOnlyL alone is dual-mono; mix with stereo backing to test real stereo mix
  const mixedL = new Float32Array(len);
  const mixedR = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    mixedL[i] = backingL[i] + vocalOnlyL[i];
    mixedR[i] = backingR[i] + vocalOnlyL[i];
  }

  const outMix = processVocalRemovalChannels(mixedL, mixedR, {
    sampleRate: sr,
    config: { suppression: 1, bassPreserve: true, extraVocalCut: false },
  });

  // Measure correlation / error vs pure backing track
  const backingOnlyRms = computeRms(backingL.subarray(4096, len - 4096));
  const outputRms = computeRms(outMix.left.subarray(4096, len - 4096));

  // Measure remaining 600Hz vocal component via DFT correlation
  let vocalRe = 0;
  let vocalIm = 0;
  for (let i = 4096; i < len - 4096; i += 1) {
    const phase = (2 * Math.PI * 600 * i) / sr;
    vocalRe += outMix.left[i] * Math.cos(phase);
    vocalIm += outMix.left[i] * Math.sin(phase);
  }
  const nSamples = len - 8192;
  const remainingVocalAmp = (2 * Math.hypot(vocalRe, vocalIm)) / nSamples;

  assert.equal(outMix.isEffectiveStereo, true);
  assert.ok(remainingVocalAmp < 0.05, `Expected center 600Hz vocal heavily attenuated, got amp=${remainingVocalAmp}`);
  assert.ok(outputRms > backingOnlyRms * 0.75, `Expected backing RMS preserved, got ${outputRms} vs ${backingOnlyRms}`);
  assert.ok(vocalRemoved.left.every((v) => Math.abs(v) <= 0.95));
});
