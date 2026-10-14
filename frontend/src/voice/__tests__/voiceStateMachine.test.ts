import { describe, it, expect } from 'vitest';
import {
  initialVoiceState,
  reduceVoice,
  isMicOpen,
  type VoiceState
} from '../voiceStateMachine';

describe('voiceStateMachine pure reducer', () => {
  it('starts at idle and ignores events before session_start', () => {
    let state = initialVoiceState;
    expect(state.phase).toBe('idle');
    expect(isMicOpen(state)).toBe(false);

    state = reduceVoice(state, { type: 'mic_ready' });
    expect(state.phase).toBe('idle');
    expect(state.micAvailable).toBe(false);
  });

  it('session_start moves to connecting; opens mic only when both handshake_ok and mic_ready', () => {
    let state = reduceVoice(initialVoiceState, { type: 'session_start' });
    expect(state.phase).toBe('connecting');
    expect(isMicOpen(state)).toBe(false);

    // Handshake arrives first
    state = reduceVoice(state, { type: 'handshake_ok' });
    expect(state.phase).toBe('connecting');
    expect(isMicOpen(state)).toBe(false);

    // Mic becomes ready
    state = reduceVoice(state, { type: 'mic_ready' });
    expect(state.phase).toBe('listening');
    expect(isMicOpen(state)).toBe(true);
  });

  it('pauses mic on utterance_submitted and transitions to processing', () => {
    let state: VoiceState = {
      ...initialVoiceState,
      phase: 'listening',
      handshakeOk: true,
      micAvailable: true
    };
    expect(isMicOpen(state)).toBe(true);

    state = reduceVoice(state, { type: 'utterance_submitted' });
    expect(state.phase).toBe('processing');
    expect(state.providerTurnComplete).toBe(false);
    expect(isMicOpen(state)).toBe(false);
  });

  it('moves to speaking on provider_audio and ignores stale generation audio', () => {
    let state: VoiceState = {
      ...initialVoiceState,
      phase: 'processing',
      generation: 2,
      handshakeOk: true,
      micAvailable: true,
      providerTurnComplete: false
    };

    // Stale generation audio (gen 1 < state gen 2)
    const staleState = reduceVoice(state, { type: 'provider_audio', generation: 1 });
    expect(staleState.phase).toBe('processing');

    // Matching generation audio
    const activeState = reduceVoice(state, { type: 'provider_audio', generation: 2 });
    expect(activeState.phase).toBe('speaking');
    expect(isMicOpen(activeState)).toBe(false);
  });

  it('never reopens microphone until BOTH provider turn is complete AND playback is drained', () => {
    let state: VoiceState = {
      ...initialVoiceState,
      phase: 'speaking',
      generation: 1,
      handshakeOk: true,
      micAvailable: true,
      providerTurnComplete: false,
      queueEmpty: false
    };

    // Case A: provider_turn_complete arrives first, but audio still playing
    state = reduceVoice(state, { type: 'provider_turn_complete', generation: 1 });
    expect(state.providerTurnComplete).toBe(true);
    expect(state.queueEmpty).toBe(false);
    expect(state.phase).toBe('speaking');
    expect(isMicOpen(state)).toBe(false); // Audio still playing!

    // Playback finishes
    state = reduceVoice(state, { type: 'playback_drained' });
    expect(state.queueEmpty).toBe(true);
    expect(state.phase).toBe('listening');
    expect(isMicOpen(state)).toBe(true);

    // Case B: playback drains first, but provider is still thinking/streaming next chunk
    state = {
      ...state,
      phase: 'speaking',
      providerTurnComplete: false,
      queueEmpty: false
    };
    state = reduceVoice(state, { type: 'playback_drained' });
    expect(state.phase).toBe('speaking');
    expect(isMicOpen(state)).toBe(false);

    state = reduceVoice(state, { type: 'provider_turn_complete', generation: 1 });
    expect(state.phase).toBe('listening');
    expect(isMicOpen(state)).toBe(true);
  });

  it('handles user interrupt by bumping generation, clearing queue, and immediately returning to listening', () => {
    let state: VoiceState = {
      ...initialVoiceState,
      phase: 'speaking',
      generation: 1,
      handshakeOk: true,
      micAvailable: true,
      providerTurnComplete: false,
      queueEmpty: false
    };

    state = reduceVoice(state, { type: 'user_interrupt' });
    expect(state.phase).toBe('listening');
    expect(state.generation).toBe(2);
    expect(state.providerTurnComplete).toBe(true);
    expect(state.queueEmpty).toBe(true);
    expect(isMicOpen(state)).toBe(true);

    // Stale audio from generation 1 arriving after interrupt is discarded
    const afterStale = reduceVoice(state, { type: 'provider_audio', generation: 1 });
    expect(afterStale.phase).toBe('listening');
    expect(afterStale.generation).toBe(2);
  });

  it('mute_set toggles isMicOpen without destroying session phase', () => {
    let state: VoiceState = {
      ...initialVoiceState,
      phase: 'listening',
      handshakeOk: true,
      micAvailable: true,
      muted: false
    };
    expect(isMicOpen(state)).toBe(true);

    state = reduceVoice(state, { type: 'mute_set', muted: true });
    expect(state.phase).toBe('listening');
    expect(state.muted).toBe(true);
    expect(isMicOpen(state)).toBe(false);

    state = reduceVoice(state, { type: 'mute_set', muted: false });
    expect(isMicOpen(state)).toBe(true);
  });

  it('session_end resets state to idle', () => {
    let state: VoiceState = {
      ...initialVoiceState,
      phase: 'listening',
      handshakeOk: true,
      micAvailable: true
    };
    state = reduceVoice(state, { type: 'session_end' });
    expect(state.phase).toBe('idle');
    expect(state.micAvailable).toBe(false);
    expect(state.handshakeOk).toBe(false);
    expect(isMicOpen(state)).toBe(false);
  });
});
