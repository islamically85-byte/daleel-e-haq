from typing import Any, Dict, List, Optional
from app.providers.base import AIProvider


class LocalAIStubProvider(AIProvider):
    """
    Local AI Provider Stub (Phase 2 Architecture Boundary).
    Clearly marked as 'Planned — Not Installed'.
    Does not run local inference or download GGUF models during Phase 1.
    """

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "provider_id": "local",
            "provider_name": "Local AI Engine (GGUF / Llama.cpp)",
            "mode": "Offline Local Mode",
            "model": "None (Planned - Not Installed)",
            "is_configured": False,
            "status_label": "Planned — Not Installed",
            "capabilities": {
                "download_model_supported": True,
                "custom_gguf_supported": True,
                "offline_privacy": True
            },
            "planned_actions": [
                {
                    "action_id": "download_model",
                    "title": "Download AI Model",
                    "description": "Download supported quantized model (e.g., Qwen 9B / 4B GGUF) directly into local app storage.",
                    "status": "disabled",
                    "badge": "Phase 2"
                },
                {
                    "action_id": "select_model_file",
                    "title": "Select Existing Model File",
                    "description": "Select an existing local .gguf model binary. (Scripture text files belong in Library, not here).",
                    "status": "disabled",
                    "badge": "Phase 2"
                }
            ],
            "data_privacy": "When active in Phase 2, inference runs 100% on local hardware with zero network traffic."
        }

    def test_connection(self) -> Dict[str, Any]:
        return {
            "status": "disabled",
            "message": "Local AI inference engine is planned for Phase 2. Currently, Daleel-e-Haq operates in Online AI Mode using Google Gemini API.",
            "model": "None"
        }

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
        raise NotImplementedError("Local AI inference is deferred to Phase 2. Use Gemini Online AI Mode.")

    def analyze_debate_transcript(
        self,
        transcript: str,
        retrieved_evidence: List[Dict[str, Any]],
        language: str = "en"
    ) -> Dict[str, Any]:
        raise NotImplementedError("Local AI inference is deferred to Phase 2. Use Gemini Online AI Mode.")
