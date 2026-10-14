import { describe, it, expect, vi } from 'vitest';
import { PlaybackQueue, type PlaybackContextLike, type PlaybackSourceLike } from '../playbackQueue';

class MockSource implements PlaybackSourceLike {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  stopped = false;
  disconnected = false;

  connect(_dest: unknown) {
    return _dest;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(_when?: number) {}
  stop() {
    this.stopped = true;
  }
}

class MockAudioContext implements PlaybackContextLike {
  currentTime = 0;
  sources: MockSource[] = [];

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return {
      duration: length / sampleRate,
      copyToChannel: (_src: Float32Array, _ch: number) => {}
    };
  }

  createBufferSource(): MockSource {
    const src = new MockSource();
    this.sources.push(src);
    return src;
  }
}

describe('PlaybackQueue', () => {
  it('enqueues audio buffer and fires onDrained when ended', () => {
    const ctx = new MockAudioContext();
    const onDrained = vi.fn();
    const queue = new PlaybackQueue(ctx, {}, { onDrained });

    const samples = new Float32Array(24000); // 1 second at 24kHz
    queue.enqueue(samples, 24000);

    expect(queue.pendingCount).toBe(1);
    expect(ctx.sources.length).toBe(1);

    const source = ctx.sources[0];
    source.onended?.();

    expect(queue.pendingCount).toBe(0);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('cancellation via clear() stops playing sources and invalidates onended callbacks', () => {
    const ctx = new MockAudioContext();
    const onDrained = vi.fn();
    const queue = new PlaybackQueue(ctx, {}, { onDrained });

    const samples = new Float32Array(24000);
    queue.enqueue(samples, 24000);
    queue.enqueue(samples, 24000);

    expect(queue.pendingCount).toBe(2);

    const source1 = ctx.sources[0];
    const source2 = ctx.sources[1];

    queue.clear();

    expect(queue.pendingCount).toBe(0);
    expect(source1.stopped).toBe(true);
    expect(source2.stopped).toBe(true);

    // Call stale onended
    source1.onended?.();
    source2.onended?.();

    // Must NOT fire onDrained for the invalidated generation token!
    expect(onDrained).not.toHaveBeenCalled();
  });
});
