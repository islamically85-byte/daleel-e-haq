import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Dict, Tuple

from app.config import settings
from app.db.connection import get_connection
from app.evidence.normalizer import normalize_arabic


def calculate_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def load_pipe_separated_file(filepath: str) -> Dict[Tuple[int, int], str]:
    data = {}
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or not line[0].isdigit() or "|" not in line:
                continue
            parts = line.split("|", 2)
            if len(parts) == 3:
                surah = int(parts[0])
                ayah = int(parts[1])
                text = parts[2].strip()
                data[(surah, ayah)] = text
    return data


def import_quran_corpus(conn: sqlite3.Connection = None) -> Dict[str, int]:
    corpus_dir = settings.absolute_corpus_dir
    surahs_file = os.path.join(corpus_dir, "surahs.json")
    arabic_file = os.path.join(corpus_dir, "quran-simple.txt")
    en_file = os.path.join(corpus_dir, "quran-trans-en-sahih.txt")
    ur_file = os.path.join(corpus_dir, "quran-trans-ur-jalandhry.txt")

    if not os.path.exists(arabic_file):
        raise FileNotFoundError(f"Quran Arabic corpus not found at {arabic_file}. Run scripts/download_quran_corpus.py first.")

    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    cursor = conn.cursor()

    # 1. Load Surahs
    with open(surahs_file, "r", encoding="utf-8") as f:
        surahs_data = json.load(f)

    if len(surahs_data) != 114:
        raise ValueError(f"Expected 114 surahs in metadata, got {len(surahs_data)}")

    cursor.execute("DELETE FROM quran_verses;")
    cursor.execute("DELETE FROM quran_fts;")
    cursor.execute("DELETE FROM quran_surahs;")
    for s in surahs_data:
        cursor.execute("""
            INSERT INTO quran_surahs (surah_number, name_ar, name_en, meaning, revelation_type, verses_count)
            VALUES (?, ?, ?, ?, ?, ?);
        """, (s["number"], s["name_ar"], s["name_en"], s["meaning"], s["type"], s["verses"]))

    # 2. Load translations and arabic text
    arabic_verses = load_pipe_separated_file(arabic_file)
    en_verses = load_pipe_separated_file(en_file) if os.path.exists(en_file) else {}
    ur_verses = load_pipe_separated_file(ur_file) if os.path.exists(ur_file) else {}

    total_verses = len(arabic_verses)
    if total_verses != 6236:
        raise ValueError(f"Expected exactly 6,236 canonical verses, got {total_verses}")

    sha_arabic = calculate_sha256(arabic_file)

    # 3. Populate quran_verses & quran_fts in transaction
    cursor.execute("DELETE FROM quran_verses;")
    cursor.execute("DELETE FROM quran_fts;")

    inserted = 0
    for (surah, ayah), raw_text_ar in arabic_verses.items():
        verse_id = f"quran:{surah}:{ayah}"
        
        has_bismillah = 0
        bismillah_text = None
        clean_text_ar = raw_text_ar

        if ayah == 1:
            if surah == 1:
                # In Surah Al-Fatihah, the Basmala IS verse 1
                has_bismillah = 1
                bismillah_text = None
                clean_text_ar = raw_text_ar
            elif surah == 9:
                # Surah At-Tawbah has no Basmala
                has_bismillah = 0
                bismillah_text = None
                clean_text_ar = raw_text_ar
            else:
                # All other 112 surahs have an introductory unnumbered Basmala in the source text
                idx = raw_text_ar.find("الرَّحِيمِ")
                if idx != -1:
                    bismillah_text = raw_text_ar[:idx + len("الرَّحِيمِ")].strip()
                    clean_text_ar = raw_text_ar[idx + len("الرَّحِيمِ"):].strip()
                    has_bismillah = 1

        text_norm = normalize_arabic(clean_text_ar)
        trans_en = en_verses.get((surah, ayah), "")
        trans_ur = ur_verses.get((surah, ayah), "")
        
        # Checksum of this individual canonical verse text
        verse_checksum = hashlib.sha256(f"{surah}:{ayah}:{clean_text_ar}".encode("utf-8")).hexdigest()

        cursor.execute("""
            INSERT INTO quran_verses (
                id, surah_number, ayah_number, text_ar, text_ar_normalized,
                translation_en, translation_ur, provenance, checksum,
                has_bismillah, bismillah
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            verse_id, surah, ayah, clean_text_ar, text_norm,
            trans_en, trans_ur, "Tanzil Quran Text (Simple v1.1, CC-BY 3.0)", verse_checksum,
            has_bismillah, bismillah_text
        ))

        cursor.execute("""
            INSERT INTO quran_fts (
                verse_id, surah_number, ayah_number, text_ar, text_ar_normalized, translation_en, translation_ur
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (
            verse_id, str(surah), str(ayah), clean_text_ar, text_norm, trans_en, trans_ur
        ))
        inserted += 1

    # 4. Record provenance
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        INSERT OR REPLACE INTO corpus_provenance (
            corpus_key, name, edition, version, license, total_records, sha256, imported_at, is_approved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);
    """, (
        "quran_arabic", "Tanzil Quran Text", "Simple (Imla'ei)", "1.1",
        "Creative Commons Attribution 3.0", 6236, sha_arabic, now_iso
    ))

    conn.commit()
    if close_after:
        conn.close()

    return {"surahs": len(surahs_data), "verses": inserted}


if __name__ == "__main__":
    from app.db.init_db import initialize_database
    initialize_database()
    res = import_quran_corpus()
    print(f"Quran import complete: {res['surahs']} surahs, {res['verses']} verses imported.")
