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


def test_empty_turn_complete_resets_to_user_turn_without_hanging():
    """Prove clicking Respond Now with no audio immediately returns to user_turn (QA Failure A)."""
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # Send turn_complete without any audio
        ws.send_json({"type": "turn_complete"})
        state_msg = ws.receive_json()
        assert state_msg["type"] == "state_change"
        assert state_msg["state"] == "user_turn"

        ws.send_json({"type": "end"})


def test_sub_4800_byte_turn_resets_to_user_turn_without_hanging():
    """Prove undersized turns (<4800 bytes) safely reset to user_turn."""
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # Send 2000 bytes (< 4800 byte threshold)
        ws.send_bytes(b"\x00\x05" * 1000)
        ws.send_json({"type": "turn_complete"})

        state_msg = ws.receive_json()
        assert state_msg["type"] == "state_change"
        assert state_msg["state"] == "user_turn"

        ws.send_json({"type": "end"})


def test_silent_audio_turn_rejected_with_user_turn_state_change():
    """Prove pure silence / noise floor bursts (RMS < 0.010) are discarded without hanging."""
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # 8,000 bytes of silence (RMS ~ 0)
        ws.send_bytes(b"\x00\x00" * 4000)
        ws.send_json({"type": "turn_complete"})

        state_msg = ws.receive_json()
        assert state_msg["type"] == "state_change"
        assert state_msg["state"] == "user_turn"

        ws.send_json({"type": "end"})


def test_mute_state_preserves_recorded_audio_and_commits_on_turn_complete():
    """
    CRITICAL REGRESSION TEST (Failure A):
    1. User speaks question (sends valid speech PCM).
    2. User clicks Mute (sends mute_state: is_muted=True).
    3. User clicks Respond Now (sends turn_complete).
    4. Server DOES NOT discard speech; transitions to thinking and processes turn!
    """
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    import math
    import struct

    # Generate 1.0s of synthetic voiced speech (~32,000 bytes of 16kHz PCM16, RMS ~ 0.25)
    samples = []
    for i in range(16000):
        t = i / 16000.0
        val = (math.sin(2 * math.pi * 180 * t) * 0.7 + math.sin(2 * math.pi * 360 * t) * 0.3) * 0.35
        samples.append(int(val * 32767))
    speech_pcm = struct.pack(f"<{len(samples)}h", *samples)

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # Step 1: User speaks question
        ws.send_bytes(speech_pcm)

        # Step 2: User clicks Mute
        ws.send_json({"type": "mute_state", "is_muted": True})

        # Step 3: User clicks Respond Now
        ws.send_json({"type": "turn_complete"})

        # Step 4: Server must NOT reject or discard; must transition to thinking
        thinking_msg = ws.receive_json()
        assert thinking_msg["type"] == "state_change"
        assert thinking_msg["state"] == "thinking"

        # Drain until turn completes or audio arrives
        events_seen = 0
        while events_seen < 40:
            try:
                msg = ws.receive_json()
                events_seen += 1
                if msg.get("type") in ("audio", "output_caption", "turn_complete"):
                    break
            except Exception:
                break

        ws.send_json({"type": "end"})

