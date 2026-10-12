import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Cpu,
  Download,
  FolderOpen,
  Info,
  Lock,
  RefreshCw,
  Settings as SettingsIcon,
  Zap
} from 'lucide-react';
import { api } from '../services/api';
import type { ConnectionStatus, ProviderMetadata } from '../types/api';

interface Props {
  language: 'en' | 'ur';
}

export const SettingsPage: React.FC<Props> = ({ language }) => {
  const isUrdu = language === 'ur';
  const [providers, setProviders] = useState<ProviderMetadata[]>([]);
  const [testResult, setTestResult] = useState<ConnectionStatus | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'local'>('gemini');

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const data = await api.getProviders();
      setProviders(data);
    } catch (e: any) {
      console.error('Failed to load providers:', e);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testProviderStatus();
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        status: 'error',
        message: e.message || 'Connection test failed',
        model: 'gemini-3.8-flash'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const geminiMeta = providers.find((p) => p.provider_id === 'gemini');

  return (
    <div style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <SettingsIcon size={24} color="var(--emerald-primary)" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isUrdu ? 'اے آئی انجن اور ایپلیکیشن ترتیبات' : 'AI Engine & Application Settings'}
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isUrdu
              ? 'آن لائن جیمنائی ماڈل اور مستقبل کے لوکل ماڈل کا انتظام۔ رازداری اور تصدیقی ضوابط۔'
              : 'Configure reasoning providers, verify API connectivity, and inspect model runtime policies.'}
          </p>
        </div>

        {/* Provider Switcher Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem'
        }}>
          {/* Provider 1: Online AI (Gemini) */}
          <div
            className="card"
            style={{
              border: selectedProvider === 'gemini' ? '2px solid var(--emerald-primary)' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              position: 'relative'
            }}
            onClick={() => setSelectedProvider('gemini')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Zap size={20} color="var(--emerald-primary)" />
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Online AI Engine
                </span>
              </div>
              <span className="badge badge-verified">
                Active in Phase 1
              </span>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              Google Gemini API reasoning service. Delivers high-speed structured theological reasoning grounded in local scripture.
            </p>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <strong>Configured Model:</strong> <code style={{ color: 'var(--emerald-primary)' }}>{geminiMeta?.model || 'gemini-3.8-flash'}</code><br />
              <strong>Status:</strong> {geminiMeta?.is_configured ? '✓ Configured via Backend' : 'Key Missing'}
            </div>
          </div>

          {/* Provider 2: Local AI (Planned Stub) */}
          <div
            className="card"
            style={{
              border: selectedProvider === 'local' ? '2px solid var(--gold-accent)' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              opacity: 0.85,
              position: 'relative'
            }}
            onClick={() => setSelectedProvider('local')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Cpu size={20} color="var(--gold-accent)" />
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Local AI Engine
                </span>
              </div>
              <span className="badge badge-warning">
                Planned — Not Installed
              </span>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              Completely offline local model inference (GGUF / Llama.cpp). Planned for Phase 2 implementation.
            </p>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <strong>Execution Target:</strong> Qwen 9B / 4B Quantized<br />
              <strong>Phase 1 Status:</strong> Boundary preserved, engine not loaded
            </div>
          </div>
        </div>

        {/* Selected Provider Details Panel */}
        {selectedProvider === 'gemini' && (
          <div className="card animate-fade-in" style={{ backgroundColor: 'var(--bg-surface)', padding: '1.75rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Google Gemini Online AI Configuration
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Primary Model ID</span>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{geminiMeta?.model || 'gemini-3.8-flash'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>API Credential Status</span>
                  <span style={{ color: geminiMeta?.is_configured ? 'var(--emerald-primary)' : 'var(--danger-primary)', fontWeight: 600 }}>
                    {geminiMeta?.is_configured ? '● Credential Set in Environment' : '○ Not Configured'}
                  </span>
                </div>
              </div>

              {/* Connection Test Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="btn btn-primary"
                >
                  {isTesting ? (
                    <>
                      <div className="spinner" />
                      <span>Testing API Connectivity...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      <span>Test Live Connection</span>
                    </>
                  )}
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Pings Gemini API endpoint and measures latency.
                </span>
              </div>

              {/* Test Result Message Box */}
              {testResult && (
                <div style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: testResult.status === 'connected' ? 'var(--emerald-badge-bg)' : 'var(--danger-badge-bg)',
                  border: `1px solid ${testResult.status === 'connected' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  color: testResult.status === 'connected' ? 'var(--emerald-badge-text)' : 'var(--danger-badge-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.875rem'
                }} className="animate-fade-in">
                  {testResult.status === 'connected' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                  <div style={{ flex: 1 }}>
                    <strong>{testResult.message}</strong>
                    {testResult.latency_ms && (
                      <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.85 }}>
                        Round-trip Latency: {testResult.latency_ms} ms
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Setup Guidance */}
            <div style={{
              padding: '1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.825rem',
              color: 'var(--text-secondary)'
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>Secure Setup Guidance:</strong><br />
              Credentials are kept server-side and never exposed to the browser. To configure or rotate your key, edit <code style={{ color: 'var(--emerald-primary)' }}>.env</code> at the project root:<br />
              <pre style={{ backgroundColor: 'var(--bg-base)', padding: '0.5rem', borderRadius: '4px', margin: '0.5rem 0', fontFamily: 'monospace' }}>
                GEMINI_API_KEY=your_key_here
              </pre>
            </div>
          </div>
        )}

        {/* Local AI Stub Controls Panel */}
        {selectedProvider === 'local' && (
          <div className="card animate-fade-in" style={{ backgroundColor: 'var(--bg-surface)', padding: '1.75rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Local AI Model Management (Phase 2 Roadmap)
              </h3>
              <span className="badge badge-warning">Deferred to Phase 2</span>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Local inference allows 100% offline reasoning without transmitting queries over the internet. The controls below represent the planned model ingestion workflow. In Phase 1, they remain disabled to avoid deploying unoptimized heavy binaries.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Planned Action 1 */}
              <div style={{
                padding: '1.25rem',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Download size={18} color="var(--text-muted)" />
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Download AI Model</strong>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Download official quantized GGUF weights directly into application storage.
                </p>
                <button disabled className="btn btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>
                  Download Model (Phase 2)
                </button>
              </div>

              {/* Planned Action 2 */}
              <div style={{
                padding: '1.25rem',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <FolderOpen size={18} color="var(--text-muted)" />
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Select Existing Model File</strong>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Point to an existing compatible .gguf file on your local drive.
                </p>
                <button disabled className="btn btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>
                  Select .gguf File (Phase 2)
                </button>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8rem',
              color: 'var(--gold-badge-text)',
              backgroundColor: 'var(--gold-badge-bg)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)'
            }}>
              <Info size={16} />
              <span>
                Reminder: Importing Quran and Hadith text files belongs to the Evidence Library, not the model selection interface.
              </span>
            </div>
          </div>
        )}

        {/* Data Privacy & Transparency Disclosure */}
        <div className="card" style={{ border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <Lock size={18} color="var(--emerald-primary)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Data Privacy & Architecture Disclosure
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            In accordance with Daleel-e-Haq's transparency mandate: while Gemini Online AI Mode is active, user prompts and retrieved canonical snippets are processed on Google's servers for logical reasoning. The religious evidence database, search indexing, conversation history, and citation verification remain strictly local on your machine.
          </p>
        </div>
      </div>
    </div>
  );
};
