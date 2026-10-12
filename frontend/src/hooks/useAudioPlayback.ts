import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { voicePreferences } from '../services/voicePreferences';

export function useAudioPlayback() {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [intensity, setIntensity] = useState(0); // 0.0 to 1.0 real audio amplitude
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioUrlCacheRef = useRef<Map<string, string>>(new Map());
  const requestIdRef = useRef<number>(0);

  // Clean up cached blob URLs on unmount
  useEffect(() => {
    return () => {
      audioUrlCacheRef.current.forEach((url) => {
        if (url && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch {}
        }
      });
      audioUrlCacheRef.current.clear();
    };
  }, []);

  // Setup Web Audio Analyser for actual real audio intensity analysis
  const setupAudioAnalyser = useCallback((audioEl: HTMLAudioElement) => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (!sourceNodeRef.current) {
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 64;
        analyserRef.current.smoothingTimeConstant = 0.8;

        sourceNodeRef.current = ctx.createMediaElementSource(audioEl);
        sourceNodeRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      }
    } catch (e) {
      // Audio element might already be connected to source node
    }
  }, []);

  // Real-time animation frame loop to measure actual playback energy
  const startIntensityLoop = useCallback(() => {
    const dataArray = new Uint8Array(32);

    const update = () => {
      if (analyserRef.current && isPlaying && !isPaused) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setIntensity(Math.min(1, Math.max(0, avg / 128)));
      } else {
        setIntensity(0);
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(update);
  }, [isPlaying, isPaused]);

  useEffect(() => {
    if (isPlaying && !isPaused) {
      startIntensityLoop();
    } else {
      setIntensity(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isPaused, startIntensityLoop]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setIsLoading(false);
    setActiveMessageId(null);
    setCurrentTime(0);
    setIntensity(0);
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && isPaused) {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      audioRef.current.play().then(() => {
        setIsPaused(false);
      }).catch((e) => {
        setError(`Failed to resume playback: ${e.message}`);
      });
    }
  }, [isPaused]);

  const play = useCallback(
    async (messageId: string, text: string, voice?: string, language?: string) => {
      setError(null);

      // If already playing this message and paused, resume
      if (activeMessageId === messageId && isPaused && audioRef.current) {
        resume();
        return;
      }

      // If already playing this message, stop
      if (activeMessageId === messageId && isPlaying) {
        stop();
        return;
      }

      // Stop previous playback
      stop();

      const currentReqId = ++requestIdRef.current;
      setActiveMessageId(messageId);
      setIsLoading(true);

      const prefs = voicePreferences.get();
      const selectedVoice = voice || prefs.voice;
      const selectedLang = language || prefs.language;

      try {
        const cacheKey = `${messageId}_${selectedVoice}_${selectedLang}`;
        let audioUrl = audioUrlCacheRef.current.get(cacheKey);

        if (!audioUrl) {
          audioUrl = await api.generateSpeech({
            text,
            voice: selectedVoice,
            language: selectedLang
          });

          // Check if request was superseded while waiting for speech generation
          if (currentReqId !== requestIdRef.current) {
            if (audioUrl && audioUrl.startsWith('blob:')) {
              try { URL.revokeObjectURL(audioUrl); } catch {}
            }
            return;
          }

          // Bound cache to 20 items (QA-19)
          if (audioUrlCacheRef.current.size >= 20) {
            const firstKey = audioUrlCacheRef.current.keys().next().value;
            if (firstKey) {
              const oldUrl = audioUrlCacheRef.current.get(firstKey);
              if (oldUrl && oldUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(oldUrl); } catch {}
              }
              audioUrlCacheRef.current.delete(firstKey);
            }
          }
          audioUrlCacheRef.current.set(cacheKey, audioUrl);
        }

        if (currentReqId !== requestIdRef.current) return;

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        audio.src = audioUrl;

        audio.onloadedmetadata = () => {
          setDuration(audio.duration || 0);
          setIsLoading(false);
        };

        audio.ontimeupdate = () => {
          setCurrentTime(audio.currentTime || 0);
        };

        audio.onended = () => {
          setIsPlaying(false);
          setIsPaused(false);
          setActiveMessageId(null);
          setCurrentTime(0);
          setIntensity(0);
        };

        audio.onerror = () => {
          setError('Failed to play generated audio.');
          stop();
        };

        setupAudioAnalyser(audio);

        await audio.play();
        setIsPlaying(true);
        setIsPaused(false);
        setIsLoading(false);
      } catch (err: any) {
        setError(err.message || 'Error generating spoken audio.');
        stop();
      }
    },
    [activeMessageId, isPaused, isPlaying, resume, stop, setupAudioAnalyser]
  );

  return {
    activeMessageId,
    isPlaying,
    isPaused,
    isLoading,
    currentTime,
    duration,
    intensity,
    error,
    play,
    pause,
    resume,
    stop,
    clearError: () => setError(null)
  };
}
