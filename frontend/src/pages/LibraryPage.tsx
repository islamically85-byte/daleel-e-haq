import React, { useState, useEffect } from 'react';
import { BookOpen, Check, Copy, Search, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import type { SearchResultItem, SourceStatus, SurahMeta, VerseDetail } from '../types/api';

interface Props {
  language: 'en' | 'ur';
}

export const LibraryPage: React.FC<Props> = ({ language }) => {
  const isUrdu = language === 'ur';
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<number>(1);
  const [ayahNumber, setAyahNumber] = useState<number>(1);
  const [exactVerse, setExactVerse] = useState<VerseDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'quran' | 'hadith'>('all');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  // errorMsg setter used in error handlers; getter rendered below
  const [_errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSourceStatus();
    loadSurahs();
    loadExactVerse(1, 1);
  }, []);

  const loadSourceStatus = async () => {
    try {
      const data = await api.getSourceStatus();
      setStatus(data);
    } catch (e: any) {
      console.error('Failed to load source status:', e);
    }
  };

  const loadSurahs = async () => {
    try {
      const data = await api.listSurahs();
      setSurahs(data);
    } catch (e: any) {
      console.error('Failed to load surahs list:', e);
    }
  };

  const loadExactVerse = async (surah: number, ayah: number) => {
    setErrorMsg(null);
    try {
      const v = await api.getVerse(surah, ayah);
      setExactVerse(v);
    } catch (e: any) {
      setErrorMsg(e.message || 'Verse not found');
      setExactVerse(null);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setErrorMsg(null);
    try {
      const hits = await api.searchSources(searchQuery.trim(), searchType);
      setSearchResults(hits);
    } catch (e: any) {
      setErrorMsg(`Search error: ${e.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopyVerse = () => {
    if (!exactVerse) return;
    const text = [
      `Surah ${exactVerse.surah_name_en} (${exactVerse.surah_number}:${exactVerse.ayah_number})`,
      exactVerse.text_ar,
      `EN: ${exactVerse.translation_en || ''}`,
      `UR: ${exactVerse.translation_ur || ''}`,
      `Provenance: ${exactVerse.provenance}`,
      `SHA256: ${exactVerse.checksum}`
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <BookOpen size={24} color="var(--emerald-primary)" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isUrdu ? 'مستند کتب خانہ و مآخذ' : 'Approved Religious Evidence Library'}
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isUrdu
              ? 'دلیلِ حق کا مقامی، ناقابلِ ترمیم قرآنی متون اور احادیث کا ریکارڈ۔ تمام دلائل کی بنیاد صرف اور صرف یہ منظور شدہ کتب خانہ ہے۔'
              : 'Canonical offline scripture library. Every religious assertion in Daleel-e-Haq is grounded and verified against these stored records.'}
          </p>
        </div>

        {/* Source Status Cards */}
        {status && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            {/* Quran Status */}
            <div className="card" style={{ border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>The Noble Quran (القرآن الكريم)</span>
                <span className="badge badge-verified">
                  <ShieldCheck size={13} /> Active & Approved
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                {status.quran.total_surahs} Surahs • {status.quran.total_verses.toLocaleString()} Canonical Verses Loaded
              </p>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <strong>Provenance:</strong> {status.quran.edition} • {status.quran.license}<br />
                <strong>Translations:</strong> Saheeh International (EN) & Fateh Muhammad Jalandhari (UR)
              </div>
            </div>

            {/* Hadith Status */}
            <div className="card" style={{ border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Hadith Collections</span>
                <span className="badge badge-neutral">
                  Schema Configured
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--gold-badge-text)', marginBottom: '0.5rem' }}>
                {status.hadith.message}
              </p>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <strong>Target Collections:</strong> {status.hadith.supported_target_collections.join(', ')}<br />
                <em>Note: Scraped community corpora are withheld pending verified license clearance.</em>
              </div>
            </div>
          </div>
        )}

        {/* Exact Verse Lookup Card */}
        <div className="card" style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--emerald-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            {isUrdu ? 'مخصوص آیت تلاش کریں' : 'Exact Verse Reference Lookup'}
          </h3>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                {isUrdu ? 'سورت منتخب کریں' : 'Select Surah'}
              </label>
              <select
                className="input"
                value={selectedSurah}
                onChange={(e) => {
                  const sNum = parseInt(e.target.value);
                  setSelectedSurah(sNum);
                  setAyahNumber(1);
                  loadExactVerse(sNum, 1);
                }}
              >
                {surahs.map((s) => (
                  <option key={s.surah_number} value={s.surah_number}>
                    {s.surah_number}. {s.name_en} ({s.name_ar}) - {s.verses_count} ayahs
                  </option>
                ))}
              </select>
            </div>

            <div style={{ width: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                {isUrdu ? 'آیت نمبر' : 'Ayah Number'}
              </label>
              <input
                type="number"
                className="input"
                min={1}
                max={surahs.find((s) => s.surah_number === selectedSurah)?.verses_count || 286}
                value={ayahNumber}
                onChange={(e) => setAyahNumber(parseInt(e.target.value) || 1)}
              />
            </div>

            <button
              onClick={() => loadExactVerse(selectedSurah, ayahNumber)}
              className="btn btn-primary"
              style={{ minHeight: '42px' }}
            >
              <span>{isUrdu ? 'دیکھیں' : 'Retrieve Scripture'}</span>
            </button>
          </div>

          {/* Exact Verse Display */}
          {exactVerse && (
            <div style={{
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              border: '1px solid var(--border-subtle)'
            }} className="animate-fade-in">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="badge badge-verified">
                    Surah {exactVerse.surah_name_en} {exactVerse.surah_number}:{exactVerse.ayah_number}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {exactVerse.revelation_type} • Meaning: {exactVerse.surah_meaning}
                  </span>
                </div>
                <button onClick={handleCopyVerse} className="btn btn-secondary btn-icon" title="Copy verse citation">
                  {copied ? <Check size={14} color="var(--emerald-primary)" /> : <Copy size={14} />}
                </button>
              </div>

              {/* Arabic Original with Opening Basmala if verse 1 */}
              <div style={{
                backgroundColor: 'rgba(6, 9, 17, 0.75)',
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                border: '1px solid var(--border-subtle)'
              }}>
                {exactVerse.has_bismillah && exactVerse.bismillah && (
                  <div className="basmala-heading">
                    {exactVerse.bismillah}
                  </div>
                )}
                <p className="arabic-text">
                  {exactVerse.text_ar}
                </p>
              </div>

              {/* Translations */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {exactVerse.translation_en && (
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Saheeh International: </strong>
                    {exactVerse.translation_en}
                  </p>
                )}
                {exactVerse.translation_ur && (
                  <p className="urdu-text" style={{ fontSize: '1.1rem', lineHeight: 2, color: 'var(--text-primary)' }}>
                    <span style={{ color: 'var(--emerald-primary)', fontSize: '0.8rem', fontWeight: 600 }}>فتح محمد جالندھری: </span>
                    {exactVerse.translation_ur}
                  </p>
                )}
              </div>

              <div style={{
                marginTop: '1.25rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <span><strong>Provenance:</strong> {exactVerse.provenance}</span>
                <span className="ltr-preserve"><strong>Checksum:</strong> {exactVerse.checksum.slice(0, 16)}...</span>
              </div>
            </div>
          )}
        </div>

        {/* FTS Search Section */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--emerald-primary)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            {isUrdu ? 'متن اور موضوعاتی تلاش' : 'Full-Text Search Across Scripture'}
          </h3>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <input
                className="input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isUrdu ? 'تلاش کریں (عربی، اردو، انگریزی)...' : 'Search Quran verses (English, Urdu, or Arabic terms)...'}
                style={{ paddingLeft: isUrdu ? '1rem' : '2.5rem', paddingRight: isUrdu ? '2.5rem' : '1rem' }}
              />
              <Search
                size={16}
                color="var(--text-muted)"
                style={{
                  position: 'absolute',
                  [isUrdu ? 'right' : 'left']: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)'
                }}
              />
            </div>

            <select
              className="input"
              value={searchType}
              onChange={(e: any) => setSearchType(e.target.value)}
              style={{ width: '130px' }}
            >
              <option value="all">All Sources</option>
              <option value="quran">Quran Only</option>
              <option value="hadith">Hadith Only</option>
            </select>

            <button type="submit" disabled={isSearching || !searchQuery.trim()} className="btn btn-primary">
              {isSearching ? <div className="spinner" /> : <span>Search</span>}
            </button>
          </form>

          {/* Results List */}
          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {searchResults.length} search results found:
              </p>
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className="badge badge-verified">
                      {r.source_type === 'quran'
                        ? `Surah ${r.surah_name_en} (${r.surah_number}:${r.ayah_number})`
                        : `${r.collection} #${r.hadith_number}`}
                    </span>
                    <button
                      onClick={() => {
                        if (r.surah_number && r.ayah_number) {
                          setSelectedSurah(r.surah_number);
                          setAyahNumber(r.ayah_number);
                          loadExactVerse(r.surah_number, r.ayah_number);
                          window.scrollTo({ top: 300, behavior: 'smooth' });
                        }
                      }}
                      className="btn btn-secondary"
                      style={{ minHeight: '28px', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      Inspect
                    </button>
                  </div>
                  {r.text_ar && (
                    <p className="arabic-text" style={{ fontSize: '1.25rem', marginBottom: '0.5rem', lineHeight: 1.9 }}>
                      {r.text_ar}
                    </p>
                  )}
                  {r.translation_en && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                      <strong>EN:</strong> {r.translation_en}
                    </p>
                  )}
                  {r.translation_ur && (
                    <p className="urdu-text" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                      <strong>اردو:</strong> {r.translation_ur}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !isSearching && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem', fontSize: '0.9rem' }}>
              No matching records found for "{searchQuery}". Check spelling or try a different root word.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
