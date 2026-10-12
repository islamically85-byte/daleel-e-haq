export interface EvidenceCard {
  source_id: string;
  source_type: 'quran' | 'hadith';
  surah_number?: number;
  ayah_number?: number;
  surah_name_ar?: string;
  surah_name_en?: string;
  surah_meaning?: string;
  revelation_type?: string;
  collection?: string;
  hadith_number?: number;
  book_name?: string;
  chapter_name?: string;
  text_ar?: string;
  has_bismillah?: boolean;
  bismillah?: string | null;
  translation_en?: string;
  translation_ur?: string;
  narrator?: string;
  grade?: string;
  graded_by?: string;
  provenance?: string;
  is_verified: boolean;
}

export interface ClaimItem {
  claim_text: string;
  cited_ids: string[];
  verification_status: 'verified' | 'unverified' | 'contradicted' | 'partially_verified';
  notes?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  language: 'en' | 'ur';
  created_at: string;
  evidence_citations?: EvidenceCard[];
  has_unverified_claims?: boolean;
  unverified_reason?: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  provider: string;
  model: string;
  message_count?: number;
  messages?: Message[];
}

export interface ChatResponse {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  direct_answer: string;
  language: 'en' | 'ur';
  evidence_cards: EvidenceCard[];
  claims: ClaimItem[];
  has_unverified_claims: boolean;
  limitations?: string;
  provider: string;
  model: string;
}

export interface DebateClaim {
  id?: string;
  claim_number: number;
  claim_text: string;
  alleged_source?: string;
  verification_status: string;
  evidence_ids: string[];
  response_text: string;
  logical_issues?: string;
  interpretive_notes?: string;
}

export interface DebateReport {
  id: string;
  title: string;
  language: 'en' | 'ur';
  created_at: string;
  topic: string;
  summary: string;
  claims: DebateClaim[];
  evidence_cards: EvidenceCard[];
  unresolved_issues: string[];
  synthesis: string;
  claims_count?: number;
}

export interface ProviderMetadata {
  provider_id: string;
  provider_name: string;
  mode: string;
  model: string;
  is_configured: boolean;
  is_active: boolean;
  status_label?: string;
  data_privacy: string;
  planned_actions?: Array<{
    action_id: string;
    title: string;
    description: string;
    status: string;
    badge: string;
  }>;
}

export interface ConnectionStatus {
  status: 'connected' | 'error' | 'unconfigured' | 'disabled';
  message: string;
  model: string;
  latency_ms?: number;
}

export interface SourceStatus {
  quran: {
    is_configured: boolean;
    total_surahs: number;
    total_verses: number;
    edition: string;
    license: string;
    translations: Array<{ language: string; name: string }>;
  };
  hadith: {
    is_configured: boolean;
    total_records: number;
    approved_records: number;
    pending_records: number;
    approved_collections: string[];
    message: string;
    supported_target_collections: string[];
  };
}

export interface VerseDetail {
  id: string;
  surah_number: number;
  ayah_number: number;
  surah_name_ar: string;
  surah_name_en: string;
  surah_meaning: string;
  revelation_type: string;
  verses_count: number;
  text_ar: string;
  has_bismillah?: boolean;
  bismillah?: string | null;
  translation_en?: string;
  translation_ur?: string;
  provenance: string;
  checksum: string;
}

export interface SurahMeta {
  surah_number: number;
  name_ar: string;
  name_en: string;
  meaning: string;
  revelation_type: string;
  verses_count: number;
}

export interface SearchResultItem {
  id: string;
  source_type: 'quran' | 'hadith';
  surah_number?: number;
  ayah_number?: number;
  surah_name_ar?: string;
  surah_name_en?: string;
  collection?: string;
  hadith_number?: number;
  text_ar?: string;
  has_bismillah?: boolean;
  bismillah?: string | null;
  translation_en?: string;
  translation_ur?: string;
  provenance?: string;
}

export interface ReviewQueueItem {
  id: string;
  item_type: string;
  question_or_topic: string;
  proposed_answer?: string;
  supporting_evidence_ids: string[];
  missing_evidence?: string;
  user_feedback?: string;
  review_status: string;
  created_at: string;
}
