import React from 'react';

interface Props {
  content: string;
  isUrdu?: boolean;
  onCitationClick?: (sourceId: string) => void;
}

export const FormattedResponse: React.FC<Props> = ({ content, isUrdu = false, onCitationClick }) => {
  if (!content) return null;

  // Split by double newline for paragraphs
  const paragraphs = content.split(/\n\s*\n/);

  const renderInlineFormatted = (text: string) => {
    // Regex for bold text: **text**
    // and scripture IDs: (quran:X:Y) or [quran:X:Y] or quran:X:Y
    const parts = text.split(/(\*\*.*?\*\*|\[quran:\d+:\d+\]|\(quran:\d+:\d+\)|quran:\d+:\d+)/g);

    return parts.map((part, idx) => {
      if (!part) return null;

      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {part.slice(2, -2)}
          </strong>
        );
      }

      // Check if it's a Quran reference ID
      const quranMatch = part.match(/quran:(\d+):(\d+)/);
      if (quranMatch) {
        const fullId = `quran:${quranMatch[1]}:${quranMatch[2]}`;
        const label = `Quran ${quranMatch[1]}:${quranMatch[2]}`;
        return (
          <button
            key={idx}
            onClick={() => onCitationClick && onCitationClick(fullId)}
            className="badge badge-verified"
            style={{
              cursor: onCitationClick ? 'pointer' : 'default',
              margin: '0 0.25rem',
              fontSize: '0.75rem',
              padding: '0.15rem 0.5rem',
              display: 'inline-flex',
              verticalAlign: 'middle',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.12)'
            }}
            title={`View evidence record for ${fullId}`}
          >
            {label}
          </button>
        );
      }

      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div
      className="response-prose"
      style={{
        direction: isUrdu ? 'rtl' : 'ltr',
        textAlign: isUrdu ? 'right' : 'left',
        fontFamily: isUrdu ? 'var(--font-urdu), var(--font-sans)' : 'inherit'
      }}
    >
      {paragraphs.map((p, pIdx) => {
        const trimmed = p.trim();
        if (!trimmed) return null;

        // Headings: ### or ##
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          const headingText = trimmed.replace(/^#{2,3}\s+/, '');
          return (
            <h3 key={pIdx} style={{ color: 'var(--emerald-badge-text)', margin: '1rem 0 0.4rem', fontSize: '1.05rem', fontWeight: 600 }}>
              {renderInlineFormatted(headingText)}
            </h3>
          );
        }

        // List items: lines starting with "- " or "* " or "1. "
        const lines = trimmed.split('\n');
        const isBulletList = lines.every((l) => l.trim().startsWith('- ') || l.trim().startsWith('* '));
        const isNumberedList = lines.every((l) => /^\d+\.\s/.test(l.trim()));

        if (isBulletList && lines.length > 1) {
          return (
            <ul key={pIdx} style={{ margin: '0.5rem 0 0.85rem 1.25rem' }}>
              {lines.map((l, lIdx) => (
                <li key={lIdx} style={{ marginBottom: '0.35rem' }}>
                  {renderInlineFormatted(l.trim().replace(/^[-*]\s+/, ''))}
                </li>
              ))}
            </ul>
          );
        }

        if (isNumberedList && lines.length > 1) {
          return (
            <ol key={pIdx} style={{ margin: '0.5rem 0 0.85rem 1.25rem' }}>
              {lines.map((l, lIdx) => (
                <li key={lIdx} style={{ marginBottom: '0.35rem' }}>
                  {renderInlineFormatted(l.trim().replace(/^\d+\.\s+/, ''))}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={pIdx} style={{ marginBottom: '0.85rem', lineHeight: 1.7 }}>
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderInlineFormatted(line)}
                {lIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};
