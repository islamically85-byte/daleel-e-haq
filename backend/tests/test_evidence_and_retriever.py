import pytest
from app.evidence.retriever import get_quran_verse, get_quran_surah_info, search_quran_fts, retrieve_relevant_evidence
from app.evidence.hadith_importer import get_hadith_status
from app.evidence.normalizer import normalize_arabic, extract_potential_quran_reference


def test_exact_quran_verse_retrieval():
    verse = get_quran_verse(1, 1)
    assert verse is not None
    assert verse["id"] == "quran:1:1"
    assert "بِسْمِ اللَّهِ" in verse["text_ar"]
    assert "Merciful" in verse["translation_en"]
    assert "مہربان" in verse["translation_ur"]
    assert verse["surah_name_en"] == "Al-Fatihah"


def test_ayat_al_kursi_retrieval():
    verse = get_quran_verse(2, 255)
    assert verse is not None
    assert verse["id"] == "quran:2:255"
    assert "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ" in verse["text_ar"]


def test_invalid_quran_references():
    # Surah 1 only has 7 verses. Ayah 8 must return None.
    verse_invalid_ayah = get_quran_verse(1, 8)
    assert verse_invalid_ayah is None

    # Surah 115 does not exist. Must return None.
    verse_invalid_surah = get_quran_verse(115, 1)
    assert verse_invalid_surah is None

    # Ayah 0 does not exist
    verse_zero = get_quran_verse(1, 0)
    assert verse_zero is None


def test_arabic_normalization():
    with_tashkeel = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    normalized = normalize_arabic(with_tashkeel)
    assert "بسم الله الرحمن الرحيم" == normalized
    # Checks that harakat are removed
    assert "ِ" not in normalized
    assert "ْ" not in normalized


def test_fts5_quran_search():
    # English search
    en_results = search_quran_fts("Merciful", limit=5)
    assert len(en_results) > 0
    assert any("Merciful" in r["translation_en"] for r in en_results)

    # Arabic search with normalized text
    ar_results = search_quran_fts("الله", limit=5)
    assert len(ar_results) > 0

    # Urdu search
    ur_results = search_quran_fts("پروردگار", limit=5)
    assert len(ur_results) > 0


def test_reference_extraction():
    assert extract_potential_quran_reference("What is 2:255 about?") == (2, 255)
    assert extract_potential_quran_reference("Read Surah 112 Verse 1") == (112, 1)
    assert extract_potential_quran_reference("General Islamic question without numbers") is None


def test_hadith_status_unconfigured():
    stat = get_hadith_status()
    assert "is_configured" in stat
    assert "message" in stat
    assert "supported_target_collections" in stat
