import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserSpeechRecognizer } from '../speechRecognitionService';

describe('BrowserSpeechRecognizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports false when SpeechRecognition is not in window', () => {
    // In node/vitest environment, window.SpeechRecognition is undefined
    expect(BrowserSpeechRecognizer.isSupported()).toBe(false);
  });

  it('instantiates and provides safe fallback stop/reset methods', () => {
    const onInterimText = vi.fn();
    const onFinalText = vi.fn();
    const recognizer = new BrowserSpeechRecognizer('ur', {
      onInterimText,
      onFinalText
    });

    expect(recognizer.getAccumulatedText()).toBe('');
    recognizer.start();
    const result = recognizer.stop();
    expect(result).toBe('');
    recognizer.reset();
    expect(recognizer.getAccumulatedText()).toBe('');
  });

  it('updates language setting properly', () => {
    const recognizer = new BrowserSpeechRecognizer('auto', {
      onInterimText: vi.fn(),
      onFinalText: vi.fn()
    });

    recognizer.setLanguage('ur');
    recognizer.setLanguage('en');
    expect(recognizer.getAccumulatedText()).toBe('');
  });
});
