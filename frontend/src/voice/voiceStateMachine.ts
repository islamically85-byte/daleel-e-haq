/**
 * Pure state machine for one live voice session.
 *
 * Invariants (enforced here, exercised by voiceStateMachine.test.ts):
 *  - The microphone is only "open" while phase === 'listening', it is available and not muted.
 *  - 'listening' is re-entered after a reply ONLY when the provider turn is complete AND the
 *    queued playback has drained. Neither signal alone reopens the microphone.
 *  - Provider events tagged with an older generation (i.e. from before an explicit interrupt)
 *    are ignored, so stale audio / turn_complete events can never change state.
 *  - An 'idle' machine ignores everything except session_start.
 */
export type VoicePhase = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';

export interface VoiceState {
  phase: VoicePhase;
  /** Bumped by every explicit interrupt; provider events with a lower value are stale. */
  generation: number;
  handshakeOk: boolean;
  micAvailable: boolean;
  muted: boolean;
  /** True once the provider reports the current reply finished (or none is pending). */
  providerTurnComplete: boolean;
  /** True when no scheduled playback is outstanding. */
  queueEmpty: boolean;
}

export type VoiceEvent =
  | { type: 'session_start' }
  | { type: 'session_end' }
  | { type: 'handshake_ok' }
  | { type: 'mic_ready' }
  | { type: 'mic_lost' }
  | { type: 'mute_set'; muted: boolean }
  | { type: 'utterance_submitted' }
  | { type: 'turn_rejected' }
  | { type: 'provider_audio'; generation: number }
  | { type: 'audio_queued' }
  | { type: 'provider_turn_complete'; generation: number }
  | { type: 'playback_drained' }
  | { type: 'user_interrupt' }
  | { type: 'server_generation'; generation: number };

export const initialVoiceState: VoiceState = {
  phase: 'idle',
  generation: 1,
  handshakeOk: false,
  micAvailable: false,
  muted: false,
  providerTurnComplete: true,
  queueEmpty: true
};

export function isMicOpen(s: VoiceState): boolean {
  return s.phase === 'listening' && s.micAvailable && !s.muted;
}

/** True when the reply is fully finished: provider done and every queued chunk has played. */
function replyFinished(s: VoiceState): boolean {
  return s.providerTurnComplete && s.queueEmpty;
}

function maybeReopen(s: VoiceState): VoiceState {
  if ((s.phase === 'processing' || s.phase === 'speaking') && replyFinished(s)) {
    return { ...s, phase: 'listening' };
  }
  return s;
}

function maybeListen(s: VoiceState): VoiceState {
  if (s.phase === 'connecting' && s.handshakeOk && s.micAvailable) {
    return { ...s, phase: 'listening' };
  }
  return s;
}

export function reduceVoice(state: VoiceState, event: VoiceEvent): VoiceState {
  if (event.type === 'session_start') {
    return { ...initialVoiceState, phase: 'connecting' };
  }
  if (state.phase === 'idle') return state;

  switch (event.type) {
    case 'session_end':
    case 'mic_lost':
      return { ...state, phase: 'idle', micAvailable: false, handshakeOk: false };

    case 'handshake_ok':
      return maybeListen({ ...state, handshakeOk: true });

    case 'mic_ready':
      return maybeListen({ ...state, micAvailable: true });

    case 'mute_set':
      return { ...state, muted: event.muted };

    case 'utterance_submitted':
      // Only a listening session may submit a turn; this is the single entry into 'processing'.
      if (state.phase !== 'listening') return state;
      return { ...state, phase: 'processing', providerTurnComplete: false, queueEmpty: true };

    case 'turn_rejected':
      // Server discarded the turn / its watchdog fired before any audio. Never reopens mid-speech.
      if (state.phase !== 'processing') return state;
      return { ...state, phase: 'listening', providerTurnComplete: true, queueEmpty: true };

    case 'provider_audio':
      if (event.generation < state.generation) return state;
      if (state.phase !== 'processing' && state.phase !== 'speaking') return state;
      return { ...state, phase: 'speaking', providerTurnComplete: false };

    case 'audio_queued':
      return { ...state, queueEmpty: false };

    case 'provider_turn_complete':
      if (event.generation < state.generation) return state;
      return maybeReopen({ ...state, providerTurnComplete: true });

    case 'playback_drained':
      return maybeReopen({ ...state, queueEmpty: true });

    case 'user_interrupt':
      // Explicit Stop is only meaningful while a reply is in progress.
      if (state.phase !== 'processing' && state.phase !== 'speaking') return state;
      return {
        ...state,
        phase: 'listening',
        generation: state.generation + 1,
        providerTurnComplete: true,
        queueEmpty: true
      };

    case 'server_generation':
      return event.generation > state.generation ? { ...state, generation: event.generation } : state;

    default:
      return state;
  }
}

/** True when this transition handed the floor back to the user after a reply (server needs a resume signal). */
export function reopenedAfterReply(prev: VoiceState, next: VoiceState): boolean {
  return (
    next.phase === 'listening' &&
    (prev.phase === 'processing' || prev.phase === 'speaking')
  );
}
