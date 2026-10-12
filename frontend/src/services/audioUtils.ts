/**
 * Downsamples Float32 audio samples to 16kHz and converts to 16-bit linear PCM little-endian.
 */
export function downsampleAndConvertToPCM16(
  inputBuffer: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): ArrayBuffer {
  if (inputSampleRate === targetSampleRate) {
    const pcm = new Int16Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      const s = Math.max(-1, Math.min(1, inputBuffer[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm.buffer;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(inputBuffer.length / ratio);
  const result = new Int16Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputBuffer.length; i++) {
      accum += inputBuffer[i];
      count++;
    }
    const sample = count > 0 ? accum / count : inputBuffer[offsetBuffer] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result.buffer;
}

/**
 * Calculates Root Mean Square (RMS) volume from a Float32Array buffer.
 * Returns a normalized value between 0.0 and 1.0.
 */
export function calculateRMSVolume(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sum / buffer.length);
  // Normalize and scale for pleasant visualizer response
  return Math.min(1, Math.max(0, rms * 5));
}

/**
 * Calculates the Zero-Crossing Rate (ZCR) of a Float32Array buffer.
 * Characteristic range for human voiced vowels: ~0.02 - 0.22.
 * High-frequency transients (clicks, keyboard taps, glass taps, paper rustle): > 0.32.
 */
export function calculateZCR(buffer: Float32Array): number {
  if (buffer.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (buffer.length - 1);
}

