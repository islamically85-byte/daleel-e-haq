import React from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListChecks,
  MessageSquare,
  Plus,
  Scale,
  Settings,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import type { NavTab } from './Navigation';
import type { Conversation } from '../types/api';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  language: 'en' | 'ur';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  conversations: Conversation[];
  activeConvId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  language,
  isCollapsed,
  onToggleCollapse,
  conversations,
  activeConvId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation
}) => {
  const isUrdu = language === 'ur';

  const navItems = [
    { id: 'ask' as NavTab, labelEn: 'Research Chat', labelUr: 'تحقیقی گفتگو', icon: MessageSquare },
    { id: 'debate' as NavTab, labelEn: 'Debate Mode', labelUr: 'مناظرہ و استدلال', icon: Scale },
    { id: 'library' as NavTab, labelEn: 'Evidence Library', labelUr: 'کتب خانہ و مصادر', icon: BookOpen },
    { id: 'history' as NavTab, labelEn: 'Archive & History', labelUr: 'محفوظ ریکارڈ', icon: Clock },
    { id: 'queue' as NavTab, labelEn: 'Review Queue', labelUr: 'جائزہ کی قطار', icon: ListChecks },
    { id: 'settings' as NavTab, labelEn: 'System Settings', labelUr: 'ترتیبات و ماڈل', icon: Settings },
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        minWidth: isCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: isUrdu ? 'none' : '1px solid var(--border-subtle)',
        borderLeft: isUrdu ? '1px solid var(--border-subtle)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width var(--transition-smooth), min-width var(--transition-smooth)',
        overflow: 'hidden',
        zIndex: 40,
        height: '100%'
      }}
    >
      {/* Top Brand Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '1rem 0.5rem' : '1.15rem 1.25rem',
          borderBottom: '1px solid var(--border-subtle)',
          minHeight: 'var(--header-height)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              minWidth: '34px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, var(--emerald-primary), var(--emerald-dark))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#032014',
              boxShadow: 'var(--shadow-emerald)'
            }}
          >
            <ShieldCheck size={20} strokeWidth={2.4} />
          </div>

          {!isCollapsed && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', display: 'block', lineHeight: 1.2 }}>
                Daleel-e-Haq
              </span>
              <span style={{ fontFamily: 'var(--font-urdu)', fontSize: '0.85rem', color: 'var(--emerald-primary)' }}>
                دلیلِ حق
              </span>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <button
            onClick={onToggleCollapse}
            className="btn btn-ghost btn-icon"
            style={{ minHeight: '30px', minWidth: '30px', padding: '0.3rem', color: 'var(--text-muted)' }}
            title={isUrdu ? 'سائیڈبار سمیٹیں' : 'Collapse sidebar'}
          >
            {isUrdu ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* New Research Action Button */}
      <div style={{ padding: isCollapsed ? '0.75rem 0.5rem' : '0.85rem 1rem' }}>
        <button
          onClick={onNewConversation}
          className="btn btn-primary"
          style={{
            width: '100%',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '0.6rem' : '0.65rem 1rem',
            minHeight: '38px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 2px 10px rgba(16, 185, 129, 0.18)'
          }}
          title={isUrdu ? 'نئی تحقیق شروع کریں' : 'New Research Topic'}
        >
          <Plus size={17} strokeWidth={2.5} />
          {!isCollapsed && (
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {isUrdu ? 'نئی تحقیق' : 'New Research'}
            </span>
          )}
        </button>
      </div>

      {/* Main Navigation Items */}
      <nav style={{ padding: isCollapsed ? '0.25rem 0.4rem' : '0.25rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? '0.65rem' : '0.6rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: isActive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                backgroundColor: isActive ? 'var(--emerald-badge-bg)' : 'transparent',
                color: isActive ? 'var(--emerald-badge-text)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                textAlign: isUrdu ? 'right' : 'left'
              }}
              title={isUrdu ? item.labelUr : item.labelEn}
            >
              <Icon size={18} color={isActive ? 'var(--emerald-primary)' : 'currentColor'} />
              {!isCollapsed && <span>{isUrdu ? item.labelUr : item.labelEn}</span>}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      {!isCollapsed && (
        <div style={{ margin: '0.75rem 1rem 0.4rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isUrdu ? 'حالیہ تحقیقی موضوعات' : 'Recent Topics'}
          </span>
        </div>
      )}

      {/* Recent Conversations List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isCollapsed ? '0.5rem 0.35rem' : '0.25rem 0.75rem' }}>
        {!isCollapsed && conversations.length === 0 && (
          <p style={{ padding: '0.5rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isUrdu ? 'کوئی سابقہ ریکارڈ نہیں' : 'No prior sessions'}
          </p>
        )}

        {!isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {conversations.slice(0, 15).map((conv) => {
              const isSelected = activeConvId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onTabChange('ask');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
                    border: isSelected ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                  className="conversation-item"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                    <MessageSquare size={13} color={isSelected ? 'var(--emerald-primary)' : 'var(--text-muted)'} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                      {conv.title || 'Untitled Research'}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0.2rem',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Delete session"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Collapse Toggle for Compact Mode */}
      {isCollapsed && (
        <div style={{ padding: '0.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onToggleCollapse}
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--text-secondary)', minHeight: '34px', minWidth: '34px' }}
            title={isUrdu ? 'سائیڈبار کھولیں' : 'Expand sidebar'}
          >
            {isUrdu ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      )}
    </aside>
  );
};
