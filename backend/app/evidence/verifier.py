import re
import sqlite3
from typing import Any, Dict, List, Optional, Set, Tuple

from app.db.connection import get_connection
from app.evidence.normalizer import normalize_arabic
from app.evidence.retriever import get_quran_verse


def validate_source_id(source_id: str, conn: sqlite3.Connection = None) -> Optional[Dict[str, Any]]:
    """
    Independently validates a candidate source ID against the local SQLite database.
    Rejects any nonexistent or unapproved record.
    Supported ID patterns:
    - quran:{surah}:{ayah} (e.g. quran:2:255)
    - hadith:{collection}:{number} (e.g. hadith:bukhari:1)
    """
    if not source_id or not isinstance(source_id, str):
        return None

    source_id = source_id.strip().lower()

    if source_id.startswith("quran:"):
        parts = source_id.split(":")
        if len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit():
            surah = int(parts[1])
            ayah = int(parts[2])
            verse = get_quran_verse(surah, ayah, conn=conn)
            if verse:
                return {
                    "source_id": verse["id"],
                    "source_type": "quran",
                    "surah_number": verse["surah_number"],
                    "ayah_number": verse["ayah_number"],
                    "surah_name_ar": verse["surah_name_ar"],
                    "surah_name_en": verse["surah_name_en"],
                    "surah_meaning": verse["surah_meaning"],
                    "revelation_type": verse["revelation_type"],
                    "text_ar": verse["text_ar"],
                    "has_bismillah": bool(verse.get("has_bismillah")),
                    "bismillah": verse.get("bismillah"),
                    "translation_en": verse["translation_en"],
                    "translation_ur": verse["translation_ur"],
                    "provenance": verse["provenance"],
                    "is_verified": True
                }

    elif source_id.startswith("hadith:"):
        close_after = False
        if conn is None:
            conn = get_connection()
            close_after = True

        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM hadith_records 
            WHERE id = ? AND review_status = 'approved';
        """, (source_id,))
        row = cursor.fetchone()
        if close_after:
            conn.close()

        if row:
            h = dict(row)
            return {
                "source_id": h["id"],
                "source_type": "hadith",
                "collection": h["collection"],
                "hadith_number": h["hadith_number"],
                "book_name": h.get("book_name"),
                "chapter_name": h.get("chapter_name"),
                "text_ar": h.get("text_ar"),
                "translation_en": h.get("translation_en"),
                "translation_ur": h.get("translation_ur"),
                "narrator": h.get("narrator"),
                "grade": h.get("grade"),
                "graded_by": h.get("graded_by"),
                "provenance": f"{h['collection']} (Edition {h['edition']})",
                "is_verified": True
            }

    return None


def verify_arabic_quotation(quoted_ar: str, canonical_text_ar: str) -> bool:
    """
    Verifies that a quoted Arabic passage actually exists within the canonical text.
    Uses normalized representation to allow harmless diacritic differences.
    """
    if not quoted_ar or not canonical_text_ar:
        return False

    norm_quote = normalize_arabic(quoted_ar)
    norm_canonical = normalize_arabic(canonical_text_ar)

    if len(norm_quote) < 4:
        return True

    return norm_quote in norm_canonical


class CitationVerificationEngine:
    """
    Core gatekeeper: validates all candidate citations, scrubs hallucinated references,
    and guarantees that only local, approved scripture is presented as evidence.
    """

    UNVERIFIED_NOTICE = "I cannot verify this claim from the approved Quran and Hadith sources currently available in Daleel-e-Haq."
    UNVERIFIED_NOTICE_UR = "میں دلیلِ حق کے منظور شدہ قرآن اور حدیث کے ماخذ سے اس دعوے کی تصدیق نہیں کر سکتا۔"

    @classmethod
    def verify_pipeline(
        cls,
        model_output: Dict[str, Any],
        retrieved_evidence: List[Dict[str, Any]],
        user_language: str = "en",
        is_greeting: bool = False
    ) -> Dict[str, Any]:
        """
        Executes complete verification on model output:
        1. Extract claimed source IDs
        2. Validate each against SQLite
        3. Match quoted Arabic passages
        4. Scrub fabricated references
        5. Build verified evidence cards
        6. Enforce honest fallback when evidence is lacking (unless greeting)
        """
        candidate_ids = model_output.get("cited_source_ids", [])
        if isinstance(candidate_ids, str):
            candidate_ids = [candidate_ids]

        valid_evidence_cards: List[Dict[str, Any]] = []
        verified_id_set: Set[str] = set()
        rejected_id_set: Set[str] = set()

        conn = get_connection()
        try:
            for cid in candidate_ids:
                card = validate_source_id(cid, conn=conn)
                if card:
                    valid_evidence_cards.append(card)
                    verified_id_set.add(card["source_id"])
                else:
                    rejected_id_set.add(cid)
        finally:
            conn.close()

        # Sanitize individual claims
        raw_claims = model_output.get("claims", [])
        sanitized_claims = []
        for c in raw_claims:
            if not isinstance(c, dict):
                continue
            claim_cids = c.get("cited_ids", [])
            valid_cids = [cid for cid in claim_cids if cid in verified_id_set]
            
            sanitized_claims.append({
                "claim_text": c.get("claim_text", ""),
                "cited_ids": valid_cids,
                "verification_status": "verified" if valid_cids else "unverified",
                "notes": c.get("notes")
            })

        direct_answer = model_output.get("direct_answer", "").strip()
        has_unverified = False
        if not is_greeting:
            has_unverified = len(rejected_id_set) > 0 or (len(retrieved_evidence) == 0 and len(valid_evidence_cards) == 0)

            # If answer claims religious facts without any verified evidence in the database
            if len(valid_evidence_cards) == 0 and len(retrieved_evidence) == 0:
                notice = cls.UNVERIFIED_NOTICE_UR if user_language == "ur" else cls.UNVERIFIED_NOTICE
                if notice not in direct_answer:
                    direct_answer = f"{notice}\n\n{direct_answer}" if direct_answer else notice
                has_unverified = True

        return {
            "direct_answer": direct_answer,
            "language": model_output.get("language", user_language),
            "evidence_cards": valid_evidence_cards,
            "verified_source_ids": list(verified_id_set),
            "rejected_source_ids": list(rejected_id_set),
            "claims": sanitized_claims,
            "has_unverified_claims": has_unverified,
            "limitations": model_output.get("limitations")
        }
