import {
  calculateNormalizedAutocorrelation,
  calculateSpectralDifferenceRatio,
  calculateZCR
} from '../services/audioUtils';

/** Per-frame acoustic features (raw, un-scaled RMS in 0..1). */
export interface FrameFeatures {
  rms: number;
  periodicity: number;
  zcr: number;
  diffRatio: number;
  crest: number;
  durationMs: number;
}

export function extractFrameFeatures(samples: Float32Array, sampleRate: number): FrameFeatures {
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSq += s * s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, samples.length));
  return {
    rms,
    periodicity: calculateNormalizedAutocorrelation(samples, sampleRate),
    zcr: calculateZCR(samples),
    diffRatio: calculateSpectralDifferenceRatio(samples),
    crest: rms > 1e-6 ? peak / rms : 0,
    durationMs: (samples.length / sampleRate) * 1000
  };
}

export interface EndpointerConfig {
  /** Absolute RMS below which a frame can never start speech (digital-silence guard). */
  absMinRms: number;
  /** Speech must exceed the adaptive noise floor by this factor to START an utterance. */
  startSnr: number;
  /** Lower factor that may CONTINUE an utterance (hysteresis). */
  continueSnr: number;
  startPeriodicity: number;
  continuePeriodicity: number;
  /** Voiced audio required to confirm an utterance began. */
  minVoicedMs: number;
  /** Largest gap inside the confirmation window before candidate speech is thrown away. */
  maxGapMs: number;
  /** Total voiced audio required for an utterance to be submittable. */
  minUtteranceMs: number;
  /** Silence that ends an utterance. A natural pause shorter than this never submits. */
  endSilenceMs: number;
  /** Weak (unvoiced / breathy) frames only prolong speech this long after the last voiced frame. */
  weakTailMs: number;
  maxUtteranceMs: number;
  /** No speech can start while the floor is still being calibrated at session/mic (re)open. */
  calibrationMs: number;
  minFloor: number;
  maxFloor: number;
}

export const DEFAULT_ENDPOINTER_CONFIG: EndpointerConfig = {
  absMinRms: 0.004,
  startSnr: 3.0,
  continueSnr: 1.8,
  startPeriodicity: 0.4,
  continuePeriodicity: 0.15,
  minVoicedMs: 160,
  maxGapMs: 180,
  minUtteranceMs: 300,
  endSilenceMs: 1100,
  weakTailMs: 600,
  maxUtteranceMs: 45000,
  calibrationMs: 500,
  minFloor: 0.0015,
  maxFloor: 0.05
};

export type EndpointEvent = 'none' | 'speech_start' | 'utterance_end' | 'discarded';

export interface EndpointResult {
  event: EndpointEvent;
  inSpeech: boolean;
  /** Voiced milliseconds accumulated in the current utterance. */
  voicedMs: number;
  /** Utterance is long enough to be submitted. */
  valid: boolean;
  noiseFloor: number;
}

/**
 * Speech endpointer with adaptive noise floor, hysteresis, minimum voiced duration and
 * silence endpointing. Pure and deterministic: time only advances through frame durations.
 *
 * Steady fans / hum are absorbed into the noise floor (SNR ~ 1). Wind and broadband noise lack
 * pitch periodicity. Taps and clicks are too short and have impulsive crest / difference ratio.
 * Quiet speech is judged relative to the floor, not an absolute volume.
 */
export class SpeechEndpointer {
  private readonly cfg: EndpointerConfig;
  private floor: number;
  private calibratedMs = 0;
  private state: 'idle' | 'speech' = 'idle';
  private pendingVoicedMs = 0;
  private pendingGapMs = 0;
  private voicedMs = 0;
  private silenceMs = 0;
  private sinceStrongMs = 0;
  private elapsedMs = 0;

  constructor(cfg: Partial<EndpointerConfig> = {}, initialFloor = 0.008) {
    this.cfg = { ...DEFAULT_ENDPOINTER_CONFIG, ...cfg };
    this.floor = initialFloor;
  }

  get noiseFloor(): number {
    return this.floor;
  }

  get inSpeech(): boolean {
    return this.state === 'speech';
  }

  get utteranceVoicedMs(): number {
    return this.voicedMs;
  }

  get hasValidUtterance(): boolean {
    return this.state === 'speech' && this.voicedMs >= this.cfg.minUtteranceMs;
  }

  /** Forget the current utterance; keep the learned noise floor. */
  reset(recalibrate = false): void {
    this.state = 'idle';
    this.pendingVoicedMs = 0;
    this.pendingGapMs = 0;
    this.voicedMs = 0;
    this.silenceMs = 0;
    this.sinceStrongMs = 0;
    this.elapsedMs = 0;
    if (recalibrate) this.calibratedMs = 0;
  }

  private updateFloor(rms: number, durationMs: number): void {
    const calibrating = this.calibratedMs < this.cfg.calibrationMs;
    const scale = durationMs / 85;
    const down = calibrating ? 0.5 : Math.min(0.5, 0.2 * scale);
    const up = calibrating ? 0.5 : Math.min(0.3, 0.02 * scale);
    const rate = rms < this.floor ? down : up;
    this.floor = Math.min(this.cfg.maxFloor, Math.max(this.cfg.minFloor, this.floor + (rms - this.floor) * rate));
  }

  private result(event: EndpointEvent): EndpointResult {
    return {
      event,
      inSpeech: this.state === 'speech',
      voicedMs: this.voicedMs,
      valid: this.voicedMs >= this.cfg.minUtteranceMs,
      noiseFloor: this.floor
    };
  }

  process(f: FrameFeatures): EndpointResult {
    const c = this.cfg;
    const snr = f.rms / Math.max(this.floor, 1e-4);
    const envelopeOk = f.diffRatio < 0.78 && f.crest < 5.5 && f.zcr <= 0.5;
    const strong =
      f.rms >= c.absMinRms &&
      snr >= c.startSnr &&
      f.periodicity >= c.startPeriodicity &&
      envelopeOk;
    const weak =
      f.rms >= c.absMinRms * 0.5 &&
      snr >= c.continueSnr &&
      (f.periodicity >= c.continuePeriodicity || snr >= c.startSnr) &&
      f.diffRatio < 0.9;

    if (this.state === 'idle') {
      if (this.calibratedMs < c.calibrationMs) {
        this.calibratedMs += f.durationMs;
        this.updateFloor(f.rms, f.durationMs);
        return this.result('none');
      }
      if (strong) {
        this.pendingVoicedMs += f.durationMs;
        this.pendingGapMs = 0;
        if (this.pendingVoicedMs >= c.minVoicedMs) {
          this.state = 'speech';
          this.voicedMs = this.pendingVoicedMs;
          this.pendingVoicedMs = 0;
          this.silenceMs = 0;
          this.sinceStrongMs = 0;
          this.elapsedMs = this.voicedMs;
          return this.result('speech_start');
        }
        return this.result('none');
      }
      if (this.pendingVoicedMs > 0) {
        this.pendingGapMs += f.durationMs;
        if (this.pendingGapMs > c.maxGapMs) {
          this.pendingVoicedMs = 0;
          this.pendingGapMs = 0;
        }
        return this.result('none');
      }
      this.updateFloor(f.rms, f.durationMs);
      return this.result('none');
    }

    // state === 'speech'
    this.elapsedMs += f.durationMs;
    if (strong) {
      this.voicedMs += f.durationMs;
      this.silenceMs = 0;
      this.sinceStrongMs = 0;
    } else {
      this.sinceStrongMs += f.durationMs;
      if (weak && this.sinceStrongMs <= c.weakTailMs) {
        this.silenceMs = 0;
      } else {
        this.silenceMs += f.durationMs;
      }
    }

    const endedBySilence = this.silenceMs >= c.endSilenceMs;
    const endedByLength = this.elapsedMs >= c.maxUtteranceMs;
    if (endedBySilence || endedByLength) {
      const valid = this.voicedMs >= c.minUtteranceMs;
      const event: EndpointEvent = valid ? 'utterance_end' : 'discarded';
      const out = this.result(event);
      this.reset();
      return { ...out, inSpeech: false };
    }
    return this.result('none');
  }
}
