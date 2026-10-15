/**
 * Browser Speech-to-Text (STT) service using the native Web Speech API
 * (Google Speech Recognition engine on Chromium/Android, Siri engine on Apple Safari/iOS).
 * Provides 0ms local latency, live interim transcripts, and instant silence detection.
 */

export interface SpeechRecognitionCallbacks {
  onInterimText: (text: string) => void;
  onFinalText: (text: string) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: (accumulatedText: string) => void;
  onError?: (err: string) => void;
}

export class BrowserSpeechRecognizer {
  private recognition: any = null;
  private isListening = false;
  private shouldBeListening = false;
  private language: string;
  private callbacks: SpeechRecognitionCallbacks;
  private accumulatedFinalText = '';
  private currentInterimText = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimeoutMs = 1200; // 1.2s silence triggers auto-complete

  constructor(language: string, callbacks: SpeechRecognitionCallbacks) {
    this.language = language;
    this.callbacks = callbacks;
    this.initRecognition();
  }

  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      // Set recognition language
      if (this.language === 'ur') {
        rec.lang = 'ur-PK';
      } else if (this.language === 'en') {
        rec.lang = 'en-US';
      } else {
        // Auto: detect based on browser language or default to ur-PK/en-US
        const navLang = navigator.language || 'en-US';
        rec.lang = navLang.startsWith('ur') ? 'ur-PK' : 'en-US';
      }

      rec.onstart = () => {
        this.isListening = true;
        this.callbacks.onSpeechStart?.();
      };

      rec.onresult = (event: any) => {
        let interim = '';
        let newFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            newFinal += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        if (newFinal) {
          this.accumulatedFinalText = (this.accumulatedFinalText + ' ' + newFinal).trim();
          this.callbacks.onFinalText(this.accumulatedFinalText);
        }

        this.currentInterimText = interim.trim();
        const fullLiveText = [this.accumulatedFinalText, this.currentInterimText].filter(Boolean).join(' ');
        this.callbacks.onInterimText(fullLiveText);

        // Reset silence timer on any speech result
        this.resetSilenceTimer();
      };

      rec.onerror = (event: any) => {
        // Ignore normal abort / no-speech events
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        this.callbacks.onError?.(event.error || 'Speech recognition error');
      };

      rec.onend = () => {
        this.isListening = false;
        // Auto-restart if we should still be listening (e.g. browser paused after silence)
        if (this.shouldBeListening) {
          try {
            rec.start();
          } catch {
            // will retry if needed
          }
        }
      };

      this.recognition = rec;
    } catch (e: any) {
      console.warn('SpeechRecognition initialization error:', e);
    }
  }

  public setLanguage(lang: string) {
    this.language = lang;
    if (this.recognition) {
      if (lang === 'ur') {
        this.recognition.lang = 'ur-PK';
      } else if (lang === 'en') {
        this.recognition.lang = 'en-US';
      } else {
        this.recognition.lang = navigator.language?.startsWith('ur') ? 'ur-PK' : 'en-US';
      }
    }
  }

  public start() {
    this.shouldBeListening = true;
    this.accumulatedFinalText = '';
    this.currentInterimText = '';
    this.clearSilenceTimer();

    if (!this.recognition) {
      this.initRecognition();
    }

    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch (e) {
        // Already started or active
      }
    }
  }

  public stop(): string {
    this.shouldBeListening = false;
    this.clearSilenceTimer();
    const result = [this.accumulatedFinalText, this.currentInterimText].filter(Boolean).join(' ').trim();

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    this.isListening = false;
    return result;
  }

  public reset() {
    this.accumulatedFinalText = '';
    this.currentInterimText = '';
    this.clearSilenceTimer();
  }

  public getAccumulatedText(): string {
    return [this.accumulatedFinalText, this.currentInterimText].filter(Boolean).join(' ').trim();
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer();
    const currentText = this.getAccumulatedText();
    if (!currentText) return;

    this.silenceTimer = setTimeout(() => {
      if (this.shouldBeListening && this.getAccumulatedText()) {
        const textToSubmit = this.getAccumulatedText();
        this.callbacks.onSpeechEnd?.(textToSubmit);
      }
    }, this.silenceTimeoutMs);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
