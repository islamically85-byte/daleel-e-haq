import React, { useState, useEffect, useRef } from 'react';
import { Check, Headphones, Mic, Play, Square, X } from 'lucide-react';
import { api } from '../services/api';
import { voicePreferences } from '../services/voicePreferences';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  language?: 'en' | 'ur';
  onCompleted?: () => void;
}

export const VoiceOnboardingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  language = 'en',
  onCompleted
}) => {
  const isUrdu = language === 'ur';

  const [selectedVoice, setSelectedVoice] = useState<'Kore' | 'Puck' | 'Aoede' | 'Charon'>('Kore');
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'ur'>(language);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize with persisted preference
  useEffect(() => {
    if (isOpen) {
      const current = voicePreferences.get();
      setSelectedVoice(current.voice);
      setSelectedLanguage(current.language);
    }
  }, [isOpen]);

  // Clean up audio on modal close
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const voices = [
    {
      id: 'Kore' as const,
      name: 'Kore',
      genderEn: 'Female',
      genderUr: 'خاتون',
      descEn: 'Calm, contemplative, and balanced',
      descUr: 'پرسکون، سنجیدہ اور متوازن لہجہ'
    },
    {
      id: 'Puck' as const,
      name: 'Puck',
      genderEn: 'Male',
      genderUr: 'مرد',
      descEn: 'Crisp, energetic, and articulate',
      descUr: 'واضح، پرجوش اور بااثر لہجہ'
    },
    {
      id: 'Aoede' as const,
      name: 'Aoede',
      genderEn: 'Female',
      genderUr: 'خاتون',
      descEn: 'Melodic, expressive, and clear',
      descUr: 'مترنم، تاثراتی اور فصیح آواز'
    },
    {
      id: 'Charon' as const,
      name: 'Charon',
      genderEn: 'Male',
      genderUr: 'مرد',
      descEn: 'Deep, authoritative, and steady',
      descUr: 'گھمبیر، باوقار اور متین لہجہ'
    }
  ];

  const handleTogglePreview = (voiceId: string) => {
    if (previewingVoice === voiceId) {
      // Stop current preview
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      setPreviewingVoice(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const previewUrl = api.getVoicePreviewUrl(voiceId);
    const audio = new Audio(previewUrl);
    previewAudioRef.current = audio;

    audio.onended = () => {
      setPreviewingVoice(null);
    };
    audio.onerror = () => {
      setPreviewingVoice(null);
    };

    setPreviewingVoice(voiceId);
    audio.play().catch(() => {
      setPreviewingVoice(null);
    });
  };

  const handleSaveAndContinue = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    voicePreferences.set({
      voice: selectedVoice,
      language: selectedLanguage,
      onboardingCompleted: true
    });
    if (onCompleted) onCompleted();
    onClose();
  };

  const handleSkip = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    voicePreferences.setOnboardingCompleted(true);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1.25rem'
      }}
      className="animate-fade-in"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-medium)',
          borderRadius: '24px',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-elevated)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          direction: isUrdu ? 'rtl' : 'ltr',
          textAlign: isUrdu ? 'right' : 'left'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                backgroundColor: 'rgba(18, 168, 134, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--emerald-primary)'
              }}
            >
              <Headphones size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {isUrdu ? 'دلیلِ حق صوتی سیٹ اپ' : 'Daleel-e-Haq Voice Setup'}
              </h3>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                {isUrdu ? 'پسندیدہ صوتی انداز اور زبان کا انتخاب' : 'Select your voice identity and preferred language'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--text-muted)', minHeight: '32px', minWidth: '32px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Microphone Permission Notice */}
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(18, 168, 134, 0.08)',
            border: '1px solid rgba(18, 168, 134, 0.22)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.825rem',
            color: 'var(--text-primary)'
          }}
        >
          <Mic size={16} color="var(--emerald-primary)" style={{ flexShrink: 0 }} />
          <span>
            {isUrdu
              ? 'مائیکروفون کی اجازت صرف صوتی املا اور مکالمے کے لیے درکار ہوتی ہے۔ آپ کی آواز کا ڈیٹا مستقل محفوظ نہیں کیا جاتا۔'
              : 'Microphone permission is requested solely for live voice interactions and is never permanently stored without consent.'}
          </span>
        </div>

        {/* Voice Selection Cards */}
        <div>
          <span
            style={{
              fontSize: '0.775rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              display: 'block',
              marginBottom: '0.65rem'
            }}
          >
            {isUrdu ? 'دستیاب آوازیں (Gemini Voices):' : 'Available Gemini Voices:'}
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            {voices.map((v) => {
              const isSelected = selectedVoice === v.id;
              const isPreviewing = previewingVoice === v.id;

              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isSelected ? 'rgba(18, 168, 134, 0.12)' : 'var(--bg-surface)',
                    border: isSelected ? '1px solid var(--emerald-primary)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {v.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px'
                        }}
                      >
                        {isUrdu ? v.genderUr : v.genderEn}
                      </span>
                    </div>

                    {/* Preview Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePreview(v.id);
                      }}
                      className="btn btn-ghost btn-icon"
                      style={{
                        minHeight: '28px',
                        minWidth: '28px',
                        padding: '0.25rem',
                        backgroundColor: isPreviewing ? 'var(--emerald-primary)' : 'rgba(255, 255, 255, 0.06)',
                        color: isPreviewing ? '#05231B' : 'var(--text-primary)'
                      }}
                      title={isPreviewing ? 'Stop preview' : 'Play voice preview'}
                    >
                      {isPreviewing ? <Square size={12} fill="currentColor" /> : <Play size={12} />}
                    </button>
                  </div>

                  <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {isUrdu ? v.descUr : v.descEn}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preferred Language Radio */}
        <div>
          <span
            style={{
              fontSize: '0.775rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              display: 'block',
              marginBottom: '0.5rem'
            }}
          >
            {isUrdu ? 'ترجیحی زبان:' : 'Preferred Language:'}
          </span>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                color: 'var(--text-primary)'
              }}
            >
              <input
                type="radio"
                name="voice_lang"
                checked={selectedLanguage === 'en'}
                onChange={() => setSelectedLanguage('en')}
                style={{ accentColor: 'var(--emerald-primary)' }}
              />
              <span>English</span>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                color: 'var(--text-primary)'
              }}
            >
              <input
                type="radio"
                name="voice_lang"
                checked={selectedLanguage === 'ur'}
                onChange={() => setSelectedLanguage('ur')}
                style={{ accentColor: 'var(--emerald-primary)' }}
              />
              <span>اردو (Urdu)</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
          <button
            onClick={handleSkip}
            className="btn btn-ghost"
            style={{ fontSize: '0.85rem' }}
          >
            {isUrdu ? 'بعد میں منتخب کریں' : 'Skip / Later'}
          </button>

          <button
            onClick={handleSaveAndContinue}
            className="btn btn-primary"
            style={{ padding: '0.55rem 1.25rem', borderRadius: 'var(--radius-sm)' }}
          >
            <Check size={16} />
            <span>{isUrdu ? 'محفوظ کریں اور جاری رکھیں' : 'Save & Continue'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
