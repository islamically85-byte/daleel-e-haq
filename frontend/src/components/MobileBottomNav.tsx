import React from 'react';
import { BookOpen, Clock, MessageSquare, Scale, Settings } from 'lucide-react';
import type { NavTab } from './Navigation';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  language: 'en' | 'ur';
  isLiveVoiceActive?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  language,
  isLiveVoiceActive = false
}) => {
  const isUrdu = language === 'ur';

  const items = [
    {
      id: 'ask' as NavTab,
      labelEn: 'Chat',
      labelUr: 'تحقیق',
      icon: MessageSquare
    },
    {
      id: 'debate' as NavTab,
      labelEn: 'Debate',
      labelUr: 'مناظرہ',
      icon: Scale,
      isSpecial: true
    },
    {
      id: 'library' as NavTab,
      labelEn: 'Library',
      labelUr: 'کتب خانہ',
      icon: BookOpen
    },
    {
      id: 'history' as NavTab,
      labelEn: 'History',
      labelUr: 'ریکارڈ',
      icon: Clock
    },
    {
      id: 'settings' as NavTab,
      labelEn: 'Settings',
      labelUr: 'ترتیبات',
      icon: Settings
    }
  ];

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        display: 'none', // Controlled by media query in CSS (shown on <= 768px)
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 45,
        backgroundColor: 'rgba(11, 19, 29, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--border-subtle)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        paddingTop: '6px',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.35)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          maxWidth: '520px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          if (item.isSpecial) {
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  minWidth: '58px',
                  position: 'relative',
                  marginTop: '-14px',
                  transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
                title={isUrdu ? item.labelUr : item.labelEn}
              >
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: isLiveVoiceActive
                      ? 'linear-gradient(135deg, #10B981, #059669)'
                      : isActive
                        ? 'linear-gradient(135deg, #10B981, #047857)'
                        : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(15, 23, 42, 0.8))',
                    border: isActive
                      ? '2px solid rgba(255, 255, 255, 0.35)'
                      : '1px solid rgba(16, 185, 129, 0.4)',
                    boxShadow: isLiveVoiceActive
                      ? '0 0 18px rgba(16, 185, 129, 0.6), 0 4px 12px rgba(0,0,0,0.4)'
                      : isActive
                        ? '0 0 14px rgba(16, 185, 129, 0.45), 0 4px 10px rgba(0,0,0,0.3)'
                        : '0 4px 10px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive || isLiveVoiceActive ? '#041E15' : 'var(--emerald-primary)',
                    marginBottom: '2px'
                  }}
                >
                  <Icon size={21} strokeWidth={isActive || isLiveVoiceActive ? 2.5 : 2} />
                </div>
                <span
                  style={{
                    fontSize: '0.675rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--emerald-primary)' : 'var(--text-secondary)',
                    fontFamily: isUrdu ? 'var(--font-urdu)' : 'inherit'
                  }}
                >
                  {isUrdu ? item.labelUr : item.labelEn}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 4px',
                minWidth: '52px',
                minHeight: '44px',
                color: isActive ? 'var(--emerald-primary)' : 'var(--text-muted)',
                transition: 'color 0.15s ease',
                position: 'relative'
              }}
              title={isUrdu ? item.labelUr : item.labelEn}
            >
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    width: '16px',
                    height: '2.5px',
                    borderRadius: '2px',
                    backgroundColor: 'var(--emerald-primary)',
                    boxShadow: '0 0 6px var(--emerald-primary)'
                  }}
                />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.3 : 1.7} />
              <span
                style={{
                  fontSize: '0.675rem',
                  fontWeight: isActive ? 600 : 400,
                  marginTop: '3px',
                  fontFamily: isUrdu ? 'var(--font-urdu)' : 'inherit',
                  letterSpacing: isUrdu ? 0 : '-0.01em'
                }}
              >
                {isUrdu ? item.labelUr : item.labelEn}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
