import React from 'react';
import { BookOpen, Clock, ListChecks, MessageSquare, Scale, Settings } from 'lucide-react';

export type NavTab = 'ask' | 'debate' | 'library' | 'history' | 'queue' | 'settings';

interface NavigationProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  language: 'en' | 'ur';
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, language }) => {
  const isUrdu = language === 'ur';

  const primaryTabs = [
    { id: 'ask' as NavTab, labelEn: 'Ask AI', labelUr: 'سوال پوچھیں', icon: MessageSquare },
    { id: 'debate' as NavTab, labelEn: 'Debate Analysis', labelUr: 'مناظرہ و بحث', icon: Scale },
    { id: 'library' as NavTab, labelEn: 'Evidence Library', labelUr: 'کتب خانہ و دلائل', icon: BookOpen },
  ];

  const secondaryTabs = [
    { id: 'history' as NavTab, labelEn: 'History', labelUr: 'سابقہ ریکارڈ', icon: Clock },
    { id: 'queue' as NavTab, labelEn: 'Review Queue', labelUr: 'جائزہ کی قطار', icon: ListChecks },
    { id: 'settings' as NavTab, labelEn: 'Settings', labelUr: 'ترتیبات', icon: Settings },
  ];

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.5rem 1.75rem',
      backgroundColor: 'var(--bg-base)',
      borderBottom: '1px solid var(--border-subtle)',
      flexWrap: 'wrap',
      gap: '0.75rem'
    }}>
      {/* Primary Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {primaryTabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--emerald-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--emerald-glow)' : 'transparent',
                border: isActive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <Icon size={17} />
              <span>{isUrdu ? t.labelUr : t.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* Secondary Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        {secondaryTabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <Icon size={15} />
              <span>{isUrdu ? t.labelUr : t.labelEn}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
