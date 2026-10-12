import { useState, useRef, useCallback, useEffect } from 'react';
import { downsampleAndConvertToPCM16, calculateRMSVolume } from '../services/audioUtils';

interface UseDictationOptions {
  language: 'en' | 'ur';
  onTranscriptUpdate: (fullText: string) => void;
  initialText?: string;
}

export function useDictation({ onTranscriptUpdate, initialText = '' }: UseDictationOptions) {
  const [isDictating, setIsDictating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const baseTextRef = useRef<string>(initialText);
  const finalizedSegmentsRef = useRef<string[]>([]);
  const currentInterimRef = useRef<string>('');
  const finishResolverRef = useRef<((value: string) => void) | null>(null);

  // Keep baseTextRef up to date when not dictating
  useEffect(() => {
    if (!isDictating && !isProcessing) {
      baseTextRef.current = initialText;
    }
  }, [initialText, isDictating, isProcessing]);

  const cleanupAudio = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
          wsRef.current.close();
        } catch {}
      }
      wsRef.current = null;
    }
    setVolume(0);
    setIsDictating(false);
    setIsConnecting(false);
  }, []);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const assembleText = (segments: string[], interim: string) => {
    const committedPart = segments.filter(Boolean).join(' ').trim();
    const interimPart = interim.trim();
    const combined = [committedPart, interimPart].filter(Boolean).join(' ').trim();
    if (baseTextRef.current.trim()) {
      return combined ? `${baseTextRef.current.trim()} ${combined}` : baseTextRef.current.trim();
    }
    return combined;
  };

  const startDictation = useCallback(async () => {
    setError(null);
    setIsConnecting(true);
    finalizedSegmentsRef.current = [];
    currentInterimRef.current = '';
    setInterimText('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone capture is not supported in this browser.');
      setIsConnecting(false);
      return;
    }

    try {
      // 1. Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // 2. Open WebSocket with automatic language detection (language=auto)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws/dictate?language=auto`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsDictating(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'interim') {
            const rawInterim = (data.text || '').trim();
            currentInterimRef.current = rawInterim;
            setInterimText(rawInterim);
            onTranscriptUpdate(assembleText(finalizedSegmentsRef.current, rawInterim));
          } else if (data.type === 'final' || data.type === 'transcript') {
            const newText = (data.text || '').trim();
            if (newText) {
              const segs = finalizedSegmentsRef.current;
              const lastSeg = segs[segs.length - 1];

              if (!lastSeg) {
                segs.push(newText);
              } else if (lastSeg === newText) {
                // Exact duplicate: do not duplicate
              } else if (newText.toLowerCase().startsWith(lastSeg.toLowerCase())) {
                // New segment subsumes previous segment: update in place
                segs[segs.length - 1] = newText;
              } else if (lastSeg.toLowerCase().startsWith(newText.toLowerCase())) {
                // Previous segment already has more detail: ignore shorter repeat
              } else {
                segs.push(newText);
              }

              currentInterimRef.current = '';
              setInterimText('');
              onTranscriptUpdate(assembleText(segs, ''));
            }
          } else if (data.type === 'finished') {
            // Signal from server that pending transcript stream is complete
            if (finishResolverRef.current) {
              const resolver = finishResolverRef.current;
              finishResolverRef.current = null;
              if (currentInterimRef.current.trim()) {
                finalizedSegmentsRef.current.push(currentInterimRef.current.trim());
                currentInterimRef.current = '';
              }
              const finalTranscript = finalizedSegmentsRef.current.join(' ').trim();
              resolver(finalTranscript);
            }
          } else if (data.type === 'error') {
            setError(data.message || 'Dictation server error occurred.');
            cleanupAudio();
          }
        } catch {
          // ignore non-json
        }
      };

      ws.onerror = () => {
        setError('Failed to establish connection to speech recognition server.');
        cleanupAudio();
      };

      ws.onclose = () => {
        setIsDictating(false);
        setIsConnecting(false);
        if (finishResolverRef.current) {
          const resolver = finishResolverRef.current;
          finishResolverRef.current = null;
          if (currentInterimRef.current.trim()) {
            finalizedSegmentsRef.current.push(currentInterimRef.current.trim());
            currentInterimRef.current = '';
          }
          resolver(finalizedSegmentsRef.current.join(' ').trim());
        }
      };

      // 3. Setup Web Audio pipeline
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const rms = calculateRMSVolume(inputData);
        setVolume(rms);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const pcmBuffer = downsampleAndConvertToPCM16(inputData, audioContext.sampleRate, 16000);
          wsRef.current.send(pcmBuffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission was denied. Please allow microphone access to use dictation.');
      } else {
        setError(`Microphone error: ${err.message || 'Unable to access microphone'}`);
      }
      cleanupAudio();
    }
  }, [onTranscriptUpdate, cleanupAudio]);

  /**
   * Completes audio stream, signals completion to backend, waits for pending
   * final transcription segments to flush, and returns the complete transcript.
   */
  const finishDictation = useCallback(async (): Promise<string> => {
    setIsProcessing(true);

    // 1. Instantly stop microphone recording
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setVolume(0);

    // 2. Signal finish to WebSocket and await completion
    const completePromise = new Promise<string>((resolve) => {
      finishResolverRef.current = resolve;

      setTimeout(() => {
        if (finishResolverRef.current) {
          const res = finishResolverRef.current;
          finishResolverRef.current = null;
          if (currentInterimRef.current.trim()) {
            finalizedSegmentsRef.current.push(currentInterimRef.current.trim());
            currentInterimRef.current = '';
          }
          res(finalizedSegmentsRef.current.join(' ').trim());
        }
      }, 1500);
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'finish' }));
      } catch {}
    } else {
      if (finishResolverRef.current) {
        const res = finishResolverRef.current;
        finishResolverRef.current = null;
        res(finalizedSegmentsRef.current.join(' ').trim());
      }
    }

    const transcript = await completePromise;

    // 3. Clean up remaining audio resources
    cleanupAudio();
    setIsProcessing(false);
    setIsDictating(false);
    return transcript;
  }, [cleanupAudio]);

  const stopDictation = useCallback(() => {
    if (currentInterimRef.current.trim()) {
      finalizedSegmentsRef.current.push(currentInterimRef.current.trim());
      currentInterimRef.current = '';
    }
    const full = finalizedSegmentsRef.current.join(' ').trim();
    onTranscriptUpdate(assembleText(finalizedSegmentsRef.current, ''));
    cleanupAudio();
    return full;
  }, [cleanupAudio, onTranscriptUpdate]);

  const cancelDictation = useCallback(() => {
    setInterimText('');
    currentInterimRef.current = '';
    finalizedSegmentsRef.current = [];
    if (finishResolverRef.current) {
      finishResolverRef.current = null;
    }
    onTranscriptUpdate(baseTextRef.current);
    cleanupAudio();
    setIsProcessing(false);
  }, [cleanupAudio, onTranscriptUpdate]);

  return {
    isDictating,
    isConnecting,
    isProcessing,
    interimText,
    volume,
    error,
    startDictation,
    stopDictation,
    finishDictation,
    cancelDictation,
    clearError: () => setError(null)
  };
}
