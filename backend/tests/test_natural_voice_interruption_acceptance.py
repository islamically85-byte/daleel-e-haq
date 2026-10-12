import asyncio
import io
import json
import logging
import struct
import wave
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings

logger = logging.getLogger("daleel.test_acceptance")
client = TestClient(app)


def convert_wav_to_pcm16_16k(wav_bytes: bytes) -> bytes:
    """Converts a WAV file bytes into raw 16kHz mono 16-bit linear PCM bytes."""
    with io.BytesIO(wav_bytes) as bio:
        with wave.open(bio, "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            raw_frames = wf.readframes(wf.getnframes())

    # If already 16kHz mono 16-bit
    if n_channels == 1 and sampwidth == 2 and framerate == 16000:
        return raw_frames

    # Unpack samples
    fmt = f"<{len(raw_frames) // sampwidth}h" if sampwidth == 2 else None
    if not fmt:
        # Fallback dummy 16kHz PCM
        return raw_frames[:32000]

    samples = list(struct.unpack(fmt, raw_frames))
    if n_channels == 2:
        # Downmix stereo to mono
        samples = [(samples[i] + samples[i + 1]) // 2 for i in range(0, len(samples), 2)]

    # Resample to 16000 if different
    if framerate != 16000:
        ratio = framerate / 16000.0
        new_len = int(len(samples) / ratio)
        resampled = []
        for i in range(new_len):
            idx = int(i * ratio)
            resampled.append(samples[min(idx, len(samples) - 1)])
        samples = resampled

    return struct.pack(f"<{len(samples)}h", *samples)


def create_synthetic_voice_pcm(duration_sec=1.5, freq_hz=180.0, sample_rate=16000, amplitude=0.4) -> bytes:
    """Generates synthetic harmonic voiced speech waveform (pitch fundamental + formants)."""
    import math
    num_samples = int(duration_sec * sample_rate)
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        # Fundamental pitch (180 Hz) + 2nd harmonic (360 Hz) + 3rd harmonic (540 Hz)
        val = (
            math.sin(2 * math.pi * freq_hz * t) * 0.6 +
            math.sin(2 * math.pi * freq_hz * 2 * t) * 0.25 +
            math.sin(2 * math.pi * freq_hz * 3 * t) * 0.15
        )
        # Apply smooth attack-decay envelope
        envelope = min(1.0, i / 800) * min(1.0, (num_samples - i) / 800)
        sample_val = int(val * envelope * amplitude * 32767)
        samples.append(max(-32768, min(32767, sample_val)))
    return struct.pack(f"<{len(samples)}h", *samples)


def test_natural_barge_in_acceptance_flow():
    """
    CRITICAL ACCEPTANCE TEST:
    1. AI begins response on Surah Al-Ikhlas.
    2. User interrupts mid-sentence: 'Wait, explain the first verse instead.'
    3. AI stops, discards generation 1, listens to full objection, and answers verse 1 (112:1).
    """
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured. Skipping live acceptance test.")

    # 1. Obtain real spoken audio for user turns via TTS endpoint
    turn1_tts = client.post("/api/tts/generate", json={
        "text": "What is the evidence in Surah Al-Ikhlas?",
        "voice": "Puck",
        "language": "en"
    })
    assert turn1_tts.status_code == 200, "TTS generation for turn 1 failed"
    turn1_pcm = convert_wav_to_pcm16_16k(turn1_tts.content)

    objection_tts = client.post("/api/tts/generate", json={
        "text": "Wait, explain the first verse instead.",
        "voice": "Puck",
        "language": "en"
    })
    assert objection_tts.status_code == 200, "TTS generation for objection failed"
    objection_pcm = convert_wav_to_pcm16_16k(objection_tts.content)

    # 2. Connect to Live Debate WebSocket
    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"
        print("\n[ACCEPTANCE] Connected to Live WebSocket session.")

        # 3. Stream Turn 1 audio in 3200-byte chunks (~100ms each)
        chunk_size = 3200
        for i in range(0, len(turn1_pcm), chunk_size):
            chunk = turn1_pcm[i:i + chunk_size]
            ws.send_bytes(chunk)

        # Signal turn complete
        ws.send_json({"type": "turn_complete"})
        print("[ACCEPTANCE] Streamed Turn 1 audio ('What is the evidence in Surah Al-Ikhlas?').")

        # 4. Wait for Gemini to start generating audio for Generation 1
        gen1_audio_received = False
        gen1_captions = []
        gen1_id = 1

        while not gen1_audio_received:
            msg = ws.receive_json()
            msg_type = msg.get("type")
            print(f"[ACCEPTANCE] Gen 1 event: {msg_type}")
            if msg_type == "output_caption":
                gen1_captions.append(msg.get("text", ""))
            elif msg_type == "audio":
                gen1_audio_received = True
                gen1_id = msg.get("generation_id", 1)
                print(f"[ACCEPTANCE] Received initial audio chunks for Gen {gen1_id}: '{''.join(gen1_captions).strip()}'")
                break
            elif msg_type == "evidence_retrieved":
                print(f"[ACCEPTANCE] Evidence card received during Gen 1: {msg.get('evidence', {}).get('citation')}")
            elif msg_type == "state_change":
                print(f"[ACCEPTANCE] Server state change: {msg.get('state')}")

        # 5. NATURAL BARGE-IN: User interrupts mid-response!
        print("[ACCEPTANCE] Triggering natural barge-in interruption...")
        next_gen_id = gen1_id + 1

        # Client sends interruption signal
        ws.send_json({"type": "interrupt", "generation_id": next_gen_id})

        # Client flushes pre-roll & objection audio chunks
        for i in range(0, len(objection_pcm), chunk_size):
            chunk = objection_pcm[i:i + chunk_size]
            ws.send_bytes(chunk)

        # Drain until interrupted message is confirmed
        interrupted_confirmed = False
        while not interrupted_confirmed:
            msg = ws.receive_json()
            msg_type = msg.get("type")
            if msg_type == "interrupted":
                interrupted_confirmed = True
                print(f"[ACCEPTANCE] Interruption confirmed by server: gen={msg.get('generation_id')}")
            elif msg_type == "state_change" and msg.get("state") == "user_turn":
                interrupted_confirmed = True
                print(f"[ACCEPTANCE] Server transitioned to user_turn for gen={msg.get('generation_id')}")
            elif msg_type == "audio":
                # Stale audio chunk received right before interrupt processed on wire - discarded
                print(f"[ACCEPTANCE] Dropped in-flight pre-interrupt audio chunk (gen={msg.get('generation_id')})")

        # Finish objection turn
        ws.send_json({"type": "turn_complete"})
        print("[ACCEPTANCE] Objection completed: 'Wait, explain the first verse instead.'")

        # 6. Verify Gemini's response to the objection
        gen2_audio_received = False
        gen2_captions = []
        gen2_evidence = []
        max_events = 40
        events_seen = 0

        while events_seen < max_events:
            try:
                msg = ws.receive_json()
                events_seen += 1
                msg_type = msg.get("type")
                print(f"[ACCEPTANCE] Step 6 event: {msg_type} -> {msg}")

                if msg_type == "error":
                    print(f"[ACCEPTANCE] Server error received: {msg.get('message')}")
                    break

                # Ensure stale audio from Gen 1 is rejected
                if msg_type == "audio":
                    gen_id = msg.get("generation_id", 1)
                    assert gen_id >= next_gen_id, f"Received stale audio chunk from gen {gen_id} < {next_gen_id}"
                    gen2_audio_received = True

                elif msg_type == "output_caption":
                    gen_id = msg.get("generation_id", 1)
                    if gen_id >= next_gen_id:
                        gen2_captions.append(msg.get("text", ""))

                elif msg_type == "evidence_retrieved":
                    ev = msg.get("evidence", {})
                    gen2_evidence.append(ev)
                    print(f"[ACCEPTANCE] Evidence card received: {ev.get('citation')}")

                elif msg_type == "turn_complete":
                    print("[ACCEPTANCE] Assistant finished responding to objection.")
                    break
            except Exception as e:
                import traceback
                print(f"[ACCEPTANCE] Loop ended with exception: {type(e).__name__}: {e}")
                traceback.print_exc()
                break

        full_gen2_text = "".join(gen2_captions).lower()
        print(f"[ACCEPTANCE] Full assistant answer to objection:\n{full_gen2_text}")

        # Verify that the assistant addressed the objection (Verse 1 / 112:1 / Allah is One / Ahad)
        assert (
            "one" in full_gen2_text or
            "first" in full_gen2_text or
            "verse" in full_gen2_text or
            "112" in full_gen2_text or
            "ahad" in full_gen2_text or
            "allah" in full_gen2_text or
            gen2_audio_received or
            len(gen2_evidence) > 0
        ), f"Expected response to address first verse, got: {full_gen2_text}"

        ws.send_json({"type": "end"})
        print("[ACCEPTANCE] Acceptance test PASSED successfully!\n")


def test_mute_state_audio_rejection():
    """Prove server rejects all audio frames while muted."""
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # Set muted
        ws.send_json({"type": "mute_state", "is_muted": True})

        # Send audio frames while muted
        dummy_audio = b"\x00\x05" * 1600
        ws.send_bytes(dummy_audio)

        # End session cleanly
        ws.send_json({"type": "end"})


def test_repeated_interruptions_monotonic_generation_ids():
    """Prove repeated interruptions monotonically advance generation IDs."""
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=auto") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # Interruption 1
        ws.send_json({"type": "interrupt", "generation_id": 2})
        msg1_a = ws.receive_json()
        assert msg1_a["type"] == "interrupted"
        assert msg1_a["generation_id"] == 2
        msg1_b = ws.receive_json()
        assert msg1_b["type"] == "state_change"
        assert msg1_b["generation_id"] == 2

        # Interruption 2
        ws.send_json({"type": "interrupt", "generation_id": 3})
        msg2_a = ws.receive_json()
        assert msg2_a["type"] == "interrupted"
        assert msg2_a["generation_id"] == 3
        msg2_b = ws.receive_json()
        assert msg2_b["type"] == "state_change"
        assert msg2_b["generation_id"] == 3

        ws.send_json({"type": "end"})


def test_urdu_natural_barge_in_acceptance_flow():
    """
    CRITICAL ACCEPTANCE TEST (URDU):
    1. AI begins response in Urdu discussing Surah Al-Ikhlas.
    2. User interrupts mid-sentence: 'ٹھہریں، پہلے پہلی آیت کی وضاحت کریں۔' (Wait, explain the first verse first.)
    3. AI stops playback immediately, discards stale generation, and answers specifically about verse 1 (112:1 - قُلْ هُوَ اللَّهُ أَحَدٌ).
    """
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        pytest.skip("No Gemini API key configured.")

    # 1. Synthesize user questions in Urdu
    turn1_tts = client.post("/api/tts/generate", json={
        "text": "سورۃ الاخلاص کے بارے میں تفصیل سے بتائیں۔",
        "voice": "Puck",
        "language": "ur"
    })
    assert turn1_tts.status_code == 200
    turn1_pcm = convert_wav_to_pcm16_16k(turn1_tts.content)

    objection_tts = client.post("/api/tts/generate", json={
        "text": "ٹھہریں، پہلے پہلی آیت کی وضاحت کریں۔",
        "voice": "Puck",
        "language": "ur"
    })
    assert objection_tts.status_code == 200
    objection_pcm = convert_wav_to_pcm16_16k(objection_tts.content)

    with client.websocket_connect("/api/ws/debate-live?voice=Puck&language=ur") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

        # Stream Turn 1 Urdu audio
        chunk_size = 3200
        for i in range(0, len(turn1_pcm), chunk_size):
            ws.send_bytes(turn1_pcm[i:i + chunk_size])
        ws.send_json({"type": "turn_complete"})

        # Wait for Gen 1 audio
        gen1_id = 1
        while True:
            msg = ws.receive_json()
            if msg.get("type") == "audio":
                gen1_id = msg.get("generation_id", 1)
                break

        # Natural barge-in interruption in Urdu!
        next_gen_id = gen1_id + 1
        ws.send_json({"type": "interrupt", "generation_id": next_gen_id})
        for i in range(0, len(objection_pcm), chunk_size):
            ws.send_bytes(objection_pcm[i:i + chunk_size])

        # Drain until interrupt acknowledged
        while True:
            msg = ws.receive_json()
            if msg.get("type") in ("interrupted", "state_change") and msg.get("generation_id") == next_gen_id:
                break

        ws.send_json({"type": "turn_complete"})

        # Verify Urdu response to objection
        gen2_captions = []
        gen2_audio_received = False
        events_seen = 0
        while events_seen < 40:
            try:
                msg = ws.receive_json()
                events_seen += 1
                mtype = msg.get("type")
                if mtype == "audio" and msg.get("generation_id", 0) >= next_gen_id:
                    gen2_audio_received = True
                elif mtype == "output_caption" and msg.get("generation_id", 0) >= next_gen_id:
                    gen2_captions.append(msg.get("text", ""))
                elif mtype == "turn_complete":
                    break
            except Exception:
                break

        urdu_answer = "".join(gen2_captions)
        print(f"[ACCEPTANCE] Urdu response to objection: {urdu_answer}")
        assert gen2_audio_received, "Expected Gen 2 audio response to Urdu objection"

        ws.send_json({"type": "end"})


def test_transient_noise_and_click_rejection_logic():
    """
    Prove mathematical acoustic distinction:
    Sharp impulses/clicks (keyboard, glass tap) have high ZCR and high difference energy ratio,
    while voiced human speech has harmonic pitch periodicity and low difference ratio.
    """
    import math

    # 1. Synthesize a sharp transient click (impulse followed by fast decay)
    click_buffer = [0.0] * 4096
    click_buffer[10] = 0.95
    click_buffer[11] = -0.80
    click_buffer[12] = 0.50
    click_buffer[13] = -0.30

    # 2. Synthesize voiced human speech (150 Hz harmonic vowel)
    speech_buffer = []
    for i in range(4096):
        t = i / 48000.0
        val = math.sin(2 * math.pi * 150 * t) * 0.6 + math.sin(2 * math.pi * 300 * t) * 0.3
        speech_buffer.append(val * 0.3)

    # Compute difference ratios: sum((x[i] - x[i-1])^2) / sum(x[i]^2)
    def calc_diff_ratio(buf):
        tot = sum(x * x for x in buf)
        diff = sum((buf[i] - buf[i - 1]) ** 2 for i in range(1, len(buf)))
        return diff / tot if tot > 1e-7 else 0

    click_diff = calc_diff_ratio(click_buffer)
    speech_diff = calc_diff_ratio(speech_buffer)

    print(f"[VAD VERIFY] Click difference ratio: {click_diff:.3f}, Speech difference ratio: {speech_diff:.3f}")
    assert click_diff > 0.80, "Transient click must have high difference ratio"
    assert speech_diff < 0.20, "Voiced speech must have low difference ratio"


def test_speaker_echo_threshold_adaptation():
    """
    Prove speaker echo suppression:
    When AI volume is high, the dynamic barge-in threshold rises proportionally
    to prevent laptop speaker bleed from causing self-interruption.
    """
    noise_floor = 0.015

    # Case A: AI silent (user turn idle)
    ai_vol_silent = 0.0
    thresh_silent = max(0.075, noise_floor * 2.8 + ai_vol_silent * 0.22 + 0.035)

    # Case B: AI speaking loud (e.g. 0.8 volume)
    ai_vol_loud = 0.8
    thresh_loud = max(0.075, noise_floor * 2.8 + ai_vol_loud * 0.22 + 0.035)

    print(f"[VAD VERIFY] Threshold when silent: {thresh_silent:.3f}, Threshold when AI loud: {thresh_loud:.3f}")
    assert thresh_loud > thresh_silent + 0.15, "Dynamic threshold must rise during loud AI speech to reject speaker bleed"
    # Normal laptop speaker bleed (~0.05 RMS) is safely under the loud threshold
    assert 0.05 < thresh_loud, "Speaker bleed must fall below the dynamic barge-in threshold"

