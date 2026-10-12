import hashlib
import logging
import os
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel
from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger("daleel.tts")
tts_router = APIRouter()

PREVIEWS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data/audio_previews")
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data/audio_cache")

os.makedirs(PREVIEWS_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

SUPPORTED_VOICES = [
    {
        "id": "Kore",
        "name": "Kore",
        "gender": "Female",
        "description": "Calm, contemplative, and balanced",
        "description_ur": "پرسکون، سنجیدہ اور متوازن لہجہ",
        "languages": ["en", "ur"]
    },
    {
        "id": "Puck",
        "name": "Puck",
        "gender": "Male",
        "description": "Crisp, energetic, and articulate",
        "description_ur": "واضح، پرجوش اور بااثر لہجہ",
        "languages": ["en", "ur"]
    },
    {
        "id": "Aoede",
        "name": "Aoede",
        "gender": "Female",
        "description": "Melodic, expressive, and clear",
        "description_ur": "مترنم، تاثراتی اور فصیح آواز",
        "languages": ["en", "ur"]
    },
    {
        "id": "Charon",
        "name": "Charon",
        "gender": "Male",
        "description": "Deep, authoritative, and steady",
        "description_ur": "گھمبیر، باوقار اور متین لہجہ",
        "languages": ["en", "ur"]
    }
]


class TTSRequest(BaseModel):
    text: str
    voice: str = "Kore"
    language: str = "en"


@tts_router.get("/tts/voices")
def list_voices():
    """List available Gemini voices and metadata."""
    return SUPPORTED_VOICES


@tts_router.get("/tts/preview/{voice}")
def get_voice_preview(voice: str):
    """Return real audio preview for a selected voice."""
    voice_name = voice.capitalize()
    valid_ids = [v["id"] for v in SUPPORTED_VOICES]
    if voice_name not in valid_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Voice '{voice}' not found. Supported: {', '.join(valid_ids)}"
        )

    file_path = os.path.join(PREVIEWS_DIR, f"{voice_name.lower()}.wav")
    if os.path.exists(file_path):
        with open(file_path, "rb") as f:
            wav_bytes = f.read()
        return Response(content=wav_bytes, media_type="audio/wav")

    # If preview is not yet generated, generate it once
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        raise HTTPException(status_code=503, detail="Gemini API key is not configured.")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
            )
        )
    )

    try:
        sample_text = f"Salam. This is {voice_name} speaking for Daleel-e-Haq."
        try:
            res = client.models.generate_content(
                model="gemini-3.8-flash-lite-tts",
                contents=sample_text,
                config=config
            )
        except Exception:
            res = client.models.generate_content(
                model="gemini-3.8-flash-tts",
                contents=sample_text,
                config=config
            )
        wav_bytes = res.candidates[0].content.parts[0].inline_data.data
        with open(file_path, "wb") as f:
            f.write(wav_bytes)
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        logger.error(f"Failed to generate preview for {voice_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate voice preview: {str(e)}")


@tts_router.post("/tts/generate")
def generate_speech(req: TTSRequest):
    """Generate or retrieve cached spoken audio for an answer using Gemini TTS."""
    clean_text = req.text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    # Limit text length to avoid unreasonable token usage
    max_len = 2000
    if len(clean_text) > max_len:
        clean_text = clean_text[:max_len]

    voice_name = req.voice.capitalize()
    valid_ids = [v["id"] for v in SUPPORTED_VOICES]
    if voice_name not in valid_ids:
        voice_name = "Kore"

    # Compute cache key
    cache_key = hashlib.sha256(f"{voice_name}:{req.language}:{clean_text}".encode("utf-8")).hexdigest()
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.wav")

    if os.path.exists(cache_file):
        with open(cache_file, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        raise HTTPException(status_code=503, detail="Gemini API key is not configured.")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
            )
        )
    )

    models_to_try = [
        "gemini-3.8-flash-tts",
        "gemini-3.8-flash-lite-tts",
        "gemini-2.5-flash-preview-tts",
        "gemini-3.1-flash-tts-preview"
    ]
    last_err = None

    for m in models_to_try:
        try:
            logger.info(f"Generating speech with model {m} for voice {voice_name}...")
            res = client.models.generate_content(
                model=m,
                contents=clean_text,
                config=config
            )
            parts = res.candidates[0].content.parts
            audio_parts = [p for p in parts if p.inline_data and "audio" in p.inline_data.mime_type]
            if audio_parts:
                wav_bytes = audio_parts[0].inline_data.data
                with open(cache_file, "wb") as f:
                    f.write(wav_bytes)
                return Response(content=wav_bytes, media_type="audio/wav")
        except Exception as e:
            last_err = e
            logger.warning(f"TTS attempt with {m} failed: {e}. Trying fallback...")

    logger.error(f"TTS generation failed across all models: {last_err}")
    raise HTTPException(status_code=500, detail=f"Speech generation error: {str(last_err)}")
