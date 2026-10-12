import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Hand,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  RotateCcw,
  Sparkles,
  X
} from 'lucide-react';
import { useLiveDebate } from '../hooks/useLiveDebate';
import { voicePreferences } from '../services/voicePreferences';
import { DaleelVoiceOrb } from './DaleelVoiceOrb';

interface Props {
  language: 'en' | 'ur';
  onDebateSaved?: (debateId: string) => void;
}

export const DebateLiveVoiceView: React.FC<Props> = ({ language, onDebateSaved }) => {
  const isUrdu = language === 'ur';
  const [selectedVoice, setSelectedVoice] = useState<'Kore' | 'Puck' | 'Aoede' | 'Charon'>(
    () => voicePreferences.getSelectedVoice()
  );
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);

  const {
    isConnected,
    isConnecting,
    phase,
    liveEvidence,
    isMuted,
    isAISpeaking,
    isUserSpeaking,
    userVolume,
    aiVolume,
    turns,
    error,
    startSession,
    endSession,
    toggleMute,
    interrupt,
    finishTurnManual,
    bargeInMode,
    setBargeInMode,
    clearError
  } = useLiveDebate({
    onSessionSaved: onDebateSaved
  });

  const captionsContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Auto-scroll ONLY inside the captions container and NEVER the entire page
  useEffect(() => {
    const container = captionsContainerRef.current;
    if (!container) return;

    // Check if user was already near the bottom (within 80px)
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;

    if (isNearBottom || !userScrolledUpRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [turns]);

  // Track if user manually scrolled up
  const handleCaptionsScroll = () => {
    const container = captionsContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    userScrolledUpRef.current = !isNearBottom;
  };

  const handleStart = () => {
    startSession(selectedVoice, language === 'ur' ? 'ur' : 'auto');
  };

  const handleVoiceChange = (v: 'Kore' | 'Puck' | 'Aoede' | 'Charon') => {
    setSelectedVoice(v);
    voicePreferences.set({ voice: v });
  };

  // Human-readable phase label and instructional cue
  const getPhaseDisplay = () => {
    if (isMuted) {
      return {
        badge: isUrdu ? 'مائیکروفون بند ہے' : 'Microphone Muted',
        badgeColor: '#EF4444',
        instruction: isUrdu
          ? 'بولنے کے لیے نیچے مائیک آن کریں۔ مائیک بند ہونے پر کوئی آواز نہیں جائے گی۔'
          : 'Microphone is gated. Click unmute below when you wish to speak.'
      };
    }

    switch (phase) {
      case 'connecting':
        return {
          badge: isUrdu ? 'رابطہ قائم ہو رہا ہے...' : 'Connecting to gemini-3.8-live...',
          badgeColor: '#F59E0B',
          instruction: isUrdu
            ? 'سرور سے براہ راست صوتی رابطہ قائم ہو رہا ہے...'
            : 'Establishing secure bidirectional audio streaming...'
        };
      case 'thinking':
        return {
          badge: isUrdu ? 'شواہد کی جانچ جاری ہے...' : 'Checking scripture & evidence...',
          badgeColor: '#F59E0B',
          instruction: isUrdu
            ? 'دلیلِ حق مقامی قرآنی ڈیٹابیس سے مستند حوالہ تلاش کر رہا ہے...'
            : 'Verifying citations against Tanzil Quran local database...'
        };
      case 'assistant_speaking':
        return {
          badge: isUrdu ? 'دلیلِ حق گفتگو کر رہا ہے' : 'Daleel-e-Haq is responding',
          badgeColor: 'var(--emerald-primary)',
          instruction:
            bargeInMode === 'natural'
              ? isUrdu
                ? 'قدرتی موڈ (طے شدہ): آپ بول کر بھی گفتگو کو نیا رخ دے سکتے ہیں'
                : 'Natural Mode (Default): Speak clearly anytime to take the floor'
              : isUrdu
                ? 'محفوظ موڈ (اختیاری): اپنی باری لینے کے لیے "بات روکیں" دبائیں'
                : 'Protected Mode (Optional): Tap Interrupt anytime to take the floor'
        };
      case 'user_turn':
        if (isUserSpeaking) {
          return {
            badge: isUrdu ? 'آپ کا استدلال سنا جا رہا ہے...' : 'Listening to your argument...',
            badgeColor: '#3B82F6',
            instruction: isUrdu
              ? 'اطمینان سے اپنا نکتہ مکمل کریں، یا "جواب طلب کریں" دبائیں'
              : 'Speak your point naturally, or tap Respond Now when done'
          };
        }
        return {
          badge: isUrdu ? 'آپ کی باری ہے' : 'Your turn to speak',
          badgeColor: '#3B82F6',
          instruction: isUrdu
            ? 'مائیکروفون تیار ہے۔ اپنا علمی دعویٰ یا سوال بولیں۔'
            : 'Floor is yours. State your theological claim or objection.'
        };
      default:
        return {
          badge: isUrdu ? 'صوتی مناظرہ تیار ہے' : 'Live Voice Debate Ready',
          badgeColor: 'var(--text-secondary)',
          instruction: isUrdu
            ? 'انگریزی، اردو، ہندی اور پنجابی میں قدرتی علمی گفتگو'
            : 'Spoken dialogue with local Tanzil Quran verification'
        };
    }
  };

  const phaseInfo = getPhaseDisplay();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        maxWidth: '920px',
        margin: '0 auto',
        padding: '0.75rem 1rem',
        gap: '0.75rem',
        overflowY: 'auto',
        minHeight: 0
      }}
    >
      {/* 1. Top Control Bar: Voice Selector & Barge-In Mode */}
      <div
        className="debate-voice-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.65rem',
          padding: '0.65rem 0.9rem',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              backgroundColor: isConnected ? 'rgba(18, 168, 134, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isConnected ? 'var(--emerald-primary)' : 'var(--text-secondary)'
            }}
          >
            <Headphones size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                {isUrdu ? 'براہِ راست صوتی مناظرہ' : 'Live Voice Debate'}
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '6px',
                  backgroundColor: isConnected ? 'rgba(18, 168, 134, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  color: isConnected ? 'var(--emerald-primary)' : 'var(--text-muted)',
                  fontWeight: 600
                }}
              >
                gemini-3.8-live
              </span>
            </div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
              {isUrdu
                ? 'انگریزی، اردو، ہندی اور پنجابی میں قدرتی صوتی مکالمہ'
                : 'Spoken dialogue with local Tanzil Quran verification'}
            </div>
          </div>
        </div>

        {/* Mode & Voice Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Barge-in Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>
              {isUrdu ? 'طریقۂ کلام:' : 'Mode:'}
            </span>
            <button
              type="button"
              onClick={() => setBargeInMode('natural')}
              className="btn btn-ghost"
              style={{
                padding: '0.2rem 0.55rem',
                minHeight: '26px',
                fontSize: '0.72rem',
                borderRadius: '10px',
                backgroundColor: bargeInMode === 'natural' ? 'rgba(18, 168, 134, 0.15)' : 'transparent',
                color: bargeInMode === 'natural' ? 'var(--emerald-primary)' : 'var(--text-secondary)',
                border: bargeInMode === 'natural' ? '1px solid rgba(18, 168, 134, 0.35)' : '1px solid transparent',
                fontWeight: bargeInMode === 'natural' ? 600 : 400
              }}
              title={isUrdu ? 'قدرتی موڈ (طے شدہ): بول کر بھی روکا جا سکتا ہے' : 'Natural Mode (Default): Hands-free conversational barge-in; deliberate speech interrupts AI'}
            >
              <span>{isUrdu ? '🌿 قدرتی (طے شدہ)' : '🌿 Natural (Default)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setBargeInMode('protected')}
              className="btn btn-ghost"
              style={{
                padding: '0.2rem 0.55rem',
                minHeight: '26px',
                fontSize: '0.72rem',
                borderRadius: '10px',
                backgroundColor: bargeInMode === 'protected' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: bargeInMode === 'protected' ? '#3B82F6' : 'var(--text-secondary)',
                border: bargeInMode === 'protected' ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid transparent',
                fontWeight: bargeInMode === 'protected' ? 600 : 400
              }}
              title={isUrdu ? 'محفوظ موڈ (اختیاری): بات روکنے کے لیے صرف بٹن دبائیں' : 'Protected Mode (Optional): Uninterrupted turns, use Interrupt button'}
            >
              <span>{isUrdu ? '🛡️ محفوظ' : '🛡️ Protected'}</span>
            </button>
          </div>

          {/* Voice Selection Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginRight: '0.15rem' }}>
              {isUrdu ? 'لہجہ:' : 'Voice:'}
            </span>
            {(['Kore', 'Puck', 'Aoede', 'Charon'] as const).map((v) => (
              <button
                key={v}
                type="button"
                disabled={isConnected}
                onClick={() => handleVoiceChange(v)}
                className="btn btn-ghost"
                style={{
                  padding: '0.2rem 0.55rem',
                  minHeight: '26px',
                  fontSize: '0.72rem',
                  borderRadius: '10px',
                  backgroundColor: selectedVoice === v ? 'rgba(18, 168, 134, 0.15)' : 'transparent',
                  color: selectedVoice === v ? 'var(--emerald-primary)' : 'var(--text-secondary)',
                  border: selectedVoice === v ? '1px solid rgba(18, 168, 134, 0.35)' : '1px solid transparent',
                  fontWeight: selectedVoice === v ? 600 : 400
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.55rem 0.9rem',
            backgroundColor: 'var(--danger-badge-bg)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            color: 'var(--danger-badge-text)',
            fontSize: '0.825rem',
            flexShrink: 0
          }}
          className="animate-fade-in"
        >
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={clearError}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.2rem' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Visualizer Stage: Daleel Celestial Orb & Real-Time Phase Display */}
      <div
        className="debate-voice-stage"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem 0.9rem',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '18px',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
          minHeight: '130px',
          flexShrink: 0
        }}
      >
        {!isConnected && !isConnecting ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem' }}>
            <DaleelVoiceOrb
              phase="idle"
              isAISpeaking={false}
              isUserSpeaking={false}
              isMuted={false}
              isConnected={false}
              isConnecting={false}
              aiVolume={0}
              userVolume={0}
              bargeInMode={bargeInMode}
              size={120}
              onOrbClick={handleStart}
            />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isUrdu ? 'دلیلِ حق سے براہِ راست مناظرہ' : 'Start Live Voice Debate'}
              </h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.785rem', color: 'var(--text-secondary)' }}>
                {isUrdu
                  ? 'اپنا علمی یا قرآنی استدلال بولیں؛ دلیلِ حق فورا سن کر مدلل جواب دے گا'
                  : 'Speak your theological argument; Daleel-e-Haq verifies scripture and responds'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleStart}
                className="btn btn-primary"
                style={{ padding: '0.55rem 1.6rem', borderRadius: '24px', fontSize: '0.875rem', gap: '0.5rem' }}
              >
                <Play size={16} fill="currentColor" />
                <span>{isUrdu ? 'دلیلِ حق سے گفتگو شروع کریں' : 'Talk to Daleel-e-Haq'}</span>
              </button>
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={() => sessionStorage.removeItem('daleel_live_debate_turns')}
                  className="btn btn-secondary"
                  style={{ padding: '0.55rem 0.9rem', borderRadius: '24px', fontSize: '0.8rem', gap: '0.35rem' }}
                  title={isUrdu ? 'سابقہ ریکارڈ صاف کریں' : 'Clear prior turns'}
                >
                  <RotateCcw size={14} />
                  <span>{isUrdu ? 'نئی نشست' : 'New Session'}</span>
                </button>
              )}
            </div>
          </div>
        ) : isConnecting ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem' }}>
            <DaleelVoiceOrb
              phase="connecting"
              isAISpeaking={false}
              isUserSpeaking={false}
              isMuted={false}
              isConnected={false}
              isConnecting={true}
              aiVolume={0}
              userVolume={0}
              bargeInMode={bargeInMode}
              size={120}
            />
            <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              {isUrdu ? 'gemini-3.8-live سرور سے رابطہ قائم ہو رہا ہے...' : 'Connecting to gemini-3.8-live session...'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem', width: '100%' }}>
            {/* Audio Reactive Celestial Orb */}
            <DaleelVoiceOrb
              phase={phase}
              isAISpeaking={isAISpeaking}
              isUserSpeaking={isUserSpeaking}
              isMuted={isMuted}
              isConnected={isConnected}
              isConnecting={isConnecting}
              aiVolume={aiVolume}
              userVolume={userVolume}
              bargeInMode={bargeInMode}
              size={135}
              onToggleMute={toggleMute}
            />

            {/* Speaking Status Caption with distinct state descriptions */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: phaseInfo.badgeColor
                }}
              >
                {phaseInfo.badge}
              </div>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {phaseInfo.instruction}
              </div>
            </div>

            {/* Live Session Controls Bar */}
            <div
              className="debate-voice-controls"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem', flexWrap: 'wrap' }}
            >
              {/* Mute Button */}
              <button
                type="button"
                onClick={toggleMute}
                className="btn btn-secondary btn-icon"
                style={{
                  minHeight: '38px',
                  minWidth: '38px',
                  borderRadius: '50%',
                  backgroundColor: isMuted ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-elevated)',
                  color: isMuted ? '#EF4444' : 'var(--text-primary)',
                  border: isMuted ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-medium)'
                }}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>

              {/* Respond Now / Turn Complete Button */}
              <button
                type="button"
                disabled={isAISpeaking || phase === 'thinking'}
                onClick={finishTurnManual}
                className="btn btn-primary"
                style={{
                  minHeight: '38px',
                  padding: '0 1.05rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  gap: '0.45rem',
                  opacity: isAISpeaking || phase === 'thinking' ? 0.45 : 1
                }}
                title={isUrdu ? 'دلیل مکمل کر کے جواب طلب کریں' : 'Signal end of argument and request AI response'}
              >
                <Sparkles size={15} />
                <span>{isUrdu ? 'جواب طلب کریں' : 'Respond Now'}</span>
              </button>

              {/* Interrupt AI Button */}
              <button
                type="button"
                disabled={!isAISpeaking}
                onClick={interrupt}
                className="btn btn-secondary"
                style={{
                  minHeight: '38px',
                  padding: '0 0.95rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  gap: '0.4rem',
                  opacity: isAISpeaking ? 1 : 0.5
                }}
                title="Interrupt AI and take floor"
              >
                <Hand size={15} />
                <span>{isUrdu ? 'بات روکیں' : 'Interrupt'}</span>
              </button>

              {/* End Call / Finish Debate */}
              <button
                type="button"
                onClick={endSession}
                className="btn btn-secondary btn-icon"
                style={{
                  minHeight: '38px',
                  minWidth: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.35)'
                }}
                title="End live voice debate session and save transcript"
              >
                <PhoneOff size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Live Evidence Drawer (Collapsible) */}
      {liveEvidence.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '14px',
            border: '1px solid rgba(18, 168, 134, 0.3)',
            overflow: 'hidden',
            flexShrink: 0
          }}
          className="animate-fade-in"
        >
          <button
            type="button"
            onClick={() => setIsEvidenceDrawerOpen(!isEvidenceDrawerOpen)}
            style={{
              width: '100%',
              padding: '0.5rem 0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={15} color="var(--emerald-primary)" />
              <span>
                {isUrdu ? 'مستند قرآنی شواہد' : 'Verified Live Evidence'} ({liveEvidence.length})
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(18, 168, 134, 0.15)',
                  color: 'var(--emerald-primary)',
                  fontWeight: 600
                }}
              >
                Tanzil SQLite
              </span>
            </div>
            {isEvidenceDrawerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isEvidenceDrawerOpen && (
            <div
              style={{
                maxHeight: '180px',
                overflowY: 'auto',
                padding: '0.5rem 0.9rem',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}
            >
              {liveEvidence.map((ev, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.65rem 0.8rem',
                    backgroundColor: 'var(--bg-elevated)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.825rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--emerald-primary)', fontSize: '0.825rem' }}>
                      {ev.citation || `Surah ${ev.surah_name_en} (${ev.surah_number}:${ev.ayah_number})`}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '6px',
                        backgroundColor: ev.is_verified ? 'rgba(18, 168, 134, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: ev.is_verified ? 'var(--emerald-primary)' : '#F59E0B',
                        fontWeight: 600
                      }}
                    >
                      {ev.is_verified ? '✓ Verified Local' : 'Corpus Scope Notice'}
                    </span>
                  </div>

                  {ev.text_ar && (
                    <p
                      style={{
                        margin: '0.3rem 0',
                        fontSize: '1rem',
                        lineHeight: 1.6,
                        fontFamily: "'Amiri', 'Traditional Arabic', serif",
                        direction: 'rtl',
                        textAlign: 'right',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {ev.text_ar}
                    </p>
                  )}

                  {ev.translation_en && (
                    <p style={{ margin: '0.2rem 0', fontSize: '0.785rem', color: 'var(--text-secondary)' }}>
                      <strong>EN: </strong>{ev.translation_en}
                    </p>
                  )}

                  {ev.translation_ur && (
                    <p
                      style={{
                        margin: '0.2rem 0',
                        fontSize: '0.825rem',
                        color: 'var(--text-secondary)',
                        direction: 'rtl',
                        textAlign: 'right'
                      }}
                    >
                      <strong>اردو: </strong>{ev.translation_ur}
                    </p>
                  )}

                  {ev.limitation_disclosure && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.725rem', color: '#F59E0B', fontStyle: 'italic' }}>
                      {ev.limitation_disclosure}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Real-Time Dialogue Captions Stream (Container-Scoped Scrolling) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          minHeight: '120px'
        }}
      >
        <div
          style={{
            padding: '0.5rem 0.9rem',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '0.785rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <span>{isUrdu ? 'براہِ راست مکالماتی متن' : 'Live Dialogue Captions'}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {turns.length} {isUrdu ? 'اقوال' : 'turns'}
          </span>
        </div>

        <div
          ref={captionsContainerRef}
          onScroll={handleCaptionsScroll}
          role="log"
          aria-live="polite"
          aria-label={isUrdu ? 'براہِ راست مکالماتی متن' : 'Live Dialogue Captions'}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            minHeight: 0
          }}
        >
          {turns.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem', margin: 'auto' }}>
              {isConnected
                ? (isUrdu ? 'بولیں، مکالماتی متن یہاں براہ راست درج ہوگا...' : 'Speak now, captions will stream here live...')
                : (isUrdu ? 'صوتی مناظرہ شروع ہونے پر مکالمہ یہاں ظاہر ہوگا' : 'Live captions will display here during the conversation')}
            </div>
          ) : (
            turns.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: t.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '0.15rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  <span style={{ fontWeight: 600, color: t.role === 'user' ? 'var(--text-secondary)' : 'var(--emerald-primary)' }}>
                    {t.role === 'user' ? (isUrdu ? 'آپ' : 'You') : 'Daleel-e-Haq'}
                  </span>
                  <span>•</span>
                  <span>{t.timestamp}</span>
                </div>
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '0.55rem 0.85rem',
                    borderRadius: '13px',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    backgroundColor: t.role === 'user' ? 'var(--bg-elevated)' : 'rgba(18, 168, 134, 0.08)',
                    border: t.role === 'user' ? '1px solid var(--border-medium)' : '1px solid rgba(18, 168, 134, 0.25)',
                    color: 'var(--text-primary)',
                    direction: /[\u0600-\u06FF]/.test(t.text) ? 'rtl' : 'ltr',
                    textAlign: /[\u0600-\u06FF]/.test(t.text) ? 'right' : 'left'
                  }}
                >
                  {t.text}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
