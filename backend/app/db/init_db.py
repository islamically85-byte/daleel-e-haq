import sqlite3
from app.db.connection import get_connection


def initialize_database(conn: sqlite3.Connection = None) -> None:
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    cursor = conn.cursor()

    # 1. Quran Surahs metadata
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quran_surahs (
        surah_number INTEGER PRIMARY KEY,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        meaning TEXT NOT NULL,
        revelation_type TEXT NOT NULL,
        verses_count INTEGER NOT NULL
    );
    """)

    # 2. Canonical Quran Verses
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quran_verses (
        id TEXT PRIMARY KEY,
        surah_number INTEGER NOT NULL,
        ayah_number INTEGER NOT NULL,
        text_ar TEXT NOT NULL,
        text_ar_normalized TEXT NOT NULL,
        translation_en TEXT,
        translation_ur TEXT,
        provenance TEXT NOT NULL,
        checksum TEXT NOT NULL,
        has_bismillah INTEGER DEFAULT 0,
        bismillah TEXT,
        FOREIGN KEY (surah_number) REFERENCES quran_surahs(surah_number)
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quran_surah_ayah ON quran_verses(surah_number, ayah_number);")

    # 3. Quran FTS5 Virtual Table
    cursor.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS quran_fts USING fts5(
        verse_id UNINDEXED,
        surah_number UNINDEXED,
        ayah_number UNINDEXED,
        text_ar,
        text_ar_normalized,
        translation_en,
        translation_ur,
        tokenize = 'unicode61'
    );
    """)

    # 4. Canonical Hadith Records
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS hadith_records (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        collection_slug TEXT NOT NULL,
        edition TEXT NOT NULL,
        edition_version TEXT,
        book_number INTEGER,
        book_name TEXT,
        chapter_number INTEGER,
        chapter_name TEXT,
        hadith_number INTEGER NOT NULL,
        alternate_numbering TEXT,
        text_ar TEXT,
        text_ar_normalized TEXT,
        translation_en TEXT,
        translation_ur TEXT,
        narrator TEXT,
        chain_isnad TEXT,
        grade TEXT NOT NULL,
        graded_by TEXT NOT NULL,
        provenance_url TEXT,
        rights_basis TEXT,
        checksum TEXT,
        review_status TEXT NOT NULL DEFAULT 'approved'
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hadith_collection_num ON hadith_records(collection_slug, hadith_number);")

    # 5. Hadith FTS5 Virtual Table
    cursor.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS hadith_fts USING fts5(
        hadith_id UNINDEXED,
        collection UNINDEXED,
        hadith_number UNINDEXED,
        text_ar,
        text_ar_normalized,
        translation_en,
        translation_ur,
        narrator,
        grade,
        tokenize = 'unicode61'
    );
    """)

    # 6. Corpus Provenance & Version Tracking
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS corpus_provenance (
        corpus_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        edition TEXT NOT NULL,
        version TEXT NOT NULL,
        license TEXT NOT NULL,
        total_records INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        is_approved BOOLEAN NOT NULL DEFAULT 1
    );
    """)

    # 7. Conversations
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL
    );
    """)

    # 8. Messages
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        created_at TEXT NOT NULL,
        evidence_citations TEXT,
        has_unverified_claims BOOLEAN DEFAULT 0,
        unverified_reason TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);")

    # 9. Debates
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS debates (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        raw_transcript TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        created_at TEXT NOT NULL,
        topic TEXT,
        summary TEXT,
        unresolved_issues TEXT,
        synthesis TEXT
    );
    """)

    # 10. Debate Claims
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS debate_claims (
        id TEXT PRIMARY KEY,
        debate_id TEXT NOT NULL,
        claim_number INTEGER NOT NULL,
        claim_text TEXT NOT NULL,
        alleged_source TEXT,
        verification_status TEXT NOT NULL,
        evidence_ids TEXT,
        response_text TEXT NOT NULL,
        logical_issues TEXT,
        interpretive_notes TEXT,
        FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_claims_debate ON debate_claims(debate_id);")

    # 11. Learning & Review Queue
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS review_queue (
        id TEXT PRIMARY KEY,
        item_type TEXT NOT NULL,
        question_or_topic TEXT NOT NULL,
        proposed_answer TEXT,
        supporting_evidence_ids TEXT,
        missing_evidence TEXT,
        user_feedback TEXT,
        review_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        reviewed_at TEXT
    );
    """)

    conn.commit()
    if close_after:
        conn.close()


if __name__ == "__main__":
    initialize_database()
    print("Database schema successfully initialized.")
