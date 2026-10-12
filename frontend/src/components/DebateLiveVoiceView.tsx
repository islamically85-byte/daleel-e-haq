import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Hand,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Play,
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

  const {
    isConnected,
    isConnecting,
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

  const captionsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const handleStart = () => {
    startSession(selectedVoice, language === 'ur' ? 'ur' : 'auto');
  };

  const handleVoiceChange = (v: 'Kore' | 'Puck' | 'Aoede' | 'Charon') => {
    setSelectedVoice(v);
    voicePreferences.set({ voice: v });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        padding: '1.25rem 1rem',
        gap: '1rem',
        overflow: 'hidden'
      }}
    >
      {/* Top Header & Voice Selector Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)'
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
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {isUrdu ? 'براہِ راست صوتی مناظرہ' : 'Live Voice-to-Voice Debate'}
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
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
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {isUrdu
                ? 'انگریزی، اردو، ہندی اور پنجابی میں قدرتی صوتی مکالمہ'
                : 'Spoken dialogue across English, Urdu, Hindi & Punjabi'}
            </div>
          </div>
        </div>

        {/* Controls Section: Barge-in Mode & Voice Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          {/* Barge-in Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>
              {isUrdu ? 'کلام موڈ:' : 'Barge-in:'}
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
              title={isUrdu ? 'قدرتی کلام: مستقل آواز سے بات روکی جا سکتی ہے، وقتی شور فلٹر ہوگا' : 'Natural: Sustained human voice can interrupt assistant'}
            >
              <span>{isUrdu ? '🌿 قدرتی' : '🌿 Natural'}</span>
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
              title={isUrdu ? 'محفوظ موڈ: خودکار مداخلت بند؛ بات روکنے کے لیے صرف بٹن دبائیں' : 'Protected: No auto-interruption; use Interrupt button'}
            >
              <span>{isUrdu ? '🛡️ محفوظ' : '🛡️ Protected'}</span>
            </button>
          </div>

          {/* Voice Selection Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>
              {isUrdu ? 'آواز:' : 'Voice:'}
            </span>
            {(['Kore', 'Puck', 'Aoede', 'Charon'] as const).map((v) => (
              <button
                key={v}
                type="button"
                disabled={isConnected}
                onClick={() => handleVoiceChange(v)}
                className="btn btn-ghost"
                style={{
                  padding: '0.25rem 0.6rem',
                  minHeight: '28px',
                  fontSize: '0.75rem',
                  borderRadius: '12px',
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
            padding: '0.65rem 1rem',
            backgroundColor: 'var(--danger-badge-bg)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            color: 'var(--danger-badge-text)',
            fontSize: '0.85rem'
          }}
          className="animate-fade-in"
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
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

      {/* Center Dual Audio Visualizer Stage */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
          minHeight: '210px'
        }}
      >
        {!isConnected && !isConnecting ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
            <DaleelVoiceOrb
              isAISpeaking={false}
              isUserSpeaking={false}
              isMuted={false}
              isConnected={false}
              isConnecting={false}
              aiVolume={0}
              userVolume={0}
              bargeInMode={bargeInMode}
              size={140}
            />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isUrdu ? 'صوتی مناظرہ شروع کریں' : 'Start Live Voice Debate'}
              </h3>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                {isUrdu
                  ? 'اپنا علمی یا قرآنی استدلال بولیں، دلیلِ حق فورا سن کر مدلل جواب دے گا'
                  : 'Speak your argument naturally; Daleel-e-Haq listens and responds with spoken evidence'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="btn btn-primary"
              style={{ padding: '0.65rem 1.75rem', borderRadius: '24px', fontSize: '0.9rem', gap: '0.5rem' }}
            >
              <Play size={16} fill="currentColor" />
              <span>{isUrdu ? 'گفتگو کا آغاز کریں' : 'Connect & Speak'}</span>
            </button>
          </div>
        ) : isConnecting ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
            <DaleelVoiceOrb
              isAISpeaking={false}
              isUserSpeaking={false}
              isMuted={false}
              isConnected={false}
              isConnecting={true}
              aiVolume={0}
              userVolume={0}
              bargeInMode={bargeInMode}
              size={150}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {isUrdu ? 'gemini-3.8-live سرور سے رابطہ قائم ہو رہا ہے...' : 'Connecting to gemini-3.8-live session...'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
            {/* Audio Reactive Daleel Voice Globe */}
            <DaleelVoiceOrb
              isAISpeaking={isAISpeaking}
              isUserSpeaking={isUserSpeaking}
              isMuted={isMuted}
              isConnected={isConnected}
              isConnecting={isConnecting}
              aiVolume={aiVolume}
              userVolume={userVolume}
              bargeInMode={bargeInMode}
              size={175}
              onToggleMute={toggleMute}
            />


            {/* Speaking Status Caption with distinct state descriptions */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: isMuted
                    ? '#EF4444'
                    : isAISpeaking
                      ? 'var(--emerald-primary)'
                      : isUserSpeaking
                        ? '#3B82F6'
                        : 'var(--text-secondary)'
                }}
              >
                {isMuted
                  ? (isUrdu ? 'مائیکروفون بند ہے (Muted)' : 'Microphone Muted')
                  : isAISpeaking
                    ? (isUrdu ? 'دلیلِ حق گفتگو کر رہا ہے...' : 'Daleel-e-Haq is speaking...')
                    : isUserSpeaking
                      ? (isUrdu ? 'آپ کا استدلال سنا جا رہا ہے...' : 'Listening to your argument...')
                      : (isUrdu ? 'دونوں فریق تیار ہیں، اطمینان سے گفتگو جاری رکھیں' : 'Live conversation ready. Speak whenever you want.')}
              </div>
              <div style={{ fontSize: '0.735rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {isMuted
                  ? (isUrdu ? 'بولنے کے لیے نیچے مائیک آن کریں۔ بند حالت میں کوئی آواز نہیں جائے گی' : 'Click Unmute below to speak. Muted speech is fully gated.')
                  : isAISpeaking
                    ? bargeInMode === 'natural'
                      ? (isUrdu ? 'قدرتی کلام: آپ بول کر گفتگو کو نیا رخ دے سکتے ہیں' : 'Natural barge-in: Speak clearly to take the floor')
                      : (isUrdu ? 'محفوظ موڈ: بات روکنے کے لیے نیچے "بات روکیں" دبائیں' : 'Protected mode: Tap Interrupt below to take the floor')
                    : isUserSpeaking
                      ? (isUrdu ? 'دلیل مکمل ہونے پر خودکار جواب آئے گا یا "جواب طلب کریں" دبائیں' : 'Thinking pauses allowed; or tap Respond Now when ready')
                      : (isUrdu ? 'علمی مباحثے کے لیے قدرتی وقفوں کی گنجائش موجود ہے' : 'Thoughtful debate with natural thinking pauses allowed')}
              </div>
            </div>

            {/* Live Session Controls Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
              {/* Mute Button */}
              <button
                type="button"
                onClick={toggleMute}
                className="btn btn-secondary btn-icon"
                style={{
                  minHeight: '40px',
                  minWidth: '40px',
                  borderRadius: '50%',
                  backgroundColor: isMuted ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-elevated)',
                  color: isMuted ? '#EF4444' : 'var(--text-primary)',
                  border: isMuted ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-medium)'
                }}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              {/* Respond Now / Turn Complete Button */}
              <button
                type="button"
                disabled={isAISpeaking}
                onClick={finishTurnManual}
                className="btn btn-primary"
                style={{
                  minHeight: '40px',
                  padding: '0 1.15rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  gap: '0.45rem',
                  opacity: isAISpeaking ? 0.45 : 1
                }}
                title={isUrdu ? 'دلیل مکمل کر کے جواب طلب کریں' : 'Signal end of argument and request AI voice response'}
              >
                <Sparkles size={16} />
                <span>{isUrdu ? 'جواب طلب کریں' : 'Respond Now'}</span>
              </button>

              {/* Interrupt AI Button */}
              <button
                type="button"
                disabled={!isAISpeaking}
                onClick={interrupt}
                className="btn btn-secondary"
                style={{
                  minHeight: '40px',
                  padding: '0 1rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  gap: '0.4rem',
                  opacity: isAISpeaking ? 1 : 0.5
                }}
                title="Interrupt AI speaking"
              >
                <Hand size={16} />
                <span>{isUrdu ? 'بات روکیں' : 'Interrupt'}</span>
              </button>

              {/* End Call / Finish Debate */}
              <button
                type="button"
                onClick={endSession}
                className="btn btn-secondary btn-icon"
                style={{
                  minHeight: '40px',
                  minWidth: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.35)'
                }}
                title="End live voice debate session and save transcript"
              >
                <PhoneOff size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Real-Time Dialogue Captions Stream */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          minHeight: '160px'
        }}
      >
        <div
          style={{
            padding: '0.6rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>{isUrdu ? 'براہِ راست مکالماتی متن' : 'Live Dialogue Captions'}</span>
          <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
            {turns.length} {isUrdu ? 'اقوال' : 'turns recorded'}
          </span>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
          }}
        >
          {turns.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem', margin: 'auto' }}>
              {isConnected
                ? (isUrdu ? 'بولیں، مکالماتی متن یہاں براہ راست درج ہوگا...' : 'Speak now, captions will appear here live...')
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
                  gap: '0.2rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span style={{ fontWeight: 600, color: t.role === 'user' ? 'var(--text-secondary)' : 'var(--emerald-primary)' }}>
                    {t.role === 'user' ? (isUrdu ? 'آپ' : 'You') : 'Daleel-e-Haq'}
                  </span>
                  <span>•</span>
                  <span>{t.timestamp}</span>
                </div>
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '14px',
                    fontSize: '0.875rem',
                    lineHeight: 1.55,
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
          <div ref={captionsEndRef} />
        </div>
      </div>
    </div>
  );
};
