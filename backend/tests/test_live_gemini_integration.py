import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)


def test_live_provider_status():
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured. Skipping live test.")

    res = client.get("/api/providers/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "connected"
    assert data["latency_ms"] is not None
    assert data["latency_ms"] > 0


def test_live_chat_and_verification_pipeline():
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured. Skipping live test.")

    # Ask about Surah Al-Ikhlas (112:1)
    payload = {
        "question": "What is the evidence regarding the oneness of God in Surah 112:1?",
        "language": "en"
    }

    res = client.post("/api/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "conversation_id" in data
    assert len(data["direct_answer"]) > 0

    # Ensure evidence cards are present and verified
    assert len(data["evidence_cards"]) > 0
    first_card = data["evidence_cards"][0]
    assert first_card["source_id"].startswith("quran:")
    assert first_card["is_verified"] is True
    assert "text_ar" in first_card

    # Check conversation persistence
    conv_id = data["conversation_id"]
    get_conv = client.get(f"/api/conversations/{conv_id}")
    assert get_conv.status_code == 200
    conv_data = get_conv.json()
    assert len(conv_data["messages"]) == 2
    assert conv_data["messages"][0]["role"] == "user"
    assert conv_data["messages"][1]["role"] == "assistant"
