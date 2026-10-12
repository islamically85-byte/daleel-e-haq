import type {
  ChatResponse,
  ConnectionStatus,
  Conversation,
  DebateReport,
  ProviderMetadata,
  ReviewQueueItem,
  SearchResultItem,
  SourceStatus,
  SurahMeta,
  VerseDetail
} from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      // fallback to statusText
    }
    throw new Error(`API Error (${res.status}): ${errorDetail}`);
  }
  return res.json();
}

export const api = {
  // System & Providers
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse<any>(res);
  },

  async getProviders(): Promise<ProviderMetadata[]> {
    const res = await fetch(`${API_BASE}/providers`);
    return handleResponse<ProviderMetadata[]>(res);
  },

  async testProviderStatus(): Promise<ConnectionStatus> {
    const res = await fetch(`${API_BASE}/providers/status`);
    return handleResponse<ConnectionStatus>(res);
  },

  // Chat
  async sendChatMessage(
    params: {
      question: string;
      conversation_id?: string;
      language?: 'en' | 'ur';
      image_base64?: string;
      image_mime_type?: string;
    },
    signal?: AbortSignal
  ): Promise<ChatResponse> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal
    });
    return handleResponse<ChatResponse>(res);
  },

  // Conversations
  async listConversations(): Promise<Conversation[]> {
    const res = await fetch(`${API_BASE}/conversations`);
    return handleResponse<Conversation[]>(res);
  },

  async getConversation(id: string): Promise<Conversation> {
    const res = await fetch(`${API_BASE}/conversations/${id}`);
    return handleResponse<Conversation>(res);
  },

  async renameConversation(id: string, title: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    return handleResponse<{ status: string }>(res);
  },

  async deleteConversation(id: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/conversations/${id}`, {
      method: 'DELETE'
    });
    return handleResponse<{ status: string }>(res);
  },

  // Debates
  async analyzeDebate(params: {
    transcript: string;
    title?: string;
    language?: 'en' | 'ur';
  }): Promise<DebateReport> {
    const res = await fetch(`${API_BASE}/debates/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return handleResponse<DebateReport>(res);
  },

  async listDebates(): Promise<DebateReport[]> {
    const res = await fetch(`${API_BASE}/debates`);
    return handleResponse<DebateReport[]>(res);
  },

  async getDebate(id: string): Promise<DebateReport> {
    const res = await fetch(`${API_BASE}/debates/${id}`);
    return handleResponse<DebateReport>(res);
  },

  async deleteDebate(id: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/debates/${id}`, {
      method: 'DELETE'
    });
    return handleResponse<{ status: string }>(res);
  },

  // Sources & Library
  async getSourceStatus(): Promise<SourceStatus> {
    const res = await fetch(`${API_BASE}/sources/status`);
    return handleResponse<SourceStatus>(res);
  },

  async listSurahs(): Promise<SurahMeta[]> {
    const res = await fetch(`${API_BASE}/sources/surahs`);
    return handleResponse<SurahMeta[]>(res);
  },

  async getVerse(surah: number, ayah: number): Promise<VerseDetail> {
    const res = await fetch(`${API_BASE}/sources/quran/${surah}/${ayah}`);
    return handleResponse<VerseDetail>(res);
  },

  async searchSources(query: string, sourceType: string = 'all'): Promise<SearchResultItem[]> {
    const url = new URL(`${API_BASE}/sources/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('source_type', sourceType);
    const res = await fetch(url.toString());
    return handleResponse<SearchResultItem[]>(res);
  },

  // Review Queue
  async listReviewQueue(status?: string): Promise<ReviewQueueItem[]> {
    const url = new URL(`${API_BASE}/review-queue`);
    if (status) url.searchParams.set('status', status);
    const res = await fetch(url.toString());
    return handleResponse<ReviewQueueItem[]>(res);
  },

  async submitReviewItem(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE}/review-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  },

  // Text-to-Speech & Voice Methods
  async getVoices(): Promise<{ id: string; name: string; gender: string; description: string; description_ur: string; languages: string[] }[]> {
    const res = await fetch(`${API_BASE}/tts/voices`);
    return handleResponse<any[]>(res);
  },

  getVoicePreviewUrl(voice: string): string {
    return `${API_BASE}/tts/preview/${voice.toLowerCase()}`;
  },

  async generateSpeech(params: { text: string; voice?: string; language?: string }): Promise<string> {
    const res = await fetch(`${API_BASE}/tts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      let errDetail = res.statusText;
      try {
        const errJson = await res.json();
        errDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
      } catch {}
      throw new Error(`TTS Error (${res.status}): ${errDetail}`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // Smart Multilingual Dictation Normalization
  async normalizeDictatedTranscript(params: {
    transcript: string;
    user_preferred_language: 'en' | 'ur';
  }): Promise<{
    original_transcript: string;
    detected_dominant_language: 'en' | 'ur';
    normalized_text: string;
    confidence: number;
    is_uncertain: boolean;
  }> {
    const res = await fetch(`${API_BASE}/dictate/normalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return handleResponse<any>(res);
  },

  // Voice Debate Methods
  async getDebateVoiceStatus(): Promise<{
    status: string;
    model: string;
    input_sample_rate: number;
    output_sample_rate: number;
    supported_voices: string[];
  }> {
    const res = await fetch(`${API_BASE}/debate/voice-status`);
    return handleResponse<any>(res);
  },

  async saveDebateSession(payload: {
    title: string;
    raw_transcript: string;
    language: string;
    topic?: string;
    summary?: string;
  }): Promise<{ status: string; debate_id?: string }> {
    const res = await fetch(`${API_BASE}/debate/save-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse<any>(res);
  }
};

