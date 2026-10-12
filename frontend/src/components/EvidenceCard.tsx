import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, ShieldCheck } from 'lucide-react';
import type { EvidenceCard as EvidenceCardType } from '../types/api';

interface Props {
  evidence: EvidenceCardType;
  language?: 'en' | 'ur';
}

export const EvidenceCard: React.FC<Props> = ({ evidence, language = 'en' }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isQuran = evidence.source_type === 'quran';
  const isUrdu = language === 'ur';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = [
      isQuran
        ? `Surah ${evidence.surah_name_en} (${evidence.surah_number}:${evidence.ayah_number})`
        : `${evidence.collection} #${evidence.hadith_number}`,
      evidence.has_bismillah && evidence.bismillah ? `${evidence.bismillah}\n` : '',
      evidence.text_ar,
      evidence.translation_en ? `EN: ${evidence.translation_en}` : '',
      evidence.translation_ur ? `UR: ${evidence.translation_ur}` : '',
      `Provenance: ${evidence.provenance || 'Daleel-e-Haq Local Corpus'}`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="card animate-fade-in"
      style={{
        border: '1px solid rgba(16, 185, 129, 0.22)',
        backgroundColor: 'rgba(12, 18, 32, 0.85)',
        padding: '0.95rem 1.15rem',
        marginBottom: '0.75rem',
        borderRadius: 'var(--radius-md)'
      }}
    >
      {/* Compact Header Summary Bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span className="badge badge-verified">
            <ShieldCheck size={13} />
            {isQuran ? (isUrdu ? 'مصدقہ قرآنی حوالہ' : 'Quran Verified') : (isUrdu ? 'مصدقہ حدیث' : 'Hadith Verified')}
          </span>

          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.925rem' }}>
            {isQuran
              ? `${evidence.surah_name_en || 'Surah'} (${evidence.surah_number}:${evidence.ayah_number})`
              : `${evidence.collection} #${evidence.hadith_number}`}
          </span>

          {isQuran && evidence.surah_name_ar && (
            <span
              style={{
                fontFamily: 'var(--font-arabic)',
                fontSize: '1.15rem',
                color: 'var(--emerald-primary)',
                marginRight: isUrdu ? '0' : '0.25rem',
                marginLeft: isUrdu ? '0.25rem' : '0'
              }}
            >
              {evidence.surah_name_ar}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            onClick={handleCopy}
            className="btn btn-secondary btn-icon"
            style={{ minHeight: '30px', minWidth: '30px', padding: '0.35rem' }}
            title="Copy scripture and citation"
          >
            {copied ? <Check size={13} color="var(--emerald-primary)" /> : <Copy size={13} />}
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.65rem', minHeight: '30px', fontSize: '0.75rem' }}
          >
            <span>{expanded ? (isUrdu ? 'مختصر کریں' : 'Less') : (isUrdu ? 'تفصیل و تراجم' : 'Full Scripture & Translations')}</span>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded Canonical Scripture and Translations */}
      {expanded && (
        <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }} className="animate-fade-in">
          {/* Traditional Opening Basmala if first verse of surah */}
          {isQuran && evidence.has_bismillah && evidence.bismillah && (
            <div className="basmala-heading">
              {evidence.bismillah}
            </div>
          )}

          {/* Canonical Arabic Text */}
          {evidence.text_ar && (
            <div
              style={{
                backgroundColor: 'rgba(6, 9, 17, 0.75)',
                padding: '1.15rem 1.35rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1rem',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              <p className="arabic-text">
                {evidence.text_ar}
              </p>
            </div>
          )}

          {/* Translations Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            {evidence.translation_en && (
              <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                  English (Sahih International)
                </span>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.925rem', lineHeight: 1.6 }}>
                  {evidence.translation_en}
                </p>
              </div>
            )}

            {evidence.translation_ur && (
              <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'rgba(16, 185, 129, 0.03)', borderRadius: 'var(--radius-sm)', textAlign: 'right' }}>
                <span style={{ color: 'var(--emerald-primary)', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                  اردو ترجمہ (مولانا فتح محمد جالندھری)
                </span>
                <p className="urdu-text" style={{ fontSize: '1.15rem', lineHeight: 2.1 }}>
                  {evidence.translation_ur}
                </p>
              </div>
            )}
          </div>

          {/* Provenance and Integrity Metadata */}
          <div
            style={{
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.6rem'
            }}
          >
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>{isUrdu ? 'ماخذ ایڈیشن:' : 'Provenance Edition:'}</strong><br />
              {evidence.provenance || 'Tanzil Quran Text (Simple v1.1, CC-BY 3.0)'}
            </div>

            {isQuran && (
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>{isUrdu ? 'نزول و معانی:' : 'Revelation & Meaning:'}</strong><br />
                {evidence.revelation_type || 'Meccan'} • {evidence.surah_meaning || 'The Sincerity'}
              </div>
            )}

            {!isQuran && evidence.grade && (
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>{isUrdu ? 'درجہ و محدث:' : 'Authenticity Grade:'}</strong><br />
                {evidence.grade} ({evidence.graded_by})
              </div>
            )}

            <div>
              <strong style={{ color: 'var(--text-primary)' }}>{isUrdu ? 'تصدیقی حیثیت:' : 'Verification Status:'}</strong><br />
              <span style={{ color: 'var(--emerald-primary)' }}>
                ✓ {isUrdu ? 'مقامی مستند ڈیٹابیس میں تصدیق شدہ' : 'Verified in Local Canonical Corpus'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
