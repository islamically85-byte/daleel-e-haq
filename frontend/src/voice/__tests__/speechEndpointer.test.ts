import { describe, it, expect } from 'vitest';
import { SpeechEndpointer } from '../speechEndpointer';

describe('SpeechEndpointer', () => {
  it('rejects digital silence and ambient noise below SNR threshold', () => {
    const endpointer = new SpeechEndpointer();
    // Warm up calibration with ambient noise (RMS ~ 0.005)
    for (let i = 0; i < 15; i++) {
      const res = endpointer.process({
        rms: 0.005,
        periodicity: 0.1,
        zcr: 0.05,
        diffRatio: 0.1,
        crest: 1.5,
        durationMs: 32
      });
      expect(res.inSpeech).toBe(false);
      expect(res.event).toBe('none');
    }

    // Steady fan noise / hum (unvoiced, periodicity < 0.3)
    const res = endpointer.process({
      rms: 0.015,
      periodicity: 0.15,
      zcr: 0.08,
      diffRatio: 0.12,
      crest: 1.8,
      durationMs: 32
    });
    expect(res.inSpeech).toBe(false);
    expect(res.event).toBe('none');
    expect(endpointer.inSpeech).toBe(false);
  });

  it('detects voiced human speech after minimum voiced duration and confirms utterance_end upon silence', () => {
    const endpointer = new SpeechEndpointer({
      minVoicedMs: 100,
      minUtteranceMs: 250,
      endSilenceMs: 300,
      calibrationMs: 100
    });

    // 4 quiet frames (128ms) to calibrate
    for (let i = 0; i < 4; i++) {
      endpointer.process({
        rms: 0.002,
        periodicity: 0.05,
        zcr: 0.05,
        diffRatio: 0.05,
        crest: 1.2,
        durationMs: 32
      });
    }

    // Human voiced speech: periodic (0.75), high SNR relative to 0.002
    let speechStarted = false;
    for (let i = 0; i < 10; i++) {
      // 320ms of continuous voiced speech
      const res = endpointer.process({
        rms: 0.05,
        periodicity: 0.75,
        zcr: 0.1,
        diffRatio: 0.3,
        crest: 3.5,
        durationMs: 32
      });
      if (res.event === 'speech_start') {
        speechStarted = true;
      }
    }

    expect(speechStarted).toBe(true);
    expect(endpointer.inSpeech).toBe(true);

    // Silence follows (300ms) to trigger utterance_end
    let finalEvent = 'none';
    for (let i = 0; i < 10; i++) {
      const res = endpointer.process({
        rms: 0.002,
        periodicity: 0.05,
        zcr: 0.05,
        diffRatio: 0.05,
        crest: 1.2,
        durationMs: 32
      });
      if (res.event !== 'none') {
        finalEvent = res.event;
        break;
      }
    }
    expect(finalEvent).toBe('utterance_end');
    expect(endpointer.inSpeech).toBe(false);
  });

  it('discards short noise burst / tap without emitting utterance_end', () => {
    const endpointer = new SpeechEndpointer({
      minVoicedMs: 160,
      minUtteranceMs: 300,
      calibrationMs: 100
    });

    // Calibrate
    for (let i = 0; i < 4; i++) {
      endpointer.process({
        rms: 0.002,
        periodicity: 0.05,
        zcr: 0.05,
        diffRatio: 0.05,
        crest: 1.2,
        durationMs: 32
      });
    }

    // Single 32ms loud tap (not periodic, impulsive crest)
    const res = endpointer.process({
      rms: 0.2,
      periodicity: 0.1,
      zcr: 0.3,
      diffRatio: 0.6,
      crest: 6.0,
      durationMs: 32
    });
    expect(res.inSpeech).toBe(false);
    expect(res.event).toBe('none');

    // Return to silence
    for (let i = 0; i < 5; i++) {
      const r = endpointer.process({
        rms: 0.002,
        periodicity: 0.05,
        zcr: 0.05,
        diffRatio: 0.05,
        crest: 1.2,
        durationMs: 32
      });
      expect(r.event).not.toBe('utterance_end');
    }
    expect(endpointer.inSpeech).toBe(false);
  });
});
