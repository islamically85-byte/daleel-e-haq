import React, { useState, useEffect } from 'react';
import {
  Check,
  Copy,
  Headphones,
  Scale,
  Trash2
} from 'lucide-react';
import { api } from '../services/api';
import type { DebateClaim, DebateReport } from '../types/api';
import { EvidenceCard } from '../components/EvidenceCard';
import { DebateLiveVoiceView } from '../components/DebateLiveVoiceView';

interface Props {
  language: 'en' | 'ur';
}

export const DebatePage: React.FC<Props> = ({ language }) => {
  const isUrdu = language === 'ur';
  const [activeMode, setActiveMode] = useState<'voice' | 'written'>('voice');
  const [transcript, setTranscript] = useState('');
  const [debateTitle, setDebateTitle] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeReport, setActiveReport] = useState<DebateReport | null>(null);
  const [pastDebates, setPastDebates] = useState<DebateReport[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadPastDebates();
  }, []);

  const loadPastDebates = async () => {
    try {
      const list = await api.listDebates();
      setPastDebates(list);
    } catch (e: any) {
      console.error('Failed to load past debates:', e);
    }
  };

  const handleAnalyze = async () => {
    if (!transcript.trim() || isAnalyzing) return;

    setErrorMsg(null);
    setIsAnalyzing(true);

    try {
      const report = await api.analyzeDebate({
        transcript: transcript.trim(),
        title: debateTitle.trim() || 'Debate Argument Analysis',
        language: language
      });
      setActiveReport(report);
      loadPastDebates();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to analyze debate transcript');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectPastDebate = async (id: string) => {
    try {
      const report = await api.getDebate(id);
      setActiveReport(report);
      // transcript is not stored on the report object; clear input for a fresh edit
      setTranscript('');
    } catch (e: any) {
      setErrorMsg(`Failed to load debate: ${e.message}`);
    }
  };

  const handleDeleteDebate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteDebate(id);
      if (activeReport?.id === id) {
        setActiveReport(null);
      }
      loadPastDebates();
    } catch (err: any) {
      setErrorMsg(`Failed to delete debate: ${err.message}`);
    }
  };

  const handleCopyReport = () => {
    if (!activeReport) return;
    const text = [
      `TOPIC: ${activeReport.topic}`,
      `SUMMARY: ${activeReport.summary}\n`,
      'NUMBERED CLAIMS & RESPONSES:',
      ...activeReport.claims.map(
        (c) =>
          `Claim ${c.claim_number}: ${c.claim_text}\n` +
          `Status: ${c.verification_status.toUpperCase()}\n` +
          `Response: ${c.response_text}\n` +
          (c.logical_issues ? `Logical Issues: ${c.logical_issues}\n` : '') +
          (c.interpretive_notes ? `Interpretive Notes: ${c.interpretive_notes}\n` : '')
      ),
      '\nUNRESOLVED ISSUES:',
      ...activeReport.unresolved_issues.map((u) => `- ${u}`),
      `\nFINAL SYNTHESIS:\n${activeReport.synthesis}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sampleDebate = `Speaker 1: "The argument claims that Surah 112 teaches God is one, but our theological position maintains that divine complexity allows multiple personas."
Speaker 2: "However, the Quran states 'Qul Huwa Allahu Ahad'—Ahad signifies absolute, indivisible oneness with no parts, partners, or multiplicity. Sourced directly from scripture."`;

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Debate Mode Switcher Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveMode('voice')}
            className="btn btn-ghost"
            style={{
              padding: '0.45rem 1.15rem',
              borderRadius: '20px',
              fontSize: '0.85rem',
              gap: '0.45rem',
              backgroundColor: activeMode === 'voice' ? 'rgba(18, 168, 134, 0.15)' : 'var(--bg-surface)',
              color: activeMode === 'voice' ? 'var(--emerald-primary)' : 'var(--text-secondary)',
              border: activeMode === 'voice' ? '1px solid rgba(18, 168, 134, 0.4)' : '1px solid var(--border-subtle)',
              fontWeight: activeMode === 'voice' ? 600 : 500
            }}
          >
            <Headphones size={15} />
            <span>{isUrdu ? 'براہِ راست صوتی مناظرہ' : 'Live Voice Debate'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('written')}
            className="btn btn-ghost"
            style={{
              padding: '0.45rem 1.15rem',
              borderRadius: '20px',
              fontSize: '0.85rem',
              gap: '0.45rem',
              backgroundColor: activeMode === 'written' ? 'rgba(18, 168, 134, 0.15)' : 'var(--bg-surface)',
              color: activeMode === 'written' ? 'var(--emerald-primary)' : 'var(--text-secondary)',
              border: activeMode === 'written' ? '1px solid rgba(18, 168, 134, 0.4)' : '1px solid var(--border-subtle)',
              fontWeight: activeMode === 'written' ? 600 : 500
            }}
          >
            <Scale size={15} />
            <span>{isUrdu ? 'تحریری تجزیہ و شواہد' : 'Written Argument Analysis'}</span>
          </button>
        </div>

        {activeMode === 'voice' ? (
          <div style={{ marginBottom: '2rem' }}>
            <DebateLiveVoiceView
              language={language}
              onDebateSaved={(id) => {
                loadPastDebates();
                handleSelectPastDebate(id);
              }}
            />
          </div>
        ) : (
          <>
            {/* Title & Introduction */}
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <Scale size={24} color="var(--emerald-primary)" />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isUrdu ? 'مناظرہ و استدلال کا تفصیلی تجزیہ' : 'Debate & Argument Analysis Engine'}
                </h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {isUrdu
                  ? 'کسی بھی مذہبی مناظرے یا دلیل کا متن یہاں درج کریں۔ اے آئی ہر دعوے کی درجہ بندی، قرآنی تصدیق، اور منصفانہ نکتہ بہ نکتہ جواب تیار کرے گا۔'
                  : 'Paste a debate transcript or religious argument. The engine extracts numbered claims, checks scripture references against the local database, identifies logical issues, and produces a point-by-point evidence report.'}
              </p>
            </div>

            {/* Input Box Section */}
            <div className="card" style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  value={debateTitle}
                  onChange={(e) => setDebateTitle(e.target.value)}
                  placeholder={isUrdu ? 'مناظرے کا عنوان (اختیاری)' : 'Debate Title (Optional, e.g. Tawheed vs Plurality Argument)'}
                  style={{ flex: 1, minWidth: '240px' }}
                />
                <button
                  onClick={() => setTranscript(sampleDebate)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem' }}
                >
                  <span>{isUrdu ? 'مثال لوڈ کریں' : 'Load Sample Argument'}</span>
                </button>
          </div>

          <textarea
            className="textarea"
            rows={6}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={isUrdu ? 'مناظرے کا متن، مخالف کا مؤقف، یا تقریر کا اقتباس یہاں پیسٹ کریں...' : 'Paste transcript, debate exchange, or philosophical religious argument here...'}
            style={{ marginBottom: '1rem', fontSize: '0.925rem', lineHeight: 1.6 }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {transcript.length} characters • Analyzed against local verified Quran and Hadith
            </span>
            <button
              onClick={handleAnalyze}
              disabled={!transcript.trim() || isAnalyzing}
              className="btn btn-primary"
              style={{ minWidth: '160px' }}
            >
              {isAnalyzing ? (
                <>
                  <div className="spinner" />
                  <span>{isUrdu ? 'تجزیہ ہو رہا ہے...' : 'Analyzing Claims...'}</span>
                </>
              ) : (
                <>
                  <Scale size={16} />
                  <span>{isUrdu ? 'تجزیہ شروع کریں' : 'Analyze Debate'}</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--danger-badge-bg)',
              color: 'var(--danger-badge-text)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem'
            }}>
              {errorMsg}
            </div>
          )}
        </div>

        {/* Past Debates Navigation Drawer */}
        {pastDebates.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              {isUrdu ? 'سابقہ محفوظ شدہ مناظرے' : 'Saved Debate Reports'} ({pastDebates.length})
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {pastDebates.map((d) => (
                <div
                  key={d.id}
                  onClick={() => handleSelectPastDebate(d.id)}
                  style={{
                    backgroundColor: activeReport?.id === d.id ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                    border: activeReport?.id === d.id ? '1px solid var(--emerald-primary)' : '1px solid var(--border-subtle)',
                    padding: '0.5rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    minWidth: '220px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.title || d.topic}
                    </p>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteDebate(d.id, e)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    title="Delete record"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analysis Result Display */}
        {activeReport && (
          <div className="card animate-fade-in" style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-medium)',
            padding: '2rem',
            marginBottom: '3rem'
          }}>
            {/* Report Header Actions */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '1rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <span className="badge badge-verified" style={{ marginBottom: '0.4rem' }}>
                  Verified Structured Report
                </span>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {activeReport.topic}
                </h3>
              </div>
              <button onClick={handleCopyReport} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
                {copied ? <Check size={15} color="var(--emerald-primary)" /> : <Copy size={15} />}
                <span>{copied ? 'Copied Report!' : 'Copy Full Report'}</span>
              </button>
            </div>

            {/* Discussion Summary */}
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--emerald-primary)', fontWeight: 700, marginBottom: '0.5rem' }}>
                {isUrdu ? 'خلاصۂ گفتگو' : 'Executive Summary'}
              </h4>
              <p style={{ color: 'var(--text-primary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
                {activeReport.summary}
              </p>
            </div>

            {/* Numbered Claims & Responses */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--emerald-primary)', fontWeight: 700, marginBottom: '1rem' }}>
                {isUrdu ? 'دعویٰ جات اور نکتہ بہ نکتہ جواب' : 'Numbered Claims & Rebuttal'} ({activeReport.claims.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {activeReport.claims.map((c: DebateClaim) => {
                  const isVerified = c.verification_status === 'verified';
                  const isContradicted = c.verification_status === 'contradicted';
                  return (
                    <div
                      key={c.claim_number}
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                          Claim #{c.claim_number}
                        </span>
                        <span className={`badge ${isVerified ? 'badge-verified' : isContradicted ? 'badge-danger' : 'badge-warning'}`}>
                          {c.verification_status}
                        </span>
                      </div>

                      <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                        "{c.claim_text}"
                      </p>

                      {c.alleged_source && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                          <strong>Alleged Reference:</strong> {c.alleged_source}
                        </p>
                      )}

                      <div style={{
                        padding: '0.85rem 1rem',
                        backgroundColor: 'rgba(11, 15, 23, 0.6)',
                        borderRadius: 'var(--radius-sm)',
                        borderLeft: isUrdu ? 'none' : '3px solid var(--emerald-primary)',
                        borderRight: isUrdu ? '3px solid var(--emerald-primary)' : 'none',
                        marginBottom: '0.75rem'
                      }}>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                          <strong style={{ color: 'var(--emerald-primary)' }}>Response: </strong>
                          {c.response_text}
                        </p>
                      </div>

                      {c.logical_issues && (
                        <p style={{ fontSize: '0.825rem', color: 'var(--gold-badge-text)', marginBottom: '0.35rem' }}>
                          <strong style={{ color: 'var(--gold-accent)' }}>Logical Fallacy: </strong>
                          {c.logical_issues}
                        </p>
                      )}

                      {c.interpretive_notes && (
                        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                          <strong>Theological Nuance: </strong>
                          {c.interpretive_notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Verified Evidence Cards for this Debate */}
            {activeReport.evidence_cards && activeReport.evidence_cards.length > 0 && (
              <div style={{ marginBottom: '2.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--emerald-primary)', fontWeight: 700, marginBottom: '0.75rem' }}>
                  {isUrdu ? 'مناظرے سے متعلق مستند حوالہ جات' : 'Supporting Scripture Evidence'}
                </h4>
                {activeReport.evidence_cards.map((ev, idx) => (
                  <EvidenceCard key={idx} evidence={ev} language={language} />
                ))}
              </div>
            )}

            {/* Unresolved Theological Issues */}
            {activeReport.unresolved_issues && activeReport.unresolved_issues.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--gold-accent)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {isUrdu ? 'غیر حل شدہ اور تشنہ طلب پہلو' : 'Unresolved Issues & Limitations'}
                </h4>
                <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  {activeReport.unresolved_issues.map((u, idx) => (
                    <li key={idx} style={{ marginBottom: '0.35rem' }}>{u}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Final Synthesis */}
            <div style={{
              padding: '1.25rem',
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)'
            }}>
              <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '0.5rem' }}>
                {isUrdu ? 'حتمی نتیجہ اور علمی خلاصہ' : 'Final Synthesis'}
              </h4>
              <p style={{ color: 'var(--text-primary)', lineHeight: 1.7, fontSize: '0.925rem' }}>
                {activeReport.synthesis}
              </p>
            </div>
          </div>
        )}
        </>
      )}
      </div>
    </div>
  );
};
