import { useState, useRef, useCallback, useEffect } from 'react';
import { downsampleAndConvertToPCM16, calculateRMSVolume, calculateZCR } from '../services/audioUtils';
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
  const [bargeInMode, setBargeInMode] = useState<'natural' | 'protected'>('protected');
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
  const bargeInModeRef = useRef<'natural' | 'protected'>('protected');
  const phaseRef = useRef<DebatePhase>('idle');
  const preRollBufferRef = useRef<ArrayBuffer[]>([]);
  const activeGenerationIdRef = useRef<number>(1);
  const isServerTurnCompleteRef = useRef<boolean>(true);
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}`
  );

  const setPhaseSafe = useCallback((p: DebatePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const setBargeInModeSafe = useCallback((mode: 'natural' | 'protected') => {
    bargeInModeRef.current = mode;
    setBargeInMode(mode);
  }, []);

  // AI 24kHz PCM playback queue & AnalyserNode
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const turnsRef = useRef<DebateTurn[]>([]);

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
    if (audioContextRef.current) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime;
    }
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
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
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
      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
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
    stopAiPlayback();
    preRollBufferRef.current = [];
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
  }, [stopAiPlayback, setPhaseSafe]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    preRollBufferRef.current = [];

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
    }
  }, []);

  const interrupt = useCallback(() => {
    activeGenerationIdRef.current += 1;
    isServerTurnCompleteRef.current = true;
    stopAiPlayback();
    preRollBufferRef.current = [];
    setPhaseSafe('user_turn');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
      } catch {}
    }
  }, [stopAiPlayback, setPhaseSafe]);

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

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone capture is not supported in this browser.');
      setIsConnecting(false);
      setPhaseSafe('idle');
      return;
    }

    try {
      // 1. Capture microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
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
          setAiVolume(Math.min(1, Math.max(0, avg / 128)));
        } else {
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

      // 4. Microphone pipeline (downsample 48k -> 16kHz PCM16)
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let userSpeechStartedAt = 0;
      let userSilenceStartedAt = 0;
      let hasSpokenInCurrentTurn = false;
      let speechConsecutiveFrames = 0;
      let bargeInConsecutiveFrames = 0;
      let runningNoiseFloor = 0.015;

      processor.onaudioprocess = (e) => {
        // 1. Hard Mute Gate: zero out telemetry, clear buffers, halt transmission
        if (isMutedRef.current) {
          setUserVolume(0);
          setIsUserSpeaking(false);
          speechConsecutiveFrames = 0;
          bargeInConsecutiveFrames = 0;
          preRollBufferRef.current = [];
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const rms = calculateRMSVolume(inputData);
        const zcr = calculateZCR(inputData);

        // Adaptive ambient noise floor tracking (moving average on non-speech frames)
        if (speechConsecutiveFrames === 0) {
          runningNoiseFloor = runningNoiseFloor * 0.95 + rms * 0.05;
        }
        const speechThreshold = Math.max(0.038, runningNoiseFloor * 2.2 + 0.015);
        // Raised threshold during AI speech to prevent speaker bleed/echo self-interruption
        const bargeInThreshold = Math.max(0.085, runningNoiseFloor * 3.4 + 0.04);

        // Filter out non-voice transients (clicks, keyboard keys, paper rustle, glass taps)
        // Voiced human speech typically has zcr <= 0.30; non-voice transients have zcr > 0.32
        const isVoiceLike = zcr < 0.32;
        const isEnergyAboveSpeech = rms > speechThreshold && isVoiceLike;

        if (isEnergyAboveSpeech) {
          speechConsecutiveFrames++;
        } else {
          speechConsecutiveFrames = Math.max(0, speechConsecutiveFrames - 1);
        }

        // Sustained human voice evidence (>= 3 buffers = ~250ms sustained energy), rejecting transient claps/clicks
        const speakingNow = speechConsecutiveFrames >= 3;
        setIsUserSpeaking(speakingNow);
        setUserVolume(speakingNow ? rms : Math.min(rms, 0.02));

        const now = Date.now();
        const pcmBuffer = downsampleAndConvertToPCM16(inputData, audioCtx.sampleRate, 16000);

        // 2. Interruption & Stream Gating Logic during thinking or speaking
        const isAssistantBusy = phaseRef.current === 'thinking' || phaseRef.current === 'assistant_speaking' || isAiSpeakingRef.current;

        if (isAssistantBusy) {
          // In 'protected' mode (DEFAULT):
          // Microphone audio is NEVER submitted to Gemini while thinking or speaking.
          // Automatic barge-in is suppressed; interruption is ONLY via the dedicated Interrupt button.
          if (bargeInModeRef.current === 'protected') {
            bargeInConsecutiveFrames = 0;
            preRollBufferRef.current = [];
            return;
          }

          // In optional 'natural' mode:
          // Guard against speaker echo and background noise.
          const isIntentionalVoice = rms > bargeInThreshold && isVoiceLike;
          if (isIntentionalVoice) {
            bargeInConsecutiveFrames++;
          } else {
            bargeInConsecutiveFrames = Math.max(0, bargeInConsecutiveFrames - 1);
          }

          // Buffer incoming frames in circular pre-roll queue (max 5 chunks ~340ms)
          preRollBufferRef.current.push(pcmBuffer);
          if (preRollBufferRef.current.length > 5) {
            preRollBufferRef.current.shift();
          }

          // Confirm intentional user interruption (>= 4 consecutive frames ~340ms sustained voice)
          if (bargeInConsecutiveFrames >= 4) {
            stopAiPlayback();
            bargeInConsecutiveFrames = 0;
            speechConsecutiveFrames = 4;
            hasSpokenInCurrentTurn = true;
            userSpeechStartedAt = now - 340;
            userSilenceStartedAt = 0;
            setPhaseSafe('user_turn');

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              // 1. Send interruption signal
              wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
              // 2. Flush pre-roll buffer so the beginning syllable of the interruption isn't clipped!
              while (preRollBufferRef.current.length > 0) {
                const chunk = preRollBufferRef.current.shift();
                if (chunk) wsRef.current.send(chunk);
              }
            }
          }
          return;
        }

        // 3. User's Turn Mode (Microphone actively participating)
        bargeInConsecutiveFrames = 0;

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          if (speakingNow) {
            // Flush any pre-roll frames buffered right before sustained speech was detected
            if (preRollBufferRef.current.length > 0) {
              while (preRollBufferRef.current.length > 0) {
                const chunk = preRollBufferRef.current.shift();
                if (chunk) wsRef.current.send(chunk);
              }
            }
            wsRef.current.send(pcmBuffer);

            if (!userSpeechStartedAt) userSpeechStartedAt = now;
            userSilenceStartedAt = 0;
            if (now - userSpeechStartedAt > 500) {
              hasSpokenInCurrentTurn = true;
            }
          } else {
            // User is silent or below threshold:
            // Buffer a small 3-chunk pre-roll queue (~200ms) for the start of the next speech phrase
            preRollBufferRef.current.push(pcmBuffer);
            if (preRollBufferRef.current.length > 3) {
              preRollBufferRef.current.shift();
            }

            // Conversational pause detection (allow natural 1800ms thinking pauses for debate arguments)
            if (hasSpokenInCurrentTurn) {
              if (!userSilenceStartedAt) userSilenceStartedAt = now;
              if (now - userSilenceStartedAt > 1800) {
                // User spoke sustained argument and paused for 1.8s -> commit turn & shift to thinking
                setPhaseSafe('thinking');
                wsRef.current.send(JSON.stringify({ type: 'turn_complete' }));
                hasSpokenInCurrentTurn = false;
                userSpeechStartedAt = 0;
                userSilenceStartedAt = 0;
                speechConsecutiveFrames = 0;
                preRollBufferRef.current = [];
              }
            } else {
              userSpeechStartedAt = 0;
            }
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission denied. Please allow microphone access to participate in live voice debate.');
      } else {
        setError(`Microphone error: ${err.message || 'Unable to access microphone'}`);
      }
      cleanupAudio();
    }
  }, [playPcmChunk, stopAiPlayback, cleanupAudio, setPhaseSafe]);

  const finishTurnManual = useCallback(() => {
    if (phaseRef.current === 'user_turn') {
      setPhaseSafe('thinking');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'turn_complete' }));
      }
    }
  }, [setPhaseSafe]);

  const sendTextTurn = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
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
          summary: `Recorded ${recordedTurns.length} spoken dialogue turns via gemini-3.8-live.`
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
    bargeInMode,
    setBargeInMode: setBargeInModeSafe,
    clearError: () => setError(null)
  };
}
