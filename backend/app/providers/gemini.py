import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.config import settings
from app.providers.base import AIProvider

logger = logging.getLogger(__name__)


class GeminiProvider(AIProvider):
    """
    Official Google Gemini API provider using the google-genai SDK.
    Configured for Online AI Mode with strict evidence grounding.
    """

    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model_name = settings.GEMINI_MODEL or "gemini-3.8-flash"
        self._client = None
        if self.api_key:
            try:
                from google import genai
                from google.genai import types
                self._client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(timeout=20000)
                )
            except Exception as e:
                logger.error(f"Failed to initialize google-genai Client: {e}")

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "provider_id": "gemini",
            "provider_name": "Google Gemini API",
            "mode": "Online AI Mode",
            "model": self.model_name,
            "is_configured": bool(self.api_key and self.api_key != "your_gemini_api_key_here"),
            "status_label": "Online AI Active",
            "data_privacy": "Online reasoning queries are processed via Google Gemini API servers. Religious source lookup and verification remain 100% local."
        }

    def test_connection(self) -> Dict[str, Any]:
        if not self.api_key or self.api_key == "your_gemini_api_key_here":
            return {
                "status": "unconfigured",
                "message": "Gemini API key is not configured. Add GEMINI_API_KEY to your .env file.",
                "model": self.model_name
            }

        if not self._client:
            try:
                from google import genai
                from google.genai import types
                self._client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(timeout=10000)
                )
            except Exception as e:
                return {
                    "status": "error",
                    "message": f"Failed to load google-genai SDK: {str(e)}",
                    "model": self.model_name
                }

        t0 = time.time()
        # For connectivity verification, test with responsive model candidates
        models_to_try = ["gemini-flash-lite-latest", "gemini-3.5-flash", self.model_name]
        last_error = ""
        for m in models_to_try:
            try:
                response = self._client.models.generate_content(
                    model=m,
                    contents="Respond with: OK"
                )
                latency = round((time.time() - t0) * 1000, 1)
                return {
                    "status": "connected",
                    "message": f"Successfully connected to Google Gemini API ({m}).",
                    "model": self.model_name,
                    "latency_ms": latency
                }
            except Exception as e:
                last_error = str(e)
                logger.warning(f"Connection test with model {m} failed: {e}")

        return {
            "status": "error",
            "message": f"Gemini API connectivity error: {last_error}",
            "model": self.model_name
        }

    def _execute_with_model_fallback(self, contents: Any, config: Any = None) -> Any:
        """
        Executes generation using primary model, gracefully falling back to compatible
        flash models if the primary model times out or encounters account limits.
        """
        if not self._client:
            raise RuntimeError("Gemini API client is not initialized. Please verify GEMINI_API_KEY.")

        models_to_try = [self.model_name]
        if self.model_name != "gemini-3.5-flash":
            models_to_try.append("gemini-3.5-flash")
        if "gemini-flash-lite-latest" not in models_to_try:
            models_to_try.append("gemini-flash-lite-latest")

        last_exc = None
        for m in models_to_try:
            try:
                if config:
                    return self._client.models.generate_content(model=m, contents=contents, config=config)
                return self._client.models.generate_content(model=m, contents=contents)
            except Exception as e:
                last_exc = e
                logger.warning(f"Execution failed on model {m}: {e}. Trying fallback if available.")
        raise last_exc

    def generate_grounded_response(
        self,
        question: str,
        retrieved_evidence: List[Dict[str, Any]],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        language: str = "en",
        image_bytes: Optional[bytes] = None,
        image_mime_type: Optional[str] = None,
        is_greeting: bool = False
    ) -> Dict[str, Any]:
        if not self.api_key:
            return {
                "status": "error",
                "error_message": "Gemini API key is not configured. Please add GEMINI_API_KEY to your .env file to enable Online AI reasoning.",
                "direct_answer": "Gemini API key is not configured. Please add GEMINI_API_KEY to your .env file to enable Online AI reasoning.",
                "language": language,
                "cited_source_ids": [],
                "claims": [],
                "limitations": "API key missing"
            }

        if is_greeting:
            system_instruction = (
                "You are Daleel-e-Haq (دلیلِ حق — Evidence of Truth), a specialized Islamic research assistant.\n"
                "The user has shared a polite greeting or introduction (e.g., 'Hi', 'Hello', 'Salam').\n"
                "INSTRUCTIONS:\n"
                "1. Respond warmly, courteously, and helpfully in the requested language (English or Urdu).\n"
                "2. Briefly introduce Daleel-e-Haq as an AI research assistant grounded in canonical Quran and Hadith sources.\n"
                "3. Welcome the user to ask any questions regarding the Quran, theological principles, Islamic evidence, or religious topics.\n"
                "4. Do NOT cite non-existent sources or prepend unverified warnings for basic greetings.\n"
                "5. Return valid JSON matching this schema:\n"
                "{\n"
                '  "direct_answer": "Warm greeting and helpful introduction",\n'
                '  "language": "en" or "ur",\n'
                '  "cited_source_ids": [],\n'
                '  "claims": [],\n'
                '  "limitations": null\n'
                "}"
            )
            user_prompt = f"User greeting: {question}\nPreferred Language: {language}"
        else:
            # Build evidence section
            evidence_text_list = []
            for ev in retrieved_evidence:
                if ev.get("source_type") == "quran":
                    evidence_text_list.append(
                        f"ID: {ev['id']}\n"
                        f"Surah: {ev.get('surah_name_en', '')} ({ev.get('surah_number')}:{ev.get('ayah_number')})\n"
                        f"Arabic: {ev.get('text_ar', '')}\n"
                        f"English Translation: {ev.get('translation_en', '')}\n"
                        f"Urdu Translation: {ev.get('translation_ur', '')}\n"
                        f"Provenance: {ev.get('provenance', '')}\n"
                    )
                elif ev.get("source_type") == "hadith":
                    evidence_text_list.append(
                        f"ID: {ev['id']}\n"
                        f"Collection: {ev.get('collection', '')} #{ev.get('hadith_number')}\n"
                        f"Arabic: {ev.get('text_ar', '')}\n"
                        f"English Translation: {ev.get('translation_en', '')}\n"
                        f"Urdu Translation: {ev.get('translation_ur', '')}\n"
                        f"Grade: {ev.get('grade', '')} (by {ev.get('graded_by', '')})\n"
                    )

            evidence_block = "\n---\n".join(evidence_text_list) if evidence_text_list else "NO APPROVED EVIDENCE FOUND IN LOCAL DATABASE FOR THIS SPECIFIC TOPIC."

            system_instruction = (
                "You are Daleel-e-Haq (دلیلِ حق — Evidence of Truth), a disciplined, evidence-based Islamic research and debate assistant.\n"
                "CORE PRINCIPLES & RESPONSE QUALITY:\n"
                "1. Understand the exact religious claim or question asserted. Stay strictly on topic.\n"
                "2. DO NOT answer difficult questions with vague neutrality such as 'I am neutral', 'I am not on anyone's side', or 'Everyone has their own opinion' when scriptural evidence addresses the claim. State a clear, reasoned, evidence-based conclusion.\n"
                "3. Explain explicitly WHY the cited evidence supports, contradicts, or does not establish the claim. Respectfully correct the user when warranted by verified evidence.\n"
                "4. Where reliable interpretations legitimately differ, explain the disagreement fairly and identify the strongest supported conclusion under the stated criteria.\n"
                "5. Cite sources accurately using their exact IDs (e.g. 'quran:112:1', 'quran:2:255').\n"
                "6. NEVER fabricate or invent Surah or Ayah numbers, Hadith references, grades, or chains.\n"
                "7. HADITH LIMITATION DISCLOSURE: The approved local database contains the complete Holy Quran (6,236 verses), while offline Hadith collections are not yet installed in local storage. Disclose this limitation truthfully whenever Hadith questions arise, rather than issuing unverified Hadith claims.\n"
                "8. Maintain an objective, respectful, academic tone free of sectarian polemics.\n"
                "9. Output MUST be valid JSON with this exact schema:\n"
                "{\n"
                '  "direct_answer": "Comprehensive, structured scholarly explanation with clear paragraphs, evidence-based conclusion, and reasoning",\n'
                '  "language": "en" or "ur",\n'
                '  "cited_source_ids": ["quran:X:Y", ...],\n'
                '  "claims": [\n'
                '    {"claim_text": "Key theological or evidential assertion", "cited_ids": ["quran:X:Y"], "notes": "Explanation of why evidence supports/refutes"}\n'
                "  ],\n"
                '  "limitations": "Nuances, scope limitations, or context notes"\n'
                "}"
            )


            history_context = ""
            if conversation_history:
                formatted_turns = []
                for h in conversation_history[-6:]:
                    role_label = "User" if h.get("role") == "user" else "Assistant"
                    formatted_turns.append(f"{role_label}: {h.get('content', '')[:300]}")
                if formatted_turns:
                    history_context = "\n\nPrior Conversation History:\n" + "\n".join(formatted_turns)

            user_prompt = (
                f"User Question: {question}\n\n"
                f"Preferred Language: {language}\n\n"
                f"Approved Local Evidence Records:\n{evidence_block}"
                f"{history_context}\n\n"
                f"Provide your structured analysis in valid JSON according to the instructions."
            )

        try:
            from google.genai import types

            contents_payload = []
            if image_bytes and image_mime_type:
                contents_payload.append(types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type))
            contents_payload.append(f"{system_instruction}\n\n{user_prompt}")

            config = types.GenerateContentConfig(
                response_mime_type="application/json"
            )

            resp = self._execute_with_model_fallback(contents=contents_payload, config=config)
            raw_text = resp.text.strip()
            # Parse JSON
            data = json.loads(raw_text)
            return data

        except Exception as e:
            logger.error(f"Error generating grounded response: {e}")
            return {
                "status": "error",
                "error_message": f"Error communicating with AI engine: {str(e)}",
                "direct_answer": f"Error communicating with AI engine: {str(e)}",
                "language": language,
                "cited_source_ids": [],
                "claims": [],
                "limitations": "API error"
            }

    def analyze_debate_transcript(
        self,
        transcript: str,
        retrieved_evidence: List[Dict[str, Any]],
        language: str = "en"
    ) -> Dict[str, Any]:
        if not self.api_key:
            return {
                "topic": "Debate Analysis",
                "summary": "Gemini API key is not configured.",
                "claims": [],
                "unresolved_issues": ["API key required"],
                "synthesis": "Please configure GEMINI_API_KEY."
            }

        evidence_text_list = []
        for ev in retrieved_evidence:
            evidence_text_list.append(
                f"ID: {ev['id']} | Reference: {ev.get('surah_name_en', ev.get('collection', ''))} | Text: {ev.get('translation_en', ev.get('text_ar', ''))[:150]}"
            )
        evidence_block = "\n".join(evidence_text_list) if evidence_text_list else "No matching local evidence records found."

        system_instruction = (
            "You are the Debate Engine for Daleel-e-Haq (دلیلِ حق).\n"
            "Analyze the provided religious debate transcript or argument systematically.\n"
            "RULES:\n"
            "1. Extract the main debate topic and concise summary.\n"
            "2. Separate opponent arguments into clearly numbered claims.\n"
            "3. For each claim, evaluate if it is supported, unsupported, or contradicted by verified evidence.\n"
            "4. Provide a fair, reasoned, point-by-point rebuttal/response without ad hominem attacks or insults.\n"
            "5. Only cite source IDs present in the provided evidence list. Do NOT invent citations.\n"
            "6. Identify any logical fallacies or unresolved theological questions.\n"
            "7. Return valid JSON matching this schema:\n"
            "{\n"
            '  "topic": "Debate topic",\n'
            '  "summary": "Concise overview of the discussion",\n'
            '  "claims": [\n'
            '    {\n'
            '      "claim_number": 1,\n'
            '      "claim_text": "Opponent claim",\n'
            '      "alleged_source": "Alleged scripture/hadith if quoted or null",\n'
            '      "verification_status": "verified" | "unverified" | "contradicted" | "partially_verified",\n'
            '      "evidence_ids": ["quran:X:Y"],\n'
            '      "response_text": "Direct, fair response to this point",\n'
            '      "logical_issues": "Logical fallacies identified if any",\n'
            '      "interpretive_notes": "Differences in interpretation"\n'
            '    }\n'
            '  ],\n'
            '  "unresolved_issues": ["Key question left unresolved"],\n'
            '  "synthesis": "Comprehensive final synthesis"\n'
            "}"
        )

        user_prompt = (
            f"Transcript/Argument to Analyze:\n{transcript}\n\n"
            f"Approved Local Evidence Available:\n{evidence_block}\n\n"
            f"Target Language: {language}\n"
        )

        try:
            from google.genai import types
            config = types.GenerateContentConfig(response_mime_type="application/json")
            resp = self._execute_with_model_fallback(
                contents=f"{system_instruction}\n\n{user_prompt}",
                config=config
            )
            return json.loads(resp.text.strip())
        except Exception as e:
            logger.error(f"Error analyzing debate: {e}")
            return {
                "topic": "Debate Analysis Error",
                "summary": f"Could not complete debate analysis: {str(e)}",
                "claims": [],
                "unresolved_issues": [str(e)],
                "synthesis": "Analysis failed due to model communication error."
            }
