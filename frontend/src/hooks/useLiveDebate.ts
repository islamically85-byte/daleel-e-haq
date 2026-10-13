import { useState, useRef, useCallback, useEffect } from 'react';
import {
  downsampleAndConvertToPCM16,
  calculateRMSVolume,
  analyzeAudioFrame,
  calculateAcousticEchoCorrelation
} from '../services/audioUtils';
import { voicePreferences } from '../services/voicePreferences';
import { api } from '../services/api';

export interface DebateTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: string;
}

export type DebatePhase =
  | 'idle'
  | 'connecting'
  | 'user_turn'
  | 'thinking'
  | 'assistant_speaking';

export interface LiveEvidenceItem {
  source_id?: string;
  source_type?: 'quran' | 'hadith';
  surah_number?: number;
  ayah_number?: number;
  surah_name_en?: string;
  surah_name_ar?: string;
  text_ar?: string;
  translation_en?: string;
  translation_ur?: string;
  citation?: string;
  is_verified?: boolean;
  status?: string;
  message?: string;
  limitation_disclosure?: string;
  verses?: any[];
}

interface UseLiveDebateOptions {
  onSessionSaved?: (debateId: string) => void;
}

const STORAGE_TURNS_KEY = 'daleel_live_debate_turns';
const ROLLING_INTERRUPTION_BUFFER_MAX = 55; // ~4.7s circular PCM16 buffer (at ~85ms/frame)

export function useLiveDebate(options?: UseLiveDebateOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [phase, setPhase] = useState<DebatePhase>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [liveEvidence, setLiveEvidence] = useState<LiveEvidenceItem[]>([]);

  // Persistent turns across page refresh
  const [turns, setTurns] = useState<DebateTurn[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_TURNS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isMutedRef = useRef(false);
  const phaseRef = useRef<DebatePhase>('idle');
  const activeGenerationIdRef = useRef<number>(1);
  const isServerTurnCompleteRef = useRef<boolean>(true);
  const aiVolumeRef = useRef<number>(0);
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}`
  );

  const ambientNoiseFloorRef = useRef<number>(0.008);
  const preRollBufferRef = useRef<ArrayBuffer[]>([]);
  const rollingInterruptionBufferRef = useRef<ArrayBuffer[]>([]);
  const hasSpokenInTurnRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(0);
  const sustainedAiSpeechMsRef = useRef<number>(0);
  const interruptionSilenceMsRef = useRef<number>(0);
  const speechStreakRef = useRef<number>(0);
  const silenceStreakRef = useRef<number>(0);
  const lastSpeechStateRef = useRef<boolean>(false);
  const lastVolumeUpdateRef = useRef<number>(0);
  const lastReportedVolumeRef = useRef<number>(0);
  const thinkingWatchdogTimerRef = useRef<any>(null);

  const clearWatchdog = useCallback(() => {
    if (thinkingWatchdogTimerRef.current) {
      clearTimeout(thinkingWatchdogTimerRef.current);
      thinkingWatchdogTimerRef.current = null;
    }
  }, []);

  const setPhaseSafe = useCallback((p: DebatePhase) => {
    phaseRef.current = p;
    setPhase(p);
    if (p === 'thinking') {
      clearWatchdog();
      thinkingWatchdogTimerRef.current = setTimeout(() => {
        if (phaseRef.current === 'thinking') {
          console.warn('Thinking watchdog: 12s expired without response. Resetting to user_turn.');
          isServerTurnCompleteRef.current = true;
          phaseRef.current = 'user_turn';
          setPhase('user_turn');
        }
      }, 12000);
    } else {
      clearWatchdog();
    }
  }, [clearWatchdog]);

  // AI 24kHz PCM playback queue & AnalyserNode
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const turnsRef = useRef<DebateTurn[]>([]);

  // AI 16kHz PCM playback reference buffer for real-time acoustic echo correlation (3.0s = 48,000 samples)
  const AI_PLAYBACK_REF_SIZE = 48000;
  const aiPlaybackRefBuffer = useRef<Float32Array>(new Float32Array(AI_PLAYBACK_REF_SIZE));
  const aiPlaybackRefWriteIdx = useRef<number>(0);

  useEffect(() => {
    turnsRef.current = turns;
    try {
      if (turns.length > 0) {
        sessionStorage.setItem(STORAGE_TURNS_KEY, JSON.stringify(turns));
      } else {
        sessionStorage.removeItem(STORAGE_TURNS_KEY);
      }
    } catch {}
  }, [turns]);

  const isAiSpeakingRef = useRef(false);

  const setAiSpeakingState = useCallback((speaking: boolean) => {
    isAiSpeakingRef.current = speaking;
    setIsAISpeaking(speaking);
    if (speaking) {
      setPhaseSafe('assistant_speaking');
    }
  }, [setPhaseSafe]);

  const stopAiPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    aiVolumeRef.current = 0;
    aiPlaybackRefBuffer.current.fill(0);
    aiPlaybackRefWriteIdx.current = 0;
    setAiSpeakingState(false);
    setAiVolume(0);
  }, [setAiSpeakingState]);

  const playPcmChunk = useCallback((base64Data: string, sampleRate = 24000) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      // Guard against odd byte lengths causing Int16Array RangeError
      const validLen = len - (len % 2);
      if (validLen < 2) return;
      const bytes = new Uint8Array(validLen);
      for (let i = 0; i < validLen; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer, 0, validLen / 2);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Copy downsampled samples to circular reference buffer for acoustic echo cancellation
      const ratio = sampleRate / 16000;
      const targetLen = Math.floor(float32Array.length / ratio);
      const refBuf = aiPlaybackRefBuffer.current;
      let wIdx = aiPlaybackRefWriteIdx.current;
      for (let i = 0; i < targetLen; i++) {
        const srcIdx = Math.floor(i * ratio);
        refBuf[wIdx] = float32Array[srcIdx] || 0;
        wIdx = (wIdx + 1) % AI_PLAYBACK_REF_SIZE;
      }
      aiPlaybackRefWriteIdx.current = wIdx;

      // Micro-fade (0.5ms linear ramp on boundary samples) to eliminate high-frequency clicks
      const rampLen = Math.min(16, Math.floor(float32Array.length / 4));
      for (let i = 0; i < rampLen; i++) {
        const factor = (i + 1) / rampLen;
        float32Array[i] *= factor;
        float32Array[float32Array.length - 1 - i] *= factor;
      }

      const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.copyToChannel(float32Array, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      if (aiAnalyserRef.current) {
        source.connect(aiAnalyserRef.current);
      } else {
        source.connect(ctx.destination);
      }

      const currentTime = ctx.currentTime;
      // Jitter buffer: If queue is empty or has fallen behind (underrun), introduce 50ms initial jitter cushion
      let startTime: number;
      if (nextPlayTimeRef.current <= currentTime + 0.005) {
        startTime = currentTime + 0.050; // 50ms lead-in cushion
      } else {
        startTime = nextPlayTimeRef.current;
      }
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      activeSourcesRef.current.push(source);
      setAiSpeakingState(true);

      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source);
        if (idx !== -1) {
          activeSourcesRef.current.splice(idx, 1);
        }
        // When the final queued audio chunk finishes playing on the speakers:
        if (activeSourcesRef.current.length === 0) {
          nextPlayTimeRef.current = 0;
          aiVolumeRef.current = 0;
          setAiVolume(0);
          // Only return to user_turn if provider response has completed AND local audio queue has drained (P1 blocker 5)
          if (isServerTurnCompleteRef.current) {
            setAiSpeakingState(false);
            setPhaseSafe('user_turn');
          }
        }
      };
    } catch (e) {
      console.warn('Error playing PCM audio chunk:', e);
    }
  }, [setAiSpeakingState, setPhaseSafe]);

  const cleanupAudio = useCallback(() => {
    clearWatchdog();
    preRollBufferRef.current = [];
    rollingInterruptionBufferRef.current = [];
    hasSpokenInTurnRef.current = false;
    sustainedAiSpeechMsRef.current = 0;
    interruptionSilenceMsRef.current = 0;
    speechStreakRef.current = 0;
    silenceStreakRef.current = 0;
    lastSpeechStateRef.current = false;
    stopAiPlayback();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'end' }));
          wsRef.current.close();
        } catch {}
      }
      wsRef.current = null;
    }
    setUserVolume(0);
    setAiVolume(0);
    setIsUserSpeaking(false);
    setIsAISpeaking(false);
    setIsConnected(false);
    setIsConnecting(false);
    setPhaseSafe('idle');
  }, [stopAiPlayback, setPhaseSafe, clearWatchdog]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const finishTurnManual = useCallback(() => {
    if (phaseRef.current === 'user_turn') {
      // If user is muted and has not spoken anything in this turn, do not hang in thinking
      if (isMutedRef.current && !hasSpokenInTurnRef.current) {
        return;
      }
      hasSpokenInTurnRef.current = false;
      preRollBufferRef.current = [];
      sustainedAiSpeechMsRef.current = 0;
      interruptionSilenceMsRef.current = 0;
      setPhaseSafe('thinking');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'turn_complete' }));
      }
    }
  }, [setPhaseSafe]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);

    // 1. Hardware track gating: Mute audio input at the media stream level
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    // 2. Notify backend server to reject/gate incoming frames
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'mute_state', is_muted: nextMuted }));
      } catch {}
    }

    if (nextMuted) {
      setUserVolume(0);
      setIsUserSpeaking(false);
      sustainedAiSpeechMsRef.current = 0;
      interruptionSilenceMsRef.current = 0;
      speechStreakRef.current = 0;
      silenceStreakRef.current = 0;
      lastSpeechStateRef.current = false;

      // If user had spoken before muting, automatically commit their turn!
      if (hasSpokenInTurnRef.current && phaseRef.current === 'user_turn') {
        finishTurnManual();
      }
    }
  }, [finishTurnManual]);

  const interrupt = useCallback((flushFrames?: ArrayBuffer[] | unknown) => {
    clearWatchdog();
    preRollBufferRef.current = [];
    sustainedAiSpeechMsRef.current = 0;
    interruptionSilenceMsRef.current = 0;
    speechStreakRef.current = 0;
    silenceStreakRef.current = 0;
    lastSpeechStateRef.current = false;
    activeGenerationIdRef.current += 1;
    isServerTurnCompleteRef.current = true;
    stopAiPlayback();
    setPhaseSafe('user_turn');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'interrupt',
          generation_id: activeGenerationIdRef.current
        }));
      } catch {}

      // If speech frames accompanied this interruption (barge-in voice), preserve and stream them immediately
      const framesToFlush = Array.isArray(flushFrames) ? (flushFrames as ArrayBuffer[]) : undefined;
      if (framesToFlush && framesToFlush.length > 0) {
        hasSpokenInTurnRef.current = true;
        lastSpeechTimeRef.current = Date.now();
        for (const frame of framesToFlush) {
          try {
            wsRef.current.send(frame);
          } catch {}
        }
      } else {
        hasSpokenInTurnRef.current = false;
      }
    } else {
      hasSpokenInTurnRef.current = false;
    }
  }, [stopAiPlayback, setPhaseSafe, clearWatchdog]);

  const startSession = useCallback(async (customVoice?: string, customLanguage?: string) => {
    setError(null);
    setIsConnecting(true);
    setPhaseSafe('connecting');

    // Isolate sessions: clear prior session turns and evidence (P1 blocker 7)
    setTurns([]);
    setLiveEvidence([]);
    sessionStorage.removeItem(STORAGE_TURNS_KEY);
    activeGenerationIdRef.current = 1;
    isServerTurnCompleteRef.current = true;
    ambientNoiseFloorRef.current = 0.008;
    preRollBufferRef.current = [];
    rollingInterruptionBufferRef.current = [];
    hasSpokenInTurnRef.current = false;
    lastSpeechTimeRef.current = 0;
    sustainedAiSpeechMsRef.current = 0;
    interruptionSilenceMsRef.current = 0;
    speechStreakRef.current = 0;
    silenceStreakRef.current = 0;
    lastSpeechStateRef.current = false;
    lastVolumeUpdateRef.current = 0;
    lastReportedVolumeRef.current = 0;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone capture is not supported in this browser.');
      setIsConnecting(false);
      setPhaseSafe('idle');
      return;
    }

    try {
      // 1. Capture microphone stream with hardware echo cancellation and noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: { ideal: 16000 }
        }
      });
      mediaStreamRef.current = stream;

      // 2. Initialize Web Audio Context & Analyser
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Analyser for measuring AI speech amplitude
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      analyser.connect(audioCtx.destination);
      aiAnalyserRef.current = analyser;

      // Real-time animation loop for AI playback volume
      const dataArray = new Uint8Array(32);
      const updateVolumeLoop = () => {
        if (aiAnalyserRef.current && activeSourcesRef.current.length > 0) {
          aiAnalyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const vol = Math.min(1, Math.max(0, avg / 128));
          aiVolumeRef.current = vol;
          setAiVolume(vol);
        } else {
          aiVolumeRef.current = 0;
          setAiVolume(0);
        }
        animationFrameRef.current = requestAnimationFrame(updateVolumeLoop);
      };
      animationFrameRef.current = requestAnimationFrame(updateVolumeLoop);

      // 3. Connect to /api/ws/debate-live
      const selectedVoice = customVoice || voicePreferences.getSelectedVoice() || 'Kore';
      const selectedLang = customLanguage || 'auto';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws/debate-live?voice=${encodeURIComponent(selectedVoice)}&language=${encodeURIComponent(selectedLang)}&session_id=${encodeURIComponent(sessionIdRef.current)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        setPhaseSafe('user_turn');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'ready') {
            isServerTurnCompleteRef.current = true;
            setPhaseSafe('user_turn');
          } else if (data.type === 'state_change') {
            if (data.generation_id && data.generation_id < activeGenerationIdRef.current) {
              return;
            }
            if (data.state === 'thinking' || data.state === 'checking_evidence') {
              isServerTurnCompleteRef.current = false;
              setPhaseSafe('thinking');
            } else if (data.state === 'assistant_speaking') {
              isServerTurnCompleteRef.current = false;
              setPhaseSafe('assistant_speaking');
            } else if (data.state === 'user_turn') {
              isServerTurnCompleteRef.current = true;
              if (activeSourcesRef.current.length === 0) {
                setPhaseSafe('user_turn');
              }
            }
          } else if (data.type === 'evidence_retrieved') {
            if (data.evidence) {
              const ev = data.evidence;
              // Handle topic-search results that contain nested verses (P1 blocker 3)
              const itemsToAdd: LiveEvidenceItem[] = ev.verses && Array.isArray(ev.verses)
                ? ev.verses.map((v: any) => ({ ...v, source_type: 'quran', is_verified: true }))
                : [ev];

              setLiveEvidence((prev) => {
                const existingKeys = new Set(
                  prev.map((e) => e.source_id || (e.surah_number && e.ayah_number ? `${e.surah_number}:${e.ayah_number}` : e.citation || JSON.stringify(e)))
                );
                const newItems = itemsToAdd.filter((item) => {
                  const key = item.source_id || (item.surah_number && item.ayah_number ? `${item.surah_number}:${item.ayah_number}` : item.citation || JSON.stringify(item));
                  return !existingKeys.has(key);
                });
                return [...prev, ...newItems];
              });
            }
          } else if (data.type === 'audio') {
            // Discard stale audio chunks from an interrupted generation (P1 blocker 2)
            if (data.generation_id && data.generation_id < activeGenerationIdRef.current) {
              return;
            }
            clearWatchdog();
            isServerTurnCompleteRef.current = false;
            playPcmChunk(data.data, data.sample_rate || 24000);
          } else if (data.type === 'interrupted') {
            if (data.generation_id && data.generation_id > activeGenerationIdRef.current) {
              activeGenerationIdRef.current = data.generation_id;
            }
            isServerTurnCompleteRef.current = true;
            stopAiPlayback();
            setPhaseSafe('user_turn');
          } else if (data.type === 'output_caption') {
            if (data.generation_id && data.generation_id < activeGenerationIdRef.current) {
              return;
            }
            const textChunk = data.text || '';
            if (textChunk) {
              setTurns((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text: `${last.text}${textChunk}` }
                  ];
                }
                return [
                  ...prev,
                  {
                    id: `turn_${Date.now()}`,
                    role: 'assistant',
                    text: textChunk,
                    isFinal: true,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ];
              });
            }
          } else if (data.type === 'input_caption') {
            const text = (data.text || '').trim();
            const isFinal = Boolean(data.is_final);
            if (text) {
              setTurns((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'user' && !last.isFinal) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, text, isFinal }
                  ];
                }
                if (last && last.role === 'user' && last.isFinal && !isFinal) {
                  return [
                    ...prev,
                    {
                      id: `turn_${Date.now()}`,
                      role: 'user',
                      text,
                      isFinal: false,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                  ];
                }
                return [
                  ...prev,
                  {
                    id: `turn_${Date.now()}`,
                    role: 'user',
                    text,
                    isFinal,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ];
              });
            }
          } else if (data.type === 'turn_complete') {
            if (data.generation_id && data.generation_id < activeGenerationIdRef.current) {
              return;
            }
            isServerTurnCompleteRef.current = true;
            // Only transition back to user_turn if local playback queue is completely drained (P1 blocker 5)
            if (activeSourcesRef.current.length === 0) {
              setAiSpeakingState(false);
              setPhaseSafe('user_turn');
            }
          } else if (data.type === 'error') {
            setError(data.message || 'Live debate server error occurred.');
            cleanupAudio();
          }
        } catch (e) {
          console.warn('Error handling live debate message:', e);
        }
      };

      ws.onerror = () => {
        setError('Failed to connect to live debate server.');
        cleanupAudio();
      };

      ws.onclose = () => {
        cleanupAudio();
      };

      // 4. Microphone pipeline (DSP Noise Cancellation + Bandpass + Downsample to 16kHz PCM16)
      const source = audioCtx.createMediaStreamSource(stream);

      // Sub-bass filter: cuts mechanical rumble, table handling, air-conditioner hum below 85Hz
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(85, audioCtx.currentTime);
      highpass.Q.setValueAtTime(0.7, audioCtx.currentTime);

      // Lowpass filter: cuts high-frequency hiss, coil whine, fan hiss above 7500Hz
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(7500, audioCtx.currentTime);
      lowpass.Q.setValueAtTime(0.7, audioCtx.currentTime);

      source.connect(highpass);
      highpass.connect(lowpass);

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      lowpass.connect(processor);
      processor.connect(audioCtx.destination);

      let speechHangoverFrames = 0;
      const PRE_ROLL_MAX = 3; // ~250ms circular pre-roll buffer

      processor.onaudioprocess = (e) => {
        // 1. Hard Mute Gate: zero out telemetry and halt transmission while muted
        if (isMutedRef.current) {
          setUserVolume(0);
          setIsUserSpeaking(false);
          preRollBufferRef.current = [];
          rollingInterruptionBufferRef.current = [];
          sustainedAiSpeechMsRef.current = 0;
          interruptionSilenceMsRef.current = 0;
          speechStreakRef.current = 0;
          silenceStreakRef.current = 0;
          lastSpeechStateRef.current = false;
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const sampleRate = audioCtx.sampleRate;
        const frameDurationMs = (inputData.length / sampleRate) * 1000; // ~85.3ms

        // Check if AI is currently playing speech on speakers
        const isAiCurrentlySpeaking = isAiSpeakingRef.current || activeSourcesRef.current.length > 0;

        // Asymmetric continuous ambient noise floor tracking (adapts to background fans and room hum)
        const rawRms = calculateRMSVolume(inputData);
        if (!lastSpeechStateRef.current && !isAiCurrentlySpeaking) {
          if (rawRms < ambientNoiseFloorRef.current) {
            // Fast adaptation downward when room becomes quieter
            ambientNoiseFloorRef.current = 0.90 * ambientNoiseFloorRef.current + 0.10 * rawRms;
          } else {
            // Slow adaptation upward to track steady ambient sound (fans, air conditioning)
            ambientNoiseFloorRef.current = 0.985 * ambientNoiseFloorRef.current + 0.015 * rawRms;
          }
        }
        const noiseFloor = Math.max(0.006, Math.min(0.065, ambientNoiseFloorRef.current));
        const dynamicSpeechThreshold = Math.max(0.018, noiseFloor * 2.2);

        // Downsample input chunk to 16kHz Float32Array for correlation analysis
        const mic16kRatio = sampleRate / 16000;
        const mic16kLen = Math.floor(inputData.length / mic16kRatio);
        const mic16k = new Float32Array(mic16kLen);
        for (let i = 0; i < mic16kLen; i++) {
          mic16k[i] = inputData[Math.floor(i * mic16kRatio)] || 0;
        }

        const echoCorrelation = isAiCurrentlySpeaking
          ? calculateAcousticEchoCorrelation(
              mic16k,
              aiPlaybackRefBuffer.current,
              aiPlaybackRefWriteIdx.current,
              16000,
              25,
              350
            )
          : 0;

        // Perform comprehensive multi-feature acoustic analysis (ZCR, pitch autocorrelation, spectral diff, echo)
        const analysis = analyzeAudioFrame(
          inputData,
          sampleRate,
          noiseFloor,
          aiVolumeRef.current,
          isAiCurrentlySpeaking,
          echoCorrelation
        );
        const rms = analysis.rms;

        // Throttled volume telemetry to eliminate React re-render stutter (updates at max ~12Hz or on large delta)
        const now = performance.now();
        if (now - lastVolumeUpdateRef.current >= 80 || Math.abs(rms - lastReportedVolumeRef.current) > 0.025) {
          lastVolumeUpdateRef.current = now;
          lastReportedVolumeRef.current = rms;
          setUserVolume(rms);
        }

        // Downsample input chunk to 16kHz PCM16
        const pcmBuffer = downsampleAndConvertToPCM16(inputData, sampleRate, 16000);

        // Maintain continuous rolling pre-interruption buffer of >= 4 seconds (~55 frames)
        rollingInterruptionBufferRef.current.push(pcmBuffer);
        if (rollingInterruptionBufferRef.current.length > ROLLING_INTERRUPTION_BUFFER_MAX) {
          rollingInterruptionBufferRef.current.shift();
        }

        // 2. AI Speaking Phase: Sustained ~2.5s speech required to interrupt
        if (isAiCurrentlySpeaking) {
          if (analysis.isEcho) {
            // Physical speaker bleed detected through laptop microphone!
            // Aggressively drain barge-in accumulator to guarantee AI NEVER interrupts itself
            sustainedAiSpeechMsRef.current = Math.max(0, sustainedAiSpeechMsRef.current - frameDurationMs * 2);
            interruptionSilenceMsRef.current = 0;
            return;
          }

          const isInterruptionCandidate = analysis.isIntentionalBargeIn;

          if (isInterruptionCandidate) {
            sustainedAiSpeechMsRef.current += frameDurationMs;
            interruptionSilenceMsRef.current = 0;

            // Confirm intentional interruption after ~2.5 seconds of sustained human speech
            if (sustainedAiSpeechMsRef.current >= 2500) {
              sustainedAiSpeechMsRef.current = 0;
              interruptionSilenceMsRef.current = 0;
              // Extract the user speech history corresponding to the deliberate barge-in streak (~30 frames, ~2.5s)
              const framesToFlush = [...rollingInterruptionBufferRef.current.slice(-30)];
              interrupt(framesToFlush);
            }
          } else {
            // Natural brief inter-syllable gaps (< 400ms) do NOT reset accumulated speech
            interruptionSilenceMsRef.current += frameDurationMs;
            if (interruptionSilenceMsRef.current >= 400) {
              // Isolated click, fan burst, or throat clear without sustained speech
              sustainedAiSpeechMsRef.current = 0;
              interruptionSilenceMsRef.current = 0;
            }
          }
          // Do not stream user mic audio while AI is actively speaking (prevents speaker echo)
          return;
        } else {
          sustainedAiSpeechMsRef.current = 0;
          interruptionSilenceMsRef.current = 0;
        }

        // 3. User Turn Phase: Immediate listening with debounced state & fast silence auto-commit
        const isSpeech = analysis.isVoiceLike && rms >= dynamicSpeechThreshold;

        if (isSpeech) {
          speechStreakRef.current++;
          silenceStreakRef.current = 0;
          if (speechStreakRef.current >= 2 && !lastSpeechStateRef.current) {
            lastSpeechStateRef.current = true;
            setIsUserSpeaking(true);
          }

          speechHangoverFrames = 4; // ~350ms hangover to preserve natural word endings
          lastSpeechTimeRef.current = Date.now();

          // Flush pre-roll circular buffer on first detected speech frame of turn
          if (!hasSpokenInTurnRef.current) {
            hasSpokenInTurnRef.current = true;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              while (preRollBufferRef.current.length > 0) {
                const preRollChunk = preRollBufferRef.current.shift();
                if (preRollChunk) {
                  wsRef.current.send(preRollChunk);
                }
              }
            }
          }
        } else {
          silenceStreakRef.current++;
          speechStreakRef.current = 0;
          if (silenceStreakRef.current >= 5 && lastSpeechStateRef.current) {
            lastSpeechStateRef.current = false;
            setIsUserSpeaking(false);
          }

          if (speechHangoverFrames > 0) {
            speechHangoverFrames--;
          }

          // Maintain circular pre-roll buffer when user is not actively speaking
          preRollBufferRef.current.push(pcmBuffer);
          if (preRollBufferRef.current.length > PRE_ROLL_MAX) {
            preRollBufferRef.current.shift();
          }

          // Auto-commit silence trigger:
          // If user was speaking in this turn and has been silent for 1000ms, automatically submit turn!
          if (hasSpokenInTurnRef.current && phaseRef.current === 'user_turn' && speechHangoverFrames === 0) {
            const silenceMs = Date.now() - lastSpeechTimeRef.current;
            if (silenceMs >= 1000) {
              hasSpokenInTurnRef.current = false;
              finishTurnManual();
              return;
            }
          }
        }

        // Noise Gate: Suppress silence/ambient noise frames
        // Prevents room noise, fan hum, or keyboard clicks from polluting Gemini Live stream
        if (!isSpeech && speechHangoverFrames === 0) {
          return;
        }

        // Stream PCM audio chunk to WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcmBuffer);
        }
      };
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission denied. Please allow microphone access to participate in live voice debate.');
      } else {
        setError(`Microphone error: ${err.message || 'Unable to access microphone'}`);
      }
      cleanupAudio();
    }
  }, [playPcmChunk, stopAiPlayback, cleanupAudio, setPhaseSafe, interrupt, finishTurnManual]);

  const sendTextTurn = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    hasSpokenInTurnRef.current = false;
    preRollBufferRef.current = [];
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setPhaseSafe('thinking');
      wsRef.current.send(JSON.stringify({ type: 'text_turn', text: trimmed }));
      setTurns((prev) => [
        ...prev,
        {
          id: `turn_${Date.now()}`,
          role: 'user',
          text: trimmed,
          isFinal: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, [setPhaseSafe]);

  const endSession = useCallback(async () => {
    const recordedTurns = turnsRef.current;
    cleanupAudio();

    if (recordedTurns.length > 0) {
      try {
        const formattedTranscript = recordedTurns
          .map((t) => `${t.role === 'user' ? 'User' : 'Daleel-e-Haq'}: ${t.text}`)
          .join('\n\n');

        const title = recordedTurns[0]?.text
          ? `Live Debate: ${recordedTurns[0].text.slice(0, 40)}...`
          : 'Live Voice Debate Session';

        const saveRes = await api.saveDebateSession({
          title,
          raw_transcript: formattedTranscript,
          language: 'auto',
          topic: 'Live Theological Debate',
          summary: `Recorded ${recordedTurns.length} spoken dialogue turns.`
        });

        if (saveRes.debate_id) {
          sessionStorage.removeItem(STORAGE_TURNS_KEY);
          if (options?.onSessionSaved) {
            options.onSessionSaved(saveRes.debate_id);
          }
        }
      } catch (e) {
        console.warn('Failed to auto-save debate session:', e);
      }
    }
  }, [cleanupAudio, options]);

  const clearHistory = useCallback(() => {
    setTurns([]);
    setLiveEvidence([]);
    sessionStorage.removeItem(STORAGE_TURNS_KEY);
  }, []);

  return {
    isConnected,
    isConnecting,
    phase,
    isMuted,
    isAISpeaking,
    isUserSpeaking,
    userVolume,
    aiVolume,
    turns,
    liveEvidence,
    error,
    startSession,
    endSession,
    toggleMute,
    interrupt,
    finishTurnManual,
    sendTextTurn,
    clearHistory,
    clearError: () => setError(null)
  };
}
