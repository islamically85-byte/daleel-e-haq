import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Headphones,
  Image as ImageIcon,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  X
} from 'lucide-react';
import { api } from '../services/api';
import type { Message, ChatResponse } from '../types/api';
import { EvidenceCard } from '../components/EvidenceCard';
import { FormattedResponse } from '../components/FormattedResponse';
import { useDictation } from '../hooks/useDictation';
import { AudioPlayerControl } from '../components/AudioPlayerControl';
import { VoiceOnboardingModal } from '../components/VoiceOnboardingModal';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { voicePreferences } from '../services/voicePreferences';

interface Props {
  language: 'en' | 'ur';
  activeConvId: string | null;
  onActiveConvChange: (id: string | null) => void;
  onConversationsUpdated?: () => void;
  onOpenLiveVoice?: () => void;
}

export const AskPage: React.FC<Props> = ({
  language,
  activeConvId,
  onActiveConvChange,
  onConversationsUpdated,
  onOpenLiveVoice
}) => {
  const isUrdu = language === 'ur';

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Image attachment state
  const [selectedImage, setSelectedImage] = useState<{
    base64: string;
    mimeType: string;
    preview: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Smart Multilingual Dictation Engine
  const isSubmittingRef = useRef(false);
  const [originalSpokenTranscript, setOriginalSpokenTranscript] = useState<string | null>(null);
  const [dictationNotice, setDictationNotice] = useState<string | null>(null);

  const {
    isDictating,
    isConnecting: isDictationConnecting,
    isProcessing: isDictationProcessing,
    interimText: dictationInterim,
    volume: dictationVolume,
    error: dictationError,
    startDictation,
    stopDictation,
    finishDictation,
    cancelDictation,
    clearError: clearDictationError
  } = useDictation({
    language,
    initialText: inputQuestion,
    onTranscriptUpdate: (newText) => {
      setInputQuestion(newText);
    }
  });

  const handleDictationDoneAndSend = async () => {
    if (isSubmittingRef.current || isDictationProcessing) return;
    try {
      setDictationNotice(null);
      const rawTranscript = await finishDictation();
      const trimmed = rawTranscript.trim();
      if (!trimmed) return;

      setOriginalSpokenTranscript(trimmed);

      // Smart Multilingual Normalization
      const normRes = await api.normalizeDictatedTranscript({
        transcript: trimmed,
        user_preferred_language: language
      });

      const finalText = normRes.normalized_text?.trim() || trimmed;

      if (!normRes.is_uncertain) {
        setInputQuestion('');
        await handleSend(finalText);
      } else {
        setInputQuestion(finalText);
        setDictationNotice(
          isUrdu
            ? 'صوتی پیغام مرتب ہو گیا ہے، براہ کرم ارسال سے قبل جائزہ لیں۔'
            : 'Transcribed message ready. Please review and edit before sending.'
        );
        textareaRef.current?.focus();
      }
    } catch (err: any) {
      console.warn('Smart dictation send error:', err);
      textareaRef.current?.focus();
    }
  };

  const handleDictationReviewAndEdit = async () => {
    if (isDictationProcessing) return;
    try {
      setDictationNotice(null);
      const rawTranscript = await finishDictation();
      const trimmed = rawTranscript.trim();
      if (!trimmed) return;

      setOriginalSpokenTranscript(trimmed);

      const normRes = await api.normalizeDictatedTranscript({
        transcript: trimmed,
        user_preferred_language: language
      });

      const finalText = normRes.normalized_text?.trim() || trimmed;
      setInputQuestion(finalText);
      textareaRef.current?.focus();
    } catch {
      textareaRef.current?.focus();
    }
  };

  const handleRestoreOriginalTranscript = () => {
    if (originalSpokenTranscript) {
      setInputQuestion(originalSpokenTranscript);
      setOriginalSpokenTranscript(null);
      setDictationNotice(null);
      textareaRef.current?.focus();
    }
  };

  // Milestone C: Real Audio Playback & Voice Selection
  const audioPlayback = useAudioPlayback();
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(() => voicePreferences.getSelectedVoice());

  const handleVoiceOnboardingCompleted = () => {
    setSelectedVoiceName(voicePreferences.getSelectedVoice());
  };

  const handleOpenVoice = () => {
    if (voicePreferences.get().onboardingCompleted && onOpenLiveVoice) {
      onOpenLiveVoice();
    } else {
      setIsVoiceModalOpen(true);
    }
  };

  // Curated scripture research suggestions for the welcome screen
  const samplePrompts = [
    {
      topicEn: 'Monotheism (Tawhid)',
      topicUr: 'توحیدِ باری تعالیٰ',
      en: 'What is the scripture evidence regarding divine oneness in Surah Al-Ikhlas (112:1)?',
      ur: 'سورۃ الاخلاص (112:1) میں توحیدِ باری تعالیٰ کا کیا واضح قرآنی ثبوت ہے؟'
    },
    {
      topicEn: 'Patience (Sabr)',
      topicUr: 'صبر و استقامت',
      en: 'What guidance does the Quran provide regarding patience (Sabr) during trials?',
      ur: 'صبر اور ثابت قدمی کے بارے میں قرآنِ کریم کے کیا واضح احکامات ہیں؟'
    },
    {
      topicEn: 'Divine Sovereignty',
      topicUr: 'حاکمیتِ الٰہی',
      en: 'Show the verified evidence in Ayat al-Kursi (2:255) regarding divine sovereignty.',
      ur: 'آیت الکرسی (2:255) میں اللہ تعالیٰ کی حاکمیت اور صفات کے قرآنی دلائل بتائیں۔'
    },
    {
      topicEn: 'Justice & Testimony',
      topicUr: 'عدل و انصاف',
      en: 'What does the Quran command regarding justice and truth in Surah An-Nisa (4:135)?',
      ur: 'عدل و انصاف اور سچی گواہی کے متعلق سورۃ النساء (4:135) کا کیا حکم ہے؟'
    }
  ];

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 44), 160)}px`;
    }
  }, [inputQuestion]);

  // Load conversation when activeConvId changes
  useEffect(() => {
    audioPlayback.stop();
    if (activeConvId) {
      loadActiveConversation(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId]);

  // Scroll to bottom on new messages or loading state
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadActiveConversation = async (id: string) => {
    try {
      const conv = await api.getConversation(id);
      setMessages(conv.messages || []);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(`Failed to load conversation: ${e.message}`);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(isUrdu ? 'تصویر کا سائز 5MB سے کم ہونا چاہیے۔' : 'Image file size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setSelectedImage({
        base64: base64Data,
        mimeType: file.type,
        preview: result
      });
    };
    reader.readAsDataURL(file);
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const handleSend = async (customPrompt?: string) => {
    const query = (customPrompt || inputQuestion).trim();
    if (!query || isLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    audioPlayback.stop();
    setInputQuestion('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
    setErrorMsg(null);
    setIsLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp_${Date.now()}`,
      conversation_id: activeConvId || '',
      role: 'user',
      content: query,
      language: language,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response: ChatResponse = await api.sendChatMessage(
        {
          question: query,
          conversation_id: activeConvId || undefined,
          language: language,
          image_base64: selectedImage?.base64,
          image_mime_type: selectedImage?.mimeType
        },
        abortController.signal
      );

      setSelectedImage(null);

      // Assistant message
      const asstMsg: Message = {
        id: response.assistant_message_id,
        conversation_id: response.conversation_id,
        role: 'assistant',
        content: response.direct_answer,
        language: response.language,
        created_at: new Date().toISOString(),
        evidence_citations: response.evidence_cards,
        has_unverified_claims: Boolean(response.has_unverified_claims),
        unverified_reason: response.limitations
      };

      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), tempUserMsg, asstMsg]);

      if (!activeConvId || activeConvId !== response.conversation_id) {
        onActiveConvChange(response.conversation_id);
      }
      if (onConversationsUpdated) {
        onConversationsUpdated();
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // User aborted, keep what we have
        return;
      }
      setErrorMsg(e.message || (isUrdu ? 'سرور سے رابطہ ممکن نہیں ہو سکا۔' : 'Failed to communicate with AI engine'));
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const handleRegenerate = () => {
    // Find last user question
    const userMsgs = messages.filter((m) => m.role === 'user');
    if (userMsgs.length > 0) {
      const lastUserQuestion = userMsgs[userMsgs.length - 1].content;
      handleSend(lastUserQuestion);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-base)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Scrollable Conversation Stream */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem 1rem 1rem',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            maxWidth: 'var(--content-max-width)',
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.75rem',
            paddingBottom: '1rem'
          }}
        >
          {/* Empty Conversation Welcome State */}
          {messages.length === 0 && (
            <div
              className="animate-fade-in"
              style={{
                textAlign: 'center',
                padding: '4rem 1.5rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                margin: 'auto 0'
              }}
            >
              {/* Refined Daleel-e-Haq Emblem */}
              <div
                style={{
                  width: '58px',
                  height: '58px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, rgba(18, 168, 134, 0.2), rgba(11, 99, 80, 0.45))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--emerald-primary)',
                  marginBottom: '1.25rem',
                  border: '1px solid rgba(18, 168, 134, 0.35)',
                  boxShadow: 'var(--shadow-emerald)'
                }}
              >
                <Sparkles size={28} />
              </div>

              <h2
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  marginBottom: '0.4rem',
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em'
                }}
              >
                {isUrdu ? 'دلیلِ حق — برہان قبل از بیان' : 'Daleel-e-Haq'}
              </h2>

              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.975rem',
                  marginBottom: '2.5rem',
                  maxWidth: '560px',
                  lineHeight: 1.65
                }}
              >
                {isUrdu
                  ? 'مستند قرآنی و حدیثی مصادر پر مبنی تحقیقی ریسرچ۔ ہر دعوے کے ساتھ تصدیق شدہ شواہد اور اصل کلمات پیش کیے جاتے ہیں۔'
                  : 'Evidence Before Assertion. Ask questions grounded in canonical Quranic verses and approved theological sources.'}
              </p>

              {/* Sample Research Topics Grid */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '720px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '0.75rem'
                }}
              >
                {samplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(isUrdu ? p.ur : p.en)}
                    className="suggestion-chip"
                    style={{
                      textAlign: isUrdu ? 'right' : 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem'
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--emerald-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}
                    >
                      {isUrdu ? p.topicUr : p.topicEn}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                      {isUrdu ? p.ur : p.en}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages Stream */}
          {messages.map((m, index) => {
            const isUser = m.role === 'user';
            const isLastAssistant = !isUser && index === messages.length - 1;

            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: isUser ? (isUrdu ? 'flex-start' : 'flex-end') : 'stretch',
                  maxWidth: isUser ? '80%' : '100%',
                  width: isUser ? 'fit-content' : '100%'
                }}
                className="animate-fade-in"
              >
                {/* User Message Bubble */}
                {isUser ? (
                  <div
                    style={{
                      padding: '0.85rem 1.25rem',
                      borderRadius: '18px',
                      backgroundColor: 'var(--bg-user-bubble)',
                      border: '1px solid var(--border-medium)',
                      color: 'var(--text-primary)',
                      fontSize: '0.975rem',
                      lineHeight: 1.6,
                      direction: m.language === 'ur' ? 'rtl' : 'ltr',
                      textAlign: m.language === 'ur' ? 'right' : 'left',
                      fontFamily: m.language === 'ur' ? 'var(--font-urdu), var(--font-sans)' : 'inherit',
                      boxShadow: 'var(--shadow-subtle)'
                    }}
                  >
                    {m.content}
                  </div>
                ) : (
                  /* Assistant Message: Natural Canvas Flow */
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '0.5rem 0',
                      color: 'var(--text-primary)',
                      position: 'relative'
                    }}
                  >
                    {/* Header Action Bar */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.75rem',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--emerald-badge-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--emerald-primary)'
                          }}
                        >
                          <Sparkles size={12} />
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {isUrdu ? 'دلیلِ حق' : 'Daleel-e-Haq'}
                        </span>
                        <span>•</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {isUrdu ? 'تحقیقی استدلال' : 'Evidence-Grounded'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {/* Audio Speech Playback (Milestone C) */}
                        <AudioPlayerControl
                          messageId={m.id}
                          text={m.content}
                          language={m.language === 'ur' || isUrdu ? 'ur' : 'en'}
                          activeMessageId={audioPlayback.activeMessageId}
                          isPlaying={audioPlayback.isPlaying}
                          isPaused={audioPlayback.isPaused}
                          isLoading={audioPlayback.isLoading}
                          currentTime={audioPlayback.currentTime}
                          duration={audioPlayback.duration}
                          intensity={audioPlayback.intensity}
                          onPlay={(id, text) =>
                            audioPlayback.play(id, text, undefined, m.language === 'ur' || isUrdu ? 'ur' : 'en')
                          }
                          onPause={audioPlayback.pause}
                          onResume={audioPlayback.resume}
                          onStop={audioPlayback.stop}
                        />

                        {/* Copy Answer Button */}
                        <button
                          onClick={() => handleCopyMessage(m.id, m.content)}
                          className="btn btn-ghost"
                          style={{
                            padding: '0.25rem 0.5rem',
                            minHeight: '28px',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)'
                          }}
                          title="Copy answer"
                        >
                          {copiedId === m.id ? (
                            <>
                              <Check size={13} color="var(--emerald-primary)" />
                              <span style={{ color: 'var(--emerald-primary)' }}>
                                {isUrdu ? 'کاپی شدہ' : 'Copied'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>{isUrdu ? 'کاپی' : 'Copy'}</span>
                            </>
                          )}
                        </button>

                        {/* Regenerate Button on last assistant response */}
                        {isLastAssistant && !isLoading && (
                          <button
                            onClick={handleRegenerate}
                            className="btn btn-ghost"
                            style={{
                              padding: '0.25rem 0.5rem',
                              minHeight: '28px',
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)'
                            }}
                            title="Regenerate answer"
                          >
                            <RotateCcw size={13} />
                            <span>{isUrdu ? 'دوبارہ' : 'Retry'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Structured Markdown / Prose Response */}
                    <div style={{ padding: '0.25rem 0' }}>
                      <FormattedResponse content={m.content} isUrdu={m.language === 'ur'} />
                    </div>

                    {/* Unverified Disclaimer Banner */}
                    {Boolean(m.has_unverified_claims) && (
                      <div
                        style={{
                          marginTop: '1rem',
                          padding: '0.75rem 1rem',
                          backgroundColor: 'var(--gold-badge-bg)',
                          border: '1px solid rgba(229, 168, 59, 0.3)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.65rem',
                          fontSize: '0.85rem',
                          color: 'var(--gold-badge-text)',
                          lineHeight: 1.55
                        }}
                      >
                        <ShieldAlert size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ flex: 1 }}>
                          <strong>{isUrdu ? 'وضاحت برائے تصدیق:' : 'Verification Boundary Notice:'}</strong>
                          <p style={{ marginTop: '0.2rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                            {m.unverified_reason ||
                              (isUrdu
                                ? 'اس جواب میں بیان کردہ بعض نکات کی براہ راست تصدیق مقامی منظور شدہ قرآنی و حدیثی ڈیٹابیس میں دستیاب نہیں ہے۔'
                                : 'Some assertions could not be completely matched to the local verified scripture corpus.')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Evidence Citations Section */}
                    {m.evidence_citations && m.evidence_citations.length > 0 && (
                      <div
                        style={{
                          marginTop: '1.25rem',
                          paddingTop: '1rem',
                          borderTop: '1px solid var(--border-subtle)'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.775rem',
                            fontWeight: 600,
                            color: 'var(--emerald-badge-text)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            marginBottom: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                          }}
                        >
                          <Sparkles size={14} />
                          <span>
                            {isUrdu
                              ? `تصدیق شدہ قرآنی و حدیثی دلائل (${m.evidence_citations.length})`
                              : `Verified Scripture Citations (${m.evidence_citations.length})`}
                          </span>
                        </div>

                        {m.evidence_citations.map((card, idx) => (
                          <EvidenceCard key={idx} evidence={card} language={language} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                padding: '0.9rem 1.25rem',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                maxWidth: '400px',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-subtle)'
              }}
              className="animate-fade-in"
            >
              <div className="spinner" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {isUrdu ? 'دلائل کی جانچ اور استدلال...' : 'Reasoning & Verifying Scripture...'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isUrdu ? 'مقامی آیات اور مستند تفاسیر سے تقابل جاری ہے' : 'Cross-referencing local Quranic records'}
                </span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1.25rem',
                backgroundColor: 'var(--danger-badge-bg)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--danger-badge-text)',
                fontSize: '0.875rem'
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{errorMsg}</span>
              <button
                onClick={() => setErrorMsg(null)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={15} />
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating / Docked Responsive Message Composer */}
      <div
        style={{
          padding: '0.85rem 1.25rem 1.25rem',
          backgroundColor: 'transparent',
          position: 'relative'
        }}
      >
        <div
          style={{
            maxWidth: 'var(--content-max-width)',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}
        >
          {/* Image Attachment Preview */}
          {selectedImage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.45rem 0.85rem',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                width: 'fit-content',
                border: '1px solid var(--border-medium)'
              }}
            >
              <img
                src={selectedImage.preview}
                alt="Attached scripture or claim"
                style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px' }}
              />
              <span style={{ fontSize: '0.775rem', color: 'var(--text-primary)' }}>
                {isUrdu ? 'تصویر منسلک ہے' : 'Image attached for theological claim analysis'}
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                title="Remove image"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Dictation Error Notification */}
          {dictationError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 1rem',
                backgroundColor: 'var(--danger-badge-bg)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--danger-badge-text)',
                fontSize: '0.85rem'
              }}
              className="animate-fade-in"
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{dictationError}</span>
              <button
                type="button"
                onClick={clearDictationError}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Audio Playback Error Notification */}
          {audioPlayback.error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 1rem',
                backgroundColor: 'var(--danger-badge-bg)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--danger-badge-text)',
                fontSize: '0.85rem'
              }}
              className="animate-fade-in"
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{audioPlayback.error}</span>
              <button
                type="button"
                onClick={audioPlayback.stop}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Composer Outer Container */}
          <div
            style={{
              backgroundColor: 'var(--bg-composer)',
              borderRadius: '24px',
              border: isDictating ? '1px solid rgba(18, 168, 134, 0.45)' : '1px solid var(--border-medium)',
              boxShadow: isDictating ? '0 0 16px rgba(18, 168, 134, 0.18)' : 'var(--shadow-elevated)',
              padding: '0.5rem 0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              transition: 'all var(--transition-fast)'
            }}
          >
            {/* Live Dictation Active Ribbon */}
            {(isDictating || isDictationConnecting) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.45rem 0.85rem',
                  backgroundColor: 'rgba(18, 168, 134, 0.12)',
                  borderRadius: '16px',
                  border: '1px solid rgba(18, 168, 134, 0.25)',
                  marginBottom: '0.2rem'
                }}
                className="animate-fade-in"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      backgroundColor: isDictationConnecting ? '#F59E0B' : '#EF4444',
                      boxShadow: isDictationConnecting ? '0 0 8px #F59E0B' : '0 0 8px #EF4444'
                    }}
                  />
                  {/* Dynamic Audio Reactive Waveform Mini-bars */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '16px' }}>
                    {[0.6, 1.0, 0.75, 0.45].map((factor, i) => (
                      <div
                        key={i}
                        style={{
                          width: '3px',
                          borderRadius: '2px',
                          backgroundColor: 'var(--emerald-primary)',
                          height: `${Math.max(3, Math.round(dictationVolume * 16 * factor))}px`,
                          transition: 'height 80ms ease'
                        }}
                      />
                    ))}
                  </div>

                  <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {isDictationConnecting
                      ? (isUrdu ? 'صوتی سرور سے رابطہ ہو رہا ہے...' : 'Connecting to live speech transcriber...')
                      : dictationInterim
                        ? `"${dictationInterim}"`
                        : (isUrdu ? 'بولیں... صوتی املا جاری ہے' : 'Listening... Speak in English or Urdu')}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {isDictationProcessing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--emerald-primary)', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                      <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} />
                      <span>{isUrdu ? 'ترتیب و ترجمہ...' : 'Normalizing...'}</span>
                    </div>
                  ) : (
                    <>
                      {/* Done & Send */}
                      <button
                        type="button"
                        onClick={handleDictationDoneAndSend}
                        className="btn btn-primary"
                        style={{
                          minHeight: '26px',
                          padding: '0.2rem 0.6rem',
                          fontSize: '0.75rem',
                          borderRadius: '12px',
                          gap: '0.25rem'
                        }}
                        title={isUrdu ? 'مکمل کریں اور خودکار ارسال کریں' : 'Finish and send normalized question'}
                      >
                        <Send size={11} />
                        <span>{isUrdu ? 'مکمل اور ارسال' : 'Done & Send'}</span>
                      </button>

                      {/* Review & Edit */}
                      <button
                        type="button"
                        onClick={handleDictationReviewAndEdit}
                        className="btn btn-secondary"
                        style={{
                          minHeight: '26px',
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.75rem',
                          borderRadius: '12px'
                        }}
                        title={isUrdu ? 'ترمیم کیلئے حاصل کریں' : 'Review and edit transcript'}
                      >
                        <span>{isUrdu ? 'ترمیم' : 'Review'}</span>
                      </button>

                      {/* Cancel */}
                      <button
                        type="button"
                        onClick={cancelDictation}
                        className="btn btn-ghost btn-icon"
                        style={{ minHeight: '26px', minWidth: '26px', padding: '0.2rem', color: 'var(--text-muted)' }}
                        title={isUrdu ? 'منسوخ کریں' : 'Cancel dictation'}
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Original Spoken Transcript Recovery Pill */}
            {originalSpokenTranscript && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.3rem 0.65rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  margin: '0.15rem 0'
                }}
                className="animate-fade-in"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {isUrdu ? 'اصل صوتی الفاظ:' : 'Spoken:'}
                  </span>
                  <span style={{ fontStyle: 'italic', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '380px' }}>
                    "{originalSpokenTranscript}"
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={handleRestoreOriginalTranscript}
                    className="btn btn-ghost"
                    style={{ padding: '0.1rem 0.4rem', fontSize: '0.725rem', color: 'var(--emerald-primary)' }}
                    title={isUrdu ? 'اصل الفاظ ٹیکسٹ باکس میں لائیں' : 'Restore original transcript into textarea'}
                  >
                    {isUrdu ? 'بحال کریں' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOriginalSpokenTranscript(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.1rem' }}
                    title="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Dictation Review Notice */}
            {dictationNotice && (
              <div
                style={{
                  padding: '0.35rem 0.65rem',
                  backgroundColor: 'rgba(18, 168, 134, 0.08)',
                  border: '1px solid rgba(18, 168, 134, 0.25)',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  color: 'var(--emerald-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  margin: '0.15rem 0'
                }}
                className="animate-fade-in"
              >
                <span>{dictationNotice}</span>
                <button
                  type="button"
                  onClick={() => setDictationNotice(null)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.1rem' }}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Multiline Auto-Growing Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isDictating
                  ? (isUrdu ? 'سماعت جاری ہے... جو بولیں گے وہ یہاں درج ہوگا' : 'Listening... speak now, words will appear here live')
                  : (isUrdu ? 'قرآن یا اسلامی شواہد کے متعلق سوال پوچھیں... (Enter برائے ارسال)' : 'Ask an evidence-based question about the Quran or Hadith... (Enter to send)')
              }
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.975rem',
                lineHeight: 1.5,
                direction: isUrdu ? 'rtl' : 'ltr',
                textAlign: isUrdu ? 'right' : 'left',
                padding: '0.4rem 0.6rem 0.2rem',
                fontFamily: isUrdu ? 'var(--font-urdu), var(--font-sans)' : 'inherit',
                minHeight: '44px',
                maxHeight: '160px',
                overflowY: 'auto'
              }}
            />

            {/* Bottom Actions Bar inside Composer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.2rem'
              }}
            >
              {/* Left Actions: File Attachment, Dictation Mic, Live Voice Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {/* Hidden file input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                />

                {/* Attach Image Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-ghost btn-icon"
                  style={{ minHeight: '34px', minWidth: '34px', padding: '0.35rem' }}
                  title={isUrdu ? 'تصویر منسلک کریں' : 'Attach image'}
                >
                  <ImageIcon size={18} />
                </button>

                {/* Voice Dictation (Mode A) */}
                <button
                  type="button"
                  onClick={() => {
                    if (isDictating || isDictationConnecting) {
                      stopDictation();
                    } else {
                      startDictation();
                    }
                  }}
                  className="btn btn-ghost btn-icon"
                  style={{
                    minHeight: '34px',
                    minWidth: '34px',
                    padding: '0.35rem',
                    backgroundColor: isDictating ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                    color: isDictating ? '#EF4444' : 'var(--text-secondary)',
                    border: isDictating ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid transparent'
                  }}
                  title={
                    isDictating
                      ? (isUrdu ? 'املا بند کریں' : 'Stop dictation')
                      : (isUrdu ? 'صوتی املا شروع کریں' : 'Start voice dictation')
                  }
                >
                  {isDictating ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                {/* Voice Selection & Onboarding (Milestone C) */}
                <button
                  type="button"
                  onClick={handleOpenVoice}
                  className="btn btn-ghost"
                  style={{
                    minHeight: '34px',
                    padding: '0.3rem 0.65rem',
                    gap: '0.35rem',
                    borderRadius: '16px',
                    fontSize: '0.8rem',
                    color: 'var(--emerald-primary)',
                    backgroundColor: 'rgba(18, 168, 134, 0.08)'
                  }}
                  title={isUrdu ? 'آواز کی ترتیبات اور انتخاب' : 'Voice selection & setup'}
                >
                  <Headphones size={15} />
                  <span>{selectedVoiceName}</span>
                </button>
              </div>

              {/* Right Action: Send / Stop Button */}
              <div>
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="btn btn-secondary btn-icon"
                    style={{
                      minHeight: '34px',
                      minWidth: '34px',
                      borderRadius: '50%',
                      padding: '0.35rem',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)'
                    }}
                    title="Stop generation"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputQuestion.trim() && !selectedImage}
                    className="btn btn-primary btn-icon"
                    style={{
                      minHeight: '34px',
                      minWidth: '34px',
                      borderRadius: '50%',
                      padding: '0.35rem'
                    }}
                    title={isUrdu ? 'ارسال' : 'Send'}
                  >
                    <Send size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Onboarding & Selection Modal */}
      <VoiceOnboardingModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        language={language}
        onCompleted={handleVoiceOnboardingCompleted}
      />
    </div>
  );
};
