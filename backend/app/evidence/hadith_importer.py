import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.connection import get_connection
from app.evidence.normalizer import normalize_arabic


def calculate_hadith_checksum(collection_slug: str, hadith_number: int, text_ar: str) -> str:
    payload = f"{collection_slug}:{hadith_number}:{text_ar or ''}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_hadith_status(conn: sqlite3.Connection = None) -> Dict[str, Any]:
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            COUNT(*) as total_count,
            SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) as approved_count,
            SUM(CASE WHEN review_status = 'pending_provenance' THEN 1 ELSE 0 END) as pending_count
        FROM hadith_records;
    """)
    row = cursor.fetchone()
    total = row["total_count"] or 0
    approved = row["approved_count"] or 0
    pending = row["pending_count"] or 0

    cursor.execute("SELECT DISTINCT collection FROM hadith_records WHERE review_status = 'approved';")
    approved_collections = [r["collection"] for r in cursor.fetchall()]

    if close_after:
        conn.close()

    is_configured = approved > 0
    return {
        "is_configured": is_configured,
        "total_records": total,
        "approved_records": approved,
        "pending_records": pending,
        "approved_collections": approved_collections,
        "message": (
            "Hadith library active with approved records."
            if is_configured
            else "Hadith evidence is not yet configured. The canonical schema and FTS5 search index are ready, awaiting verified offline dataset clearance."
        ),
        "supported_target_collections": ["Sahih al-Bukhari", "Sahih Muslim"]
    }


# Canonical reference signatures for authenticated Sahih narrations
CANONICAL_REFERENCE_SIGNATURES = {
    "الدين النصيحة": ("sahih_muslim", [55], "Sahih Muslim 55a (In-book: Bk 1, H 95)"),
    "ليس الشديد بالصرعة": ("sahih_bukhari", [6114], "Sahih al-Bukhari 6114 (In-book: Bk 78, H 141)"),
    "من عادى لي وليا": ("sahih_bukhari", [6502], "Sahih al-Bukhari 6502 (In-book: Bk 81, H 91)"),
    "إنما الأعمال بالنيات": ("sahih_bukhari", [1], "Sahih al-Bukhari 1"),
    "بني الإسلام على خمس": ("sahih_bukhari", [8], "Sahih al-Bukhari 8"),
    "لا يؤمن أحدكم حتى يحب لأخيه": ("sahih_bukhari", [13], "Sahih al-Bukhari 13"),
    "خيركم من تعلم القرآن وعلمه": ("sahih_bukhari", [5027], "Sahih al-Bukhari 5027"),
    "من أحدث في أمرنا هذا": ("sahih_bukhari", [2697], "Sahih al-Bukhari 2697"),
    "من نفس عن مؤمن كربة": ("sahih_muslim", [2699], "Sahih Muslim 2699"),
    "بلغوا عني ولو آية": ("sahih_bukhari", [3461], "Sahih al-Bukhari 3461"),
    "بدأ الإسلام غريبا": ("sahih_muslim", [145], "Sahih Muslim 145"),
}

# Known quarantined/erroneous reference mappings to prevent regression
KNOWN_MISMATCHED_REFERENCES = {
    ("sahih_muslim", 77): "Sahih Muslim 77 is about the Ansar; 'Religion is sincerity' is Sahih Muslim 55a",
    ("sahih_bukhari", 6011): "Sahih al-Bukhari 6011 is about believers' mutual affection; 'The strong person controls anger' is Sahih al-Bukhari 6114",
    ("sahih_bukhari", 6491): "Sahih al-Bukhari 6491 is about good intentions; Hadith Qudsi about Allah's Wali is Sahih al-Bukhari 6502",
}


def verify_hadith_reference_and_matn(record: Dict[str, Any]) -> tuple[bool, str]:
    """
    Independently verifies that the claimed collection and hadith number match the canonical matn (text).
    Detects and rejects known numbering discrepancies.
    """
    collection = record.get("collection", "").strip()
    collection_slug = record.get("collection_slug", "").strip() or collection.lower().replace(" ", "_")
    hadith_number = int(record.get("hadith_number", 0))
    text_ar = record.get("text_ar", "")
    text_norm = normalize_arabic(text_ar) if text_ar else ""

    # 1. Check known erroneous combinations
    if (collection_slug, hadith_number) in KNOWN_MISMATCHED_REFERENCES:
        err_msg = KNOWN_MISMATCHED_REFERENCES[(collection_slug, hadith_number)]
        return False, f"Mismatched reference detected: {err_msg}"

    # 2. Check canonical text signatures
    for sig, (exp_slug, exp_numbers, canonical_ref) in CANONICAL_REFERENCE_SIGNATURES.items():
        sig_norm = normalize_arabic(sig)
        if sig in text_ar or sig_norm in text_norm:
            if collection_slug == exp_slug and hadith_number not in exp_numbers:
                return False, f"Reference mismatch: '{sig}' must be {canonical_ref}, but got #{hadith_number}"

    return True, "Verified canonical reference and text signature"


def import_hadith_record(record: Dict[str, Any], conn: sqlite3.Connection) -> str:
    """
    Validates and inserts a single Hadith record.
    Verifies reference-to-matn integrity, preventing mismatched records from receiving approved status.
    """
    collection = record.get("collection", "").strip()
    collection_slug = record.get("collection_slug", "").strip() or collection.lower().replace(" ", "_")
    hadith_number = int(record.get("hadith_number", 0))

    if not collection or hadith_number <= 0:
        raise ValueError("Hadith record requires valid collection and positive hadith_number")

    hadith_id = f"hadith:{collection_slug}:{hadith_number}"
    text_ar = record.get("text_ar", "")
    text_norm = normalize_arabic(text_ar) if text_ar else ""
    checksum = calculate_hadith_checksum(collection_slug, hadith_number, text_ar)

    # Reference-to-matn validation
    is_valid, validation_msg = verify_hadith_reference_and_matn(record)
    requested_status = record.get("review_status", "approved")

    if not is_valid:
        if requested_status == "approved":
            raise ValueError(f"Cannot import mismatched Hadith record as approved: {validation_msg}")
        effective_status = "quarantined"
    else:
        effective_status = requested_status

    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO hadith_records (
            id, collection, collection_slug, edition, edition_version,
            book_number, book_name, chapter_number, chapter_name,
            hadith_number, alternate_numbering, text_ar, text_ar_normalized,
            translation_en, translation_ur, narrator, chain_isnad,
            grade, graded_by, provenance_url, rights_basis, checksum, review_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        hadith_id,
        collection,
        collection_slug,
        record.get("edition", "Standard Edition"),
        record.get("edition_version", "1.0"),
        record.get("book_number"),
        record.get("book_name"),
        record.get("chapter_number"),
        record.get("chapter_name"),
        hadith_number,
        record.get("alternate_numbering"),
        text_ar,
        text_norm,
        record.get("translation_en"),
        record.get("translation_ur"),
        record.get("narrator"),
        record.get("chain_isnad"),
        record.get("grade", "Sahih"),
        record.get("graded_by", "Scholarly Consensus / Classical Muhaddithin"),
        record.get("provenance_url"),
        record.get("rights_basis"),
        checksum,
        effective_status
    ))

    # Only index approved records into FTS
    if effective_status == "approved":
        cursor.execute("""
            INSERT INTO hadith_fts (
                hadith_id, collection, hadith_number, text_ar, text_ar_normalized,
                translation_en, translation_ur, narrator, grade
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            hadith_id,
            collection,
            str(hadith_number),
            text_ar,
            text_norm,
            record.get("translation_en", ""),
            record.get("translation_ur", ""),
            record.get("narrator", ""),
            record.get("grade", "")
        ))

    return hadith_id


def import_hadith_corpus(conn: sqlite3.Connection = None) -> int:
    """Imports canonical verified Sahih al-Bukhari and Sahih Muslim corpus into SQLite."""
    import os
    from app.config import settings

    corpus_dir = settings.absolute_corpus_dir
    hadith_file = os.path.join(corpus_dir, "hadith_canonical_sahih.json")

    if not os.path.exists(hadith_file):
        return 0

    with open(hadith_file, "r", encoding="utf-8") as f:
        records = json.load(f)

    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    imported = 0
    try:
        for rec in records:
            import_hadith_record(rec, conn)
            imported += 1
        conn.commit()
    finally:
        if close_after:
            conn.close()

    return imported
