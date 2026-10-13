/**
 * Downsamples Float32 audio samples to 16kHz and converts to 16-bit linear PCM little-endian.
 */
export function downsampleAndConvertToPCM16(
  inputBuffer: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): ArrayBuffer {
  if (inputSampleRate === targetSampleRate) {
    const pcm = new Int16Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      const s = Math.max(-1, Math.min(1, inputBuffer[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm.buffer;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(inputBuffer.length / ratio);
  const result = new Int16Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputBuffer.length; i++) {
      accum += inputBuffer[i];
      count++;
    }
    const sample = count > 0 ? accum / count : inputBuffer[offsetBuffer] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result.buffer;
}

/**
 * Calculates Root Mean Square (RMS) volume from a Float32Array buffer.
 * Returns a normalized value between 0.0 and 1.0.
 */
export function calculateRMSVolume(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sum / buffer.length);
  // Normalize and scale for pleasant visualizer response
  return Math.min(1, Math.max(0, rms * 5));
}

/**
 * Calculates the Zero-Crossing Rate (ZCR) of a Float32Array buffer.
 * Characteristic range for human voiced vowels: ~0.02 - 0.22.
 * High-frequency transients (clicks, keyboard taps, glass taps, paper rustle): > 0.32.
 */
export function calculateZCR(buffer: Float32Array): number {
  if (buffer.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (buffer.length - 1);
}

/**
 * Calculates peak normalized autocorrelation in the human pitch frequency range (80Hz - 350Hz).
 * Voiced speech exhibits strong harmonic periodicity (periodicity >= 0.30, typically 0.45 - 0.85).
 * Non-speech noise (clicks, typing, glass impact, air hiss) has low periodicity (< 0.22).
 */
export function calculateNormalizedAutocorrelation(
  buffer: Float32Array,
  sampleRate: number,
  minPitchHz = 80,
  maxPitchHz = 350
): number {
  const len = buffer.length;
  if (len < 512) return 0;

  // Decimate by 2 for sub-millisecond real-time performance on audio thread
  const step = 2;
  const effSampleRate = sampleRate / step;
  const minLag = Math.max(1, Math.floor(effSampleRate / maxPitchHz));
  const maxLag = Math.min(Math.floor(len / (step * 2)), Math.ceil(effSampleRate / minPitchHz));
  if (minLag >= maxLag) return 0;

  const windowSize = Math.min(512, Math.floor(len / step) - maxLag);
  if (windowSize <= 0) return 0;

  // Energy of reference window
  let refEnergy = 0;
  for (let i = 0; i < windowSize; i++) {
    const s = buffer[i * step];
    refEnergy += s * s;
  }
  if (refEnergy < 1e-6) return 0;

  let maxCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let crossCorr = 0;
    let lagEnergy = 0;
    for (let i = 0; i < windowSize; i++) {
      const sRef = buffer[i * step];
      const sLag = buffer[(i + lag) * step];
      crossCorr += sRef * sLag;
      lagEnergy += sLag * sLag;
    }
    if (lagEnergy > 1e-6) {
      const normCorr = crossCorr / Math.sqrt(refEnergy * lagEnergy);
      if (normCorr > maxCorr) {
        maxCorr = normCorr;
      }
    }
  }

  return Math.max(0, Math.min(1, maxCorr));
}

/**
 * Computes high-pass difference energy ratio: sum((x[i] - x[i-1])^2) / sum(x[i]^2).
 * Transient clicks, glass impacts, and keyboard clatter are dominated by high-pass differences (> 0.80).
 * Human speech vowels are smooth with energy in low/mid formants (< 0.50).
 */
export function calculateSpectralDifferenceRatio(buffer: Float32Array): number {
  if (buffer.length < 2) return 0;
  let totalEnergy = 0;
  let diffEnergy = 0;
  for (let i = 1; i < buffer.length; i++) {
    const s = buffer[i];
    const prev = buffer[i - 1];
    totalEnergy += s * s;
    const diff = s - prev;
    diffEnergy += diff * diff;
  }
  if (totalEnergy < 1e-7) return 0;
  return diffEnergy / totalEnergy;
}

/**
 * Computes Crest Factor (Peak to RMS ratio).
 * Impulsive transients (clicks, clinks) have sharp crests (> 4.5).
 * Voiced speech has balanced peak-to-RMS ratios (1.8 - 3.8).
 */
export function calculateCrestFactor(buffer: Float32Array, rmsRaw: number): number {
  if (rmsRaw < 1e-6) return 0;
  let maxAbs = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  return maxAbs / rmsRaw;
}

export interface VoiceAnalysisResult {
  rms: number;
  rawRms: number;
  zcr: number;
  periodicity: number;
  diffRatio: number;
  crestFactor: number;
  isVoiceLike: boolean;
  isIntentionalBargeIn: boolean;
  bargeInThreshold: number;
  isEcho: boolean;
  echoCorrelation: number;
}

/**
 * Computes peak normalized cross-correlation between incoming microphone PCM buffer
 * and recently played AI reference PCM ring buffer across plausible acoustic delay lags (25ms - 350ms).
 * High correlation (>= 0.30) indicates physical speaker-to-mic acoustic bleed, NOT near-end user speech.
 */
export function calculateAcousticEchoCorrelation(
  micBuffer: Float32Array,
  refRingBuffer: Float32Array,
  refWriteIndex: number,
  sampleRate = 16000,
  minLagMs = 25,
  maxLagMs = 350
): number {
  const refLen = refRingBuffer.length;
  const micLen = micBuffer.length;
  if (refLen < 1024 || micLen < 256) return 0;

  // Analysis window: up to 1024 samples (~64ms at 16kHz)
  const windowLen = Math.min(1024, micLen);
  const step = 4; // Decimate by 4 -> effective 4kHz sampling rate for fast sub-millisecond calculation
  const effWindow = Math.floor(windowLen / step);

  const minLag = Math.max(1, Math.floor((minLagMs * sampleRate) / (1000 * step)));
  const maxLag = Math.min(
    Math.floor((refLen - windowLen) / step),
    Math.ceil((maxLagMs * sampleRate) / (1000 * step))
  );

  if (minLag >= maxLag) return 0;

  // Compute energy of mic window
  let micEnergy = 0;
  for (let i = 0; i < effWindow; i++) {
    const s = micBuffer[i * step];
    micEnergy += s * s;
  }
  if (micEnergy < 1e-5) return 0;

  let maxCorr = 0;

  // Search acoustic delays with step 2 (sub-millisecond resolution)
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let crossCorr = 0;
    let refEnergy = 0;

    for (let i = 0; i < effWindow; i++) {
      const sMic = micBuffer[i * step];
      // Lookup sample in circular ref buffer at current lag
      const refIdx = (refWriteIndex - ((lag + effWindow - 1 - i) * step) % refLen + refLen * 10) % refLen;
      const sRef = refRingBuffer[refIdx];
      crossCorr += sMic * sRef;
      refEnergy += sRef * sRef;
    }

    if (refEnergy > 1e-5) {
      const normCorr = crossCorr / Math.sqrt(micEnergy * refEnergy);
      if (normCorr > maxCorr) {
        maxCorr = normCorr;
      }
    }
  }

  return Math.max(0, Math.min(1, maxCorr));
}

/**
 * Evaluates comprehensive multi-feature voice metrics to distinguish deliberate human speech
 * from background noise, keyboard clicks, glass impacts, and laptop speaker echo bleed.
 */
export function analyzeAudioFrame(
  buffer: Float32Array,
  sampleRate: number,
  noiseFloor: number,
  aiPlaybackVolume: number,
  isAssistantSpeaking: boolean,
  echoCorrelation = 0
): VoiceAnalysisResult {
  const rms = calculateRMSVolume(buffer);
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
  const rawRms = Math.sqrt(sumSq / buffer.length);

  const zcr = calculateZCR(buffer);
  const diffRatio = calculateSpectralDifferenceRatio(buffer);
  const crestFactor = calculateCrestFactor(buffer, rawRms);
  const periodicity = calculateNormalizedAutocorrelation(buffer, sampleRate);

  // Human voice envelope:
  // 1. ZCR in natural speech range covering deep male vowels up to sibilants (0.002 to 0.48 at 48kHz)
  // 2. High-pass difference ratio bounded (< 0.78) to reject sharp glass/cutlery impacts
  // 3. Crest factor bounded (< 4.8) to reject isolated impulse clicks
  const isSpeechEnvelope =
    zcr >= 0.002 &&
    zcr <= 0.48 &&
    diffRatio < 0.78 &&
    crestFactor < 4.8;

  const isVoiced = periodicity >= 0.20;

  // Speaker acoustic echo detection:
  // If the incoming mic buffer correlates with recent AI playback audio (>= 0.30), it is echo.
  const isEcho = isAssistantSpeaking && echoCorrelation >= 0.30;

  // Speaker echo coupling compensation during AI speech:
  // On open laptop chassis, physical speaker bleed into mic scales with playback volume.
  const expectedSpeakerBleed = isAssistantSpeaking ? Math.min(0.20, aiPlaybackVolume * 0.35) : 0;
  const bargeInThreshold = Math.max(
    0.075,
    Math.min(0.25, noiseFloor * 2.5 + expectedSpeakerBleed + 0.02)
  );

  // Voice-like classification:
  // During AI speech, if echo is present, it is rejected to prevent self-interruption.
  const isVoiceLike = !isEcho && isSpeechEnvelope && (isVoiced || (rms > noiseFloor * 2.0 && zcr <= 0.38));

  // Intentional barge-in:
  // - Acoustic RMS energy exceeding the dynamic noise floor + physical speaker bleed
  // - Conforms to human speech acoustic envelope (not a transient click or glass impact)
  // - Either periodic vocal-fold harmonic vibration (vowels) OR clear speech energy (plosives/stops)
  // - Positively verified as NOT acoustic echo from the laptop speakers
  const isIntentionalBargeIn =
    !isEcho &&
    rms > bargeInThreshold &&
    isSpeechEnvelope &&
    (periodicity >= 0.22 || (rms > bargeInThreshold * 1.25 && zcr <= 0.38));

  return {
    rms,
    rawRms,
    zcr,
    periodicity,
    diffRatio,
    crestFactor,
    isVoiceLike,
    isIntentionalBargeIn,
    bargeInThreshold,
    isEcho,
    echoCorrelation
  };
}

