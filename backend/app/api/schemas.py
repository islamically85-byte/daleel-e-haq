from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# --- Health & Providers ---

class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    quran_records_loaded: int
    hadith_configured: bool
    active_provider: str
    active_model: str
    provider_configured: bool = False
    provider_status: str = "unconfigured"


class ProviderMetadata(BaseModel):
    provider_id: str
    provider_name: str
    mode: str
    model: str
    is_configured: bool
    is_active: bool
    status_label: Optional[str] = None
    data_privacy: str
    planned_actions: Optional[List[Dict[str, Any]]] = None


class ConnectionTestResponse(BaseModel):
    status: str
    message: str
    model: str
    latency_ms: Optional[float] = None


# --- Chat & Evidence ---

class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    question: str = Field(..., min_length=1, max_length=4000)
    language: str = Field(default="en", pattern="^(en|ur)$")
    image_base64: Optional[str] = None
    image_mime_type: Optional[str] = None


class EvidenceCard(BaseModel):
    source_id: str
    source_type: str
    surah_number: Optional[int] = None
    ayah_number: Optional[int] = None
    surah_name_ar: Optional[str] = None
    surah_name_en: Optional[str] = None
    surah_meaning: Optional[str] = None
    revelation_type: Optional[str] = None
    collection: Optional[str] = None
    hadith_number: Optional[int] = None
    book_name: Optional[str] = None
    chapter_name: Optional[str] = None
    text_ar: Optional[str] = None
    has_bismillah: Optional[bool] = False
    bismillah: Optional[str] = None
    translation_en: Optional[str] = None
    translation_ur: Optional[str] = None
    narrator: Optional[str] = None
    grade: Optional[str] = None
    graded_by: Optional[str] = None
    provenance: Optional[str] = None
    is_verified: bool = True


class ClaimItem(BaseModel):
    claim_text: str
    cited_ids: List[str] = []
    verification_status: str
    notes: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    user_message_id: str
    assistant_message_id: str
    direct_answer: str
    language: str
    evidence_cards: List[EvidenceCard] = []
    claims: List[ClaimItem] = []
    has_unverified_claims: bool = False
    limitations: Optional[str] = None
    provider: str
    model: str


# --- Debate Analysis ---

class DebateAnalyzeRequest(BaseModel):
    title: Optional[str] = "Debate Analysis"
    transcript: str = Field(..., min_length=10, max_length=50000)
    language: str = Field(default="en", pattern="^(en|ur)$")


class DebateClaimItem(BaseModel):
    id: Optional[str] = None
    claim_number: int
    claim_text: str
    alleged_source: Optional[str] = None
    verification_status: str
    evidence_ids: List[str] = []
    response_text: str
    logical_issues: Optional[str] = None
    interpretive_notes: Optional[str] = None


class DebateResponse(BaseModel):
    id: str
    title: str
    language: str
    created_at: str
    topic: str
    summary: str
    claims: List[DebateClaimItem] = []
    evidence_cards: List[EvidenceCard] = []
    unresolved_issues: List[str] = []
    synthesis: str


# --- Sources & Library ---

class SourceStatusResponse(BaseModel):
    quran: Dict[str, Any]
    hadith: Dict[str, Any]


class VerseDetail(BaseModel):
    id: str
    surah_number: int
    ayah_number: int
    surah_name_ar: str
    surah_name_en: str
    surah_meaning: str
    revelation_type: str
    verses_count: int
    text_ar: str
    has_bismillah: Optional[bool] = False
    bismillah: Optional[str] = None
    translation_en: Optional[str] = None
    translation_ur: Optional[str] = None
    provenance: str
    checksum: str


class SearchResultItem(BaseModel):
    id: str
    source_type: str
    surah_number: Optional[int] = None
    ayah_number: Optional[int] = None
    surah_name_ar: Optional[str] = None
    surah_name_en: Optional[str] = None
    collection: Optional[str] = None
    hadith_number: Optional[int] = None
    text_ar: Optional[str] = None
    has_bismillah: Optional[bool] = False
    bismillah: Optional[str] = None
    translation_en: Optional[str] = None
    translation_ur: Optional[str] = None
    provenance: Optional[str] = None


class ConversationRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)


class ReviewQueueCreateRequest(BaseModel):
    item_type: str
    question_or_topic: str
    proposed_answer: Optional[str] = None
    supporting_evidence_ids: Optional[List[str]] = None
    missing_evidence: Optional[str] = None
    user_feedback: Optional[str] = None
