import pytest
from app.api.debate_voice import handle_quran_lookup, handle_hadith_lookup


def test_handle_quran_lookup_by_surah_ayah():
    # Surah Al-Ikhlas 112:1
    res = handle_quran_lookup({"surah": 112, "ayah": 1})
    assert res["status"] == "found"
    assert res["is_verified"] is True
    assert res["surah_number"] == 112
    assert res["ayah_number"] == 1
    assert "قُلْ هُوَ اللَّهُ أَحَدٌ" in res["text_ar"]
    assert "Say" in res["translation_en"]
    assert "Surah Al-Ikhlas (112:1)" in res["citation"]


def test_handle_quran_lookup_not_found():
    # Surah 112 Ayah 99 (does not exist)
    res = handle_quran_lookup({"surah": 112, "ayah": 99})
    assert res["status"] == "not_found"
    assert res["is_verified"] is False
    assert "does not exist" in res["message"]


def test_handle_quran_lookup_by_query():
    # Search for Allah / Lord in Quran
    res = handle_quran_lookup({"query": "Lord"})
    assert res["status"] == "found"
    assert res["is_verified"] is True
    assert len(res["verses"]) > 0


def test_handle_quran_lookup_by_arabic_query():
    # Search for Arabic text
    res = handle_quran_lookup({"query": "الله"})
    assert res["status"] == "found"
    assert res["is_verified"] is True
    assert len(res["verses"]) > 0


def test_handle_hadith_lookup_limitation_disclosure():
    # Offline Hadith corpus is not installed in local DB (0 rows)
    # The handler must honestly disclose this limitation and never mark as verified
    res = handle_hadith_lookup({"query": "fasting on ashura", "collection": "bukhari"})
    assert res["status"] == "unverified"
    assert res["is_verified"] is False
    assert res["records_found"] == 0
    assert "limitation_disclosure" in res
    assert "6,236 verses" in res["limitation_disclosure"]
    assert "Hadith corpus is not yet installed" in res["limitation_disclosure"]
