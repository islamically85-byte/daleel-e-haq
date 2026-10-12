import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == "Daleel-e-Haq (دلیلِ حق)"
    assert data["phase"] == 1
    assert data["developer"] == "Zevrako"


def test_health_check_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["quran_records_loaded"] == 6236
    assert "active_provider" in data
    assert "active_model" in data


def test_providers_metadata():
    response = client.get("/api/providers")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    provider_ids = [p["provider_id"] for p in data]
    assert "gemini" in provider_ids
    assert "local" in provider_ids

    local_meta = next(p for p in data if p["provider_id"] == "local")
    assert local_meta["is_configured"] is False
    assert "Planned — Not Installed" in local_meta.get("status_label", "")
