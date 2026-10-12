import pytest
from app.evidence.retriever import get_quran_verse, is_conversational_greeting
from app.evidence.verifier import validate_source_id


def test_surah_al_ikhlas_verse_1_integrity():
    verse = get_quran_verse(112, 1)
    assert verse is not None
    assert verse["text_ar"] == "قُلْ هُوَ اللَّهُ أَحَدٌ"
    assert verse["has_bismillah"] == 1
    assert verse["bismillah"] == "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    assert verse["translation_en"] == 'Say, "He is Allah, [who is] One,'
    assert "ایک ہے" in verse["translation_ur"]


def test_surah_al_fatihah_verse_1_integrity():
    # In Surah Al-Fatihah, the Basmala IS verse 1
    verse = get_quran_verse(1, 1)
    assert verse is not None
    assert verse["text_ar"] == "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    assert verse["has_bismillah"] == 1
    assert verse["bismillah"] is None


def test_surah_at_tawbah_verse_1_has_no_basmala():
    # Surah At-Tawbah starts without a Basmala
    verse = get_quran_verse(9, 1)
    assert verse is not None
    assert verse["text_ar"].startswith("بَرَاءَةٌ")
    assert verse["has_bismillah"] == 0
    assert verse["bismillah"] is None


def test_multiple_surahs_verse_boundaries():
    cases = [
        (2, 1, "الم"),
        (3, 1, "الم"),
        (95, 1, "وَالتِّينِ وَالزَّيْتُونِ"),
        (97, 1, "إِنَّا أَنزَلْنَاهُ فِي لَيْلَةِ الْقَدْرِ"),
        (113, 1, "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ"),
        (114, 1, "قُلْ أَعُوذُ بِرَبِّ النَّاسِ"),
    ]
    for surah, ayah, expected_text in cases:
        v = get_quran_verse(surah, ayah)
        assert v is not None, f"Missing verse {surah}:{ayah}"
        assert v["text_ar"] == expected_text, f"Mismatch in {surah}:{ayah}: got '{v['text_ar']}', expected '{expected_text}'"
        assert v["has_bismillah"] == 1


def test_validate_source_id_includes_bismillah_metadata():
    card = validate_source_id("quran:112:1")
    assert card is not None
    assert card["text_ar"] == "قُلْ هُوَ اللَّهُ أَحَدٌ"
    assert card["has_bismillah"] is True
    assert card["bismillah"] == "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"


def test_conversational_greetings_detected():
    greetings = ["Hi", "hello", "Salam", "Assalamu Alaykum", "اسلام علیکم", "سلام", "hey!"]
    for g in greetings:
        assert is_conversational_greeting(g) is True, f"Failed to detect greeting: {g}"

    theological_queries = [
        "What is the evidence regarding oneness in Surah 112:1?",
        "What does the Quran say about patience?",
        "Explain Tawhid",
        "Hadith on good manners"
    ]
    for q in theological_queries:
        assert is_conversational_greeting(q) is False, f"False positive greeting: {q}"
