import React, { useState, useEffect } from 'react';
import { CheckCircle2, ListChecks, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import type { ReviewQueueItem } from '../types/api';

interface Props {
  language: 'en' | 'ur';
}

export const ReviewQueuePage: React.FC<Props> = ({ language }) => {
  const isUrdu = language === 'ur';
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadQueue();
  }, [filterStatus]);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const data = await api.listReviewQueue(filterStatus || undefined);
      setItems(data);
    } catch (e: any) {
      console.error('Failed to load review queue:', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <ListChecks size={24} color="var(--emerald-primary)" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isUrdu ? 'تشنہ طلب مسائل اور جائزہ کی قطار' : 'Learning Memory & Review Queue'}
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isUrdu
              ? 'جب اے آئی کو کسی دعوے کے لیے منظور شدہ قرآن و حدیث میں کافی ثبوت نہ ملے تو وہ یہاں محفوظ ہوتا ہے۔ غیر تصدیق شدہ بات کبھی بھی از خود دینی سند نہیں بن سکتی۔'
              : 'Claims that lacked sufficient evidence in the local scripture database are isolated here. They are never automatically promoted into religious doctrine.'}
          </p>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { id: '', label: 'All Items' },
            { id: 'pending', label: 'Pending Review' },
            { id: 'approved', label: 'Reviewed & Approved' },
            { id: 'rejected', label: 'Rejected' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`btn ${filterStatus === f.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ minHeight: '34px', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Queue Items List */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Loading review queue...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <CheckCircle2 size={36} color="var(--emerald-primary)" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Review Queue Clear
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              No unverified claims or isolated questions pending review in this status.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map((item) => (
              <div key={item.id} className="card" style={{ border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span className="badge badge-warning">
                    <ShieldAlert size={13} /> {item.item_type.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Logged: {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>

                <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  {item.question_or_topic}
                </h4>

                {item.missing_evidence && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--gold-badge-text)', marginBottom: '0.5rem' }}>
                    <strong>Missing Evidence Note:</strong> {item.missing_evidence}
                  </p>
                )}

                {item.proposed_answer && (
                  <div style={{
                    padding: '0.75rem',
                    backgroundColor: 'rgba(11, 15, 23, 0.6)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)'
                  }}>
                    <strong>Proposed Response Draft:</strong><br />
                    {item.proposed_answer.slice(0, 240)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
