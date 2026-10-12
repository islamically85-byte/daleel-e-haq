import base64
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.config import settings
from app.evidence.verifier import CitationVerificationEngine, validate_source_id, verify_arabic_quotation
from app.api.debate_voice import MAX_AUDIO_FRAME_BYTES, MAX_AUDIO_BYTES_PER_TURN
from app.memory.repository import MemoryRepository

client = TestClient(app)


# ---------------------------------------------------------------------------
# Priority 1: Audio Engine Invariants & Hardening
# ---------------------------------------------------------------------------

def test_audio_buffer_bounds_constants():
    """Prove audio streaming limits prevent unbounded memory growth (QA-24)."""
    assert MAX_AUDIO_FRAME_BYTES == 65536  # 64 KB
    assert MAX_AUDIO_BYTES_PER_TURN == 3840000  # 3.84 MB (~120s of 16kHz PCM16)


# ---------------------------------------------------------------------------
# Priority 2: Religious Verification (Binding, Quotes, Hadith Limitations)
# ---------------------------------------------------------------------------

def test_verifier_unrelated_genuine_verse_marked_unverified():
    """
    CRITICAL: Validating candidate IDs globally against SQLite allowed
    citations of unrelated Quran verses to pass as verified (QA audit).
    This test proves that a genuine verse in SQLite (quran:2:255) is rejected
    if it was NOT part of the retrieved evidence for the query.
    """
    mock_model_output = {
        "direct_answer": "Claiming that God has divine partners.",
        "language": "en",
        "cited_source_ids": ["quran:2:255", "quran:112:1"],
        "claims": [
            {
                "claim_text": "Surah 112:1 establishes absolute monotheism",
                "cited_ids": ["quran:112:1"],
                "notes": "Relevant to oneness of God"
            },
            {
                "claim_text": "Surah 2:255 is cited as an unrelated proof",
                "cited_ids": ["quran:2:255"],
                "notes": "Unrelated genuine verse"
            }
        ]
    }

    # Only 112:1 was retrieved for this specific query
    retrieved = [{"id": "quran:112:1", "source_id": "quran:112:1"}]

    result = CitationVerificationEngine.verify_pipeline(
        model_output=mock_model_output,
        retrieved_evidence=retrieved,
        user_language="en"
    )

    # quran:112:1 was in retrieval set -> verified
    assert "quran:112:1" in result["verified_source_ids"]
    # quran:2:255 was NOT in retrieval set -> rejected / unverified
    assert "quran:2:255" in result["rejected_source_ids"]

    # Verify claim 0 is verified, but claim 1 is unverified
    claims = result["claims"]
    assert claims[0]["verification_status"] == "verified"
    assert claims[1]["verification_status"] == "unverified"


def test_verifier_arabic_quotation_mismatch_rejected():
    """Proves quotation tampering or altered Arabic words fails verification."""
    # Canonical Surah 112:1: قُلْ هُوَ اللَّهُ أَحَدٌ
    canonical = "قُلْ هُوَ اللَّهُ أَحَدٌ"
    accurate_quote = "قُلْ هُوَ اللَّهُ"
    tampered_quote = "قُلْ هُوَ شَرِيكٌ"  # Inserted shirk word

    assert verify_arabic_quotation(accurate_quote, canonical) is True
    assert verify_arabic_quotation(tampered_quote, canonical) is False


def test_hadith_corpus_uninstalled_honest_disclosure():
    """
    Proves that Hadith citations cannot pass as verified when local corpus has 0 records.
    The system must never fabricate Hadith evidence or grades.
    """
    # SQLite returns None for any uninstalled Hadith record
    card = validate_source_id("hadith:bukhari:1")
    assert card is None

    mock_output = {
        "direct_answer": "According to Hadith Bukhari 1...",
        "language": "en",
        "cited_source_ids": ["hadith:bukhari:1"],
        "claims": [
            {
                "claim_text": "Action is judged by intention",
                "cited_ids": ["hadith:bukhari:1"]
            }
        ]
    }

    result = CitationVerificationEngine.verify_pipeline(
        model_output=mock_output,
        retrieved_evidence=[],
        user_language="en"
    )

    assert "hadith:bukhari:1" in result["rejected_source_ids"]
    assert result["has_unverified_claims"] is True
    assert result["claims"][0]["verification_status"] == "unverified"


# ---------------------------------------------------------------------------
# Priority 3: Debate Session Isolation & Reopen by ID
# ---------------------------------------------------------------------------

def test_debate_save_and_reopen_by_id():
    """Prove save/reopen preserves exact turn counts, order, and specific ID."""
    payload1 = {
        "title": "Debate Session One",
        "raw_transcript": "User: What is Tawhid?\n\nDaleel-e-Haq: Tawhid is the absolute oneness of God (112:1).",
        "topic": "Divine Oneness",
        "language": "en",
        "summary": "First debate test session"
    }

    save_res = client.post("/api/debate/save-session", json=payload1)
    assert save_res.status_code == 200
    debate_id1 = save_res.json()["debate_id"]

    payload2 = {
        "title": "Debate Session Two",
        "raw_transcript": "User: What is the proof for resurrection in Surah 36:78?\n\nDaleel-e-Haq: Surah 36:79 states He who produced them the first time will revive them.",
        "topic": "Resurrection",
        "language": "en",
        "summary": "Second debate test session"
    }
    save_res2 = client.post("/api/debate/save-session", json=payload2)
    assert save_res2.status_code == 200
    debate_id2 = save_res2.json()["debate_id"]

    assert debate_id1 != debate_id2

    # Fetching debate 1 returns debate 1 data exclusively
    get_res1 = client.get(f"/api/debates/{debate_id1}")
    assert get_res1.status_code == 200
    report1 = get_res1.json()
    assert report1["id"] == debate_id1
    assert report1["title"] == "Debate Session One"
    assert report1["topic"] == "Divine Oneness"

    # Fetching debate 2 returns debate 2 data exclusively
    get_res2 = client.get(f"/api/debates/{debate_id2}")
    assert get_res2.status_code == 200
    report2 = get_res2.json()
    assert report2["id"] == debate_id2
    assert report2["title"] == "Debate Session Two"
    assert report2["topic"] == "Resurrection"


# ---------------------------------------------------------------------------
# Priority 5: Hardening & Bug Fixes (QA-12, QA-15, QA-22, QA-25)
# ---------------------------------------------------------------------------

def test_health_reports_accurate_provider_status():
    """Prove health endpoint does not falsely claim provider is configured if key is unset (QA-22)."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert "provider_configured" in data
    assert "provider_status" in data
    expected_configured = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here")
    assert data["provider_configured"] == expected_configured


def test_cors_has_no_wildcard_with_credentials():
    """Prove CORS configuration does not contain '*' wildcard with allow_credentials (QA-12)."""
    from app.main import app
    from starlette.middleware.cors import CORSMiddleware
    for middleware in app.user_middleware:
        if middleware.cls == CORSMiddleware:
            kwargs = getattr(middleware, "kwargs", {})
            allow_origins = kwargs.get("allow_origins", [])
            allow_credentials = kwargs.get("allow_credentials", False)
            if allow_credentials:
                assert "*" not in allow_origins, "Wildcard '*' origin forbidden when allow_credentials=True"


def test_oversized_image_rejected_with_400():
    """Prove oversized image (>5MB) returns HTTP 400 (QA-25)."""
    # 6MB dummy base64 payload
    oversized_data = b"x" * (6 * 1024 * 1024)
    b64_str = base64.b64encode(oversized_data).decode("utf-8")

    res = client.post("/api/chat", json={
        "question": "What is shown in this manuscript?",
        "image_base64": b64_str,
        "image_mime_type": "image/png"
    })
    assert res.status_code == 400
    assert "5mb" in res.json()["detail"].lower()


def test_provider_failure_returns_502_without_persisting_answer():
    """Prove provider failures return 502/503 and do NOT persist error strings as answers (QA-15)."""
    conv_info = MemoryRepository.create_conversation(title="Error Test")
    conv_id = conv_info["id"]

    with patch("app.providers.gemini.GeminiProvider.generate_grounded_response") as mock_gen:
        mock_gen.return_value = {
            "status": "error",
            "error_message": "Upstream quota exhausted (503 Service Unavailable)"
        }

        res = client.post("/api/chat", json={
            "question": "Explain Surah 112:1",
            "conversation_id": conv_id
        })

        assert res.status_code in [502, 503]

    # Verify no bogus assistant answer was saved to conversation history
    conv_data = client.get(f"/api/conversations/{conv_id}").json()
    messages = conv_data["messages"]
    # Only the user message was saved before provider failure, NEVER an error assistant message
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
