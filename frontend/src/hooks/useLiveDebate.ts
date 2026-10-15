import { useState, useRef, useCallback, useEffect } from 'react';
import { voicePreferences } from '../services/voicePreferences';
import { api } from '../services/api';
import { openBrowserAudio } from '../voice/browserAudio';
import { soundEffects } from '../voice/uiSoundEffects';
import {
  VoiceSession,
  type DebatePhase,
  type SocketLike,
  type VoiceEnv,
  type VoiceErrorCode,
  type VoiceSnapshot
} from '../voice/voiceSession';

export type { DebatePhase } from '../voice/voiceSession';

export interface DebateTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: string;
}

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

const browserEnv: VoiceEnv = {
  openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  openAudio: openBrowserAudio,
  now: () => Date.now()
};

const IDLE_SNAPSHOT: VoiceSnapshot = {
  phase: 'idle',
  isMuted: false,
  isUserSpeaking: false,
  isAISpeaking: false,
  micOpen: false,
  userVolume: 0,
  canRespondNow: false,
  generation: 1
};

const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * React adapter around {@link VoiceSession}. All audio / socket / timer logic lives in the
 * session; this hook only mirrors its snapshot and owns transcript + evidence state.
 */
export function useLiveDebate(options?: UseLiveDebateOptions) {
  const [snap, setSnap] = useState<VoiceSnapshot>(IDLE_SNAPSHOT);
  const [aiVolume, setAiVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<VoiceErrorCode | null>(null);
  const [liveEvidence, setLiveEvidence] = useState<LiveEvidenceItem[]>([]);
  const [turns, setTurns] = useState<DebateTurn[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_TURNS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const sessionRef = useRef<VoiceSession | null>(null);
  const turnsRef = useRef<DebateTurn[]>([]);
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}`
  );

  useEffect(() => {
    turnsRef.current = turns;
    try {
      if (turns.length > 0) sessionStorage.setItem(STORAGE_TURNS_KEY, JSON.stringify(turns));
      else sessionStorage.removeItem(STORAGE_TURNS_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [turns]);

  // Assistant output meter: only runs while the assistant is actually speaking.
  useEffect(() => {
    if (snap.phase !== 'assistant_speaking') {
      setAiVolume(0);
      return;
    }
    let raf = 0;
    const loop = () => {
      setAiVolume(sessionRef.current?.getAiLevel() ?? 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [snap.phase]);

  // Unmount, refresh and tab close all release the microphone and timers.
  useEffect(() => {
    const release = () => sessionRef.current?.end();
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  const handleServerMessage = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'evidence_retrieved' && data.evidence) {
      const ev = data.evidence as LiveEvidenceItem;
      const items: LiveEvidenceItem[] =
        ev.verses && Array.isArray(ev.verses)
          ? ev.verses.map((v: any) => ({ ...v, source_type: 'quran', is_verified: true }))
          : [ev];
      const keyOf = (e: LiveEvidenceItem) =>
        e.source_id ||
        (e.surah_number && e.ayah_number ? `${e.surah_number}:${e.ayah_number}` : e.citation || JSON.stringify(e));
      setLiveEvidence((prev) => {
        const existing = new Set(prev.map(keyOf));
        return [...prev, ...items.filter((i) => !existing.has(keyOf(i)))];
      });
    } else if (data.type === 'output_caption') {
      const chunk = typeof data.text === 'string' ? data.text : '';
      if (!chunk) return;
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, text: `${last.text}${chunk}` }];
        }
        return [
          ...prev,
          { id: `turn_${Date.now()}`, role: 'assistant', text: chunk, isFinal: true, timestamp: nowLabel() }
        ];
      });
    } else if (data.type === 'input_caption') {
      const text = (typeof data.text === 'string' ? data.text : '').trim();
      const isFinal = Boolean(data.is_final);
      if (!text) return;
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'user' && !last.isFinal) {
          return [...prev.slice(0, -1), { ...last, text, isFinal }];
        }
        return [...prev, { id: `turn_${Date.now()}`, role: 'user', text, isFinal, timestamp: nowLabel() }];
      });
    }
  }, []);

  const startSession = useCallback(
    async (customVoice?: string, customLanguage?: string) => {
      sessionRef.current?.end(); // never leave a previous session's mic / socket alive
      setError(null);
      setErrorCode(null);
      setTurns([]);
      setLiveEvidence([]);
      sessionStorage.removeItem(STORAGE_TURNS_KEY);

      const selectedVoice = customVoice || voicePreferences.getSelectedVoice() || 'Kore';
      const selectedLang = customLanguage || 'auto';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const customKey = (localStorage.getItem('daleel_user_gemini_api_key') || '').trim();
      let url = `${protocol}//${window.location.host}/api/ws/debate-live?voice=${encodeURIComponent(selectedVoice)}&language=${encodeURIComponent(selectedLang)}&session_id=${encodeURIComponent(sessionIdRef.current)}`;
      if (customKey) {
        url += `&api_key=${encodeURIComponent(customKey)}`;
      }

      const session: VoiceSession = new VoiceSession({
        url,
        env: browserEnv,
        callbacks: {
          // Callbacks from a superseded session are ignored.
          onState: (s) => {
            if (sessionRef.current === session) setSnap(s);
          },
          onServerMessage: (d) => {
            if (sessionRef.current === session) {
              if (d.type === 'ready') soundEffects.playConnectChime();
              handleServerMessage(d);
            }
          },
          onError: (code, message) => {
            if (sessionRef.current !== session) return;
            soundEffects.stopThinkingTick();
            setError(message);
            setErrorCode(code);
          }
        }
      });
      sessionRef.current = session;
      await session.start();
    },
    [handleServerMessage]
  );

  // Sync procedural thinking tick audio with debate phase
  useEffect(() => {
    if (snap.phase === 'thinking') {
      soundEffects.startThinkingTick();
    } else {
      soundEffects.stopThinkingTick();
    }
    return () => {
      soundEffects.stopThinkingTick();
    };
  }, [snap.phase]);

  const endSession = useCallback(async () => {
    soundEffects.stopThinkingTick();
    soundEffects.playSoftClick();
    const recorded = turnsRef.current;
    sessionRef.current?.end();
    if (recorded.length === 0) return;
    try {
      const transcript = recorded
        .map((t) => `${t.role === 'user' ? 'User' : 'Daleel-e-Haq'}: ${t.text}`)
        .join('\n\n');
      const title = recorded[0]?.text
        ? `Live Debate: ${recorded[0].text.slice(0, 40)}...`
        : 'Live Voice Debate Session';
      const saveRes = await api.saveDebateSession({
        title,
        raw_transcript: transcript,
        language: 'auto',
        topic: 'Live Theological Debate',
        summary: `Recorded ${recorded.length} spoken dialogue turns.`
      });
      if (saveRes.debate_id) {
        sessionStorage.removeItem(STORAGE_TURNS_KEY);
        options?.onSessionSaved?.(saveRes.debate_id);
      }
    } catch (e) {
      console.warn('Failed to auto-save debate session:', e);
    }
  }, [options]);

  const toggleMute = useCallback(() => {
    soundEffects.playSoftClick();
    sessionRef.current?.toggleMute();
  }, []);

  const interrupt = useCallback(() => {
    soundEffects.playSoftClick();
    sessionRef.current?.interrupt();
  }, []);
  const finishTurnManual = useCallback(() => sessionRef.current?.respondNow(), []);

  const sendTextTurn = useCallback((text: string) => {
    const trimmed = text.trim();
    if (sessionRef.current?.sendText(trimmed)) {
      setTurns((prev) => [
        ...prev,
        { id: `turn_${Date.now()}`, role: 'user', text: trimmed, isFinal: true, timestamp: nowLabel() }
      ]);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setTurns([]);
    setLiveEvidence([]);
    sessionStorage.removeItem(STORAGE_TURNS_KEY);
  }, []);

  const phase: DebatePhase = snap.phase;
  return {
    isConnected: phase !== 'idle' && phase !== 'connecting',
    isConnecting: phase === 'connecting',
    phase,
    isMuted: snap.isMuted,
    isAISpeaking: snap.isAISpeaking,
    isUserSpeaking: snap.isUserSpeaking,
    /** Microphone frames are really being analysed right now (false while paused / muted). */
    micOpen: snap.micOpen,
    canRespondNow: snap.canRespondNow,
    userVolume: snap.userVolume,
    aiVolume,
    turns,
    liveEvidence,
    error,
    errorCode,
    startSession,
    endSession,
    toggleMute,
    interrupt,
    finishTurnManual,
    sendTextTurn,
    clearHistory,
    clearError: () => {
      setError(null);
      setErrorCode(null);
    }
  };
}
