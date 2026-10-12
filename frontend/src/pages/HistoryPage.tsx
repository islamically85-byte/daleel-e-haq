import React, { useState, useEffect } from 'react';
import { Clock, Edit2, MessageSquare, Scale, Trash2, Check, X } from 'lucide-react';
import { api } from '../services/api';
import type { Conversation, DebateReport } from '../types/api';

interface Props {
  language: 'en' | 'ur';
  onResumeConversation: (convId: string) => void;
  onOpenDebate: (debateId: string) => void;
}

export const HistoryPage: React.FC<Props> = ({
  language,
  onResumeConversation,
  onOpenDebate
}) => {
  const isUrdu = language === 'ur';
  const [activeTab, setActiveTab] = useState<'conversations' | 'debates'>('conversations');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [debates, setDebates] = useState<DebateReport[]>([]);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [cList, dList] = await Promise.all([
        api.listConversations(),
        api.listDebates()
      ]);
      setConversations(cList);
      setDebates(dList);
    } catch (e: any) {
      setErrorMsg(`Failed to load history: ${e.message}`);
    }
  };

  const handleStartRename = (c: Conversation) => {
    setEditingConvId(c.id);
    setEditTitle(c.title);
  };

  const handleSaveRename = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      await api.renameConversation(id, editTitle.trim());
      setEditingConvId(null);
      loadData();
    } catch (e: any) {
      setErrorMsg(`Rename failed: ${e.message}`);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await api.deleteConversation(id);
      loadData();
    } catch (e: any) {
      setErrorMsg(`Delete failed: ${e.message}`);
    }
  };

  const handleDeleteDebate = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this debate analysis?')) return;
    try {
      await api.deleteDebate(id);
      loadData();
    } catch (e: any) {
      setErrorMsg(`Delete failed: ${e.message}`);
    }
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <Clock size={24} color="var(--emerald-primary)" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isUrdu ? 'تاریخچہ و محفوظ شدہ ریکارڈ' : 'Persistent Research History'}
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isUrdu
              ? 'آپ کی تمام تحقیقات اور مناظرے مقامی ڈیٹابیس میں محفوظ ہیں۔ آپ کسی بھی وقت سابقہ بحث جاری رکھ سکتے ہیں۔'
              : 'Stored discussions and debate analyses survive application restarts in your local SQLite store.'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
          <button
            onClick={() => setActiveTab('conversations')}
            className={`btn ${activeTab === 'conversations' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem' }}
          >
            <MessageSquare size={16} />
            <span>{isUrdu ? 'تحقیقی گفتگو' : 'Conversations'} ({conversations.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('debates')}
            className={`btn ${activeTab === 'debates' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem' }}
          >
            <Scale size={16} />
            <span>{isUrdu ? 'مناظرے اور مباحثے' : 'Debate Reports'} ({debates.length})</span>
          </button>
        </div>

        {errorMsg && (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--danger-badge-bg)',
            color: 'var(--danger-badge-text)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1rem',
            fontSize: '0.85rem'
          }}>
            {errorMsg}
          </div>
        )}

        {/* Conversations View */}
        {activeTab === 'conversations' && (
          <div>
            {conversations.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem' }}>
                No saved conversations yet. Start a discussion in Ask AI!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1rem 1.25rem',
                      gap: '1rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      {editingConvId === c.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            className="input"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                          />
                          <button onClick={() => handleSaveRename(c.id)} className="btn btn-primary btn-icon" style={{ minHeight: '34px' }}>
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditingConvId(null)} className="btn btn-secondary btn-icon" style={{ minHeight: '34px' }}>
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                            {c.title}
                          </h4>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Updated: {new Date(c.updated_at).toLocaleString()} • Model: {c.model}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => onResumeConversation(c.id)}
                        className="btn btn-primary"
                        style={{ minHeight: '34px', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      >
                        Resume Discussion
                      </button>
                      <button
                        onClick={() => handleStartRename(c)}
                        className="btn btn-secondary btn-icon"
                        style={{ minHeight: '34px' }}
                        title="Rename topic"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteConversation(c.id)}
                        className="btn btn-danger btn-icon"
                        style={{ minHeight: '34px' }}
                        title="Delete conversation"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Debates View */}
        {activeTab === 'debates' && (
          <div>
            {debates.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem' }}>
                No debate reports saved yet. Paste an argument in the Debate tab to analyze!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {debates.map((d) => (
                  <div
                    key={d.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1rem 1.25rem',
                      gap: '1rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                        {d.title || d.topic}
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>
                        {d.summary}
                      </p>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Created: {new Date(d.created_at).toLocaleString()} • {d.claims_count || 0} claims analyzed
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => onOpenDebate(d.id)}
                        className="btn btn-primary"
                        style={{ minHeight: '34px', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      >
                        View Full Report
                      </button>
                      <button
                        onClick={() => handleDeleteDebate(d.id)}
                        className="btn btn-danger btn-icon"
                        style={{ minHeight: '34px' }}
                        title="Delete debate"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
