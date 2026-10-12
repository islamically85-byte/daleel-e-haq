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


def import_hadith_record(record: Dict[str, Any], conn: sqlite3.Connection) -> str:
    """
    Validates and inserts a single Hadith record.
    Ensures required fields are present and calculates text checksum.
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
        record.get("review_status", "approved")
    ))

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
