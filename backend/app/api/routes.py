import base64
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.api.schemas import (
    ChatRequest, ChatResponse, ConnectionTestResponse, ConversationRenameRequest,
    DebateAnalyzeRequest, DebateResponse, HealthResponse, ProviderMetadata,
    ReviewQueueCreateRequest, SearchResultItem, SourceStatusResponse, VerseDetail
)
from app.config import settings
from app.db.connection import get_connection
from app.debate.analyzer import DebateAnalysisEngine
from app.evidence.hadith_importer import get_hadith_status
from app.evidence.retriever import (
    get_quran_surah_info, get_quran_verse, is_conversational_greeting,
    retrieve_relevant_evidence, search_hadith_fts, search_quran_fts
)
from app.evidence.verifier import CitationVerificationEngine
from app.memory.repository import MemoryRepository
from app.providers.manager import provider_manager

from app.api.dictate import dictate_router
from app.api.tts import tts_router
from app.api.debate_voice import debate_voice_router

logger = logging.getLogger(__name__)
router = APIRouter()
router.include_router(dictate_router)
router.include_router(tts_router)
router.include_router(debate_voice_router)


# --- System & Health ---

@router.get("/health", response_model=HealthResponse)
def health_check():
    quran_count = 0
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM quran_verses;")
        quran_count = cursor.fetchone()[0]

    hadith_stat = get_hadith_status()
    meta = provider_manager.get_active_provider().get_metadata()

    return HealthResponse(
        status="healthy",
        version="1.0.0-phase1",
        environment=settings.ENVIRONMENT,
        quran_records_loaded=quran_count,
        hadith_configured=hadith_stat["is_configured"],
        active_provider=meta["provider_id"],
        active_model=meta["model"]
    )


# --- Providers & AI Settings ---

@router.get("/providers", response_model=List[ProviderMetadata])
def get_providers():
    return provider_manager.list_providers()


@router.get("/providers/status", response_model=ConnectionTestResponse)
def test_active_provider_status():
    provider = provider_manager.get_active_provider()
    res = provider.test_connection()
    return ConnectionTestResponse(
        status=res["status"],
        message=res["message"],
        model=res["model"],
        latency_ms=res.get("latency_ms")
    )


# --- Chat & Grounded Reasoning ---

@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    # 1. Manage Conversation
    conv_id = req.conversation_id
    if not conv_id:
        title_snippet = req.question[:40].strip() + ("..." if len(req.question) > 40 else "")
        active_meta = provider_manager.get_active_provider().get_metadata()
        conv = MemoryRepository.create_conversation(
            title=title_snippet or "New Islamic Research",
            provider=active_meta["provider_id"],
            model=active_meta["model"]
        )
        conv_id = conv["id"]
    else:
        existing = MemoryRepository.get_conversation(conv_id)
        if not existing:
            active_meta = provider_manager.get_active_provider().get_metadata()
            conv = MemoryRepository.create_conversation(
                title="Islamic Research",
                provider=active_meta["provider_id"],
                model=active_meta["model"]
            )
            conv_id = conv["id"]

    # 2. Persist user message
    user_msg = MemoryRepository.add_message(
        conv_id=conv_id,
        role="user",
        content=req.question,
        language=req.language
    )

    # 3. Handle optional image
    image_bytes = None
    if req.image_base64:
        try:
            # Check maximum size (5 MB limit)
            image_bytes = base64.b64decode(req.image_base64)
            if len(image_bytes) > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Image exceeds 5MB size limit.")
        except Exception as e:
            logger.warning(f"Failed to decode attached image: {e}")

    # 4. Check if conversational greeting vs religious inquiry
    is_greeting = is_conversational_greeting(req.question)

    # Retrieve locally approved evidence from SQLite (skip for simple greetings)
    retrieved_evidence = [] if is_greeting else retrieve_relevant_evidence(req.question, max_results=6)

    # 5. Step 5 & 6: Provider reasoning
    provider = provider_manager.get_active_provider()
    raw_model_response = provider.generate_grounded_response(
        question=req.question,
        retrieved_evidence=retrieved_evidence,
        language=req.language,
        image_bytes=image_bytes,
        image_mime_type=req.image_mime_type or "image/jpeg",
        is_greeting=is_greeting
    )

    # 6. Step 7, 8, 9, 10: Citation Verification Engine
    verified_data = CitationVerificationEngine.verify_pipeline(
        model_output=raw_model_response,
        retrieved_evidence=retrieved_evidence,
        user_language=req.language,
        is_greeting=is_greeting
    )

    # 7. Persist assistant message
    asst_msg = MemoryRepository.add_message(
        conv_id=conv_id,
        role="assistant",
        content=verified_data["direct_answer"],
        language=verified_data["language"],
        evidence_citations=verified_data["evidence_cards"],
        has_unverified=verified_data["has_unverified_claims"],
        unverified_reason=verified_data.get("limitations")
    )

    # If answer has unverified claims, track in review queue
    if verified_data["has_unverified_claims"]:
        MemoryRepository.add_to_review_queue(
            item_type="unverified_claim",
            question_or_topic=req.question,
            proposed_answer=verified_data["direct_answer"],
            supporting_evidence_ids=verified_data["verified_source_ids"],
            missing_evidence="Insufficient local scripture evidence to verify question claims."
        )

    active_meta = provider.get_metadata()
    return ChatResponse(
        conversation_id=conv_id,
        user_message_id=user_msg["id"],
        assistant_message_id=asst_msg["id"],
        direct_answer=verified_data["direct_answer"],
        language=verified_data["language"],
        evidence_cards=verified_data["evidence_cards"],
        claims=verified_data["claims"],
        has_unverified_claims=verified_data["has_unverified_claims"],
        limitations=verified_data.get("limitations"),
        provider=active_meta["provider_name"],
        model=active_meta["model"]
    )


# --- Conversations Management ---

@router.get("/conversations")
def list_conversations():
    return MemoryRepository.list_conversations()


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: str):
    conv = MemoryRepository.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.patch("/conversations/{conv_id}")
def rename_conversation(conv_id: str, body: ConversationRenameRequest):
    success = MemoryRepository.rename_conversation(conv_id, body.title)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "success", "id": conv_id, "title": body.title}


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str):
    success = MemoryRepository.delete_conversation(conv_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "success", "id": conv_id}


# --- Debates Management ---

@router.post("/debates/analyze", response_model=DebateResponse)
def analyze_debate(req: DebateAnalyzeRequest):
    try:
        report = DebateAnalysisEngine.analyze_transcript(
            transcript=req.transcript,
            title=req.title or "Debate Analysis",
            language=req.language
        )
        return DebateResponse(**report)
    except Exception as e:
        logger.error(f"Debate analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Debate analysis failed: {str(e)}")


@router.get("/debates")
def list_debates():
    return MemoryRepository.list_debates()


@router.get("/debates/{debate_id}", response_model=DebateResponse)
def get_debate(debate_id: str):
    debate = MemoryRepository.get_debate(debate_id)
    if not debate:
        raise HTTPException(status_code=404, detail="Debate report not found")
    # Attach evidence cards for any verified IDs
    evidence_cards = []
    seen = set()
    for claim in debate.get("claims", []):
        for cid in claim.get("evidence_ids", []):
            if cid not in seen:
                card = CitationVerificationEngine.validate_source_id(cid) if hasattr(CitationVerificationEngine, "validate_source_id") else None
                if not card:
                    from app.evidence.verifier import validate_source_id
                    card = validate_source_id(cid)
                if card:
                    evidence_cards.append(card)
                    seen.add(cid)
    debate["evidence_cards"] = evidence_cards
    return DebateResponse(**debate)


@router.delete("/debates/{debate_id}")
def delete_debate(debate_id: str):
    success = MemoryRepository.delete_debate(debate_id)
    if not success:
        raise HTTPException(status_code=404, detail="Debate not found")
    return {"status": "success", "id": debate_id}


# --- Evidence Library & Search ---

@router.get("/sources/status", response_model=SourceStatusResponse)
def get_sources_status():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM quran_verses;")
        verse_count = cursor.fetchone()[0]
        cursor.execute("SELECT * FROM corpus_provenance WHERE corpus_key = 'quran_arabic';")
        prov_row = cursor.fetchone()
        prov_data = dict(prov_row) if prov_row else {}

    hadith_stat = get_hadith_status()

    return SourceStatusResponse(
        quran={
            "is_configured": verse_count == 6236,
            "total_surahs": 114,
            "total_verses": verse_count,
            "edition": prov_data.get("edition", "Tanzil Quran Text (Simple v1.1)"),
            "license": prov_data.get("license", "Creative Commons Attribution 3.0"),
            "translations": [
                {"language": "en", "name": "Saheeh International (Tanzil edition)"},
                {"language": "ur", "name": "Fateh Muhammad Jalandhry (Tanzil edition)"}
            ]
        },
        hadith=hadith_stat
    )


@router.get("/sources/surahs")
def list_surahs():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM quran_surahs ORDER BY surah_number ASC;")
        return [dict(r) for r in cursor.fetchall()]


@router.get("/sources/quran/{surah}/{ayah}", response_model=VerseDetail)
def get_verse_detail(surah: int, ayah: int):
    verse = get_quran_verse(surah, ayah)
    if not verse:
        raise HTTPException(
            status_code=404,
            detail=f"Verse not found: Surah {surah}, Ayah {ayah}. (Valid surahs: 1-114)"
        )
    return VerseDetail(**verse)


@router.get("/sources/search", response_model=List[SearchResultItem])
def search_sources(
    q: str = Query(..., min_length=1, max_length=150),
    source_type: str = Query(default="all", pattern="^(all|quran|hadith)$"),
    limit: int = Query(default=20, ge=1, le=50)
):
    results = []
    if source_type in ("all", "quran"):
        results.extend(search_quran_fts(q, limit=limit))
    if source_type in ("all", "hadith"):
        results.extend(search_hadith_fts(q, limit=limit))
    return results[:limit]


# --- Review Queue ---

@router.get("/review-queue")
def get_review_queue(status: Optional[str] = None):
    return MemoryRepository.list_review_queue(status=status)


@router.post("/review-queue")
def submit_review_item(item: ReviewQueueCreateRequest):
    return MemoryRepository.add_to_review_queue(
        item_type=item.item_type,
        question_or_topic=item.question_or_topic,
        proposed_answer=item.proposed_answer,
        supporting_evidence_ids=item.supporting_evidence_ids,
        missing_evidence=item.missing_evidence,
        user_feedback=item.user_feedback
    )
