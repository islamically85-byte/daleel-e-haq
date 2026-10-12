export interface VoicePreferences {
  voice: 'Kore' | 'Puck' | 'Aoede' | 'Charon';
  language: 'en' | 'ur';
  onboardingCompleted: boolean;
}

const STORAGE_KEY = 'daleel_voice_preferences';

const DEFAULT_PREFERENCES: VoicePreferences = {
  voice: 'Kore',
  language: 'en',
  onboardingCompleted: false
};

export const voicePreferences = {
  get(): VoicePreferences {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_PREFERENCES,
          ...parsed
        };
      }
    } catch (e) {
      console.warn('Failed to parse voice preferences from localStorage:', e);
    }
    return DEFAULT_PREFERENCES;
  },

  set(prefs: Partial<VoicePreferences>): VoicePreferences {
    const current = this.get();
    const updated: VoicePreferences = {
      ...current,
      ...prefs
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save voice preferences to localStorage:', e);
    }
    return updated;
  },

  setOnboardingCompleted(completed = true): void {
    this.set({ onboardingCompleted: completed });
  },

  getSelectedVoice(): 'Kore' | 'Puck' | 'Aoede' | 'Charon' {
    return this.get().voice;
  }
};
