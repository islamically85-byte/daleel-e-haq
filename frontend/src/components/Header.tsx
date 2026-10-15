import React from 'react';
import { Database, Globe, Menu, Settings } from 'lucide-react';
import type { NavTab } from './Navigation';

interface HeaderProps {
  language: 'en' | 'ur';
  onLanguageChange: (lang: 'en' | 'ur') => void;
  activeModel: string;
  isOnlineMode: boolean;
  providerConfigured?: boolean;
  onToggleSidebar?: () => void;
  onNavigateSettings?: (tab: NavTab) => void;
  quranCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  language,
  onLanguageChange,
  activeModel: _activeModel,
  isOnlineMode,
  providerConfigured = false,
  onToggleSidebar,
  onNavigateSettings,
  quranCount = 6236
}) => {
  const isUrdu = language === 'ur';

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        height: 'var(--header-height)',
        minHeight: 'var(--header-height)',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'relative',
        zIndex: 30,
        gap: '1rem',
        flexWrap: 'nowrap'
      }}
    >
      {/* Left: Sidebar Toggle & Quick Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="btn btn-ghost btn-icon header-sidebar-toggle"
            style={{ color: 'var(--text-secondary)', padding: '0.5rem', minWidth: '44px', minHeight: '44px' }}
            title={isUrdu ? 'مینو کھولیں / بند کریں' : 'Toggle Sidebar'}
          >
            <Menu size={20} />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
            Daleel-e-Haq
          </h2>
          <span style={{ fontFamily: 'var(--font-urdu)', fontSize: '0.95rem', color: 'var(--emerald-primary)', fontWeight: 600 }}>
            دلیلِ حق
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'none' }} className="header-subtitle">
            • {isUrdu ? 'برہان قبل از بیان' : 'Evidence Before Assertion'}
          </span>
        </div>
      </div>

      {/* Right: Status Pills & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
        {/* Local Scripture Status Pill */}
        <div
          className="header-quran-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.6rem',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '9999px',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap'
          }}
          title="Verified canonical local Quran verses"
        >
          <Database size={13} color="var(--emerald-primary)" />
          <span style={{ fontWeight: 500 }}>
            {quranCount >= 1000 ? `${(quranCount / 1000).toFixed(1)}k` : quranCount}
            <span className="hidden-mobile"> {isUrdu ? 'آیات' : 'Verses'}</span>
          </span>
        </div>

        {/* Active AI Status Pill */}
        <div
          className="header-ai-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.65rem',
            backgroundColor: !isOnlineMode
              ? 'rgba(255, 255, 255, 0.04)'
              : providerConfigured
                ? 'rgba(16, 185, 129, 0.1)'
                : 'rgba(245, 158, 11, 0.12)',
            borderRadius: '9999px',
            border: !isOnlineMode
              ? '1px solid var(--border-subtle)'
              : providerConfigured
                ? '1px solid rgba(16, 185, 129, 0.3)'
                : '1px solid rgba(245, 158, 11, 0.35)',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap'
          }}
          title={
            !isOnlineMode
              ? 'Offline local mode'
              : providerConfigured
                ? 'Google Gemini API is active for online reasoning'
                : 'Gemini API key is unconfigured in backend environment'
          }
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: !isOnlineMode
                ? 'var(--text-muted)'
                : providerConfigured
                  ? 'var(--emerald-primary)'
                  : '#F59E0B',
              boxShadow: !isOnlineMode
                ? 'none'
                : providerConfigured
                  ? '0 0 8px var(--emerald-primary)'
                  : '0 0 8px rgba(245, 158, 11, 0.5)',
              display: 'inline-block'
            }}
          />
          <span
            className="hidden-mobile"
            style={{
              fontWeight: 600,
              color: !isOnlineMode
                ? 'var(--text-secondary)'
                : providerConfigured
                  ? 'var(--emerald-badge-text)'
                  : '#F59E0B'
            }}
          >
            {!isOnlineMode
              ? (isUrdu ? 'آف لائن' : 'Offline')
              : providerConfigured
                ? (isUrdu ? 'ماڈل فعال' : 'Online AI')
                : (isUrdu ? 'غیر مرتب' : 'Unconfigured')}
          </span>
        </div>

        {/* Language Switcher */}
        <button
          onClick={() => onLanguageChange(language === 'en' ? 'ur' : 'en')}
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.775rem', minHeight: '36px', minWidth: '40px' }}
          title={language === 'en' ? 'اردو انٹرفیس منتخب کریں' : 'Switch interface to English'}
        >
          <Globe size={14} />
          <span>{language === 'en' ? 'اردو' : 'EN'}</span>
        </button>

        {/* Quick Settings Icon */}
        {onNavigateSettings && (
          <button
            onClick={() => onNavigateSettings('settings')}
            className="btn btn-ghost btn-icon header-settings-btn"
            style={{ minHeight: '36px', minWidth: '36px', padding: '0.35rem', color: 'var(--text-secondary)' }}
            title={isUrdu ? 'ترتیبات' : 'Settings'}
          >
            <Settings size={17} />
          </button>
        )}
      </div>
    </header>
  );
};
