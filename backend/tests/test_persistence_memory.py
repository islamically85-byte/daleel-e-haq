import pytest
from app.memory.repository import MemoryRepository


def test_conversation_lifecycle():
    # 1. Create conversation
    conv = MemoryRepository.create_conversation(title="Test Discussion", provider="gemini", model="gemini-3.8-flash")
    conv_id = conv["id"]
    assert conv_id.startswith("conv_")
    assert conv["title"] == "Test Discussion"

    # 2. Add User Message
    msg1 = MemoryRepository.add_message(
        conv_id=conv_id,
        role="user",
        content="What does Surah Al-Ikhlas say?",
        language="en"
    )
    assert msg1["role"] == "user"

    # 3. Add Assistant Message with evidence
    evidence = [{
        "source_id": "quran:112:1",
        "source_type": "quran",
        "surah_number": 112,
        "ayah_number": 1,
        "text_ar": "قُلْ هُوَ اللَّهُ أَحَدٌ"
    }]
    msg2 = MemoryRepository.add_message(
        conv_id=conv_id,
        role="assistant",
        content="Say, He is Allah, [who is] One.",
        language="en",
        evidence_citations=evidence,
        has_unverified=False
    )
    assert msg2["role"] == "assistant"
    assert len(msg2["evidence_citations"]) == 1

    # 4. Retrieve conversation
    retrieved = MemoryRepository.get_conversation(conv_id)
    assert retrieved is not None
    assert len(retrieved["messages"]) == 2
    assert retrieved["messages"][1]["evidence_citations"][0]["source_id"] == "quran:112:1"

    # 5. Rename conversation
    assert MemoryRepository.rename_conversation(conv_id, "Tawheed & Surah Ikhlas") is True
    updated = MemoryRepository.get_conversation(conv_id)
    assert updated["title"] == "Tawheed & Surah Ikhlas"

    # 6. Delete conversation
    assert MemoryRepository.delete_conversation(conv_id) is True
    assert MemoryRepository.get_conversation(conv_id) is None


def test_debate_persistence():
    analysis_payload = {
        "topic": "Theology of Divine Oneness",
        "summary": "Discussion comparing monotheistic arguments.",
        "claims": [
            {
                "claim_number": 1,
                "claim_text": "Opponent argues multiplicity in divine attributes implies division.",
                "alleged_source": "Philosophical argument",
                "verification_status": "unverified",
                "evidence_ids": ["quran:112:1"],
                "response_text": "Divine oneness in Quran encompasses undivided perfection.",
                "logical_issues": "False dichotomy between unity and attributes.",
                "interpretive_notes": "Classical Ash'ari and Maturidi responses."
            }
        ],
        "unresolved_issues": ["Epistemological limits of anthropomorphic metaphors"],
        "synthesis": "The argument conflates created multiplicity with divine attributes."
    }

    saved = MemoryRepository.save_debate(
        title="Sample Theological Debate",
        raw_transcript="Speaker A: ... Speaker B: ...",
        language="en",
        analysis_data=analysis_payload
    )
    debate_id = saved["id"]
    assert debate_id.startswith("deb_")
    assert saved["topic"] == "Theology of Divine Oneness"
    assert len(saved["claims"]) == 1
    assert saved["claims"][0]["claim_number"] == 1

    # Fetch from memory
    fetched = MemoryRepository.get_debate(debate_id)
    assert fetched is not None
    assert len(fetched["claims"]) == 1
    assert fetched["claims"][0]["evidence_ids"] == ["quran:112:1"]

    # Delete debate
    assert MemoryRepository.delete_debate(debate_id) is True
    assert MemoryRepository.get_debate(debate_id) is None


def test_review_queue():
    item = MemoryRepository.add_to_review_queue(
        item_type="unverified_claim",
        question_or_topic="Unverified historical attribution",
        proposed_answer="Needs further Hadith takhrij",
        supporting_evidence_ids=[],
        missing_evidence="Chain of narration not in approved local database"
    )
    assert item["review_status"] == "pending"

    pending_list = MemoryRepository.list_review_queue(status="pending")
    assert any(i["id"] == item["id"] for i in pending_list)
