import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)


def test_debate_voice_status_endpoint():
    res = client.get("/api/debate/voice-status")
    assert res.status_code == 200
    data = res.json()
    assert data["model"] == "gemini-3.8-live"
    assert data["input_sample_rate"] == 16000
    assert data["output_sample_rate"] == 24000
    assert "Puck" in data["supported_voices"]
    if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
        assert data["status"] == "ready"


def test_save_debate_session_endpoint():
    res = client.post("/api/debate/save-session", json={
        "title": "Tawhid and Divine Unity Spoken Debate",
        "raw_transcript": "User: What is the argument for Tawhid in Surah Al-Ikhlas?\nAI: Say He is Allah, the One.",
        "language": "en",
        "topic": "Monotheism"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "saved"
    assert data["debate_id"].startswith("deb_")


def test_debate_live_websocket_connection():
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured. Skipping live WebSocket test.")

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "ready"
        assert init_msg["model"] == "gemini-3.8-live"
        assert init_msg["voice"] == "Puck"

        # Send ping
        ws.send_json({"type": "ping"})
        pong = ws.receive_json()
        assert pong["type"] == "pong"

        # Send end session signal
        ws.send_json({"type": "end"})
