from typing import Any, Dict, List
from app.providers.base import AIProvider
from app.providers.gemini import GeminiProvider
from app.providers.local_stub import LocalAIStubProvider


class ProviderManager:
    def __init__(self):
        self._gemini = GeminiProvider()
        self._local = LocalAIStubProvider()
        self._active_provider_id = "gemini"

    def get_active_provider(self) -> AIProvider:
        if self._active_provider_id == "local":
            return self._local
        return self._gemini

    def get_provider(self, provider_id: str) -> AIProvider:
        if provider_id == "local":
            return self._local
        return self._gemini

    def list_providers(self) -> List[Dict[str, Any]]:
        return [
            {**self._gemini.get_metadata(), "is_active": self._active_provider_id == "gemini"},
            {**self._local.get_metadata(), "is_active": self._active_provider_id == "local"}
        ]

    def set_active_provider(self, provider_id: str) -> bool:
        if provider_id == "local":
            # In Phase 1, Local AI is not runnable
            return False
        self._active_provider_id = "gemini"
        return True


provider_manager = ProviderManager()
