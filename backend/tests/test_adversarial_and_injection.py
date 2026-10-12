import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.evidence.retriever import search_quran_fts, get_quran_verse
from app.evidence.verifier import validate_source_id

client = TestClient(app)


def test_sql_injection_defense_in_retriever():
    # Attempt SQL injection through FTS search
    malicious_query = "' OR 1=1 -- ; DROP TABLE quran_verses; SELECT *"
    results = search_quran_fts(malicious_query)
    # The database must remain intact and return a safe list
    assert isinstance(results, list)

    verse_1_1 = get_quran_verse(1, 1)
    assert verse_1_1 is not None, "quran_verses table was not dropped"


def test_sql_injection_in_source_id_validation():
    malicious_id = "quran:1:1' OR '1'='1"
    card = validate_source_id(malicious_id)
    assert card is None


def test_chat_api_validation_limits():
    # Empty question rejected
    res = client.post("/api/chat", json={"question": ""})
    assert res.status_code == 422

    # Excessively large question rejected (over 4000 characters)
    huge_question = "A" * 4001
    res2 = client.post("/api/chat", json={"question": huge_question})
    assert res2.status_code == 422


def test_debate_api_validation_limits():
    # Transcript too short
    res = client.post("/api/debates/analyze", json={"transcript": "Too short"})
    assert res.status_code == 422

    # Missing transcript
    res2 = client.post("/api/debates/analyze", json={})
    assert res2.status_code == 422


def test_adversarial_citation_fabrication_never_verified():
    # An adversary claims Surah 200 Verse 5 or FakeHadith:999
    assert validate_source_id("quran:200:5") is None
    assert validate_source_id("hadith:fake_isnad:999") is None
    assert validate_source_id("quran:2:287") is None # Baqarah only has 286 verses
