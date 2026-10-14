/**
 * Gapless PCM playback queue with generation-safe cancellation.
 *
 * Every scheduled source captures the queue "token" current at scheduling time. clear() bumps the
 * token, so `onended` callbacks of cancelled / stale sources become no-ops and can never report
 * "drained" for a newer reply.
 */
export interface PlaybackSourceLike {
  buffer: unknown;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number): void;
  stop(): void;
}

export interface PlaybackContextLike {
  readonly currentTime: number;
  createBuffer(channels: number, length: number, sampleRate: number): {
    readonly duration: number;
    copyToChannel(source: Float32Array, channel: number): void;
  };
  createBufferSource(): PlaybackSourceLike;
}

export interface PlaybackQueueHooks {
  /** Fires once every scheduled chunk of the CURRENT token has finished playing. */
  onDrained(): void;
}

const LEAD_IN_SECONDS = 0.05;

export class PlaybackQueue {
  private token = 0;
  private sources: PlaybackSourceLike[] = [];
  private nextStart = 0;
  private readonly ctx: PlaybackContextLike;
  private readonly destination: unknown;
  private readonly hooks: PlaybackQueueHooks;

  constructor(
    ctx: PlaybackContextLike,
    destination: unknown,
    hooks: PlaybackQueueHooks
  ) {
    this.ctx = ctx;
    this.destination = destination;
    this.hooks = hooks;
  }

  get pendingCount(): number {
    return this.sources.length;
  }

  enqueue(samples: Float32Array, sampleRate: number): void {
    if (samples.length === 0) return;
    const buffer = this.ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);

    const now = this.ctx.currentTime;
    // After an underrun (or at the start of a reply) leave a small cushion for jitter.
    const startAt = this.nextStart <= now + 0.005 ? now + LEAD_IN_SECONDS : this.nextStart;
    this.nextStart = startAt + buffer.duration;

    const token = this.token;
    source.onended = () => {
      if (token !== this.token) return; // cancelled / stale
      const idx = this.sources.indexOf(source);
      if (idx !== -1) this.sources.splice(idx, 1);
      if (this.sources.length === 0) {
        this.nextStart = 0;
        this.hooks.onDrained();
      }
    };
    this.sources.push(source);
    source.start(startAt);
  }

  /** Stop everything and invalidate every outstanding callback. Does NOT fire onDrained. */
  clear(): void {
    this.token++;
    const toStop = this.sources;
    this.sources = [];
    this.nextStart = 0;
    for (const src of toStop) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}

/** Decode base64 PCM16-LE into floats; tolerates odd byte counts and softens chunk edges. */
export function decodePcm16Base64(b64: string): Float32Array {
  const bin = atob(b64);
  const usable = bin.length - (bin.length % 2);
  const out = new Float32Array(usable / 2);
  for (let i = 0; i < out.length; i++) {
    const lo = bin.charCodeAt(i * 2);
    const hi = bin.charCodeAt(i * 2 + 1);
    let v = (hi << 8) | lo;
    if (v & 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  const ramp = Math.min(16, Math.floor(out.length / 4));
  for (let i = 0; i < ramp; i++) {
    const g = (i + 1) / ramp;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}
