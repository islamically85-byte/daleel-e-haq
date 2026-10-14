import { downsampleAndConvertToPCM16 } from '../services/audioUtils';
import { PlaybackQueue, decodePcm16Base64, type PlaybackContextLike } from './playbackQueue';
import { SessionResources } from './sessionResources';
import { SpeechEndpointer, extractFrameFeatures, type EndpointerConfig } from './speechEndpointer';
import {
  initialVoiceState,
  isMicOpen,
  reduceVoice,
  reopenedAfterReply,
  type VoiceEvent,
  type VoiceState
} from './voiceStateMachine';

export type DebatePhase = 'idle' | 'connecting' | 'user_turn' | 'thinking' | 'assistant_speaking';

export type VoiceErrorCode =
  | 'mic_denied'
  | 'mic_unavailable'
  | 'mic_lost'
  | 'connection_failed'
  | 'connection_lost'
  | 'handshake_timeout'
  | 'timeout'
  | 'server';

export interface VoiceSnapshot {
  phase: DebatePhase;
  isMuted: boolean;
  isUserSpeaking: boolean;
  isAISpeaking: boolean;
  /** True only while microphone frames are actually being analysed. */
  micOpen: boolean;
  userVolume: number;
  /** A valid utterance is buffered, so "Respond now" is meaningful. */
  canRespondNow: boolean;
  generation: number;
}

export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

export interface AudioHandle {
  playbackCtx: PlaybackContextLike;
  destination: unknown;
  onDeviceLost: (() => void) | null;
  setMicEnabled(enabled: boolean): void;
  getAiLevel(): number;
  stop(): void;
}

export interface VoiceEnv {
  openSocket(url: string): SocketLike;
  openAudio(onFrame: (samples: Float32Array, sampleRate: number) => void): Promise<AudioHandle>;
  now(): number;
}

export interface VoiceCallbacks {
  onState(snapshot: VoiceSnapshot): void;
  /** Caption / evidence messages that survived the generation filter. */
  onServerMessage(data: Record<string, unknown>): void;
  onError(code: VoiceErrorCode, message: string, fatal: boolean): void;
}

export interface VoiceSessionOptions {
  url: string;
  env: VoiceEnv;
  callbacks: VoiceCallbacks;
  endpointer?: Partial<EndpointerConfig>;
}

const WS_OPEN = 1;
const PRE_ROLL_FRAMES = 8;
/** Ignore the mic briefly after a reply ends so speaker/room tail is not mistaken for the user. */
export const REOPEN_HOLDOFF_MS = 400;
export const RESPONSE_WATCHDOG_MS = 45000;
export const HANDSHAKE_TIMEOUT_MS = 10000;

/**
 * One live voice session. Every handler is bound to this instance and checks `res.isDisposed`,
 * so events from a previous (ended / reconnected) session can never touch a newer one.
 */
export class VoiceSession {
  private readonly res = new SessionResources();
  private readonly endpointer: SpeechEndpointer;
  private state: VoiceState = initialVoiceState;
  private audio: AudioHandle | null = null;
  private playback: PlaybackQueue | null = null;
  private ws: SocketLike | null = null;
  private preRoll: ArrayBuffer[] = [];
  private holdoffUntil = 0;
  private userSpeaking = false;
  private userVolume = 0;
  private lastVolumeAt = 0;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private lastSnapshot: VoiceSnapshot | null = null;
  private readonly opts: VoiceSessionOptions;

  constructor(opts: VoiceSessionOptions) {
    this.opts = opts;
    this.endpointer = new SpeechEndpointer(opts.endpointer);
  }

  get isDisposed(): boolean {
    return this.res.isDisposed;
  }

  get phaseState(): VoiceState {
    return this.state;
  }

  getAiLevel(): number {
    return this.audio ? this.audio.getAiLevel() : 0;
  }

  getSnapshot(): VoiceSnapshot {
    const s = this.state;
    return {
      phase:
        s.phase === 'listening'
          ? 'user_turn'
          : s.phase === 'processing'
            ? 'thinking'
            : s.phase === 'speaking'
              ? 'assistant_speaking'
              : s.phase,
      isMuted: s.muted,
      isUserSpeaking: this.userSpeaking,
      isAISpeaking: s.phase === 'speaking',
      micOpen: isMicOpen(s) && this.opts.env.now() >= this.holdoffUntil,
      userVolume: this.userVolume,
      canRespondNow: s.phase === 'listening' && this.endpointer.hasValidUtterance,
      generation: s.generation
    };
  }

  // ---------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    this.dispatch({ type: 'session_start' });
    let audio: AudioHandle;
    try {
      audio = await this.opts.env.openAudio((samples, rate) => this.handleFrame(samples, rate));
    } catch (err) {
      if (this.res.isDisposed) return;
      const name = (err as { name?: string } | null)?.name;
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
      this.fail(
        denied ? 'mic_denied' : 'mic_unavailable',
        denied
          ? 'Microphone permission denied. Please allow microphone access to join the live debate.'
          : 'Unable to access the microphone. Please check that one is connected.'
      );
      return;
    }
    if (this.res.isDisposed) {
      audio.stop(); // session ended while the permission prompt was open
      return;
    }
    this.audio = audio;
    this.res.add(() => audio.stop());
    audio.onDeviceLost = () => {
      if (this.res.isDisposed) return;
      this.fail('mic_lost', 'The microphone was disconnected.');
    };
    const playback = new PlaybackQueue(audio.playbackCtx, audio.destination, {
      onDrained: () => {
        if (!this.res.isDisposed) this.dispatch({ type: 'playback_drained' });
      }
    });
    this.playback = playback;
    this.res.add(() => playback.clear());
    this.dispatch({ type: 'mic_ready' });

    const ws = this.opts.env.openSocket(this.opts.url);
    this.ws = ws;
    this.res.add(() => {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    });
    ws.onmessage = (e) => this.handleMessage(e.data);
    ws.onerror = () => {
      if (!this.res.isDisposed) this.fail('connection_failed', 'Failed to connect to the live debate server.');
    };
    ws.onclose = () => {
      if (!this.res.isDisposed) this.fail('connection_lost', 'The connection to the live debate server was lost.');
    };
    this.res.setTimeout(() => {
      if (this.state.phase === 'connecting') {
        this.fail('handshake_timeout', 'The live debate server did not respond. Please try again.');
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }

  /** User-initiated or fatal end. Idempotent; releases mic, audio, socket and timers. */
  end(): void {
    if (this.res.isDisposed) return;
    this.sendJson({ type: 'end' });
    this.dispatch({ type: 'session_end' });
    this.userSpeaking = false;
    this.userVolume = 0;
    this.emit();
    this.res.dispose();
  }

  private fail(code: VoiceErrorCode, message: string): void {
    if (this.res.isDisposed) return;
    this.opts.callbacks.onError(code, message, true);
    this.end();
  }

  // ---------------------------------------------------------------- user actions

  toggleMute(): void {
    if (this.res.isDisposed || this.state.phase === 'idle') return;
    const muted = !this.state.muted;
    this.dispatch({ type: 'mute_set', muted });
    this.audio?.setMicEnabled(!muted);
    this.sendJson({ type: 'mute_state', is_muted: muted });
    if (muted) {
      // A fully captured utterance is kept and answered; a partial / noise fragment is dropped.
      if (this.state.phase === 'listening' && this.endpointer.hasValidUtterance) {
        this.submitTurn(this.endpointer.utteranceVoicedMs);
      } else if (this.endpointer.inSpeech) {
        this.sendJson({ type: 'discard_turn' });
      }
      this.resetCapture();
    } else {
      this.resetCapture();
      this.holdoffUntil = this.opts.env.now() + 200;
    }
    this.userVolume = 0;
    this.emit();
  }

  /** "Respond now": only valid when a real utterance has been captured. */
  respondNow(): void {
    if (this.state.phase !== 'listening' || !this.endpointer.hasValidUtterance) return;
    this.submitTurn(this.endpointer.utteranceVoicedMs);
  }

  sendText(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || this.state.phase !== 'listening') return false;
    this.resetCapture();
    this.sendJson({ type: 'text_turn', text: trimmed });
    this.dispatch({ type: 'utterance_submitted' });
    return true;
  }

  /**
   * Explicit Stop. Order matters: cancel server output, clear every queued / stale client audio
   * (invalidating its callbacks), and only then hand the microphone to the user.
   */
  interrupt(): void {
    if (this.res.isDisposed) return;
    if (this.state.phase !== 'processing' && this.state.phase !== 'speaking') return;
    this.sendJson({ type: 'interrupt', generation_id: this.state.generation + 1 });
    this.playback?.clear();
    this.dispatch({ type: 'user_interrupt' });
  }

  // ---------------------------------------------------------------- microphone path

  handleFrame(samples: Float32Array, sampleRate: number): void {
    if (this.res.isDisposed) return;
    const now = this.opts.env.now();
    if (!isMicOpen(this.state) || now < this.holdoffUntil) {
      // Mic is paused (muted, processing, replying, or just reopened): analyse nothing.
      this.preRoll.length = 0;
      if (this.userSpeaking || this.userVolume !== 0) {
        this.userSpeaking = false;
        this.userVolume = 0;
        this.emit();
      }
      return;
    }

    const features = extractFrameFeatures(samples, sampleRate);
    const pcm = downsampleAndConvertToPCM16(samples, sampleRate, 16000);
    this.preRoll.push(pcm);
    if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();

    const wasInSpeech = this.endpointer.inSpeech;
    const r = this.endpointer.process(features);

    switch (r.event) {
      case 'speech_start':
        for (const chunk of this.preRoll) this.sendBinary(chunk);
        this.preRoll = [];
        this.userSpeaking = true;
        break;
      case 'utterance_end':
        this.submitTurn(r.voicedMs);
        break;
      case 'discarded':
        this.sendJson({ type: 'discard_turn' });
        this.resetCapture();
        break;
      default:
        if (r.inSpeech && wasInSpeech) this.sendBinary(pcm);
    }

    const vol = Math.min(1, features.rms * 5);
    if (now - this.lastVolumeAt >= 80 || Math.abs(vol - this.userVolume) > 0.05) {
      this.lastVolumeAt = now;
      this.userVolume = vol;
    }
    this.emit();
  }

  private submitTurn(voicedMs: number): void {
    if (this.state.phase !== 'listening') return;
    this.sendJson({ type: 'turn_complete', voiced_ms: Math.round(voicedMs) });
    this.resetCapture();
    this.dispatch({ type: 'utterance_submitted' });
  }

  private resetCapture(): void {
    this.endpointer.reset();
    this.preRoll = [];
    this.userSpeaking = false;
  }

  // ---------------------------------------------------------------- server path

  private handleMessage(raw: string): void {
    if (this.res.isDisposed) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const gen = typeof data.generation_id === 'number' ? data.generation_id : undefined;
    const stale = gen !== undefined && gen < this.state.generation;
    const waiting = this.state.phase === 'processing' || this.state.phase === 'speaking';
    if (waiting && !stale) this.armWatchdog();

    switch (data.type) {
      case 'ready':
        this.dispatch({ type: 'handshake_ok' });
        break;
      case 'state_change':
        // Only a rejected / timed-out turn may reopen the mic from the server side;
        // reopening after speech is driven by turn_complete + drained playback.
        if (data.state === 'user_turn' && !stale && this.state.phase === 'processing') {
          this.dispatch({ type: 'turn_rejected' });
        }
        break;
      case 'audio': {
        if (stale || typeof data.data !== 'string' || !waiting) return;
        const rate = typeof data.sample_rate === 'number' ? data.sample_rate : 24000;
        const samples = decodePcm16Base64(data.data);
        this.dispatch({ type: 'provider_audio', generation: gen ?? this.state.generation });
        this.dispatch({ type: 'audio_queued' });
        this.playback?.enqueue(samples, rate);
        break;
      }
      case 'turn_complete':
        if (!stale) this.dispatch({ type: 'provider_turn_complete', generation: gen ?? this.state.generation });
        break;
      case 'interrupted':
        if (gen !== undefined) this.dispatch({ type: 'server_generation', generation: gen });
        break;
      case 'output_caption':
        if (!stale) this.opts.callbacks.onServerMessage(data);
        break;
      case 'input_caption':
      case 'evidence_retrieved':
        this.opts.callbacks.onServerMessage(data);
        break;
      case 'error': {
        const message = typeof data.message === 'string' ? data.message : 'Live debate server error.';
        if (data.recoverable === true) {
          this.opts.callbacks.onError('server', message, false);
        } else {
          this.fail('server', message);
        }
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- plumbing

  private dispatch(event: VoiceEvent): void {
    const prev = this.state;
    this.state = reduceVoice(prev, event);
    if (this.state === prev) return;
    if (reopenedAfterReply(prev, this.state)) {
      this.holdoffUntil = this.opts.env.now() + REOPEN_HOLDOFF_MS;
      this.resetCapture();
      this.sendJson({ type: 'listening_resume' });
    }
    if (this.state.phase === 'processing' || this.state.phase === 'speaking') {
      if (prev.phase !== this.state.phase) this.armWatchdog();
    } else {
      this.clearWatchdog();
    }
    this.emit();
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdog = this.res.setTimeout(() => {
      this.watchdog = null;
      if (this.state.phase === 'processing' || this.state.phase === 'speaking') {
        this.opts.callbacks.onError('timeout', 'No response was received. Please speak again.', false);
        this.interrupt();
      }
    }, RESPONSE_WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    this.res.clearTimer(this.watchdog);
    this.watchdog = null;
  }

  private emit(): void {
    const next = this.getSnapshot();
    const prev = this.lastSnapshot;
    if (
      prev &&
      prev.phase === next.phase &&
      prev.isMuted === next.isMuted &&
      prev.isUserSpeaking === next.isUserSpeaking &&
      prev.micOpen === next.micOpen &&
      prev.canRespondNow === next.canRespondNow &&
      prev.generation === next.generation &&
      Math.abs(prev.userVolume - next.userVolume) < 0.02
    ) {
      return;
    }
    this.lastSnapshot = next;
    this.opts.callbacks.onState(next);
  }

  private sendJson(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WS_OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch {
        /* socket closing */
      }
    }
  }

  private sendBinary(buf: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WS_OPEN) {
      try {
        this.ws.send(buf);
      } catch {
        /* socket closing */
      }
    }
  }
}
