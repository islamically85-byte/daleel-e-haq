from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class AIProvider(ABC):
    """
    Abstract AI Provider interface supporting model execution, connectivity verification,
    and capability reporting.
    """

    @abstractmethod
    def get_metadata(self) -> Dict[str, Any]:
        """Returns provider metadata, model name, status, and capabilities."""
        pass

    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """Tests live connectivity to the provider engine and returns diagnostic results."""
        pass

    @abstractmethod
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
        """
        Generates a structured reasoning response grounded strictly in the provided evidence.
        """
        pass

    @abstractmethod
    def analyze_debate_transcript(
        self,
        transcript: str,
        retrieved_evidence: List[Dict[str, Any]],
        language: str = "en"
    ) -> Dict[str, Any]:
        """
        Performs structured point-by-point debate claim extraction and analysis.
        """
        pass
