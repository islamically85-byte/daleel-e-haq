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
