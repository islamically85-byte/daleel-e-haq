import os
import shutil
import pytest
from app.config import settings

TEST_DB_PATH = "data/local/test_daleel.db"

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    original_db = os.path.join(root_dir, "data/local/daleel.db")
    test_db = os.path.join(root_dir, TEST_DB_PATH)

    # Set DATABASE_PATH to test db
    orig_path = settings.DATABASE_PATH
    settings.DATABASE_PATH = TEST_DB_PATH

    # Copy canonical db to test db so Quran/Hadith records are present
    if os.path.exists(original_db):
        try:
            import sqlite3
            tmp_conn = sqlite3.connect(original_db)
            tmp_conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            tmp_conn.close()
        except Exception:
            pass
        shutil.copy2(original_db, test_db)

    yield

    # Restore settings and remove test db
    settings.DATABASE_PATH = orig_path
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except OSError:
            pass
    for ext in ["-shm", "-wal"]:
        if os.path.exists(test_db + ext):
            try:
                os.remove(test_db + ext)
            except OSError:
                pass
