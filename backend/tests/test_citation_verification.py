import pytest
from app.evidence.verifier import CitationVerificationEngine, validate_source_id, verify_arabic_quotation


def test_validate_valid_source_id():
    card = validate_source_id("quran:1:1")
    assert card is not None
    assert card["source_id"] == "quran:1:1"
    assert card["surah_name_en"] == "Al-Fatihah"
    assert card["is_verified"] is True


def test_reject_fabricated_source_id():
    # Nonexistent Ayah
    assert validate_source_id("quran:1:99") is None

    # Nonexistent Surah
    assert validate_source_id("quran:200:1") is None

    # Hallucinated format
    assert validate_source_id("quran:bukhari:1") is None
    assert validate_source_id("quran:invalid") is None
    assert validate_source_id("") is None
    assert validate_source_id(None) is None

    # Unapproved Hadith ID
    assert validate_source_id("hadith:fabricated_collection:999") is None


def test_verify_arabic_quotation():
    canonical = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    assert verify_arabic_quotation("بسم الله", canonical) is True
    assert verify_arabic_quotation("الرحمن الرحيم", canonical) is True
    assert verify_arabic_quotation("كلمة غير موجودة", canonical) is False


def test_verification_pipeline_sanitizes_fabricated_citations():
    mock_model_output = {
        "direct_answer": "This is a theological explanation with references.",
        "language": "en",
        "cited_source_ids": ["quran:1:1", "quran:999:999", "hadith:fake:500"],
        "claims": [
            {
                "claim_text": "First verified assertion",
                "cited_ids": ["quran:1:1"],
                "notes": "Supported by Al-Fatihah"
            },
            {
                "claim_text": "Second unverified assertion with fake citation",
                "cited_ids": ["quran:999:999"],
                "notes": "Attempted fake citation"
            }
        ]
    }

    result = CitationVerificationEngine.verify_pipeline(
        model_output=mock_model_output,
        retrieved_evidence=[{"id": "quran:1:1"}],
        user_language="en"
    )

    # quran:1:1 is accepted, fake citations are rejected
    assert "quran:1:1" in result["verified_source_ids"]
    assert "quran:999:999" in result["rejected_source_ids"]
    assert "hadith:fake:500" in result["rejected_source_ids"]
    assert len(result["evidence_cards"]) == 1
    assert result["evidence_cards"][0]["source_id"] == "quran:1:1"

    # Second claim was stripped of its fake citation and marked unverified
    claims = result["claims"]
    assert claims[0]["verification_status"] == "verified"
    assert claims[1]["verification_status"] == "unverified"
    assert len(claims[1]["cited_ids"]) == 0


def test_verification_pipeline_enforces_transparent_disclaimer_when_empty():
    mock_empty_output = {
        "direct_answer": "An answer made without any approved scripture in the database.",
        "language": "en",
        "cited_source_ids": [],
        "claims": []
    }

    result = CitationVerificationEngine.verify_pipeline(
        model_output=mock_empty_output,
        retrieved_evidence=[],
        user_language="en"
    )

    assert result["has_unverified_claims"] is True
    assert CitationVerificationEngine.UNVERIFIED_NOTICE in result["direct_answer"]
