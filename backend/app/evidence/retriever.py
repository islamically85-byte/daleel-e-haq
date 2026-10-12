import re
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from app.db.connection import get_connection
from app.evidence.normalizer import extract_potential_quran_reference, normalize_arabic, normalize_urdu


def get_quran_verse(surah: int, ayah: int, conn: sqlite3.Connection = None) -> Optional[Dict[str, Any]]:
    """
    Retrieves exact Quran verse by surah and ayah number.
    Returns None if surah or ayah is out of range.
    """
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            v.id, v.surah_number, v.ayah_number, v.text_ar, v.text_ar_normalized,
            v.translation_en, v.translation_ur, v.provenance, v.checksum,
            v.has_bismillah, v.bismillah,
            s.name_ar as surah_name_ar, s.name_en as surah_name_en,
            s.meaning as surah_meaning, s.revelation_type, s.verses_count
        FROM quran_verses v
        JOIN quran_surahs s ON v.surah_number = s.surah_number
        WHERE v.surah_number = ? AND v.ayah_number = ?;
    """, (surah, ayah))
    row = cursor.fetchone()

    if close_after:
        conn.close()

    if not row:
        return None
    res = dict(row)
    res["source_type"] = "quran"
    return res


def get_quran_surah_info(surah: int, conn: sqlite3.Connection = None) -> Optional[Dict[str, Any]]:
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    cursor = conn.cursor()
    cursor.execute("SELECT * FROM quran_surahs WHERE surah_number = ?;", (surah,))
    row = cursor.fetchone()
    if close_after:
        conn.close()
    return dict(row) if row else None


def search_quran_fts(query: str, limit: int = 10, conn: sqlite3.Connection = None) -> List[Dict[str, Any]]:
    """
    Executes FTS5 search across Arabic original, normalized Arabic, English, and Urdu translations.
    """
    clean_query = re.sub(r'["\';\-\(\)]', ' ', query).strip()
    if not clean_query:
        return []

    # Prepare search terms for FTS5 (match any term with wildcard)
    words = [w for w in clean_query.split() if len(w) > 1]
    if not words:
        return []

    # Build FTS match expression: term1* OR term2*
    match_expr = " OR ".join([f'"{w}"*' for w in words[:6]])

    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            v.id, v.surah_number, v.ayah_number, v.text_ar,
            v.translation_en, v.translation_ur, v.provenance,
            v.has_bismillah, v.bismillah,
            s.name_ar as surah_name_ar, s.name_en as surah_name_en,
            s.meaning as surah_meaning, s.revelation_type,
            rank
        FROM quran_fts f
        JOIN quran_verses v ON f.verse_id = v.id
        JOIN quran_surahs s ON v.surah_number = s.surah_number
        WHERE quran_fts MATCH ?
        ORDER BY rank
        LIMIT ?;
    """, (match_expr, limit))

    rows = cursor.fetchall()
    results = []
    for r in rows:
        item = dict(r)
        item["source_type"] = "quran"
        results.append(item)

    if close_after:
        conn.close()

    return results


def search_hadith_fts(query: str, limit: int = 5, conn: sqlite3.Connection = None) -> List[Dict[str, Any]]:
    clean_query = re.sub(r'["\';\-\(\)]', ' ', query).strip()
    if not clean_query:
        return []

    words = [w for w in clean_query.split() if len(w) > 1]
    if not words:
        return []

    match_expr = " OR ".join([f'"{w}"*' for w in words[:6]])

    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT 
                h.id, h.collection, h.hadith_number, h.book_name, h.chapter_name,
                h.text_ar, h.translation_en, h.translation_ur, h.narrator,
                h.grade, h.graded_by, h.review_status, rank
            FROM hadith_fts f
            JOIN hadith_records h ON f.hadith_id = h.id
            WHERE hadith_fts MATCH ? AND h.review_status = 'approved'
            ORDER BY rank
            LIMIT ?;
        """, (match_expr, limit))
        rows = cursor.fetchall()
        results = [dict(r) for r in rows]
    except Exception:
        results = []

    if close_after:
        conn.close()

    for item in results:
        item["source_type"] = "hadith"
    return results



# Common English stop words that appear in questions but don't help FTS on scripture
_STOP_WORDS = {
    "what", "does", "the", "quran", "say", "about", "how", "is", "are",
    "was", "were", "can", "could", "would", "should", "do", "did",
    "who", "which", "when", "where", "why", "that", "this", "these",
    "those", "for", "and", "or", "but", "not", "with", "from", "has",
    "have", "had", "will", "shall", "may", "might", "be", "been", "being",
    "in", "on", "at", "to", "of", "a", "an", "according", "islam", "islamic",
    "hadith", "verse", "surah", "ayah", "allah", "quran", "please", "tell",
    "me", "give", "find", "show", "explain", "means", "meaning"
}

def _extract_search_keywords(query: str, max_words: int = 6) -> List[str]:
    """
    Extracts meaningful keywords from a user query, removing common stop words.
    Returns a list of terms suitable for FTS5 search.
    """
    clean = re.sub(r'[\"\';\-\(\)\?\!,\.]', ' ', query).lower()
    words = [w.strip() for w in clean.split() if len(w) > 2]
    # Filter stop words, keep meaningful theological and topic terms
    keywords = [w for w in words if w not in _STOP_WORDS]
    # If filtering removes everything, fall back to longer words
    if not keywords:
        keywords = [w for w in words if len(w) > 3]
    return keywords[:max_words]


_GREETING_PATTERN = re.compile(
    r'^\s*(hi|hello|hey|salam|salaam|assalam\w*(\s*(o|wa)?\s*al[a-z]+)?|as-salam\w*(\s*al[a-z]+)?|good\s*(morning|afternoon|evening)|greetings|howdy|'
    r'اسلام\s*علیکم|السلام\s*علیکم|سلام|سلام\s*مسنون|ہائے|کیا\s*حال\s*ہے|آپ\s*کون\s*ہیں)\s*[\!\?\.\,\s]*$',
    re.IGNORECASE
)

def is_conversational_greeting(query: str) -> bool:
    """
    Identifies common conversational greetings that should not trigger
    expensive scripture database searches or trigger unverified claims warnings.
    """
    q = query.strip()
    if not q or len(q) > 60:
        return False
    return bool(_GREETING_PATTERN.match(q))


def retrieve_relevant_evidence(query: str, max_results: int = 6) -> List[Dict[str, Any]]:
    """
    High-level evidence retrieval pipeline:
    1. Check for exact verse reference (e.g., 2:255, 112:1)
    2. Execute FTS5 keyword search on Quran (with stop-word filtering)
    3. Execute FTS5 keyword search on Hadith (if configured)
    4. Deduplicate and return verified records
    """
    # Conversational greetings do not require scripture retrieval
    if is_conversational_greeting(query):
        return []

    evidence: List[Dict[str, Any]] = []
    seen_ids = set()

    # Step 1: Exact reference check
    exact_ref = extract_potential_quran_reference(query)
    if exact_ref:
        surah, ayah = exact_ref
        exact_verse = get_quran_verse(surah, ayah)
        if exact_verse:
            evidence.append(exact_verse)
            seen_ids.add(exact_verse["id"])

    # Step 2: FTS Search on Quran using extracted keywords
    keywords = _extract_search_keywords(query, max_words=6)
    quran_hits = search_quran_fts(" ".join(keywords), limit=max_results * 2) if keywords else []
    for hit in quran_hits:
        if hit["id"] not in seen_ids and len(evidence) < max_results:
            evidence.append(hit)
            seen_ids.add(hit["id"])

    # Step 3: FTS Search on Hadith
    hadith_hits = search_hadith_fts(" ".join(keywords), limit=max_results // 2) if keywords else []
    for hit in hadith_hits:
        if hit["id"] not in seen_ids and len(evidence) < max_results:
            evidence.append(hit)
            seen_ids.add(hit["id"])

    return evidence
