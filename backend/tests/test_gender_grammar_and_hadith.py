import pytest
from app.api.debate_voice import handle_hadith_lookup, debate_live_websocket
from app.evidence.retriever import search_hadith_fts
from app.evidence.hadith_importer import get_hadith_status


def test_hadith_status_configured():
    stat = get_hadith_status()
    assert stat["is_configured"] is True
    assert stat["approved_records"] >= 12
    assert "Sahih al-Bukhari" in stat["approved_collections"]
    assert "Sahih Muslim" in stat["approved_collections"]


def test_hadith_fts_search_authenticated():
    # Intention Hadith (Sahih al-Bukhari 1)
    results = search_hadith_fts("intention", limit=3)
    assert len(results) > 0
    bukhari1 = results[0]
    assert bukhari1["collection"] in ["Sahih al-Bukhari", "Sahih Muslim"]
    assert bukhari1["grade"] == "Sahih"
    assert bukhari1["review_status"] == "approved"
    assert any("نیتوں" in r["translation_ur"] or "الأعمال" in r["text_ar"] for r in results)


def test_hadith_fts_search_specific_query_found():
    res = handle_hadith_lookup({"query": "Quran", "collection": "bukhari"})
    assert res["status"] == "found"
    assert res["is_verified"] is True
    assert len(res["hadiths"]) > 0
    first = res["hadiths"][0]
    assert first["hadith_number"] == 5027  # Sahih Bukhari 5027: Learn and teach Quran
    assert "خَيْرُكُمْ" in first["text_ar"]


def test_hadith_lookup_unverified_disclosed():
    # Query for a hadith not in local database
    res = handle_hadith_lookup({"query": "fasting on ashura", "collection": "bukhari"})
    assert res["status"] == "unverified"
    assert res["is_verified"] is False
    assert res["records_found"] == 0
    assert "6,236 verses" in res["limitation_disclosure"]
    assert "Hadith corpus is not yet installed" in res["limitation_disclosure"]


def test_voice_gender_grammar_personas():
    import inspect
    from app.api.debate_voice import debate_live_websocket

    src = inspect.getsource(debate_live_websocket)
    # Check that feminine directive for Kore/Aoede is present with first-person feminine Urdu forms
    assert "VOICE IDENTITY & GENDER GRAMMATICAL AGREEMENT (FEMININE — Kore / Aoede)" in src
    assert "میں آپ کو سمجھاتی ہوں" in src
    assert "میں اس کی وضاحت کروں گی" in src

    # Check that masculine directive for Puck/Charon is present with first-person masculine Urdu forms
    assert "VOICE IDENTITY & GENDER GRAMMATICAL AGREEMENT (MASCULINE — Puck / Charon)" in src
    assert "میں آپ کو سمجھاتا ہوں" in src
    assert "میں اس کی وضاحت کروں گا" in src

    # Check scriptural exception to never alter scripture
    assert "CRITICAL SCRIPTURAL EXCEPTION" in src


def test_hadith_canonical_numbering_audit():
    """Verify that the 3 previously mismatched Hadiths are indexed with Sunnah.com canonical numbers."""
    from app.db.connection import get_connection

    conn = get_connection()
    cursor = conn.cursor()

    # 1. Religion is Sincerity: Muslim 55a (not 77)
    cursor.execute("SELECT id, hadith_number, review_status FROM hadith_records WHERE id = 'hadith:sahih_muslim:55';")
    m55 = cursor.fetchone()
    assert m55 is not None
    assert m55["hadith_number"] == 55
    assert m55["review_status"] == "approved"

    cursor.execute("SELECT id, hadith_number, review_status FROM hadith_records WHERE id = 'hadith:sahih_muslim:77';")
    m77 = cursor.fetchone()
    assert m77 is not None
    assert m77["review_status"] == "quarantined"

    # 2. Controlling Anger: Bukhari 6114 (not 6011)
    cursor.execute("SELECT id, hadith_number, review_status FROM hadith_records WHERE id = 'hadith:sahih_bukhari:6114';")
    b6114 = cursor.fetchone()
    assert b6114 is not None
    assert b6114["hadith_number"] == 6114
    assert b6114["review_status"] == "approved"

    cursor.execute("SELECT id, hadith_number, review_status FROM hadith_records WHERE id = 'hadith:sahih_bukhari:6011';")
    b6011 = cursor.fetchone()
    assert b6011 is not None
    assert b6011["review_status"] == "quarantined"

    # 3. Hadith Qudsi Wali of Allah: Bukhari 6502 (not 6491)
    cursor.execute("SELECT id, hadith_number, review_status FROM hadith_records WHERE id = 'hadith:sahih_bukhari:6502';")
    b6502 = cursor.fetchone()
    assert b6502 is not None
    assert b6502["hadith_number"] == 6502
    assert b6502["review_status"] == "approved"

    cursor.execute("SELECT id, hadith_number, review_status FROM hadith_records WHERE id = 'hadith:sahih_bukhari:6491';")
    b6491 = cursor.fetchone()
    assert b6491 is not None
    assert b6491["review_status"] == "quarantined"

    conn.close()


def test_hadith_importer_rejects_mismatched_records():
    """Verify that verify_hadith_reference_and_matn rejects known mismatched references."""
    from app.evidence.hadith_importer import verify_hadith_reference_and_matn, import_hadith_record
    from app.db.connection import get_connection

    # Attempting to verify Muslim 77 for 'Religion is sincerity'
    valid, msg = verify_hadith_reference_and_matn({
        "collection": "Sahih Muslim",
        "collection_slug": "sahih_muslim",
        "hadith_number": 77,
        "text_ar": "الدِّينُ النَّصِيحَةُ"
    })
    assert valid is False
    assert "Mismatched reference detected" in msg or "55" in msg

    # Attempting to import mismatched record with review_status='approved' must raise ValueError
    conn = get_connection()
    with pytest.raises(ValueError, match="Cannot import mismatched Hadith"):
        import_hadith_record({
            "collection": "Sahih al-Bukhari",
            "collection_slug": "sahih_bukhari",
            "hadith_number": 6011,
            "text_ar": "لَيْسَ الشَّدِيدُ بِالصُّرَعَةِ",
            "review_status": "approved"
        }, conn)
    conn.close()


def test_quarantined_records_never_returned_by_search():
    """Verify that quarantined records never appear in FTS or carry a Verified badge."""
    results = search_hadith_fts("Unverified Reference")
    assert len(results) == 0

    lookup = handle_hadith_lookup({"query": "Unverified Reference"})
    assert lookup["status"] == "unverified"
    assert lookup["is_verified"] is False

