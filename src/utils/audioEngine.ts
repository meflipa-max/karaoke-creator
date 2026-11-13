import { LyricLine, VocalRemovalConfig } from '../types/karaoke';

export interface StereoProfile {
  isEffectiveStereo: boolean;
  sideToMidRatio: number;
  makeupGain: number;
}

/**
 * Pure stereo-width analyzer for AudioBuffer channel arrays.
 * Detects dual-mono files (where L and R are identical or nearly identical)
 * so vocal removal switches to EQ attenuation instead of cancelling the whole song to silence.
 */
export function analyzeStereoProfile(
  left: Float32Array,
  right?: Float32Array
): StereoProfile {
  if (!right || left.length === 0 || right.length === 0) {
    return { isEffectiveStereo: false, sideToMidRatio: 0, makeupGain: 1.25 };
  }

  const len = Math.min(left.length, right.length);
  const step = Math.max(1, Math.floor(len / 20000));
  let midEnergy = 0;
  let sideEnergy = 0;

  for (let i = 0; i < len; i += step) {
    const l = left[i];
    const r = right[i];
    const mid = 0.5 * (l + r);
    const side = 0.5 * (l - r);
    midEnergy += mid * mid;
    sideEnergy += side * side;
  }

  const midRms = Math.sqrt(midEnergy);
  const sideRms = Math.sqrt(sideEnergy);

  if (midRms < 1e-6) {
    return { isEffectiveStereo: false, sideToMidRatio: 0, makeupGain: 1.2 };
  }

  const ratio = sideRms / midRms;
  // Below 0.08, L - R is virtually silent (dual-mono or extremely narrow mono-ish mix)
  const isEffectiveStereo = ratio >= 0.08;
  // Compensate loudness loss when L - R is quieter than L + R
  const makeupGain = isEffectiveStereo
    ? Math.max(1.0, Math.min(2.4, 0.72 / Math.max(0.22, ratio)))
    : 1.25;

  return {
    isEffectiveStereo,
    sideToMidRatio: Number(ratio.toFixed(3)),
    makeupGain: Number(makeupGain.toFixed(2)),
  };
}

export function analyzeAudioBufferStereo(buffer: AudioBuffer): StereoProfile {
  if (buffer.numberOfChannels < 2) {
    return analyzeStereoProfile(buffer.getChannelData(0));
  }
  return analyzeStereoProfile(buffer.getChannelData(0), buffer.getChannelData(1));
}

/**
 * Encodes an AudioBuffer into a 16-bit PCM WAV ArrayBuffer.
 */
export function encodeAudioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c += 1) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return wavBuffer;
}

/**
 * Downsamples an AudioBuffer to a compact 12kHz mono WAV base64 string
 * so any uploaded song transmits rapidly to /api/lyrics/analyze.
 */
export async function renderCompactAnalysisWavBase64(sourceBuffer: AudioBuffer): Promise<string> {
  const targetSampleRate = 12000;
  const maxDuration = Math.min(sourceBuffer.duration, 360);
  const frameCount = Math.max(1, Math.floor(maxDuration * targetSampleRate));

  const offline = new OfflineAudioContext(1, frameCount, targetSampleRate);
  const source = offline.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(offline.destination);
  source.start(0, 0, maxDuration);

  const rendered = await offline.startRendering();
  const wavBytes = new Uint8Array(encodeAudioBufferToWav(rendered));

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < wavBytes.length; i += chunkSize) {
    const slice = wavBytes.subarray(i, Math.min(i + chunkSize, wavBytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Builds the Web Audio vocal-removal processing graph on any BaseAudioContext.
 * - Automatically detects dual-mono vs true stereo mixes so music never drops to silence.
 * - Keeps L and R phase-coherent (positive gain on both sides) so laptop/phone speakers never cancel out.
 * - Preserves bass/kick (< 220 Hz) and applies makeup gain + safety limiter.
 */
export function connectVocalRemovalGraph(
  ctx: BaseAudioContext,
  sourceNode: AudioBufferSourceNode,
  destinationNode: AudioNode,
  isStereoHint: boolean,
  config: VocalRemovalConfig
) {
  const profile = sourceNode.buffer
    ? analyzeAudioBufferStereo(sourceNode.buffer)
    : { isEffectiveStereo: isStereoHint, sideToMidRatio: 0.35, makeupGain: 1.4 };

  const useStereoMidSide = isStereoHint && profile.isEffectiveStereo;

  // Safety limiter to prevent clipping after makeup gain
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  limiter.connect(destinationNode);

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();

  const suppression = Math.max(0, Math.min(1, config.suppression));
  dryGain.gain.value = 1 - suppression;
  wetGain.gain.value = suppression;

  // Dry original path
  sourceNode.connect(dryGain);
  dryGain.connect(limiter);

  const vocalNotch = ctx.createBiquadFilter();
  vocalNotch.type = 'peaking';
  vocalNotch.frequency.value = 1500;
  vocalNotch.Q.value = 0.7;
  vocalNotch.gain.value = !useStereoMidSide ? -12 : config.extraVocalCut ? -8 : 0;

  if (!useStereoMidSide) {
    // Mono or dual-mono track: attenuate main vocal formant bands while keeping bass & highs loud
    const monoNotchLow = ctx.createBiquadFilter();
    monoNotchLow.type = 'peaking';
    monoNotchLow.frequency.value = 700;
    monoNotchLow.Q.value = 0.75;
    monoNotchLow.gain.value = -9;

    const monoNotchHigh = ctx.createBiquadFilter();
    monoNotchHigh.type = 'peaking';
    monoNotchHigh.frequency.value = 2700;
    monoNotchHigh.Q.value = 0.85;
    monoNotchHigh.gain.value = config.extraVocalCut ? -11 : -7;

    const monoMakeup = ctx.createGain();
    monoMakeup.gain.value = profile.makeupGain;

    sourceNode.connect(monoNotchLow);
    monoNotchLow.connect(vocalNotch);
    vocalNotch.connect(monoNotchHigh);
    monoNotchHigh.connect(monoMakeup);
    monoMakeup.connect(wetGain);
    wetGain.connect(limiter);

    return {
      updateConfig(next: VocalRemovalConfig) {
        const s = Math.max(0, Math.min(1, next.suppression));
        dryGain.gain.setTargetAtTime(1 - s, ctx.currentTime, 0.02);
        wetGain.gain.setTargetAtTime(s, ctx.currentTime, 0.02);
        vocalNotch.gain.setTargetAtTime(next.extraVocalCut ? -16 : -12, ctx.currentTime, 0.02);
        monoNotchHigh.gain.setTargetAtTime(next.extraVocalCut ? -12 : -7, ctx.currentTime, 0.02);
      },
      disconnect() {
        dryGain.disconnect();
        wetGain.disconnect();
        vocalNotch.disconnect();
        monoNotchLow.disconnect();
        monoNotchHigh.disconnect();
        monoMakeup.disconnect();
        limiter.disconnect();
      },
    };
  }

  // Stereo Mid-Side cancellation path
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);

  sourceNode.connect(splitter);

  // 1) Side cancellation: (L - R) with automatic makeup gain -> high-passed at 210 Hz
  const invertR = ctx.createGain();
  invertR.gain.value = -1;

  const sideSum = ctx.createGain();
  sideSum.gain.value = profile.makeupGain;

  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = config.bassPreserve ? 210 : 25;
  highPass.Q.value = 0.707;

  splitter.connect(sideSum, 0);
  splitter.connect(invertR, 1);
  invertR.connect(sideSum);
  sideSum.connect(highPass);
  highPass.connect(vocalNotch);

  // Phase-coherent routing to both L and R (positive polarity prevents speaker/mono self-cancellation!)
  const sideToL = ctx.createGain();
  const sideToR = ctx.createGain();
  sideToL.gain.value = 0.95;
  sideToR.gain.value = 0.95;
  vocalNotch.connect(sideToL);
  vocalNotch.connect(sideToR);
  sideToL.connect(merger, 0, 0);
  sideToR.connect(merger, 0, 1);

  // 2) Bass & warmth preservation path: (L + R) * 0.6 -> low-passed at 210 Hz
  const bassSum = ctx.createGain();
  bassSum.gain.value = config.bassPreserve ? 0.62 : 0;

  const lowPass = ctx.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.value = 210;
  lowPass.Q.value = 0.707;

  splitter.connect(bassSum, 0);
  splitter.connect(bassSum, 1);
  bassSum.connect(lowPass);
  lowPass.connect(merger, 0, 0);
  lowPass.connect(merger, 0, 1);

  merger.connect(wetGain);
  wetGain.connect(limiter);

  return {
    updateConfig(next: VocalRemovalConfig) {
      const s = Math.max(0, Math.min(1, next.suppression));
      dryGain.gain.setTargetAtTime(1 - s, ctx.currentTime, 0.02);
      wetGain.gain.setTargetAtTime(s, ctx.currentTime, 0.02);
      bassSum.gain.setTargetAtTime(next.bassPreserve ? 0.62 : 0, ctx.currentTime, 0.03);
      highPass.frequency.setTargetAtTime(next.bassPreserve ? 210 : 25, ctx.currentTime, 0.03);
      vocalNotch.gain.setTargetAtTime(next.extraVocalCut ? -8 : 0, ctx.currentTime, 0.03);
    },
    disconnect() {
      splitter.disconnect();
      merger.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      invertR.disconnect();
      sideSum.disconnect();
      highPass.disconnect();
      vocalNotch.disconnect();
      sideToL.disconnect();
      sideToR.disconnect();
      bassSum.disconnect();
      lowPass.disconnect();
      limiter.disconnect();
    },
  };
}

/**
 * Generates a realistic 24-second stereo demo track with:
 * - Wide stereo electric-piano chords + centered bassline (remains rich & loud when vocal removal is on)
 * - Dead-center melodic lead vocal synth (gets cancelled when vocal removal is on!)
 * - Perfectly synced Italian karaoke lines & word-level timestamps.
 */
export async function createDemoKaraokeTrack(): Promise<{
  audioBuffer: AudioBuffer;
  title: string;
  artist: string;
  lines: LyricLine[];
}> {
  const sampleRate = 44100;
  const duration = 24;
  const totalSamples = sampleRate * duration;
  const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  const chordRoots = [
    [220, 261.63, 329.63, 392], // Am7
    [174.61, 220, 261.63, 329.63], // Fmaj7
    [261.63, 329.63, 392, 493.88], // Cmaj7
    [196, 246.94, 293.66, 329.63], // G6
  ];

  for (let bar = 0; bar < 12; bar += 1) {
    const start = bar * 2;
    const chord = chordRoots[bar % chordRoots.length];

    // Warm bassline (centered, < 150 Hz so bass-preserve retains it cleanly)
    const bassOsc = offline.createOscillator();
    const bassGain = offline.createGain();
    bassOsc.type = 'triangle';
    bassOsc.frequency.value = chord[0] / 2;
    bassGain.gain.setValueAtTime(0.001, start);
    bassGain.gain.exponentialRampToValueAtTime(0.36, start + 0.04);
    bassGain.gain.exponentialRampToValueAtTime(0.001, start + 1.9);
    bassOsc.connect(bassGain);
    bassGain.connect(master);
    bassOsc.start(start);
    bassOsc.stop(start + 1.95);

    // Wide stereo electric-piano chords (panned L and R so Mid-Side subtraction preserves them cleanly)
    chord.forEach((freq, idx) => {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      const panner = offline.createStereoPanner();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      panner.pan.value = idx % 2 === 0 ? -0.78 : 0.78;

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.95);

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(master);
      osc.start(start);
      osc.stop(start + 1.98);
    });
  }

  // Lead vocal melody notes (strictly dead-center so Mid-Side vocal removal removes them)
  const demoLyricSpec: Array<{
    words: Array<{ text: string; start: number; end: number; freq: number }>;
  }> = [
    {
      words: [
        { text: 'Sotto', start: 2.0, end: 2.8, freq: 440 },
        { text: 'le', start: 2.8, end: 3.3, freq: 493.88 },
        { text: 'luci', start: 3.3, end: 4.2, freq: 523.25 },
        { text: 'della', start: 4.2, end: 4.9, freq: 493.88 },
        { text: 'città', start: 4.9, end: 6.0, freq: 440 },
      ],
    },
    {
      words: [
        { text: 'vola', start: 7.0, end: 7.9, freq: 523.25 },
        { text: 'la', start: 7.9, end: 8.4, freq: 587.33 },
        { text: 'voce', start: 8.4, end: 9.4, freq: 659.25 },
        { text: 'nella', start: 9.4, end: 10.2, freq: 587.33 },
        { text: 'notte', start: 10.2, end: 11.4, freq: 523.25 },
      ],
    },
    {
      words: [
        { text: 'ogni', start: 12.5, end: 13.3, freq: 392.0 },
        { text: 'parola', start: 13.3, end: 14.5, freq: 440.0 },
        { text: 'prende', start: 14.5, end: 15.5, freq: 523.25 },
        { text: 'vita', start: 15.5, end: 16.4, freq: 493.88 },
        { text: 'qui', start: 16.4, end: 17.4, freq: 440.0 },
      ],
    },
    {
      words: [
        { text: 'canta', start: 18.2, end: 19.2, freq: 523.25 },
        { text: 'con', start: 19.2, end: 19.9, freq: 587.33 },
        { text: 'noi', start: 19.9, end: 20.8, freq: 659.25 },
        { text: 'fino', start: 20.8, end: 21.7, freq: 587.33 },
        { text: 'al', start: 21.7, end: 22.2, freq: 523.25 },
        { text: 'mattino', start: 22.2, end: 23.4, freq: 440.0 },
      ],
    },
  ];

  const vocalFilter = offline.createBiquadFilter();
  vocalFilter.type = 'bandpass';
  vocalFilter.frequency.value = 1100;
  vocalFilter.Q.value = 0.8;
  vocalFilter.connect(master);

  demoLyricSpec.forEach((lineSpec) => {
    lineSpec.words.forEach((w) => {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(w.freq, w.start);

      gain.gain.setValueAtTime(0.001, w.start);
      gain.gain.linearRampToValueAtTime(0.22, w.start + 0.04);
      gain.gain.setValueAtTime(0.2, Math.max(w.start + 0.05, w.end - 0.06));
      gain.gain.exponentialRampToValueAtTime(0.001, w.end);

      osc.connect(gain);
      gain.connect(vocalFilter);
      osc.start(w.start);
      osc.stop(w.end + 0.02);
    });
  });

  const audioBuffer = await offline.startRendering();

  const lines: LyricLine[] = demoLyricSpec.map((lineSpec, lineIdx) => {
    const startTime = lineSpec.words[0].start;
    const endTime = lineSpec.words[lineSpec.words.length - 1].end;
    return {
      id: `demo-line-${lineIdx}`,
      startTime,
      endTime,
      words: lineSpec.words.map((w, wIdx) => ({
        id: `demo-w-${lineIdx}-${wIdx}`,
        text: w.text,
        startTime: w.start,
        endTime: w.end,
      })),
    };
  });

  return {
    audioBuffer,
    title: 'Luci nella Notte',
    artist: 'Palco Demo Ensemble',
    lines,
  };
}
