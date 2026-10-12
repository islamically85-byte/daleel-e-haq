import logging
from typing import Any, Dict, List

from app.evidence.retriever import retrieve_relevant_evidence
from app.evidence.verifier import validate_source_id
from app.memory.repository import MemoryRepository
from app.providers.manager import provider_manager

logger = logging.getLogger(__name__)


class DebateAnalysisEngine:
    """
    Orchestrates the 6-stage debate analysis workflow:
    Stage A — Argument extraction
    Stage B — Claim separation
    Stage C — Evidence retrieval
    Stage D — Verification
    Stage E — Response generation
    Stage F — Final review & source card attachment
    """

    @classmethod
    def analyze_transcript(
        cls,
        transcript: str,
        title: str = "Debate Analysis",
        language: str = "en"
    ) -> Dict[str, Any]:
        clean_text = transcript.strip()
        if not clean_text:
            raise ValueError("Transcript cannot be empty.")

        # Stage C: Retrieve potentially relevant evidence from local database
        # Extract keywords from the first 500 chars to find relevant scripture
        retrieved_evidence = retrieve_relevant_evidence(clean_text[:500], max_results=8)

        # Stage A, B, D, E: Process with AI Provider
        provider = provider_manager.get_active_provider()
        raw_analysis = provider.analyze_debate_transcript(
            transcript=clean_text,
            retrieved_evidence=retrieved_evidence,
            language=language
        )

        # Stage F: Final review - Validate all cited evidence IDs against SQLite
        claims = raw_analysis.get("claims", [])
        verified_evidence_map: Dict[str, Any] = {}

        for claim in claims:
            cids = claim.get("evidence_ids", [])
            valid_cids = []
            for cid in cids:
                card = validate_source_id(cid)
                if card:
                    valid_cids.append(cid)
                    verified_evidence_map[cid] = card
            claim["evidence_ids"] = valid_cids
            if not valid_cids and claim.get("verification_status") == "verified":
                claim["verification_status"] = "unverified"

        # Build complete report object
        final_analysis = {
            "topic": raw_analysis.get("topic", title),
            "summary": raw_analysis.get("summary", ""),
            "claims": claims,
            "evidence_cards": list(verified_evidence_map.values()),
            "unresolved_issues": raw_analysis.get("unresolved_issues", []),
            "synthesis": raw_analysis.get("synthesis", "")
        }

        # Persist debate in memory
        saved_record = MemoryRepository.save_debate(
            title=title,
            raw_transcript=clean_text,
            language=language,
            analysis_data=final_analysis
        )
        saved_record["evidence_cards"] = list(verified_evidence_map.values())
        return saved_record
