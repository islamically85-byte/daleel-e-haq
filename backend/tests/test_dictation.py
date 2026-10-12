import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)


def test_dictate_status_endpoint():
    res = client.get("/api/dictate/status")
    assert res.status_code == 200
    data = res.json()
    assert data["model"] == "gemini-3.5-transcribe-live"
    assert data["sample_rate"] == 16000
    assert data["format"] == "pcm16_le"
    if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
        assert data["status"] == "ready"


def test_dictate_websocket_connection():
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured. Skipping live WebSocket test.")

    with client.websocket_connect("/api/ws/dictate?language=auto") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "ready"
        assert init_msg["model"] == "gemini-3.5-transcribe-live"
        assert init_msg["language"] == "auto"

        # Send ping
        ws.send_json({"type": "ping"})
        pong = ws.receive_json()
        assert pong["type"] == "pong"

        # Send finish signal
        ws.send_json({"type": "finish"})

        # Send stop
        ws.send_json({"type": "stop"})


def test_dictate_normalize_empty():
    res = client.post("/api/dictate/normalize", json={"transcript": "   ", "user_preferred_language": "ur"})
    assert res.status_code == 200
    data = res.json()
    assert data["normalized_text"] == ""
    assert data["detected_dominant_language"] == "ur"
    assert data["is_uncertain"] is False


def test_dictate_normalize_multilingual():
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    # Mixed English/Urdu with English dominance
    res_en = client.post("/api/dictate/normalize", json={
        "transcript": "What does the Holy Quran state in Surah 2:255 regarding divine power aur shirk ki mumaniat?",
        "user_preferred_language": "en"
    })
    assert res_en.status_code == 200
    data_en = res_en.json()
    assert data_en["detected_dominant_language"] == "en"
    assert "2:255" in data_en["normalized_text"]

    # Hindi/Urdu mixed: must produce Urdu script, no Devanagari
    res_ur = client.post("/api/dictate/normalize", json={
        "transcript": "Yeh bataiye ki Surah Al-Ikhlas mein divine oneness ke baare mein kya daleel hai?",
        "user_preferred_language": "ur"
    })
    assert res_ur.status_code == 200
    data_ur = res_ur.json()
    assert data_ur["detected_dominant_language"] == "ur"
    # Ensure no Devanagari script characters (U+0900 to U+097F)
    assert not any('\u0900' <= ch <= '\u097F' for ch in data_ur["normalized_text"])
