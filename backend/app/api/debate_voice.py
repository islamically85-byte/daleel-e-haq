import asyncio
import base64
import json
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from google import genai
from google.genai import types

from app.config import settings
from app.evidence.retriever import get_quran_verse, search_quran_fts, search_hadith_fts, retrieve_relevant_evidence
from app.evidence.verifier import validate_source_id
from app.memory.repository import MemoryRepository

logger = logging.getLogger("daleel.debate_voice")
debate_voice_router = APIRouter()

DEBATE_LIVE_MODEL = "gemini-3.8-live"
MAX_AUDIO_FRAME_BYTES = 65536  # 64 KB per frame
MAX_AUDIO_BYTES_PER_TURN = 3840000  # 3.84 MB (~120s of 16kHz PCM16)


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

    # Bound transcript size to avoid unbounded storage (max 500,000 characters)
    if len(transcript) > 500000:
        transcript = transcript[:500000]

    # Do not trust arbitrary client verification claims (QA-11)
    raw_analysis = payload.analysis_data or {}
    raw_claims = raw_analysis.get("claims", [])
    sanitized_claims = []
    if raw_claims:
        conn = MemoryRepository.get_connection() if hasattr(MemoryRepository, "get_connection") else None
        for c in raw_claims:
            if isinstance(c, dict):
                c_copy = dict(c)
                cited_ids = c_copy.get("cited_ids", [])
                valid_ids = []
                for cid in cited_ids:
                    if validate_source_id(cid, conn=conn):
                        valid_ids.append(cid)
                c_copy["cited_ids"] = valid_ids
                # Only mark verified if source is actually authenticated in the local database
                if not valid_ids:
                    c_copy["verification_status"] = "unverified"
                sanitized_claims.append(c_copy)

    analysis_data = {
        "topic": payload.topic or "Live Spoken Debate",
        "summary": payload.summary or f"Spoken voice debate ({len(transcript.split())} words transcribed)",
        "unresolved_issues": raw_analysis.get("unresolved_issues", []),
        "synthesis": raw_analysis.get("synthesis", "Spoken dialogue recorded via Daleel-e-Haq Live Voice Mode."),
        "claims": sanitized_claims
    }

    saved = MemoryRepository.save_debate(
        title=payload.title,
        raw_transcript=transcript,
        language=payload.language,
        analysis_data=analysis_data
    )
    return {"status": "saved", "debate_id": saved.get("id")}


# Tools definition for Gemini Live
quran_tool_decl = types.FunctionDeclaration(
    name="get_quran_evidence",
    description="Look up verified Quranic verses from the local SQLite database by surah number and ayah number, or by topic search query in English or Urdu.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "query": types.Schema(type="STRING", description="Search topic, question, or phrase in English or Urdu"),
            "surah": types.Schema(type="INTEGER", description="Surah chapter number (1-114)"),
            "ayah": types.Schema(type="INTEGER", description="Ayah verse number")
        }
    )
)

hadith_tool_decl = types.FunctionDeclaration(
    name="check_hadith_evidence",
    description="Query the local database for Hadith narrations or references related to a topic or collection.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "query": types.Schema(type="STRING", description="Search topic or narration in English or Urdu"),
            "collection": types.Schema(type="STRING", description="Collection name if known (e.g., bukhari, muslim)")
        },
        required=["query"]
    )
)


def handle_quran_lookup(args: Dict[str, Any]) -> Dict[str, Any]:
    """Retrieves verified scripture from local Tanzil Quran SQLite database."""
    surah = args.get("surah")
    ayah = args.get("ayah")
    query = args.get("query")

    if surah is not None and ayah is not None:
        try:
            s_num = int(surah)
            a_num = int(ayah)
            verse = get_quran_verse(s_num, a_num)
            if verse:
                return {
                    "status": "found",
                    "source_id": verse["id"],
                    "surah_number": verse["surah_number"],
                    "ayah_number": verse["ayah_number"],
                    "surah_name_en": verse["surah_name_en"],
                    "surah_name_ar": verse["surah_name_ar"],
                    "text_ar": verse["text_ar"],
                    "translation_en": verse["translation_en"],
                    "translation_ur": verse["translation_ur"],
                    "citation": f"Surah {verse['surah_name_en']} ({verse['surah_number']}:{verse['ayah_number']})",
                    "is_verified": True
                }
            return {
                "status": "not_found",
                "message": f"Ayah {s_num}:{a_num} does not exist in the 6,236 verses of the Holy Quran.",
                "is_verified": False
            }
        except (ValueError, TypeError):
            pass

    if query:
        hits = search_quran_fts(str(query), limit=3)
        if hits:
            formatted = []
            for h in hits:
                formatted.append({
                    "source_id": h["id"],
                    "surah_number": h["surah_number"],
                    "ayah_number": h["ayah_number"],
                    "surah_name_en": h["surah_name_en"],
                    "surah_name_ar": h["surah_name_ar"],
                    "text_ar": h["text_ar"],
                    "translation_en": h["translation_en"],
                    "translation_ur": h["translation_ur"],
                    "citation": f"Surah {h['surah_name_en']} ({h['surah_number']}:{h['ayah_number']})",
                    "is_verified": True
                })
            return {"status": "found", "verses": formatted, "is_verified": True}
        return {
            "status": "no_results",
            "message": f"No Quranic verses matched search terms: {query}",
            "is_verified": False
        }

    return {"status": "error", "message": "Missing search parameters.", "is_verified": False}


def handle_hadith_lookup(args: Dict[str, Any]) -> Dict[str, Any]:
    """Queries local Hadith database, disclosing limitations if not installed."""
    query = args.get("query", "")
    hits = search_hadith_fts(str(query), limit=3) if query else []
    if hits:
        return {"status": "found", "hadiths": hits, "is_verified": True}
    return {
        "status": "unverified",
        "records_found": 0,
        "is_verified": False,
        "limitation_disclosure": (
            "The approved local Daleel-e-Haq database currently contains the complete Holy Quran (6,236 verses). "
            "The authenticated Hadith corpus is not yet installed in local storage. "
            "Therefore, Hadith citations cannot be verified against offline records."
        )
    }


@debate_voice_router.websocket("/ws/debate-live")
async def debate_live_websocket(
    websocket: WebSocket,
    voice: str = Query(default="Puck"),
    language: str = Query(default="auto")
):
    """Bidirectional WebSocket for real-time voice-to-voice debate using gemini-3.8-live.
    
    Streams raw 16kHz PCM microphone audio to Gemini Live and returns 24kHz PCM synthesized speech,
    live bidirectional captions, server-side function calling for verified local evidence retrieval,
    turn-taking states, and interruption handling.
    """
    # 1. Cross-Site WebSocket Hijacking (CSWSH) origin verification
    client_origin = websocket.headers.get("origin")
    if client_origin:
        allowed = set(settings.cors_origins_list + ["http://localhost:5173", "http://127.0.0.1:5173", "testserver"])
        if client_origin not in allowed and not any(client_origin.startswith(a) for a in allowed):
            logger.warning(f"Forbidden WebSocket connection from unauthorized origin: {client_origin}")
            await websocket.close(code=1008)
            return

    await websocket.accept()

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        await websocket.send_json({
            "type": "error",
            "message": "Speech reasoning service is currently unavailable. Please configure backend environment."
        })
        await websocket.close(code=1008)
        return

    voice_name = voice.capitalize()
    if voice_name not in ["Kore", "Puck", "Aoede", "Charon"]:
        voice_name = "Puck"

    urdu_directive = (
        "\n\nSTRICT URDU LANGUAGE REQUIREMENT:\n"
        "The user has selected Urdu. You MUST converse and respond EXCLUSIVELY in articulate, authentic Urdu (اردو زبان) in Urdu script. "
        "DO NOT respond in English unless the user explicitly switches to English."
        if language == "ur" else
        "\n\nMULTILINGUAL CODE-SWITCHING DIRECTIVE:\n"
        "Automatically match the user's spoken language. If the user speaks in Urdu, Roman Urdu, Hindi, or Punjabi, "
        "or commands you to speak Urdu (e.g., 'اردو میں بات کرو' or 'urdu m bat kro'), you MUST immediately converse in fluent, articulate Urdu (اردو زبان) in Urdu script. "
        "NEVER reply in English to Urdu speech. Never repeat canned English boilerplate."
    )

    system_instruction = (
        "You are Daleel-e-Haq (دلیلِ حق — Evidence of Truth), a disciplined, evidence-based Islamic theological and debate partner. "
        "Engage in respectful, scholarly, evidence-grounded theological and philosophical dialogue. "
        "\nCRITICAL DEBATE & EVIDENCE RULES:\n"
        "1. Understand the exact religious claim or question asserted by the user. Stay strictly on topic. "
        "2. DO NOT routinely answer difficult questions with vague phrases such as 'I am neutral', 'I am not on anyone's side', or 'Everyone has their own opinion' when scriptural evidence addresses the claim. State a clear, reasoned, evidence-based conclusion. "
        "3. You have access to local database tools: ALWAYS call 'get_quran_evidence' to check and verify Quranic verses before asserting scripture. Cite Surah and Ayah numbers accurately and naturally (for example: 'Surah Al-Ikhlas, chapter 112, verse 1' or 'سورہ اخلاص، سورت نمبر 112، آیت نمبر 1'). "
        "4. Explain explicitly WHY the evidence supports, contradicts, or does not establish the claim. Respectfully correct the user when warranted by verified evidence. "
        "5. If a Hadith claim is asserted or requested, call 'check_hadith_evidence'. Honestly disclose that Daleel-e-Haq's local database currently indexes the complete 6,236 verses of the Quran, while offline Hadith collections are not yet installed in local storage, so Hadith references cannot be marked as verified against offline records. "
        "6. NEVER fabricate scripture, Hadith collections, chains of narration, or scholarly consensus. "
        "7. Never address the user as 'Korey', 'Corey', or any assumed name unless they explicitly introduced themselves by that name. "
        "8. Converse fluently across English, Urdu, Hindi, Roman Urdu, and Punjabi. When the user speaks Urdu, Hindi, or Punjabi, respond in articulate, natural Urdu (Urdu script) without filler repetition or foreign words. When the user speaks English, respond in articulate English. "
        "9. Do NOT speak markdown asterisks, hashtags, bullets, or symbols. Keep responses conversational, disciplined, and concise (2 to 4 clear spoken sentences per turn) so natural debate flow is maintained. "
        "\n10. NATURAL CONVERSATION & DIRECT OBJECTION HANDLING:\n"
        "When the user interrupts mid-sentence, stop speaking immediately and listen attentively to their complete objection. "
        "Respond DIRECTLY and specifically to the objection or question using the existing conversational context. "
        "Do not repeat points already discussed from the beginning. "
        "For example, if the user interrupts: 'Wait, explain the first verse instead' or 'ٹھہریں، پہلے پہلی آیت کی وضاحت کریں', "
        "immediately focus on verse 1 of the Surah being discussed (e.g. Surah 112:1 - 'Say: He is Allah, the One' / قُلْ هُوَ اللَّهُ أَحَدٌ), "
        "call 'get_quran_evidence' to verify, and explain its theological meaning directly and concisely."
        + urdu_directive
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
            language_codes=["ur-PK", "ur", "en-US"] if language == "ur" else ["ur-PK", "ur", "en-US", "hi-IN", "pa-PK"]
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=system_instruction)]
        ),
        tools=[types.Tool(function_declarations=[quran_tool_decl, hadith_tool_decl])]
    )

    try:
        async with client.aio.live.connect(model=DEBATE_LIVE_MODEL, config=config) as gemini_session:
            await websocket.send_json({
                "type": "ready",
                "model": DEBATE_LIVE_MODEL,
                "voice": voice_name,
                "language": language
            })

            active_generation_id = 1
            client_is_muted = False
            session_ended = asyncio.Event()
            current_turn_audio = bytearray()
            last_audio_time = asyncio.get_event_loop().time()
            turn_lock = asyncio.Lock()

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
                        await websocket.send_json({
                            "type": "state_change",
                            "state": "thinking",
                            "generation_id": active_generation_id
                        })
                        part = types.Part.from_bytes(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                        await asyncio.wait_for(
                            gemini_session.send_client_content(
                                turns=[types.Content(role="user", parts=[part])],
                                turn_complete=True
                            ),
                            timeout=20.0
                        )
                    except asyncio.TimeoutError:
                        logger.warning("Turn submission to Gemini Live timed out after 20s.")
                        await websocket.send_json({
                            "type": "error",
                            "message": "Response took longer than expected. Please speak again."
                        })
                        await websocket.send_json({
                            "type": "state_change",
                            "state": "user_turn",
                            "generation_id": active_generation_id
                        })
                    except Exception as ex:
                        logger.warning(f"Error committing user audio turn: {ex}")
                        await websocket.send_json({
                            "type": "state_change",
                            "state": "user_turn",
                            "generation_id": active_generation_id
                        })

            # Task 1: Forward client audio chunks and control signals to Gemini (Turn-Based PCM Model)
            async def forward_client_audio():
                nonlocal client_is_muted, active_generation_id, last_audio_time
                try:
                    while True:
                        msg = await websocket.receive()
                        if "bytes" in msg and msg["bytes"]:
                            # Reject microphone frames server-side while session is muted
                            if client_is_muted:
                                continue
                            audio_bytes = msg["bytes"]
                            # Cap per-frame payload size (QA-24)
                            if len(audio_bytes) > MAX_AUDIO_FRAME_BYTES:
                                continue
                            async with turn_lock:
                                current_turn_audio.extend(audio_bytes)
                                last_audio_time = asyncio.get_event_loop().time()
                                # Enforce maximum turn bytes cap (~120s of 16kHz PCM = 3.84MB)
                                if len(current_turn_audio) > MAX_AUDIO_BYTES_PER_TURN:
                                    asyncio.create_task(commit_user_audio_turn())
                                    continue
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
                                    await websocket.send_json({
                                        "type": "state_change",
                                        "state": "thinking",
                                        "generation_id": active_generation_id
                                    })
                                    await gemini_session.send_client_content(
                                        turns=[types.Content(role="user", parts=[types.Part.from_text(text=data["text"])])],
                                        turn_complete=True
                                    )
                                except Exception as ex:
                                    logger.warning(f"Error sending text turn: {ex}")
                            elif msg_type == "interrupt":
                                client_gen = data.get("generation_id")
                                if client_gen and isinstance(client_gen, int) and client_gen > active_generation_id:
                                    active_generation_id = client_gen
                                else:
                                    active_generation_id += 1
                                logger.info(f"User interrupted live speech. Active generation: {active_generation_id}")
                                async with turn_lock:
                                    current_turn_audio.clear()
                                try:
                                    await gemini_session.send_realtime_input(audio_stream_end=True)
                                except Exception as ex:
                                    logger.debug(f"Error signalling audio_stream_end on interrupt: {ex}")
                                await websocket.send_json({
                                    "type": "interrupted",
                                    "generation_id": active_generation_id
                                })
                                await websocket.send_json({
                                    "type": "state_change",
                                    "state": "user_turn",
                                    "generation_id": active_generation_id
                                })
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

            # Task 2: Auto-commit turn if user finishes speaking and goes silent for 1.6s
            async def auto_commit_silence_watcher():
                try:
                    while not session_ended.is_set():
                        await asyncio.sleep(0.2)
                        if client_is_muted:
                            continue
                        now = asyncio.get_event_loop().time()
                        if len(current_turn_audio) >= 8000 and (now - last_audio_time) >= 1.6:
                            await commit_user_audio_turn()
                except asyncio.CancelledError:
                    pass

            # Task 3: Receive Gemini audio parts, tool calls, captions, and turn events continuously
            async def forward_gemini_responses():
                nonlocal active_generation_id
                try:
                    while not session_ended.is_set():
                        async for response in gemini_session.receive():
                            # 1. Server-side Function / Tool Calls
                            if response.tool_call:
                                await websocket.send_json({
                                    "type": "state_change",
                                    "state": "checking_evidence",
                                    "generation_id": active_generation_id
                                })
                                fn_responses = []
                                for fc in response.tool_call.function_calls:
                                    logger.info(f"Gemini Live requested tool call: {fc.name} args={fc.args}")
                                    if fc.name == "get_quran_evidence":
                                        result = handle_quran_lookup(fc.args or {})
                                        # Normalize tool records: emit individual card per verse (P1 blocker 3)
                                        if result.get("verses"):
                                            for v in result["verses"]:
                                                await websocket.send_json({
                                                    "type": "evidence_retrieved",
                                                    "source_type": "quran",
                                                    "evidence": v,
                                                    "is_verified": True
                                                })
                                        else:
                                            await websocket.send_json({
                                                "type": "evidence_retrieved",
                                                "source_type": "quran",
                                                "evidence": result,
                                                "is_verified": result.get("is_verified", False)
                                            })
                                    elif fc.name == "check_hadith_evidence":
                                        result = handle_hadith_lookup(fc.args or {})
                                        # Explicitly disclose Hadith unavailability
                                        await websocket.send_json({
                                            "type": "evidence_retrieved",
                                            "source_type": "hadith_limitation",
                                            "evidence": {
                                                "source_type": "hadith_limitation",
                                                "status": "unavailable",
                                                "is_verified": False,
                                                "title": "Offline Hadith Corpus Unavailable",
                                                "limitation_disclosure": result.get("limitation_disclosure")
                                            },
                                            "is_verified": False
                                        })
                                    else:
                                        result = {"error": f"Unknown tool: {fc.name}"}

                                    fn_responses.append(types.FunctionResponse(
                                        id=fc.id,
                                        name=fc.name,
                                        response={"output": result}
                                    ))

                                if fn_responses:
                                    await gemini_session.send_tool_response(function_responses=fn_responses)

                            sc = response.server_content
                            if not sc:
                                continue

                            # 2. Interruption detection from provider
                            if sc.interrupted:
                                active_generation_id += 1
                                await websocket.send_json({
                                    "type": "interrupted",
                                    "generation_id": active_generation_id
                                })
                                await websocket.send_json({
                                    "type": "state_change",
                                    "state": "user_turn",
                                    "generation_id": active_generation_id
                                })

                            # 3. Live input speech captions (user's speech)
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

                            # 4. Live output captions (AI spoken words)
                            if sc.output_transcription and sc.output_transcription.text:
                                await websocket.send_json({
                                    "type": "output_caption",
                                    "text": sc.output_transcription.text,
                                    "generation_id": active_generation_id
                                })

                            # 5. Spoken Audio Chunks (24kHz PCM) with generation ID gating
                            if sc.model_turn and sc.model_turn.parts:
                                current_gen = active_generation_id
                                for part in sc.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        # Drop chunks for an interrupted generation
                                        if active_generation_id != current_gen:
                                            logger.info("Discarded stale audio chunk from interrupted generation.")
                                            break
                                        await websocket.send_json({
                                            "type": "state_change",
                                            "state": "assistant_speaking",
                                            "generation_id": current_gen
                                        })
                                        b64_audio = base64.b64encode(part.inline_data.data).decode("ascii")
                                        await websocket.send_json({
                                            "type": "audio",
                                            "data": b64_audio,
                                            "sample_rate": 24000,
                                            "generation_id": current_gen
                                        })

                            # 6. Turn completion
                            if sc.turn_complete:
                                await websocket.send_json({
                                    "type": "turn_complete",
                                    "generation_id": active_generation_id
                                })

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
