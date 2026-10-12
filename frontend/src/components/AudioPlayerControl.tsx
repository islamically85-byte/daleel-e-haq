import React from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';

interface Props {
  messageId: string;
  text: string;
  language?: 'en' | 'ur';
  activeMessageId: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  intensity: number;
  onPlay: (messageId: string, text: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export const AudioPlayerControl: React.FC<Props> = ({
  messageId,
  text,
  language = 'en',
  activeMessageId,
  isPlaying,
  isPaused,
  isLoading,
  currentTime,
  duration,
  intensity,
  onPlay,
  onPause,
  onResume,
  onStop
}) => {
  const isUrdu = language === 'ur';
  const isThisActive = activeMessageId === messageId;
  const isThisPlaying = isThisActive && isPlaying && !isPaused;
  const isThisPaused = isThisActive && isPaused;
  const isThisLoading = isThisActive && isLoading;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = Math.floor(secs % 60);
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  if (!isThisActive) {
    return (
      <button
        onClick={() => onPlay(messageId, text)}
        className="btn btn-ghost"
        style={{
          padding: '0.25rem 0.55rem',
          minHeight: '28px',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem'
        }}
        title={isUrdu ? 'جواب سنیں' : 'Listen to answer'}
      >
        <Volume2 size={13} />
        <span>{isUrdu ? 'سماعت' : 'Listen'}</span>
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.25rem 0.65rem',
        backgroundColor: 'rgba(18, 168, 134, 0.1)',
        border: '1px solid rgba(18, 168, 134, 0.3)',
        borderRadius: '16px',
        fontSize: '0.75rem'
      }}
      className="animate-fade-in"
    >
      {/* Play / Pause / Resume / Loading */}
      {isThisLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--emerald-primary)' }}>
          <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} />
          <span>{isUrdu ? 'تیاری...' : 'Generating...'}</span>
        </div>
      ) : (
        <button
          onClick={() => {
            if (isThisPlaying) onPause();
            else if (isThisPaused) onResume();
            else onPlay(messageId, text);
          }}
          className="btn btn-ghost btn-icon"
          style={{ minHeight: '24px', minWidth: '24px', padding: '0.2rem', color: 'var(--emerald-primary)' }}
          title={isThisPlaying ? 'Pause' : 'Resume'}
        >
          {isThisPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
      )}

      {/* Stop Button */}
      <button
        onClick={onStop}
        className="btn btn-ghost btn-icon"
        style={{ minHeight: '24px', minWidth: '24px', padding: '0.2rem', color: 'var(--text-muted)' }}
        title="Stop playback"
      >
        <Square size={10} fill="currentColor" />
      </button>

      {/* Real-Time Audio-Reactive Mini Waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px', minWidth: '24px' }}>
        {[0.6, 1.0, 0.8, 0.45, 0.9].map((factor, idx) => (
          <div
            key={idx}
            style={{
              width: '2.5px',
              borderRadius: '2px',
              backgroundColor: 'var(--emerald-primary)',
              height: isThisPlaying ? `${Math.max(3, Math.round(intensity * 14 * factor))}px` : '3px',
              transition: 'height 80ms ease'
            }}
          />
        ))}
      </div>

      {/* Time Readout */}
      {duration > 0 && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      )}

      {/* Tajweed Notice */}
      <span
        style={{
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          borderLeft: isUrdu ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
          borderRight: isUrdu ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
          paddingLeft: isUrdu ? '0' : '0.4rem',
          paddingRight: isUrdu ? '0.4rem' : '0'
        }}
        title="Synthetic speech reading; does not certify Tajweed recitation standards"
      >
        {isUrdu ? 'مصنوعی قرأت' : 'Synthetic Reading'}
      </span>
    </div>
  );
};
