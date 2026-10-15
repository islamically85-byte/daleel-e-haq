/**
 * Procedural Web Audio Sound Effects for Daleel-e-Haq
 * Synthesizes soft, elegant, non-intrusive tactile audio feedback
 * entirely in-browser using Web Audio API (zero external assets/network requests).
 */

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private thinkingTimer: number | null = null;
  private isThinkingMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Soft, organic "tick" sound synthesized with filtered noise and a gentle resonant sine.
   * Reminiscent of a subtle luxury watch or gentle clock tick.
   */
  public playTick(pitch: number = 800, volume: number = 0.04): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Soft oscillator for tactile body
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(pitch, now);
      filter.Q.setValueAtTime(3, now);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, now + 0.04);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Audio context policy safe
    }
  }

  /**
   * Starts a rhythmic, soft procedural "tick-tick-tick" while AI is thinking.
   * Plays at a soothing tempo (~360ms interval).
   */
  public startThinkingTick(): void {
    this.stopThinkingTick();
    if (this.isThinkingMuted) return;

    let step = 0;
    this.thinkingTimer = window.setInterval(() => {
      // Alternate pitch slightly between ticks (820Hz and 740Hz) for natural rhythmic pulse
      const pitch = step % 2 === 0 ? 820 : 740;
      this.playTick(pitch, 0.035);
      step++;
    }, 360);
  }

  /**
   * Stops the thinking tick loop immediately.
   */
  public stopThinkingTick(): void {
    if (this.thinkingTimer !== null) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  }

  /**
   * Gentle, soothing chime when connection establishes.
   */
  public playConnectChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 major triad
      notes.forEach((freq, idx) => {
        const now = ctx.currentTime + idx * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.035, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
      });
    } catch {}
  }

  /**
   * Soft click on button actions (Mute, interrupt, etc.).
   */
  public playSoftClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.035);
    } catch {}
  }
}

export const soundEffects = new SoundEffectsManager();
