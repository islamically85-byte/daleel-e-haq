import asyncio
import base64
import json
import logging
from typing import Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from google import genai
from google.genai import types

from app.config import settings
from app.memory.repository import MemoryRepository

logger = logging.getLogger("daleel.debate_voice")
debate_voice_router = APIRouter()

DEBATE_LIVE_MODEL = "gemini-3.8-live"


class SaveDebateSessionRequest(BaseModel):
    title: str = "Live Voice Debate"
    raw_transcript: Optional[str] = None
    transcript_turns: Optional[list] = None
    language: str = "en"
    topic: Optional[str] = "Theological Debate"
    summary: Optional[str] = None
    analysis_data: Optional[dict] = None


@debate_voice_router.get("/debate/voice-status")
def debate_voice_status():
    """Returns availability of real-time voice-to-voice debate model."""
    has_key = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here")
    return {
        "status": "ready" if has_key else "unconfigured",
        "model": DEBATE_LIVE_MODEL,
        "input_sample_rate": 16000,
        "output_sample_rate": 24000,
        "supported_voices": ["Kore", "Puck", "Aoede", "Charon"]
    }


@debate_voice_router.post("/debate/save-session")
def save_debate_session(payload: SaveDebateSessionRequest):
    """Persists a completed voice debate session into SQLite history."""
    transcript = (payload.raw_transcript or "").strip()
    if not transcript and payload.transcript_turns:
        lines = []
        for t in payload.transcript_turns:
            speaker = t.get("speaker") or t.get("role") or "Participant"
            text = t.get("text", "")
            if text:
                lines.append(f"{speaker}: {text}")
        transcript = "\n\n".join(lines)

    if not transcript:
        return {"status": "skipped", "message": "Empty transcript"}

    analysis_data = payload.analysis_data or {
        "topic": payload.topic or "Live Spoken Debate",
        "summary": payload.summary or f"Spoken voice debate ({len(transcript.split())} words transcribed)",
        "unresolved_issues": [],
        "synthesis": "Spoken dialogue recorded via Daleel-e-Haq Live Voice Mode.",
        "claims": []
    }

    saved = MemoryRepository.save_debate(
        title=payload.title,
        raw_transcript=transcript,
        language=payload.language,
        analysis_data=analysis_data
    )
    return {"status": "saved", "debate_id": saved.get("id")}


@debate_voice_router.websocket("/ws/debate-live")
async def debate_live_websocket(
    websocket: WebSocket,
    voice: str = Query(default="Puck"),
    language: str = Query(default="auto")
):
    """Bidirectional WebSocket for real-time voice-to-voice debate using gemini-3.8-live.
    
    Streams raw 16kHz PCM microphone audio to Gemini Live and returns 24kHz PCM synthesized speech,
    live bidirectional captions, natural turn-taking, and interruption events.
    """
    await websocket.accept()

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        await websocket.send_json({
            "type": "error",
            "message": "Gemini API key is not configured on the server."
        })
        await websocket.close(code=1008)
        return

    voice_name = voice.capitalize()
    if voice_name not in ["Kore", "Puck", "Aoede", "Charon"]:
        voice_name = "Puck"

    system_instruction = (
        "You are Daleel-e-Haq (دلیلِ حق) Live Voice Debate partner. "
        "Engage in respectful, scholarly, evidence-grounded theological and philosophical dialogue. "
        "Converse fluently across English, Urdu, Hindi, Roman Urdu, and Punjabi. "
        "When the user speaks Urdu, Hindi, or Punjabi, respond in eloquent, natural spoken Urdu (Urdu script). "
        "When the user speaks English, respond in articulate English. "
        "Do NOT speak markdown asterisks, hashtags, bullets, or symbols. Keep responses conversational. "
        "Keep your spoken turns concise, natural, and direct (1 to 3 spoken sentences per turn) "
        "so natural turn-taking and dialogue flow smoothly. "
        "Cite Quran Surah names, Ayah numbers, or authentic Hadith collections accurately when referencing scripture."
    )

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(
            language_codes=[]
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=system_instruction)]
        )
    )

    try:
        async with client.aio.live.connect(model=DEBATE_LIVE_MODEL, config=config) as gemini_session:
            await websocket.send_json({
                "type": "ready",
                "model": DEBATE_LIVE_MODEL,
                "voice": voice_name,
                "language": language
            })

            current_turn_audio = bytearray()
            last_audio_time = asyncio.get_event_loop().time()
            turn_lock = asyncio.Lock()
            client_is_muted = False

            async def commit_user_audio_turn():
                nonlocal last_audio_time
                if client_is_muted:
                    current_turn_audio.clear()
                    return
                async with turn_lock:
                    if len(current_turn_audio) < 3200:
                        current_turn_audio.clear()
                        return
                    audio_bytes = bytes(current_turn_audio)
                    current_turn_audio.clear()
                    try:
                        part = types.Part.from_bytes(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                        await gemini_session.send_client_content(
                            turns=[types.Content(role="user", parts=[part])],
                            turn_complete=True
                        )
                    except Exception as ex:
                        logger.warning(f"Error committing user audio turn: {ex}")

            # Task 1: Forward client audio chunks and control signals to Gemini
            async def forward_client_audio():
                nonlocal last_audio_time, client_is_muted
                try:
                    while True:
                        msg = await websocket.receive()
                        if "bytes" in msg and msg["bytes"]:
                            # Reject microphone frames server-side while session is muted
                            if client_is_muted:
                                continue
                            audio_bytes = msg["bytes"]
                            current_turn_audio.extend(audio_bytes)
                            last_audio_time = asyncio.get_event_loop().time()
                            try:
                                await gemini_session.send_realtime_input(
                                    media={"data": audio_bytes, "mime_type": "audio/pcm;rate=16000"}
                                )
                            except Exception:
                                pass
                        elif "text" in msg and msg["text"]:
                            data = json.loads(msg["text"])
                            msg_type = data.get("type")
                            if msg_type == "mute_state":
                                client_is_muted = bool(data.get("is_muted", False))
                                if client_is_muted:
                                    async with turn_lock:
                                        current_turn_audio.clear()
                            elif msg_type in ("turn_complete", "speech_end"):
                                if not client_is_muted:
                                    await commit_user_audio_turn()
                            elif msg_type == "text_turn" and data.get("text"):
                                async with turn_lock:
                                    current_turn_audio.clear()
                                    try:
                                        await gemini_session.send_client_content(
                                            turns=[types.Content(role="user", parts=[types.Part.from_text(text=data["text"])])],
                                            turn_complete=True
                                        )
                                    except Exception as ex:
                                        logger.warning(f"Error sending text turn: {ex}")
                            elif msg_type == "interrupt":
                                logger.info("User interrupted live speech.")
                                async with turn_lock:
                                    current_turn_audio.clear()
                                await websocket.send_json({"type": "interrupted"})
                            elif msg_type == "end":
                                logger.info("Client ended live debate session.")
                                break
                            elif msg_type == "ping":
                                await websocket.send_json({"type": "pong"})
                except WebSocketDisconnect:
                    logger.debug("Client disconnected from debate WebSocket.")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.warning(f"Error forwarding client audio: {e}")

            session_ended = asyncio.Event()

            # Task 2: Auto-commit turn if user finishes speaking and goes silent for 2.0s
            async def auto_commit_silence_watcher():
                try:
                    while not session_ended.is_set():
                        await asyncio.sleep(0.2)
                        if client_is_muted:
                            continue
                        now = asyncio.get_event_loop().time()
                        if len(current_turn_audio) >= 8000 and (now - last_audio_time) >= 2.0:
                            await commit_user_audio_turn()
                except asyncio.CancelledError:
                    pass

            # Task 3: Receive Gemini audio parts, captions, and turn events continuously across multiple turns
            async def forward_gemini_responses():
                try:
                    while not session_ended.is_set():
                        async for response in gemini_session.receive():
                            sc = response.server_content
                            if not sc:
                                continue

                            # Interruption detection
                            if sc.interrupted:
                                await websocket.send_json({"type": "interrupted"})

                            # Live input speech captions (user's speech)
                            if sc.interim_input_transcription and sc.interim_input_transcription.text:
                                await websocket.send_json({
                                    "type": "input_caption",
                                    "text": sc.interim_input_transcription.text,
                                    "is_final": False
                                })
                            if sc.input_transcription and sc.input_transcription.text:
                                await websocket.send_json({
                                    "type": "input_caption",
                                    "text": sc.input_transcription.text,
                                    "is_final": True
                                })

                            # Live output captions (AI spoken words)
                            if sc.output_transcription and sc.output_transcription.text:
                                await websocket.send_json({
                                    "type": "output_caption",
                                    "text": sc.output_transcription.text
                                })

                            # Spoken Audio Chunks (24kHz PCM)
                            if sc.model_turn and sc.model_turn.parts:
                                for part in sc.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        b64_audio = base64.b64encode(part.inline_data.data).decode("ascii")
                                        await websocket.send_json({
                                            "type": "audio",
                                            "data": b64_audio,
                                            "sample_rate": 24000
                                        })

                            # Turn completion
                            if sc.turn_complete:
                                await websocket.send_json({"type": "turn_complete"})
                                break

                except WebSocketDisconnect:
                    pass
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.warning(f"Error receiving Gemini live responses: {e}")

            client_task = asyncio.create_task(forward_client_audio())
            silence_task = asyncio.create_task(auto_commit_silence_watcher())
            gemini_task = asyncio.create_task(forward_gemini_responses())

            # Wait until client finishes or disconnects
            await client_task
            session_ended.set()

            for t in [silence_task, gemini_task]:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass

    except WebSocketDisconnect:
        logger.debug("Debate live WebSocket disconnected cleanly.")
    except Exception as e:
        logger.error(f"Error in debate live session: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Live voice debate connection error: {str(e)}"
            })
            await websocket.close(code=1011)
        except Exception:
            pass
