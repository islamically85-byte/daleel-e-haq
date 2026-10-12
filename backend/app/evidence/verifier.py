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
    binds claims strictly to retrieved evidence, and guarantees that only authentic,
    relevant local scripture is marked as verified evidence.
    """

    UNVERIFIED_NOTICE = "I cannot verify this claim from the approved sources currently available in Daleel-e-Haq. The local database indexes the complete 6,236 Quranic verses; offline Hadith collections are not yet installed in local storage."
    UNVERIFIED_NOTICE_UR = "دلیلِ حق کے منظور شدہ ماخذ میں فی الوقت قرآنِ کریم کی تمام 6,236 آیات محفوظ ہیں، جبکہ آف لائن حدیث کتب ابھی مقامی ڈیٹابیس میں انسٹال نہیں ہیں، اس لیے اس دعوے کی تصدیق نہیں کی جا سکتی۔"

    @classmethod
    def verify_pipeline(
        cls,
        model_output: Dict[str, Any],
        retrieved_evidence: List[Dict[str, Any]],
        user_language: str = "en",
        is_greeting: bool = False
    ) -> Dict[str, Any]:
        """
        Executes rigorous verification on model output:
        1. Extract claimed source IDs.
        2. Validate each against SQLite for source existence/authenticity.
        3. Bind citations strictly to evidence retrieved for the current inquiry.
        4. Validate quoted Arabic passages against canonical text.
        5. Separate source authenticity, text match, retrieval membership, and claim support.
        6. Reject fabricated citations and unrelated real verses from passing as verified.
        7. Enforce honest fallback when evidence is lacking.
        """
        candidate_ids = model_output.get("cited_source_ids", [])
        if isinstance(candidate_ids, str):
            candidate_ids = [candidate_ids]

        # Map of evidence retrieved specifically for this query
        retrieved_map: Dict[str, Dict[str, Any]] = {}
        for ev in (retrieved_evidence or []):
            eid = ev.get("id") or ev.get("source_id")
            if not eid and ev.get("surah_number") and ev.get("ayah_number"):
                eid = f"quran:{ev['surah_number']}:{ev['ayah_number']}"
            if eid:
                retrieved_map[eid.strip().lower()] = ev

        valid_evidence_cards: List[Dict[str, Any]] = []
        authenticated_cards_map: Dict[str, Dict[str, Any]] = {}
        verified_id_set: Set[str] = set()
        retrieved_verified_id_set: Set[str] = set()
        rejected_id_set: Set[str] = set()

        conn = get_connection()
        try:
            for cid in candidate_ids:
                if not cid or not isinstance(cid, str):
                    continue
                cid_norm = cid.strip().lower()
                card = validate_source_id(cid_norm, conn=conn)
                if card:
                    card_id = card["source_id"].lower()
                    authenticated_cards_map[card_id] = card
                    verified_id_set.add(card["source_id"])

                    # Priority 2: Check if card was actually in retrieved evidence set
                    in_retrieval = card_id in retrieved_map
                    card_copy = dict(card)
                    card_copy["source_authenticated"] = True
                    card_copy["in_retrieval_set"] = in_retrieval
                    
                    if in_retrieval:
                        card_copy["is_verified"] = True
                        card_copy["relevance"] = "retrieved_relevant"
                        retrieved_verified_id_set.add(card["source_id"])
                    else:
                        # Real verse in SQLite, but unrelated / not retrieved for this question
                        card_copy["is_verified"] = False
                        card_copy["relevance"] = "unretrieved_or_unrelated"
                        card_copy["notes"] = "Source exists in Quran, but was not retrieved for this query."
                        rejected_id_set.add(cid)
                    
                    valid_evidence_cards.append(card_copy)
                else:
                    rejected_id_set.add(cid)
        finally:
            conn.close()

        # Sanitize individual claims with distinct verification dimensions
        raw_claims = model_output.get("claims", [])
        sanitized_claims = []
        has_any_supported_claim = False

        for c in raw_claims:
            if not isinstance(c, dict):
                continue
            claim_text = c.get("claim_text", "")
            claim_cids = c.get("cited_ids", [])
            if isinstance(claim_cids, str):
                claim_cids = [claim_cids]

            valid_cids = []
            all_authenticated = True
            all_in_retrieval = True
            quote_matched = True

            quoted_ar = c.get("quoted_ar") or c.get("quoted_arabic")

            for cid in claim_cids:
                cid_norm = cid.strip().lower()
                if cid_norm in verified_id_set:
                    valid_cids.append(cid)
                    if cid_norm not in retrieved_map:
                        all_in_retrieval = False
                    
                    # Verify quoted Arabic text if provided
                    if quoted_ar:
                        canonical_card = authenticated_cards_map.get(cid_norm)
                        if canonical_card and canonical_card.get("text_ar"):
                            if not verify_arabic_quotation(quoted_ar, canonical_card["text_ar"]):
                                quote_matched = False
                else:
                    all_authenticated = False
                    rejected_id_set.add(cid)

            # Determine claim support relationship
            source_authenticated = bool(valid_cids and all_authenticated)
            in_retrieval_set = bool(valid_cids and all_in_retrieval)

            # Hadith check: offline corpus is not installed (0 records)
            has_hadith = any(str(cid).lower().startswith("hadith:") for cid in claim_cids)

            claim_supported = False
            verification_status = "unverified"
            notes = c.get("notes") or ""

            if has_hadith:
                verification_status = "unverified"
                notes = "Hadith corpus not installed in local database (0 records). Hadith claims cannot be verified."
            elif not valid_cids:
                verification_status = "unverified"
                notes = notes or "No valid scriptural citations provided."
            elif not source_authenticated:
                verification_status = "unverified"
                notes = "Cited source does not exist in local verified scripture."
            elif not in_retrieval_set:
                # Codex QA-01 / P1 blocker 4: real verse but unretrieved / irrelevant
                verification_status = "unverified"
                notes = "Cited source exists in Quran, but was not in the retrieved evidence for this inquiry."
            elif not quote_matched:
                verification_status = "unverified"
                notes = "Quoted Arabic passage does not match canonical scripture text."
            else:
                claim_supported = True
                verification_status = "verified"
                has_any_supported_claim = True

            sanitized_claims.append({
                "claim_text": claim_text,
                "cited_ids": valid_cids,
                "source_authenticated": source_authenticated,
                "in_retrieval_set": in_retrieval_set,
                "text_matched": quote_matched,
                "claim_supported": claim_supported,
                "verification_status": verification_status,
                "notes": notes
            })

        direct_answer = model_output.get("direct_answer", "").strip()
        has_unverified = False

        if not is_greeting:
            # Unverified if any citations were rejected, or any claims failed support, or no retrieved evidence was supported
            has_unverified = (
                len(rejected_id_set) > 0
                or not has_any_supported_claim
                or (len(retrieved_evidence) == 0 and len(retrieved_verified_id_set) == 0)
            )

            # If answer claims facts without verified retrieved evidence
            if len(retrieved_verified_id_set) == 0:
                notice = cls.UNVERIFIED_NOTICE_UR if user_language == "ur" else cls.UNVERIFIED_NOTICE
                if notice not in direct_answer:
                    direct_answer = f"{notice}\n\n{direct_answer}" if direct_answer else notice
                has_unverified = True

        return {
            "direct_answer": direct_answer,
            "language": model_output.get("language", user_language),
            "evidence_cards": valid_evidence_cards,
            "verified_source_ids": list(retrieved_verified_id_set),
            "authenticated_source_ids": list(verified_id_set),
            "rejected_source_ids": list(rejected_id_set),
            "claims": sanitized_claims,
            "has_unverified_claims": has_unverified,
            "limitations": model_output.get("limitations")
        }
