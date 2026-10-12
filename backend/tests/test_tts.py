import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)


def test_list_voices():
    res = client.get("/api/tts/voices")
    assert res.status_code == 200
    voices = res.json()
    voice_ids = [v["id"] for v in voices]
    assert "Kore" in voice_ids
    assert "Puck" in voice_ids
    assert "Aoede" in voice_ids
    assert "Charon" in voice_ids


def test_get_voice_preview():
    # Test cached voice preview
    res = client.get("/api/tts/preview/kore")
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert len(res.content) > 1000


def test_get_invalid_voice_preview():
    res = client.get("/api/tts/preview/invalid_voice_name")
    assert res.status_code == 404


def test_tts_generation():
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    payload = {
        "text": "Salam. Testing Daleel-e-Haq speech generation.",
        "voice": "Kore",
        "language": "en"
    }
    res = client.post("/api/tts/generate", json=payload)
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert len(res.content) > 1000

    # Second call should return cached response immediately
    res_cached = client.post("/api/tts/generate", json=payload)
    assert res_cached.status_code == 200
    assert res_cached.content == res.content
