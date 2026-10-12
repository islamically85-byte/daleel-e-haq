import asyncio
import json
import logging
import re
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger("daleel.dictate")
dictate_router = APIRouter()

DICTATION_MODEL = "gemini-3.5-transcribe-live"
NORMALIZATION_MODELS = ["gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"]


class DictateNormalizeRequest(BaseModel):
    transcript: str
    user_preferred_language: str = "en"  # "en" or "ur"


class DictateNormalizeResponse(BaseModel):
    original_transcript: str
    detected_dominant_language: str  # "en" or "ur"
    normalized_text: str
    confidence: float
    is_uncertain: bool


@dictate_router.get("/dictate/status")
def dictate_status():
    """Verify live dictation availability."""
    has_key = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here")
    return {
        "status": "ready" if has_key else "unconfigured",
        "model": DICTATION_MODEL,
        "sample_rate": 16000,
        "channels": 1,
        "format": "pcm16_le"
    }


@dictate_router.post("/dictate/normalize", response_model=DictateNormalizeResponse)
async def normalize_transcript(payload: DictateNormalizeRequest):
    """Detects dominant spoken language and normalizes/translates speech into dominant language.
    
    - Hindi and Urdu belong to the 'ur' language group and produce Urdu script output (never Devanagari).
    - English belongs to 'en'.
    - Punjabi in spoken discourse maps to Urdu script ('ur').
    - Dominant language is based on meaningful clauses/segments, not raw script character length.
    - Preserves Arabic Quranic citations, Hadith references, theological terminology, and numbers.
    - If tie, uses user_preferred_language.
    """
    transcript = payload.transcript.strip()
    preferred = payload.user_preferred_language if payload.user_preferred_language in ["en", "ur"] else "en"

    if not transcript:
        return DictateNormalizeResponse(
            original_transcript="",
            detected_dominant_language=preferred,
            normalized_text="",
            confidence=1.0,
            is_uncertain=False
        )

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        has_arabic_script = bool(re.search(r"[\u0600-\u06FF]", transcript))
        detected = "ur" if has_arabic_script else preferred
        return DictateNormalizeResponse(
            original_transcript=transcript,
            detected_dominant_language=detected,
            normalized_text=transcript,
            confidence=0.5,
            is_uncertain=True
        )

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    normalization_prompt = (
        "You are the Smart Multilingual Normalizer for Daleel-e-Haq (دلیلِ حق).\n"
        "Analyze the user's transcribed multilingual speech.\n"
        "Tasks:\n"
        "1. Detect the dominant spoken language by counting meaningful speech segments/clauses (NOT character or script length).\n"
        "   - English clauses count towards 'en'.\n"
        "   - Urdu, Hindi, Roman Urdu, and Punjabi clauses count towards 'ur' (Urdu language group).\n"
        f"   - If segment counts are tied, use the user's preferred language: '{preferred}'.\n"
        "2. Translate and normalize the entire message into the dominant language:\n"
        "   - If dominant is 'ur': Output in elegant, standard Urdu script (Nastaliq/Arabic alphabet). NEVER output Devanagari script for Hindi/Urdu theological discourse.\n"
        "   - If dominant is 'en': Output in clear, fluent English.\n"
        "   - CRITICAL PRESERVATION: Always preserve Arabic Quranic quotations, Surah names, Ayah numbers (e.g. 2:255, 112:1), Hadith collections (e.g. Sahih Bukhari, Sahih Muslim), Islamic theological terms (Tawhid, Sabr, Niyyah, Taqwa, Riba), and specific figures/numbers.\n"
        "3. Output strictly valid JSON with this schema:\n"
        "{\n"
        '  "detected_dominant_language": "en" | "ur",\n'
        '  "normalized_text": "<the fully normalized and translated text in the dominant language>",\n'
        '  "confidence": 0.0 to 1.0,\n'
        '  "is_uncertain": true | false\n'
        "}\n\n"
        f"Input transcript:\n\"{transcript}\""
    )

    for model_name in NORMALIZATION_MODELS:
        try:
            resp = client.models.generate_content(
                model=model_name,
                contents=normalization_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1
                )
            )
            raw_text = resp.text.strip()
            data = json.loads(raw_text)
            norm_text = str(data.get("normalized_text", "")).strip() or transcript
            det_lang = str(data.get("detected_dominant_language", preferred)).strip()
            if det_lang not in ["en", "ur"]:
                det_lang = preferred
            conf = float(data.get("confidence", 0.95))
            uncertain = bool(data.get("is_uncertain", False))

            return DictateNormalizeResponse(
                original_transcript=transcript,
                detected_dominant_language=det_lang,
                normalized_text=norm_text,
                confidence=conf,
                is_uncertain=uncertain
            )
        except Exception as e:
            logger.warning(f"Model {model_name} normalization attempt failed: {e}")
            continue

    # Fallback heuristic if API models unavailable
    has_arabic_script = bool(re.search(r"[\u0600-\u06FF]", transcript))
    detected = "ur" if has_arabic_script else preferred
    return DictateNormalizeResponse(
        original_transcript=transcript,
        detected_dominant_language=detected,
        normalized_text=transcript,
        confidence=0.5,
        is_uncertain=True
    )


@dictate_router.websocket("/ws/dictate")
async def dictate_websocket(
    websocket: WebSocket,
    language: str = Query(default="auto")
):
    """Secure WebSocket relay for real-time dictation using gemini-3.5-transcribe-live.
    
    Receives raw 16kHz 16-bit PCM mono audio chunks from browser,
    streams them to Gemini Live API with automatic language detection (language_codes=[]),
    and sends back real-time interim and final transcripts without locking session to one language.
    Never exposes Gemini API keys to the client.
    """
    await websocket.accept()

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        await websocket.send_json({
            "type": "error",
            "message": "Gemini API key is not configured on the server."
        })
        await websocket.close(code=1008)
        return

    instruction_text = (
        "You are an accurate real-time speech-to-text dictation transcriber. "
        "Automatically detect the spoken language seamlessly in real-time. "
        "Support seamless switching between English, Urdu, Hindi, Roman Urdu, and Punjabi within the same recording. "
        "(Saraiki is experimental). "
        "When the user speaks Urdu, Hindi, or Punjabi, transcribe accurately into Urdu script (Arabic/Nastaliq). "
        "Never output Devanagari script for Hindi/Urdu speech. "
        "When the user speaks English, transcribe in English. "
        "Preserve Quranic, Hadith, and theological terms (such as Surah, Ayah, Tawhid, Sunnah, Bukhari, Muslim) accurately. "
        "Do NOT answer questions, comment, or translate during transcription. Output ONLY the transcribed words."
    )

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = types.LiveConnectConfig(
        response_modalities=["TEXT"],
        input_audio_transcription=types.AudioTranscriptionConfig(
            language_codes=[]
        ),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=instruction_text)]
        )
    )

    try:
        async with client.aio.live.connect(model=DICTATION_MODEL, config=config) as gemini_session:
            await websocket.send_json({
                "type": "ready",
                "model": DICTATION_MODEL,
                "language": "auto"
            })

            finish_requested = asyncio.Event()

            # Task 1: Forward client audio chunks to Gemini
            async def forward_audio_to_gemini():
                try:
                    while True:
                        message = await websocket.receive()
                        if "bytes" in message and message["bytes"]:
                            audio_bytes = message["bytes"]
                            await gemini_session.send_realtime_input(
                                media={"data": audio_bytes, "mime_type": "audio/pcm;rate=16000"}
                            )
                        elif "text" in message and message["text"]:
                            data = json.loads(message["text"])
                            msg_type = data.get("type")
                            if msg_type == "finish":
                                logger.info("Client requested finish. Signaling audio_stream_end to Gemini.")
                                try:
                                    await gemini_session.send_realtime_input(audio_stream_end=True)
                                except Exception as e:
                                    logger.warning(f"Error sending audio_stream_end: {e}")
                                finish_requested.set()
                            elif msg_type == "stop":
                                logger.info("Client requested stop dictation.")
                                break
                            elif msg_type == "ping":
                                await websocket.send_json({"type": "pong"})
                except WebSocketDisconnect:
                    logger.debug("Client disconnected from dictation WebSocket.")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.warning(f"Error forwarding audio: {e}")

            # Task 2: Receive transcription events from Gemini and forward to client
            async def forward_transcripts_to_client():
                try:
                    async for response in gemini_session.receive():
                        server_content = response.server_content
                        if not server_content:
                            continue

                        # 1. Interim input transcription
                        if (
                            server_content.interim_input_transcription
                            and server_content.interim_input_transcription.text
                        ):
                            await websocket.send_json({
                                "type": "interim",
                                "text": server_content.interim_input_transcription.text
                            })

                        # 2. Finalized input transcription segment
                        if (
                            server_content.input_transcription
                            and server_content.input_transcription.text
                        ):
                            await websocket.send_json({
                                "type": "final",
                                "text": server_content.input_transcription.text,
                                "finished": bool(server_content.input_transcription.finished)
                            })

                        # 3. Model turn text output (if emitted)
                        if server_content.model_turn and server_content.model_turn.parts:
                            turn_text = "".join(
                                p.text for p in server_content.model_turn.parts if p.text
                            )
                            if turn_text:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "text": turn_text,
                                    "turn_complete": bool(server_content.turn_complete)
                                })

                        # 4. Turn complete indicator
                        if server_content.turn_complete:
                            await websocket.send_json({
                                "type": "turn_complete"
                            })
                            if finish_requested.is_set():
                                await websocket.send_json({"type": "finished"})
                                break

                except WebSocketDisconnect:
                    pass
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.warning(f"Error receiving Gemini transcripts: {e}")

            # Task 3: Watcher to guarantee finished signal within timeout
            async def finish_watcher():
                try:
                    await finish_requested.wait()
                    await asyncio.sleep(1.2)
                    try:
                        await websocket.send_json({"type": "finished"})
                    except Exception:
                        pass
                except asyncio.CancelledError:
                    pass

            audio_task = asyncio.create_task(forward_audio_to_gemini())
            transcript_task = asyncio.create_task(forward_transcripts_to_client())
            watcher_task = asyncio.create_task(finish_watcher())

            done, pending = await asyncio.wait(
                [audio_task, transcript_task, watcher_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            for task in pending:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

    except WebSocketDisconnect:
        logger.debug("Dictation WebSocket disconnected cleanly.")
    except Exception as e:
        logger.error(f"Failed to establish live dictation session: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Dictation connection error: {str(e)}"
            })
            await websocket.close(code=1011)
        except Exception:
            pass
