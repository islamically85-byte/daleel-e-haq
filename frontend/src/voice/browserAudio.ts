import type { AudioHandle } from './voiceSession';
import type { PlaybackContextLike } from './playbackQueue';

/**
 * Real browser audio engine: microphone capture (with browser echo-cancellation / noise
 * suppression where supported), a band-pass front end, and a playback chain with a level meter.
 *
 * Everything acquired here is released by stop(); device loss is surfaced via onDeviceLost.
 */
export async function openBrowserAudio(
  onFrame: (samples: Float32Array, sampleRate: number) => void
): Promise<AudioHandle> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const err = new Error('Microphone capture is not supported in this browser.');
    err.name = 'NotSupportedError';
    throw err;
  }

  // Request processing as `ideal`, so unsupported browsers still give us a usable microphone.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true }
    }
  });

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }

  const handle: AudioHandle = {
    playbackCtx: ctx as unknown as PlaybackContextLike,
    destination: null,
    onDeviceLost: null,
    setMicEnabled: () => {},
    getAiLevel: () => 0,
    stop: () => {}
  };

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.8;
  analyser.connect(ctx.destination);
  handle.destination = analyser;
  const levelBuf = new Uint8Array(analyser.frequencyBinCount);
  handle.getAiLevel = () => {
    analyser.getByteFrequencyData(levelBuf);
    let sum = 0;
    for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i];
    return Math.min(1, Math.max(0, sum / levelBuf.length / 128));
  };

  const source = ctx.createMediaStreamSource(stream);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 85;
  highpass.Q.value = 0.7;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 7500;
  lowpass.Q.value = 0.7;
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(processor);
  processor.connect(ctx.destination); // required for the node to run; output is silence
  processor.onaudioprocess = (e) => {
    // Copy: the underlying buffer is reused by the browser.
    onFrame(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
  };

  const tracks = stream.getAudioTracks();
  const lost = () => handle.onDeviceLost?.();
  tracks.forEach((t) => t.addEventListener('ended', lost));

  handle.setMicEnabled = (enabled) => tracks.forEach((t) => (t.enabled = enabled));
  handle.stop = () => {
    tracks.forEach((t) => t.removeEventListener('ended', lost));
    processor.onaudioprocess = null;
    try {
      processor.disconnect();
      lowpass.disconnect();
      highpass.disconnect();
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    stream.getTracks().forEach((t) => {
      t.enabled = false;
      t.stop();
    });
    if (ctx.state !== 'closed') ctx.close().catch(() => {});
  };

  return handle;
}
